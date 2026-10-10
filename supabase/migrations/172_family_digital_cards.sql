-- Carteirinha digital: opt-in por escola, acesso apenas ao responsável ativo.
-- Instalar esta migração não libera nenhuma escola nem cria carteirinhas.
begin;

create table public.family_digital_card_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.family_digital_card_settings enable row level security;
revoke all on public.family_digital_card_settings from public,anon,authenticated;
grant all on public.family_digital_card_settings to service_role;

create function public.family_digital_card_setting(p_school_id uuid,p_enabled boolean default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão para gerenciar carteirinhas' using errcode='42501';
  end if;
  if p_enabled is not null then
    insert into public.family_digital_card_settings(school_id,enabled,updated_by)
      values(p_school_id,p_enabled,auth.uid())
      on conflict (school_id) do update set enabled=excluded.enabled,
        updated_by=excluded.updated_by,updated_at=now();
    insert into public.family_audit(school_id,actor_id,action)
      values(p_school_id,auth.uid(),case when p_enabled then 'digital_cards_enabled' else 'digital_cards_disabled' end);
  end if;
  select coalesce(s.enabled,false) into v_enabled
    from public.family_digital_card_settings s where s.school_id=p_school_id;
  return coalesce(v_enabled,false);
end;
$$;
revoke all on function public.family_digital_card_setting(uuid,boolean) from public,anon;
grant execute on function public.family_digital_card_setting(uuid,boolean) to authenticated;

create function public.family_digital_cards_available()
returns table(school_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct allowed.school_id from public.family_my_students() allowed
    join public.family_digital_card_settings settings on settings.school_id=allowed.school_id
  where settings.enabled=true;
$$;
revoke all on function public.family_digital_cards_available() from public,anon;
grant execute on function public.family_digital_cards_available() to authenticated;

create function public.family_get_digital_card(p_link_id uuid)
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
      l.guardian_name,l.phone_e164
    from public.family_student_cards card
    join public.students st on st.id=card.student_id and st.school_id=card.school_id
    join public.classes c on c.id=st.class_id and c.school_id=st.school_id
    join public.schools sc on sc.id=card.school_id
    join public.family_links l on l.id=p_link_id and l.school_id=card.school_id
      and l.student_id=card.student_id and l.guardian_user_id=auth.uid()
      and l.status='active'
    join public.family_digital_card_settings settings
      on settings.school_id=card.school_id and settings.enabled=true
    where card.school_id=v_school_id and card.student_id=v_student_id
      and card.revoked_at is null and st.enrollment_status='active'
      and c.archived_at is null and sc.status='active';
end;
$$;
revoke all on function public.family_get_digital_card(uuid) from public,anon;
grant execute on function public.family_get_digital_card(uuid) to authenticated;

create function public.family_can_read_digital_card_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_my_students() allowed
    join public.students st on st.id=allowed.student_id and st.school_id=allowed.school_id
    join public.classes c on c.id=st.class_id and c.school_id=st.school_id
    join public.family_digital_card_settings settings
      on settings.school_id=allowed.school_id and settings.enabled=true
    where st.photo_path=p_path and c.archived_at is null
  );
$$;
revoke all on function public.family_can_read_digital_card_photo(text) from public,anon;
grant execute on function public.family_can_read_digital_card_photo(text) to authenticated;

create policy "Family views enabled digital card student photo"
  on storage.objects for select to authenticated
  using (bucket_id='student-photos'
    and public.family_can_read_digital_card_photo(name));

commit;
