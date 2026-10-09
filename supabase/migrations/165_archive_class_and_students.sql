-- Retira uma turma e seus alunos das listas ativas sem apagar o histórico.
-- A operação é atômica e restrita ao administrador da escola correspondente.
begin;

alter table public.students drop constraint if exists students_enrollment_status_check;
alter table public.students add constraint students_enrollment_status_check
  check (enrollment_status in ('active', 'transferred', 'concluded', 'archived'));

create or replace function public.archive_class_and_students(
  p_school_id uuid,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class_name text;
  v_student_count integer;
begin
  if auth.uid() is null or not public.is_school_admin(p_school_id) then
    raise exception 'Somente o administrador desta escola pode retirar uma turma.' using errcode = '42501';
  end if;

  select name into v_class_name
  from public.classes
  where id = p_class_id and school_id = p_school_id and archived_at is null
  for update;
  if not found then
    raise exception 'Turma ativa não encontrada nesta escola.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.students
    where class_id = p_class_id and school_id is distinct from p_school_id
  ) then
    raise exception 'A turma possui alunos com vínculo escolar inconsistente.';
  end if;

  update public.students
  set enrollment_status = 'archived', updated_at = now()
  where school_id = p_school_id and class_id = p_class_id and enrollment_status = 'active';
  get diagnostics v_student_count = row_count;

  update public.classes
  set archived_at = now(), updated_at = now()
  where id = p_class_id and school_id = p_school_id;

  return jsonb_build_object(
    'class_id', p_class_id,
    'class_name', v_class_name,
    'students_archived', v_student_count
  );
end;
$function$;

revoke all on function public.archive_class_and_students(uuid, uuid) from public, anon;
grant execute on function public.archive_class_and_students(uuid, uuid) to authenticated;

commit;
