-- CARÔMETRO COMERCIAL
-- Estado global de acesso independente das permissões legadas de uma escola.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

create table if not exists public.platform_account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  updated_at timestamptz not null default now()
);

alter table public.platform_account_access enable row level security;

-- Preserva suspensões já existentes e considera ativas as demais contas.
insert into public.platform_account_access (user_id, status)
select u.id,
       case when to_jsonb(up) ->> 'access_status' = 'suspended' then 'suspended' else 'active' end
from auth.users u
left join public.user_permissions up on up.user_id = u.id
on conflict (user_id) do nothing;

create or replace function public.initialize_platform_account_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.platform_account_access (user_id, status)
  values (new.id, 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

revoke all on function public.initialize_platform_account_access() from public;
revoke all on function public.initialize_platform_account_access() from anon;

drop trigger if exists initialize_platform_account_access on auth.users;
create trigger initialize_platform_account_access
after insert on auth.users
for each row execute function public.initialize_platform_account_access();

drop policy if exists "users_read_own_platform_access" on public.platform_account_access;
create policy "users_read_own_platform_access"
on public.platform_account_access
for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.platform_account_access from anon, authenticated;

do $block$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platform_account_access'
  ) then
    alter publication supabase_realtime add table public.platform_account_access;
  end if;
end;
$block$;

commit;
