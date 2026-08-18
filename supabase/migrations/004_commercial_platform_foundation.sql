-- CARÔMETRO COMERCIAL
-- Fundação da plataforma
-- Migration 004
--
-- Objetivo:
-- Criar a camada administrativa da plataforma,
-- separando o proprietário do sistema
-- dos administradores das escolas.

-- ============================================================
-- 1. ADMINISTRADORES DA PLATAFORMA
-- ============================================================

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role text not null,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint platform_admins_role_check
    check (
      role in (
        'owner',
        'support',
        'billing',
        'developer'
      )
    ),

  constraint platform_admins_status_check
    check (
      status in (
        'active',
        'suspended'
      )
    ),

  constraint platform_admins_user_unique
    unique(user_id)
);

alter table public.platform_admins
enable row level security;


-- ============================================================
-- 2. ASSINATURAS DAS ESCOLAS
-- ============================================================

create table if not exists public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),

  school_id uuid not null
    references public.schools(id)
    on delete cascade,

  plan text not null default 'free',

  billing_type text not null default 'fixed_school',

  status text not null default 'active',

  price numeric(10,2) not null default 0,

  granted_by uuid
    references public.platform_admins(user_id)
    on delete set null,

  grant_reason text,

  grant_expires_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint school_subscriptions_plan_check
    check (
      plan in (
        'free',
        'basic',
        'professional',
        'enterprise'
      )
    ),

  constraint school_subscriptions_billing_check
    check (
      billing_type in (
        'fixed_school',
        'per_student'
      )
    ),

  constraint school_subscriptions_status_check
    check (
      status in (
        'active',
        'suspended',
        'expired'
      )
    ),

  constraint school_subscriptions_school_unique
    unique(school_id)
);

alter table public.school_subscriptions
enable row level security;


-- ============================================================
-- 3. FUNÇÃO PARA VERIFICAR ADMIN DA PLATAFORMA
-- ============================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and status = 'active'
  );
$$;


revoke all on function public.is_platform_admin()
from public;

grant execute on function public.is_platform_admin()
to authenticated;


-- ============================================================
-- 4. POLICIES PLATFORM ADMINS
-- ============================================================

create policy "platform_admins_can_view_self"
on public.platform_admins
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin()
);


-- ============================================================
-- 5. POLICIES ASSINATURAS
-- ============================================================

create policy "platform_admins_manage_subscriptions"
on public.school_subscriptions
for all
to authenticated
using (
  public.is_platform_admin()
)
with check (
  public.is_platform_admin()
);


-- ============================================================
-- FIM MIGRATION 004
-- ============================================================