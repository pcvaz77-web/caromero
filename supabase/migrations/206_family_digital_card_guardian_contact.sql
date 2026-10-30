-- A carteirinha do responsável usa o contato do seu próprio pré-cadastro
-- quando o vínculo criado pelo CPF não possui telefone.
create or replace function public.family_get_digital_card(p_link_id uuid)
returns table(card_id uuid,qr_token uuid,school_name text,student_name text,
  class_name text,photo_path text,guardian_name text,guardian_phone text)
language plpgsql security definer set search_path = '' as $$
declare v_school_id uuid; v_student_id uuid;
begin
  select allowed.school_id,allowed.student_id into v_school_id,v_student_id
    from public.family_my_students() allowed
    join public.family_digital_card_settings settings
      on settings.school_id=allowed.school_id and settings.enabled=true
    where allowed.link_id=p_link_id;
  if v_school_id is null then
    raise exception 'Carteirinha digital não liberada para este vínculo' using errcode='42501';
  end if;
  if not exists(select 1 from public.students st
    join public.classes c on c.id=st.class_id and c.school_id=st.school_id
    where st.id=v_student_id and st.school_id=v_school_id
      and st.enrollment_status='active' and c.archived_at is null) then
    raise exception 'Aluno ativo não encontrado nesta escola' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_school_id::text || v_student_id::text));
  insert into public.family_student_cards(school_id,student_id,issued_by)
    select v_school_id,v_student_id,auth.uid()
    where not exists(select 1 from public.family_student_cards active_card
      where active_card.school_id=v_school_id and active_card.student_id=v_student_id
        and active_card.revoked_at is null)
    on conflict do nothing;
  return query select card.id,card.qr_token,sc.name,st.full_name,c.name,st.photo_path,
      l.guardian_name,
      coalesce(nullif(btrim(l.phone_e164),''),nullif(btrim(cpf_contact.phone_local),''),
        case when public.family_cpf_name_key(st.guardian_name)=public.family_cpf_name_key(l.guardian_name)
          then nullif(btrim(st.guardian_phone),'') end)
    from public.family_student_cards card
    join public.students st on st.id=card.student_id and st.school_id=card.school_id
    join public.classes c on c.id=st.class_id and c.school_id=st.school_id
    join public.schools sc on sc.id=card.school_id
    join public.family_links l on l.id=p_link_id and l.school_id=card.school_id
      and l.student_id=card.student_id and l.guardian_user_id=auth.uid()
      and l.status='active'
    left join lateral (
      select g.phone_local from public.family_cpf_guardians g
      join public.family_cpf_children child on child.guardian_id=g.id
        and child.school_id=g.school_id and child.student_id=card.student_id and child.status='active'
      where g.school_id=card.school_id and g.guardian_user_id=l.guardian_user_id
        and g.removed_at is null
        and public.family_cpf_name_key(g.guardian_name)=public.family_cpf_name_key(l.guardian_name)
      order by g.created_at desc limit 1
    ) cpf_contact on true
    join public.family_digital_card_settings settings
      on settings.school_id=card.school_id and settings.enabled=true
    where card.school_id=v_school_id and card.student_id=v_student_id
      and card.revoked_at is null and st.enrollment_status='active'
      and c.archived_at is null and sc.status='active';
end;
$$;
revoke all on function public.family_get_digital_card(uuid) from public,anon;
grant execute on function public.family_get_digital_card(uuid) to authenticated;
