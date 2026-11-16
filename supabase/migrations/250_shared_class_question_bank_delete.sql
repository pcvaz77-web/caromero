-- Professores, coordenadores e administradores da escola podem remover
-- questões do banco comum. A exclusão não modifica provas já criadas.
begin;

drop policy if exists class_exam_question_bank_delete on public.class_exam_question_bank;
create policy class_exam_question_bank_delete on public.class_exam_question_bank
  for delete to authenticated using (public.can_create_class_exam(school_id));

commit;
