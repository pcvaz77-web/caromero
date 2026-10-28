-- Completa a exclusão permanente de uma escola arquivada após a criação
-- de notas SIAP e provas CEPI/da turma. Mantém os mesmos controles de
-- proprietário, job durável, nome exato e auditoria da função anterior.
begin;

create or replace function public.platform_purge_school_data(
  p_school_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school public.schools%rowtype;
  v_job public.platform_school_deletion_jobs%rowtype;
  v_students_removed integer;
  v_classes_removed integer;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  select * into v_job
  from public.platform_school_deletion_jobs
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Nenhuma exclusão permanente foi iniciada para esta escola.';
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object(
      'already_completed', true,
      'school_id', p_school_id,
      'school_name', v_job.school_name_snapshot
    );
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada (verifique se a exclusão já foi concluída).';
  end if;
  if v_school.status <> 'archived' then
    raise exception 'Somente escolas arquivadas podem ser excluídas permanentemente.';
  end if;
  if p_confirm_name is null or btrim(p_confirm_name) <> v_school.name then
    raise exception 'O nome digitado não corresponde ao nome exato da escola.';
  end if;

  update public.platform_school_deletion_jobs
  set status = 'deleting_database', updated_at = now()
  where school_id = p_school_id;

  -- Filhos com RESTRICT são removidos antes de alunos, turmas e escola.
  delete from public.cepi_test_results where school_id = p_school_id;
  delete from public.cepi_test_questions where school_id = p_school_id;
  delete from public.cepi_tests where school_id = p_school_id;
  delete from public.cepi_question_bank where school_id = p_school_id;
  delete from public.cepi_group_students where school_id = p_school_id;
  delete from public.cepi_group_classes where school_id = p_school_id;
  delete from public.cepi_groups where school_id = p_school_id;
  delete from public.cepi_exam_headers where school_id = p_school_id;

  delete from public.class_exam_results where school_id = p_school_id;
  delete from public.class_exams where school_id = p_school_id;
  delete from public.class_exam_headers where school_id = p_school_id;
  delete from public.class_exam_purge_media where school_id = p_school_id;

  delete from public.siap_grade_entries where school_id = p_school_id;
  delete from public.siap_grade_batches where school_id = p_school_id;

  delete from public.cepi_tutoring_forms where school_id = p_school_id;
  delete from public.cepi_tutor_students where school_id = p_school_id;
  delete from public.cepi_tutors where school_id = p_school_id;
  delete from public.school_cepi_settings where school_id = p_school_id;
  delete from public.student_class_history where school_id = p_school_id;
  delete from public.classroom_maps where school_id = p_school_id;
  delete from public.livro_revisa_deliveries where school_id = p_school_id;
  delete from public.observation_options where school_id = p_school_id;
  delete from public.user_notification_shifts where school_id = p_school_id;
  delete from public.user_notifications where school_id = p_school_id;
  delete from public.school_terms where school_id = p_school_id;
  delete from public.report_generation_log where school_id = p_school_id;

  delete from public.students where school_id = p_school_id;
  get diagnostics v_students_removed = row_count;
  delete from public.classes where school_id = p_school_id;
  get diagnostics v_classes_removed = row_count;

  perform public.record_platform_audit(
    'school_permanently_deleted', p_school_id, null,
    jsonb_build_object('school_id',p_school_id,'school_name',v_school.name,'status',v_school.status),
    jsonb_build_object(
      'school_id',p_school_id,
      'school_name',v_school.name,
      'students_removed',v_students_removed,
      'classes_removed',v_classes_removed,
      'storage_objects_removed',v_job.storage_objects_removed,
      'deleted_at',now()
    )
  );

  delete from public.schools where id = p_school_id;

  update public.platform_school_deletion_jobs
  set status = 'completed',
      students_removed = v_students_removed,
      classes_removed = v_classes_removed,
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where school_id = p_school_id;

  return jsonb_build_object(
    'school_id',p_school_id,
    'school_name',v_school.name,
    'students_removed',v_students_removed,
    'classes_removed',v_classes_removed,
    'storage_objects_removed',v_job.storage_objects_removed
  );
end;
$function$;

commit;
