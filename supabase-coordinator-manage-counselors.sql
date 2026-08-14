-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- O administrador concede a permissão avançada, mas somente o coordenador
-- autorizado escolhe, troca ou remove conselheiros de turma.

alter table public.user_permissions
  add column if not exists can_manage_counselors boolean not null default false;

update public.user_permissions
set can_manage_counselors = false
where role = 'admin' or not coalesce(is_coordinator, false);

-- Mantém a nova permissão exclusivamente no grupo de coordenadores.
create or replace function public.clear_invalid_counselor_manager_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' or not coalesce(new.is_coordinator, false) then
    new.can_manage_counselors := false;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_invalid_counselor_manager_permission on public.user_permissions;
create trigger clear_invalid_counselor_manager_permission
before insert or update on public.user_permissions
for each row execute function public.clear_invalid_counselor_manager_permission();

create or replace function public.can_manage_class_counselors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_permissions
    where user_id = auth.uid()
      and role <> 'admin'
      and is_coordinator
      and can_manage_counselors
  );
$$;

-- Entrega ao coordenador somente os dados necessários para escolher alguém,
-- sem expor as permissões avançadas dos outros usuários.
create or replace function public.list_counselor_candidates()
returns table (user_id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_class_counselors() then
    raise exception 'Somente um coordenador autorizado pode listar candidatos a conselheiro';
  end if;

  return query
  select p.user_id, pr.email::text, pr.full_name::text
  from public.user_permissions p
  join public.profiles pr on pr.id = p.user_id
  order by coalesce(nullif(trim(pr.full_name), ''), pr.email);
end;
$$;

revoke all on function public.list_counselor_candidates() from public;
grant execute on function public.list_counselor_candidates() to authenticated;

-- Políticas antigas são removidas porque políticas RLS permissivas se somam.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'class_counselors'
  loop
    execute format('drop policy if exists %I on public.class_counselors', item.policyname);
  end loop;
end;
$$;

create policy "Authenticated users view counselor assignments"
on public.class_counselors for select to authenticated
using (true);

create policy "Authorized coordinators add counselor assignments"
on public.class_counselors for insert to authenticated
with check (public.can_manage_class_counselors());

create policy "Authorized coordinators update counselor assignments"
on public.class_counselors for update to authenticated
using (public.can_manage_class_counselors())
with check (public.can_manage_class_counselors());

create policy "Authorized coordinators delete counselor assignments"
on public.class_counselors for delete to authenticated
using (public.can_manage_class_counselors());
