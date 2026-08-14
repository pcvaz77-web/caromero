-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Corrige somente o padrão dos próximos alunos. Os alunos já cadastrados não
-- são alterados: a tela já ignora o valor técnico antigo quando não há uma
-- pendência registrada em uniform_pending.

alter table public.students
  alter column uniform_received set default true,
  alter column shoes_received set default true;

-- Conferência: pendências de uniforme e tênis devem estar em uniform_pending.
select
  count(*) filter (where uniform_pending = 'uniform') as sem_uniforme,
  count(*) filter (where uniform_pending = 'shoes') as sem_tenis,
  count(*) filter (where uniform_pending = 'both') as sem_os_dois,
  count(*) filter (where material_received = false) as sem_material
from public.students;
