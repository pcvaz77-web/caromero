begin;

alter table public.students
  add column if not exists registration_number text null;

-- As opções antigas de exibição/WhatsApp deixam de controlar o card.
-- Remova a restrição ligada à antiga caixa para permitir corrigir telefones legados.
alter table public.students drop constraint if exists students_guardian_whatsapp_phone;

alter table public.students
  drop constraint if exists students_registration_number_valid,
  add constraint students_registration_number_valid check (
    registration_number is null or
    (registration_number = btrim(registration_number) and char_length(registration_number) between 1 and 40)
  );

comment on column public.students.registration_number is
  'Matrícula informada pela escola ou pelo responsável no Portal da Família.';

-- Matrícula tem a mesma permissão de edição dos dados do responsável.
create or replace function public.enforce_student_registration_permission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.registration_number is not null
      and auth.role() <> 'service_role'
      and not public.can_edit_student_guardian_contact(new.school_id) then
      raise exception 'Sem permissao para editar a matricula do aluno' using errcode='42501';
    end if;
  elsif old.registration_number is distinct from new.registration_number then
    if auth.role() <> 'service_role'
      and current_setting('app.family_cpf_contact_sync',true) is distinct from 'true'
      and not public.can_edit_student_guardian_contact(new.school_id) then
      raise exception 'Sem permissao para editar a matricula do aluno' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_student_registration_permission() from public,anon,authenticated;
drop trigger if exists enforce_student_registration_permission on public.students;
create trigger enforce_student_registration_permission
  before insert or update of registration_number on public.students
  for each row execute function public.enforce_student_registration_permission();

create or replace function public.family_set_student_registrations(
  p_school_id uuid,p_student_ids uuid[],p_registrations jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_value text;
  v_previous_sync text := current_setting('app.family_cpf_contact_sync',true);
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations) <> 'object' then
    raise exception 'Matrículas inválidas';
  end if;
  perform set_config('app.family_cpf_contact_sync','true',true);
  for v_id in select jsonb_object_keys(p_registrations)::uuid loop
    if not v_id = any(p_student_ids) then raise exception 'Aluno fora da seleção'; end if;
    if jsonb_typeof(p_registrations -> v_id::text) <> 'string' then raise exception 'Matrícula inválida'; end if;
    v_value := btrim(p_registrations ->> v_id::text);
    if char_length(v_value) not between 1 and 40 then raise exception 'Matrícula inválida'; end if;
    update public.students set registration_number=v_value
      where id=v_id and school_id=p_school_id and enrollment_status='active';
    if not found then raise exception 'Aluno ativo não encontrado nesta escola'; end if;
  end loop;
  perform set_config('app.family_cpf_contact_sync',coalesce(v_previous_sync,''),true);
end;
$$;
revoke all on function public.family_set_student_registrations(uuid,uuid[],jsonb) from public,anon,authenticated;

create function public.family_cpf_register_bundle_contact(
  p_school_id uuid,p_student_ids uuid[],p_name text,p_cpf text,p_phone_local text,p_registrations jsonb
)
returns table(guardian_id uuid,filled_count integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query select * from public.family_cpf_register_bundle_contact(
    p_school_id,p_student_ids,p_name,p_cpf,p_phone_local);
  perform public.family_set_student_registrations(p_school_id,p_student_ids,p_registrations);
end;
$$;
revoke all on function public.family_cpf_register_bundle_contact(uuid,uuid[],text,text,text,jsonb) from public,anon;
grant execute on function public.family_cpf_register_bundle_contact(uuid,uuid[],text,text,text,jsonb) to authenticated;

create function public.family_cpf_create_individual_invite(
  p_school_id uuid,p_student_ids uuid[],p_name text,p_cpf text,p_phone_local text,p_registrations jsonb
)
returns table(invitation_token uuid,guardian_id uuid,filled_count integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query select * from public.family_cpf_create_individual_invite(
    p_school_id,p_student_ids,p_name,p_cpf,p_phone_local);
  perform public.family_set_student_registrations(p_school_id,p_student_ids,p_registrations);
end;
$$;
revoke all on function public.family_cpf_create_individual_invite(uuid,uuid[],text,text,text,jsonb) from public,anon;
grant execute on function public.family_cpf_create_individual_invite(uuid,uuid[],text,text,text,jsonb) to authenticated;

commit;
