-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Mantém um registro mínimo quando o login é cancelado, sem guardar senha.

create table if not exists public.cancelled_logins (
  id uuid primary key default gen_random_uuid(),
  former_user_id uuid not null,
  email text not null,
  full_name text,
  cancelled_by uuid not null,
  cancelled_at timestamptz not null default now()
);

alter table public.cancelled_logins enable row level security;

drop policy if exists "Only admins read cancelled logins" on public.cancelled_logins;
create policy "Only admins read cancelled logins"
on public.cancelled_logins for select
to authenticated
using (
  exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);
