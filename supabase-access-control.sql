-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Cria o controle manual de acesso à plataforma.

alter table public.user_permissions
  add column if not exists access_status text not null default 'active';

alter table public.user_permissions
  drop constraint if exists user_permissions_access_status_check;

alter table public.user_permissions
  add constraint user_permissions_access_status_check
  check (access_status in ('active', 'suspended'));

-- Mantém o administrador principal sempre com acesso.
update public.user_permissions
set access_status = 'active'
where role = 'admin';
