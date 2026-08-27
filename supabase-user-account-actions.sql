-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Mantém um registro mínimo quando o login é cancelado, sem guardar senha.

begin;

create table if not exists public.cancelled_logins (
  id uuid primary key default gen_random_uuid(),
  former_user_id uuid not null,
  email text not null,
  full_name text,
  cancelled_by uuid not null,
  cancelled_at timestamptz not null default now()
);

-- Uma conta cancelada possui um único registro administrativo. Além de evitar
-- duplicidade visual, isto torna chamadas repetidas da Edge Function seguras.
create unique index if not exists cancelled_logins_former_user_id_key
on public.cancelled_logins (former_user_id);

alter table public.cancelled_logins enable row level security;

drop policy if exists "Only admins read cancelled logins" on public.cancelled_logins;
drop policy if exists "Only platform owner reads cancelled logins" on public.cancelled_logins;
create policy "Only platform owner reads cancelled logins"
on public.cancelled_logins for select
to authenticated
using (public.is_platform_owner());

-- A Edge Function com service_role é o único caminho de escrita.
revoke insert, update, delete on public.cancelled_logins from anon, authenticated;

commit;
