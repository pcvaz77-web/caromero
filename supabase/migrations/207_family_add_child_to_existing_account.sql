-- Secretários podem apenas localizar uma conta familiar ativa e acrescentar um aluno.
-- A gestão completa do Portal continua reservada à administração e à coordenação autorizada.
begin;
create function public.family_can_add_existing_child(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members m
    join public.schools s on s.id=m.school_id and s.status='active'
    left join public.school_member_permissions p on p.member_id=m.id
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and (m.role in ('school_admin','secretary')
        or (m.role='coordinator' and coalesce(p.can_manage_family_portal,true)))
  );
$$;
revoke all on function public.family_can_add_existing_child(uuid) from public,anon;
grant execute on function public.family_can_add_existing_child(uuid) to authenticated;

-- Reaproveita a sincronização da ficha sem liberar edição geral à secretaria.
create or replace function public.enforce_student_guardian_contact_permission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_changed boolean; v_has_data boolean; v_registered_contact boolean := false;
begin
  v_has_data := new.guardian_name is not null or new.guardian_phone is not null
    or new.show_guardian_on_card;
  v_changed := tg_op='INSERT' and v_has_data;
  if tg_op='UPDATE' then
    v_changed := old.guardian_name is distinct from new.guardian_name
      or old.guardian_phone is distinct from new.guardian_phone
      or old.show_guardian_on_card is distinct from new.show_guardian_on_card;
    if v_changed and current_setting('app.family_cpf_contact_sync',true)='true'
      and old.show_guardian_on_card is not distinct from new.show_guardian_on_card
      and (public.family_school_manager(new.school_id)
        or public.family_can_add_existing_child(new.school_id)) then
      v_registered_contact := exists(
        select 1 from public.family_cpf_guardians g
        join public.family_cpf_children c on c.guardian_id=g.id and c.school_id=g.school_id
        where g.school_id=new.school_id and c.student_id=new.id and c.status='active'
          and g.removed_at is null and g.phone_local=new.guardian_phone
          and public.family_cpf_name_key(g.guardian_name)=public.family_cpf_name_key(new.guardian_name)
      );
    end if;
  end if;
  if v_changed and not public.can_edit_student_guardian_contact(new.school_id)
    and not v_registered_contact then
    raise exception 'Sem permissao para editar os dados do responsavel pelo aluno';
  end if;
  return new;
end;
$$;

create function public.family_cpf_existing_account(p_school_id uuid,p_cpf text)
returns table(guardian_id uuid,guardian_name text,cpf_last4 text,
  student_id uuid,student_name text,class_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_can_add_existing_child(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  if not public.family_cpf_valid(p_cpf) then raise exception 'CPF inválido'; end if;
  return query select g.id,g.guardian_name,right(g.cpf,4),s.id,s.full_name,c.name
    from public.family_cpf_guardians g
    join auth.users u on u.id=g.guardian_user_id and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    left join public.family_cpf_children child on child.guardian_id=g.id
      and child.school_id=g.school_id and child.status='active'
    left join public.students s on s.id=child.student_id and s.school_id=g.school_id
      and s.enrollment_status='active'
    left join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    where g.school_id=p_school_id and g.cpf=p_cpf and g.removed_at is null
    order by s.full_name;
end;
$$;
revoke all on function public.family_cpf_existing_account(uuid,text) from public,anon;
grant execute on function public.family_cpf_existing_account(uuid,text) to authenticated;

create function public.family_cpf_add_child_to_active(p_school_id uuid,p_guardian_id uuid,p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_guardian public.family_cpf_guardians%rowtype; v_student public.students%rowtype; v_link_id uuid;
  v_previous_sync text := current_setting('app.family_cpf_contact_sync',true);
begin
  if not public.family_can_add_existing_child(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  select * into v_guardian from public.family_cpf_guardians
    where id=p_guardian_id and school_id=p_school_id and removed_at is null for update;
  if not found or v_guardian.guardian_user_id is null or not exists (
    select 1 from auth.users u where u.id=v_guardian.guardian_user_id
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
  ) then raise exception 'Responsável sem conta ativa nesta escola'; end if;
  select s.* into v_student from public.students s
    join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    where s.id=p_student_id and s.school_id=p_school_id
      and s.enrollment_status='active' and c.archived_at is null for update of s;
  if not found then raise exception 'Aluno ativo não encontrado nesta escola'; end if;
  perform pg_advisory_xact_lock(hashtext(p_school_id::text || p_student_id::text));
  if exists(select 1 from public.family_links l where l.school_id=p_school_id
    and l.student_id=p_student_id and l.guardian_user_id=v_guardian.guardian_user_id
    and l.status='active') then raise exception 'Este aluno já está vinculado a esse responsável'; end if;
  if (select count(*) from public.family_cpf_children child
    where child.guardian_id=p_guardian_id and child.school_id=p_school_id
      and child.status='active') >= 10 then
    raise exception 'Este responsável já possui 10 alunos vinculados nesta escola';
  end if;
  insert into public.family_cpf_children(guardian_id,school_id,student_id)
    values(p_guardian_id,p_school_id,p_student_id)
    on conflict (guardian_id,student_id) do update set status='active',revoked_at=null;
  if v_guardian.phone_local is not null then
    perform set_config('app.family_cpf_contact_sync','true',true);
    update public.students s set guardian_name=v_guardian.guardian_name,
      guardian_phone=v_guardian.phone_local
      where s.id=p_student_id and s.school_id=p_school_id
        and ((nullif(btrim(coalesce(s.guardian_name,'')),'') is null
          and nullif(btrim(coalesce(s.guardian_phone,'')),'') is null)
          or public.family_cpf_name_key(s.guardian_name)=public.family_cpf_name_key(v_guardian.guardian_name));
    perform set_config('app.family_cpf_contact_sync',coalesce(v_previous_sync,''),true);
  end if;
  insert into public.family_links(school_id,student_id,student_name,guardian_name,phone_e164,
    guardian_user_id,status,invitation_token,accepted_at,invitation_expires_at)
    values(p_school_id,p_student_id,v_student.full_name,v_guardian.guardian_name,null,
      v_guardian.guardian_user_id,'active',null,now(),now()) returning id into v_link_id;
  insert into public.family_receipts(message_id,link_id)
    select m.id,v_link_id from public.family_messages m
    where m.school_id=p_school_id and m.student_id=p_student_id and m.status='published'
    on conflict do nothing;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'cpf_child_added_by_school',v_link_id);
  return v_link_id;
end;
$$;
revoke all on function public.family_cpf_add_child_to_active(uuid,uuid,uuid) from public,anon;
grant execute on function public.family_cpf_add_child_to_active(uuid,uuid,uuid) to authenticated;
commit;
