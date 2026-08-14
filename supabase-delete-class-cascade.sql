-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Proteção contra exclusão em massa: uma turma com alunos não pode ser
-- apagada. Primeiro, os alunos devem ser transferidos manualmente.
alter table public.students drop constraint if exists students_class_id_fkey;
alter table public.students add constraint students_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete restrict;
