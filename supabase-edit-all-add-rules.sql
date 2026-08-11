-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- "Editar tudo" também permite adicionar alunos e cadastrar turmas.
drop policy if exists "Allowed users add students" on public.students;
create policy "Allowed users add students" on public.students for insert to authenticated
  with check (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_add_students or p.can_edit_all)
  ));

drop policy if exists "Allowed users add classes" on public.classes;
create policy "Allowed users add classes" on public.classes for insert to authenticated
  with check (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_add_students or p.can_edit_all)
  ));
