-- CARÔMETRO COMERCIAL
-- Estrutura-base para um projeto Supabase novo e vazio.
--
-- Este arquivo contém somente as quatro tabelas centrais que antecedem os
-- scripts históricos do projeto. Ele não cria escola, usuário, vínculo ou
-- dado de demonstração. As migrations comerciais são aplicadas depois.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('viewer', 'editor', 'admin')),
  can_add_students boolean not null default false,
  can_edit_students boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O banco legado recebeu estas permissões em scripts separados ao longo do
-- tempo. Uma instalação limpa precisa disponibilizá-las antes de recriar as
-- funções e triggers históricas que usam user_permissions%rowtype.
alter table public.user_permissions
  add column if not exists access_status text not null default 'active',
  add column if not exists is_coordinator boolean not null default false,
  add column if not exists can_delete_students boolean not null default false,
  add column if not exists can_edit_all boolean not null default false,
  add column if not exists can_edit_photo boolean not null default false,
  add column if not exists can_edit_name boolean not null default false,
  add column if not exists can_edit_class boolean not null default false,
  add column if not exists can_edit_report boolean not null default false,
  add column if not exists can_manage_observation_options boolean not null default false,
  add column if not exists can_invite_teachers boolean not null default false,
  add column if not exists can_manage_member_permissions boolean not null default false,
  add column if not exists can_view_uniform boolean not null default false,
  add column if not exists can_edit_uniform boolean not null default false,
  add column if not exists can_mark_all_uniform_received boolean not null default false,
  add column if not exists can_view_occurrences boolean not null default false,
  add column if not exists can_register_occurrences boolean not null default false,
  add column if not exists can_edit_occurrences boolean not null default false,
  add column if not exists can_delete_occurrences boolean not null default false,
  add column if not exists can_manage_counselors boolean not null default false,
  add column if not exists can_view_dashboard boolean not null default false,
  add column if not exists can_view_history boolean not null default false,
  add column if not exists can_manage_alerts boolean not null default false,
  add column if not exists can_record_followups boolean not null default false,
  add column if not exists can_export_reports boolean not null default false,
  add column if not exists can_use_bulk_actions boolean not null default false,
  add column if not exists can_view_audit boolean not null default false,
  add column if not exists can_view_class_summary boolean not null default false;

alter table public.user_permissions
  drop constraint if exists user_permissions_access_status_check;
alter table public.user_permissions
  add constraint user_permissions_access_status_check
  check (access_status in ('active', 'suspended'));

-- Compatibilidade temporária para os scripts históricos. As regras globais
-- comerciais posteriores usam is_platform_owner(); esta função não concede
-- autoridade comercial e será retirada das decisões globais ao final.
create or replace function public.is_carometro_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_permissions p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and p.access_status = 'active'
  );
$$;
revoke execute on function public.is_carometro_admin() from public, anon;
grant execute on function public.is_carometro_admin() to authenticated;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shift text not null default 'Matutino',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  class_name text,
  has_report text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_class_id_idx
  on public.students (class_id);

-- Colunas estruturais das funcionalidades de Uniforme/Material. Em uma
-- instalação nova, a ausência de pendência é o padrão; registros futuros só
-- passam a indicar pendência por uma ação explícita e autorizada da escola.
alter table public.students
  add column if not exists uniform_received boolean not null default true,
  add column if not exists shoes_received boolean not null default true,
  add column if not exists material_received boolean not null default true,
  add column if not exists uniform_size text,
  add column if not exists shoe_size text,
  add column if not exists uniform_received_at date,
  add column if not exists uniform_notes text,
  add column if not exists uniform_pending text;

alter table public.students
  drop constraint if exists students_uniform_pending_check;
alter table public.students
  add constraint students_uniform_pending_check
  check (uniform_pending is null or uniform_pending in ('uniform', 'shoes', 'both'));

alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;

-- Sem policies nesta etapa: até a instalação das regras comerciais, o acesso
-- via API permanece fechado por padrão para anon/authenticated.
