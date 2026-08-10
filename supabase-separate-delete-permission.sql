-- Execute uma vez no Supabase: SQL Editor > New query > Run.
alter table public.user_permissions
  add column if not exists can_delete_students boolean not null default false;

-- Administradores mantêm todas as permissões.
update public.user_permissions
set can_delete_students = true
where role = 'admin';

-- Excluir alunos e turmas passa a exigir a permissão própria de exclusão.
drop policy if exists "Allowed users delete students" on public.students;
create policy "Allowed users delete students" on public.students for delete to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.can_delete_students or p.role = 'admin')
  ));

drop policy if exists "Allowed users delete classes" on public.classes;
create policy "Allowed users delete classes" on public.classes for delete to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.can_delete_students or p.role = 'admin')
  ));
