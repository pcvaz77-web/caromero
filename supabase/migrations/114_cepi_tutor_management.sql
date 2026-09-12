-- Operações atômicas para editar/remover tutores e transferir tutorandos,
-- sempre preservando o histórico e o isolamento por escola.

begin;

create or replace function public.update_cepi_tutor(
  p_school_id uuid,
  p_tutor_id uuid,
  p_display_name text,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_cepi_manager(p_school_id) then raise exception 'Sem permissão para editar tutores.'; end if;
  update public.cepi_tutors
  set display_name = btrim(p_display_name), email = nullif(btrim(p_email), ''), updated_at = now()
  where id = p_tutor_id and school_id = p_school_id and active = true;
  if not found then raise exception 'Tutor ativo não encontrado nesta escola.'; end if;
end;
$function$;

create or replace function public.deactivate_cepi_tutor(p_school_id uuid, p_tutor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_cepi_manager(p_school_id) then raise exception 'Sem permissão para remover tutores.'; end if;
  update public.cepi_tutor_students
  set active = false, ended_at = now(), ended_by = auth.uid()
  where school_id = p_school_id and tutor_id = p_tutor_id and active = true;
  update public.cepi_tutors set active = false, updated_at = now()
  where id = p_tutor_id and school_id = p_school_id and active = true;
  if not found then raise exception 'Tutor ativo não encontrado nesta escola.'; end if;
end;
$function$;

create or replace function public.transfer_cepi_student(
  p_school_id uuid,
  p_assignment_id uuid,
  p_new_tutor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.cepi_tutor_students%rowtype;
  v_new_assignment_id uuid;
begin
  if not public.is_cepi_manager(p_school_id) then raise exception 'Sem permissão para trocar tutores.'; end if;
  select * into v_assignment from public.cepi_tutor_students
  where id = p_assignment_id and school_id = p_school_id and active = true
  for update;
  if not found then raise exception 'Vínculo ativo não encontrado nesta escola.'; end if;
  if v_assignment.tutor_id = p_new_tutor_id then raise exception 'Selecione um tutor diferente do atual.'; end if;
  if not exists (select 1 from public.cepi_tutors where id = p_new_tutor_id and school_id = p_school_id and active = true) then
    raise exception 'Novo tutor inválido ou inativo.';
  end if;
  update public.cepi_tutor_students
  set active = false, ended_at = now(), ended_by = auth.uid()
  where id = v_assignment.id;
  insert into public.cepi_tutor_students (school_id, tutor_id, student_id, assigned_by)
  values (p_school_id, p_new_tutor_id, v_assignment.student_id, auth.uid())
  returning id into v_new_assignment_id;
  return v_new_assignment_id;
end;
$function$;

revoke all on function public.update_cepi_tutor(uuid, uuid, text, text) from public, anon;
revoke all on function public.deactivate_cepi_tutor(uuid, uuid) from public, anon;
revoke all on function public.transfer_cepi_student(uuid, uuid, uuid) from public, anon;
grant execute on function public.update_cepi_tutor(uuid, uuid, text, text) to authenticated;
grant execute on function public.deactivate_cepi_tutor(uuid, uuid) to authenticated;
grant execute on function public.transfer_cepi_student(uuid, uuid, uuid) to authenticated;

commit;
