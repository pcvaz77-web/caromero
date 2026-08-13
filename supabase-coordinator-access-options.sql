-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Acrescenta permissões separadas para visualização de Uniforme e Ocorrências.

alter table public.user_permissions
  add column if not exists can_view_uniform boolean not null default false,
  add column if not exists can_view_occurrences boolean not null default false;

-- Coordenadores que já tinham permissão de uso continuam vendo a respectiva
-- função; os demais só recebem acesso quando o administrador marcar a opção.
update public.user_permissions
set can_view_uniform = true
where is_coordinator and (can_edit_all or can_edit_uniform or can_mark_all_uniform_received);

update public.user_permissions
set can_view_occurrences = true
where is_coordinator and (can_edit_all or can_register_occurrences or can_edit_occurrences or can_delete_occurrences);

-- A proteção de Coordenadores também zera as novas opções quando alguém é
-- removido da função.
create or replace function public.enforce_coordinator_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'admin' and not coalesce(new.is_coordinator, false) then
    new.can_add_students := false;
    new.can_delete_students := false;
    new.can_edit_all := false;
    new.can_edit_photo := false;
    new.can_edit_name := false;
    new.can_edit_class := false;
    new.can_edit_report := false;
    new.can_view_uniform := false;
    new.can_edit_uniform := false;
    new.can_mark_all_uniform_received := false;
    new.can_view_occurrences := false;
    new.can_register_occurrences := false;
    new.can_edit_occurrences := false;
    new.can_delete_occurrences := false;
  end if;
  return new;
end;
$$;

-- Consultar ocorrências também passa a ser uma escolha avançada. Registrar,
-- editar ou excluir já implica poder consultar os próprios registros.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'student_occurrences' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.student_occurrences', item.policyname);
  end loop;
end;
$$;

create policy "Coordinators view occurrences" on public.student_occurrences for select to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_view_occurrences or p.can_register_occurrences or p.can_edit_occurrences or p.can_delete_occurrences)))
  ));
