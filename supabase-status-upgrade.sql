-- Execute uma vez no Supabase: SQL Editor > New query > Run.
alter table public.students drop constraint if exists students_has_report_check;
update public.students set has_report = 'Laudo' where has_report = 'Sim';
update public.students set has_report = '' where has_report = 'Não';
alter table public.students alter column has_report set default '';
alter table public.students add constraint students_has_report_check check (has_report in ('', 'Laudo', 'Dificuldade leve', 'Dificuldade grave'));