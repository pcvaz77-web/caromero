-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Para Ocorrências, a permissão de um conselheiro vale em todas as turmas.
-- Ele continua podendo editar ou excluir somente ocorrências criadas por ele.

drop policy if exists "Authenticated users add occurrences" on public.student_occurrences;
create policy "Authenticated users add occurrences" on public.student_occurrences for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
      or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.can_register_occurrences)
      or (
        not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
        and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_register_occurrences)
      )
    )
  );

drop policy if exists "Authenticated users update occurrences" on public.student_occurrences;
create policy "Authenticated users update occurrences" on public.student_occurrences for update to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      created_by = auth.uid()
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.can_edit_occurrences)
    )
    or (
      created_by = auth.uid()
      and not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_edit_occurrences)
    )
  )
  with check (
    created_by = auth.uid()
    or exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Authenticated users delete occurrences" on public.student_occurrences;
create policy "Authenticated users delete occurrences" on public.student_occurrences for delete to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      created_by = auth.uid()
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.can_delete_occurrences)
    )
    or (
      created_by = auth.uid()
      and not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_delete_occurrences)
    )
  );
