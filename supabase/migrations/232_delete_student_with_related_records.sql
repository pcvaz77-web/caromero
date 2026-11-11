begin;

-- Exclui um aluno e seus registros individuais na mesma transação.
-- A verificação de permissão reproduz a policy de DELETE de students.
create or replace function public.delete_student_permanently(
  p_school_id uuid,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_attachment_paths text[];
begin
  if auth.uid() is null or not public.is_active_school_member(p_school_id) or not (
    public.has_school_permission(p_school_id, 'can_delete_students')
    or public.has_school_permission(p_school_id, 'can_edit_all')
    or (
      public.has_school_permission(p_school_id, 'can_edit_students')
      and exists (
        select 1 from public.school_members sm
        where sm.school_id = p_school_id
          and sm.user_id = auth.uid()
          and sm.status = 'active'
          and sm.role = 'teacher'
      )
    )
  ) then
    raise exception 'Sem permissão para excluir alunos.' using errcode = '42501';
  end if;

  select * into v_student from public.students
  where id = p_student_id and school_id = p_school_id
  for update;
  if not found then
    raise exception 'Aluno não encontrado nesta escola.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct attachment_path), array[]::text[])
  into v_attachment_paths
  from public.student_occurrences
  where school_id = p_school_id and student_id = p_student_id
    and attachment_path is not null;

  -- Evita deixar comunicados e vínculos familiares sem aluno identificado.
  delete from public.family_student_entries where school_id = p_school_id and student_id = p_student_id;
  delete from public.family_messages where school_id = p_school_id and student_id = p_student_id;
  delete from public.family_links where school_id = p_school_id and student_id = p_student_id;

  -- Formulários referenciam tanto o aluno quanto a atribuição de tutoria.
  delete from public.cepi_tutoring_forms where school_id = p_school_id and student_id = p_student_id;
  delete from public.cepi_tutor_students where school_id = p_school_id and student_id = p_student_id;
  delete from public.cepi_group_students where school_id = p_school_id and student_id = p_student_id;
  update public.cepi_groups
    set leader_student_id = null
    where school_id = p_school_id and leader_student_id = p_student_id;
  update public.cepi_groups
    set coleader_student_id = null
    where school_id = p_school_id and coleader_student_id = p_student_id;
  delete from public.cepi_test_results where school_id = p_school_id and student_id = p_student_id;
  delete from public.class_exam_results where school_id = p_school_id and student_id = p_student_id;
  delete from public.siap_grade_entries where school_id = p_school_id and student_id = p_student_id;
  delete from public.student_class_history where school_id = p_school_id and student_id = p_student_id;

  -- Observações, ocorrências e demais filhos com CASCADE saem com o aluno.
  delete from public.students where id = p_student_id and school_id = p_school_id;

  return jsonb_build_object(
    'photo_path', v_student.photo_path,
    'attachment_paths', to_jsonb(v_attachment_paths)
  );
end;
$function$;

revoke all on function public.delete_student_permanently(uuid, uuid) from public, anon;
grant execute on function public.delete_student_permanently(uuid, uuid) to authenticated;

-- Após a exclusão, os anexos de ocorrência já não têm registro pai. Permite
-- ao mesmo operador limpar os arquivos devolvidos pela RPC no Storage.
create function public.student_deleter_can_remove_orphan_attachment(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare v_school_id uuid;
begin
  if coalesce((storage.foldername(p_name))[1], '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_school_id := ((storage.foldername(p_name))[1])::uuid;
  return public.is_active_school_member(v_school_id)
    and (
      public.has_school_permission(v_school_id, 'can_delete_students')
      or public.has_school_permission(v_school_id, 'can_edit_all')
      or (
        public.has_school_permission(v_school_id, 'can_edit_students')
        and exists (
          select 1 from public.school_members sm
          where sm.school_id = v_school_id and sm.user_id = auth.uid()
            and sm.status = 'active' and sm.role = 'teacher'
        )
      )
    )
    and not exists (
      select 1 from public.student_occurrences o where o.attachment_path = p_name
    );
end;
$function$;
revoke all on function public.student_deleter_can_remove_orphan_attachment(text) from public, anon;
grant execute on function public.student_deleter_can_remove_orphan_attachment(text) to authenticated;

create policy "student deleters view orphan occurrence attachments"
on storage.objects for select to authenticated
using (bucket_id = 'occurrence-attachments'
  and public.student_deleter_can_remove_orphan_attachment(name));

create policy "student deleters remove orphan occurrence attachments"
on storage.objects for delete to authenticated
using (bucket_id = 'occurrence-attachments'
  and public.student_deleter_can_remove_orphan_attachment(name));

commit;
