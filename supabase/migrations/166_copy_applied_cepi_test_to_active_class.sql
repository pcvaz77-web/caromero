begin;

create or replace function public.copy_applied_cepi_test_to_active_class(
  p_school_id uuid,
  p_test_id uuid,
  p_old_class_id uuid,
  p_new_class_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_test public.cepi_tests%rowtype;
  v_old_class public.classes%rowtype;
  v_new_class public.classes%rowtype;
  v_new_test_id uuid;
begin
  if auth.uid() is null or not public.is_cepi_coordinator(p_school_id) then
    raise exception 'Somente a coordenação pode copiar uma prova aplicada.';
  end if;

  select * into v_test
  from public.cepi_tests
  where id = p_test_id and school_id = p_school_id and status = 'applied';
  if not found or not (p_old_class_id = any(v_test.class_ids)) then
    raise exception 'Prova aplicada ou turma de origem não encontrada nesta escola.';
  end if;

  select * into v_old_class
  from public.classes
  where id = p_old_class_id and school_id = p_school_id;
  select * into v_new_class
  from public.classes
  where id = p_new_class_id and school_id = p_school_id;
  if v_old_class.id is null or v_old_class.archived_at is null
    or v_new_class.id is null or v_new_class.archived_at is not null
    or v_new_class.name is distinct from v_old_class.name then
    raise exception 'Escolha a turma ativa de mesmo nome da turma arquivada.';
  end if;
  if not exists (
    select 1 from public.students
    where school_id = p_school_id and class_id = p_new_class_id and enrollment_status = 'active'
  ) then
    raise exception 'A nova turma não tem alunos ativos.';
  end if;
  if (select count(*) from public.cepi_test_questions
      where school_id = p_school_id and test_id = p_test_id) <> v_test.question_count then
    raise exception 'A prova de origem não está completa.';
  end if;

  insert into public.cepi_tests (
    school_id, title, kind, class_ids, block_number, subject_plan,
    academic_year, bimester, stage, scheduled_on, question_count,
    answer_format, subjects, status, notes, created_by
  ) values (
    p_school_id, v_test.title, v_test.kind, array[p_new_class_id],
    v_test.block_number, v_test.subject_plan, v_test.academic_year,
    v_test.bimester, v_test.stage, v_test.scheduled_on,
    v_test.question_count, v_test.answer_format, v_test.subjects,
    'draft', v_test.notes, auth.uid()
  ) returning id into v_new_test_id;

  insert into public.cepi_test_questions (
    school_id, test_id, number, subject, statement, alternatives,
    correct_answer, bank_question_id, created_by
  )
  select p_school_id, v_new_test_id, number, subject, statement,
    alternatives, correct_answer, bank_question_id, auth.uid()
  from public.cepi_test_questions
  where school_id = p_school_id and test_id = p_test_id
  order by number;

  update public.cepi_tests set status = 'ready'
  where id = v_new_test_id and school_id = p_school_id;

  return v_new_test_id;
end;
$fn$;

revoke all on function public.copy_applied_cepi_test_to_active_class(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.copy_applied_cepi_test_to_active_class(uuid,uuid,uuid,uuid) to authenticated;

commit;
