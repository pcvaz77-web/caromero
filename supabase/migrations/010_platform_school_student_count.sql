-- CARÔMETRO COMERCIAL
-- Contagem de alunos por escola
-- Migration 010
--
-- Objetivo:
-- Completar o dashboard do proprietário com a contagem de alunos por escola.
-- Não altera dados existentes.

begin;


-- ============================================================
-- 1. CONTAGEM DE ALUNOS POR ESCOLA
-- ============================================================

create or replace function public.platform_school_student_count(
  target_school_id uuid
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)
  from public.students st
  where st.school_id = target_school_id
    and public.is_platform_owner();
$$;


revoke all on function public.platform_school_student_count(uuid)
from public;

grant execute on function public.platform_school_student_count(uuid)
to authenticated;


commit;
