-- CARÔMETRO COMERCIAL
-- Controle de segurança da plataforma
-- Migration 007
--
-- Objetivo:
-- Criar funções centrais de validação de acesso.
-- Não altera dados existentes.
-- Não remove informações.

begin;


-- ============================================================
-- 1. VERIFICAR SE USUÁRIO É DONO DA PLATAFORMA
-- ============================================================

create or replace function public.is_platform_owner()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.role = 'owner'
      and pa.status = 'active'
  );
$$;


revoke all on function public.is_platform_owner()
from public;

grant execute on function public.is_platform_owner()
to authenticated;



-- ============================================================
-- 2. VERIFICAR SE USUÁRIO PODE ACESSAR UMA ESCOLA
-- ============================================================

create or replace function public.can_access_school(
  target_school_id uuid
)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  );
$$;


revoke all on function public.can_access_school(uuid)
from public;

grant execute on function public.can_access_school(uuid)
to authenticated;



-- ============================================================
-- 3. VERIFICAR SE ESCOLA ESTÁ ATIVA
-- ============================================================

create or replace function public.is_school_active(
  target_school_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schools s
    where s.id = target_school_id
      and s.status = 'active'
  );
$$;


revoke all on function public.is_school_active(uuid)
from public;

grant execute on function public.is_school_active(uuid)
to authenticated;



-- ============================================================
-- 4. VERIFICAR ASSINATURA DA ESCOLA
-- ============================================================

create or replace function public.has_active_school_subscription(
  target_school_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_subscriptions ss
    where ss.school_id = target_school_id
      and ss.status = 'active'
  );
$$;


revoke all on function public.has_active_school_subscription(uuid)
from public;

grant execute on function public.has_active_school_subscription(uuid)
to authenticated;



-- ============================================================
-- 5. FUNÇÃO CENTRAL DE ACESSO COMERCIAL
-- ============================================================

create or replace function public.can_use_school(
  target_school_id uuid
)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select
    public.is_platform_owner()
    or
    (
      public.can_access_school(target_school_id)
      and public.is_school_active(target_school_id)
      and public.has_active_school_subscription(target_school_id)
    );
$$;


revoke all on function public.can_use_school(uuid)
from public;

grant execute on function public.can_use_school(uuid)
to authenticated;


commit;
