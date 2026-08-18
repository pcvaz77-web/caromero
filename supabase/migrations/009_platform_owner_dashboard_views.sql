-- CARÔMETRO COMERCIAL
-- Visões do painel do proprietário da plataforma
-- Migration 009
--
-- Objetivo:
-- Criar consultas seguras para o futuro dashboard do proprietário.
-- Não altera dados existentes.

begin;


-- ============================================================
-- 1. RESUMO GERAL DA PLATAFORMA
-- ============================================================

create or replace function public.platform_dashboard_summary()
returns table (
  total_schools bigint,
  active_schools bigint,
  suspended_schools bigint,
  free_schools bigint,
  paid_schools bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) as total_schools,

    count(*) filter (
      where s.status = 'active'
    ) as active_schools,

    count(*) filter (
      where s.status <> 'active'
    ) as suspended_schools,

    count(*) filter (
      where ss.plan = 'free'
    ) as free_schools,

    count(*) filter (
      where ss.plan <> 'free'
    ) as paid_schools

  from public.schools s
  left join public.school_subscriptions ss
    on ss.school_id = s.id

  where public.is_platform_owner();
$$;


revoke all on function public.platform_dashboard_summary()
from public;

grant execute on function public.platform_dashboard_summary()
to authenticated;



-- ============================================================
-- 2. LISTAGEM DAS ESCOLAS
-- ============================================================

create or replace function public.platform_list_schools()
returns table (
  school_id uuid,
  school_name text,
  school_status text,
  plan text,
  billing_type text,
  subscription_status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.status,
    ss.plan,
    ss.billing_type,
    ss.status,
    s.created_at

  from public.schools s

  left join public.school_subscriptions ss
    on ss.school_id = s.id

  where public.is_platform_owner()

  order by s.created_at desc;
$$;


revoke all on function public.platform_list_schools()
from public;

grant execute on function public.platform_list_schools()
to authenticated;



-- ============================================================
-- 3. CONTAGEM DE USUÁRIOS POR ESCOLA
-- ============================================================

create or replace function public.platform_school_user_count(
  target_school_id uuid
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)
  from public.school_members sm
  where sm.school_id = target_school_id
    and public.is_platform_owner();
$$;


revoke all on function public.platform_school_user_count(uuid)
from public;

grant execute on function public.platform_school_user_count(uuid)
to authenticated;


commit;