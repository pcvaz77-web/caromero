-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Corrige o padrão técnico antigo que marcava alunos já existentes como
-- "não recebeu uniforme e tênis" sem qualquer ação de usuário.
-- Pendências registradas de verdade (uniform_pending preenchido) são mantidas.

begin;

alter table public.students
  alter column uniform_received set default true,
  alter column shoes_received set default true;

update public.students
set uniform_received = true,
    shoes_received = true
where uniform_pending is null
  and uniform_received = false
  and shoes_received = false;

commit;

-- Conferência: o resultado deve listar somente pendências realmente salvas.
select
  count(*) filter (where uniform_pending = 'uniform') as sem_uniforme,
  count(*) filter (where uniform_pending = 'shoes') as sem_tenis,
  count(*) filter (where uniform_pending = 'both') as sem_os_dois,
  count(*) filter (where material_received = false) as sem_material
from public.students;
