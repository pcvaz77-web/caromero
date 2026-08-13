-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Coordenadores só recebem permissões avançadas que o administrador marcar.
-- A consulta de Ocorrências fica disponível a todo usuário autenticado.

update public.user_permissions
set can_edit_students = false,
    can_view_occurrences = false
where role <> 'admin' and coalesce(is_coordinator, false);

create or replace function public.enforce_coordinator_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'admin' and coalesce(new.is_coordinator, false) then
    -- Esta é uma permissão geral de professor(a), não de coordenador.
    new.can_edit_students := false;
  elsif new.role <> 'admin' then
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

drop trigger if exists enforce_coordinator_permissions on public.user_permissions;
create trigger enforce_coordinator_permissions
before insert or update on public.user_permissions
for each row execute function public.enforce_coordinator_permissions();

-- Substitui qualquer regra de leitura anterior e libera somente a consulta
-- para todos os usuários conectados. Criar, editar e excluir continuam
-- exigindo as permissões avançadas já escolhidas pelo administrador.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'student_occurrences'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.student_occurrences', item.policyname);
  end loop;
end;
$$;

create policy "Authenticated users view occurrences" on public.student_occurrences
for select to authenticated using (true);

-- O próprio responsável sempre pode corrigir ou excluir a ocorrência que
-- registrou. Coordenadores continuam precisando das permissões avançadas
-- para alterar registros feitos por outras pessoas.
drop policy if exists "Account users edit occurrences" on public.student_occurrences;
create policy "Account users edit occurrences" on public.student_occurrences for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.user_permissions p
      where p.user_id = auth.uid()
        and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.user_permissions p
      where p.user_id = auth.uid()
        and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))
    )
  );

drop policy if exists "Account users delete occurrences" on public.student_occurrences;
create policy "Account users delete occurrences" on public.student_occurrences for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.user_permissions p
      where p.user_id = auth.uid()
        and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_delete_occurrences)))
    )
  );
