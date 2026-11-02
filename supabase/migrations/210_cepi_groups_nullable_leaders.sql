-- Eletivas e oficinas não possuem líderes; clubes podem deixar um dos cargos vago.
-- A restrição anterior tratava dois valores NULL como iguais e impedia o cadastro.
alter table public.cepi_groups
  drop constraint if exists cepi_groups_check;

alter table public.cepi_groups
  add constraint cepi_groups_distinct_leaders_check
  check (
    leader_student_id is null
    or coleader_student_id is null
    or leader_student_id <> coleader_student_id
  );
