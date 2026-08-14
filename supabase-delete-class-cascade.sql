-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Ao excluir uma turma confirmada pelo administrador, os alunos vinculados a
-- ela também serão excluídos.
alter table public.students drop constraint if exists students_class_id_fkey;
alter table public.students add constraint students_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete cascade;
