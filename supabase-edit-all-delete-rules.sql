-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- "Editar tudo" também permite excluir alunos e turmas vazias.
drop policy if exists "Allowed users delete students" on public.students;
create policy "Allowed users delete students" on public.students for delete to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_delete_students or p.can_edit_all)
  ));

-- Usuários comuns jamais excluem uma turma que ainda possui alunos.
-- Administradores podem excluir, e a regra de cascade remove os alunos vinculados.
drop policy if exists "Allowed users delete classes" on public.classes;
create policy "Allowed users delete classes" on public.classes for delete to authenticated
  using (
    exists (
      select 1 from public.user_permissions p
      where p.user_id = auth.uid()
        and (p.role = 'admin' or p.can_delete_students or p.can_edit_all)
    )
    and (
      exists (
        select 1 from public.user_permissions p
        where p.user_id = auth.uid() and p.role = 'admin'
      )
      or not exists (select 1 from public.students s where s.class_id = public.classes.id)
    )
  );
