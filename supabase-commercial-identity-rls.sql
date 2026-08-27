-- CARÔMETRO COMERCIAL
-- Isolamento dos dados de identidade herdados do modelo de escola única.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;

-- Remove políticas legadas, inclusive as que concediam visão global ao papel
-- `admin` de user_permissions. No comercial, administrador escolar não é
-- administrador da plataforma.
do $block$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_permissions')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      item.policyname,
      item.schemaname,
      item.tablename
    );
  end loop;
end;
$block$;

-- Cada pessoa gerencia somente o próprio perfil. O e-mail armazenado precisa
-- continuar correspondendo ao e-mail autenticado.
create policy "Users create their own commercial profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

create policy "Users view their own commercial profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_platform_owner()
);

create policy "Users update their own commercial profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

-- Diretórios de membros são fornecidos apenas pelas RPCs escolares protegidas.
-- A tabela legada fica disponível somente para a própria conta e para o owner.
create policy "Users view their own legacy permission"
on public.user_permissions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_owner()
);

revoke delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.user_permissions from anon, authenticated;

commit;
