-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Um usuário cadastrado só pode ocupar UMA das funções: coordenador ou
-- conselheiro de turma. Essa regra impede conflitos mesmo entre dispositivos.

create or replace function public.enforce_exclusive_coordinator_counselor_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'user_permissions' then
    if coalesce(new.is_coordinator, false)
      and exists (
        select 1
        from public.class_counselors c
        where c.counselor_user_id = new.user_id
      ) then
      raise exception 'Este usuario ja e conselheiro de turma. Remova primeiro o vinculo de conselheiro antes de torna-lo coordenador.';
    end if;
  elsif tg_table_name = 'class_counselors' then
    if new.counselor_user_id is not null
      and exists (
        select 1
        from public.user_permissions p
        where p.user_id = new.counselor_user_id
          and coalesce(p.is_coordinator, false)
      ) then
      raise exception 'Este usuario ja e coordenador e nao pode ser conselheiro. Coordenadores usam apenas permissoes avancadas.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_coordinator_with_counselor_role on public.user_permissions;
create trigger prevent_coordinator_with_counselor_role
before insert or update of is_coordinator on public.user_permissions
for each row execute function public.enforce_exclusive_coordinator_counselor_role();

drop trigger if exists prevent_counselor_with_coordinator_role on public.class_counselors;
create trigger prevent_counselor_with_coordinator_role
before insert or update of counselor_user_id on public.class_counselors
for each row execute function public.enforce_exclusive_coordinator_counselor_role();
