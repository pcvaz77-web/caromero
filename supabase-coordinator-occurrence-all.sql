-- Execute depois do script de Coordenadores no Supabase.
-- Coordenadores autorizados podem editar e excluir ocorrências de qualquer responsável.

drop policy if exists "Coordinators edit occurrences" on public.student_occurrences;
drop policy if exists "Coordinators delete occurrences" on public.student_occurrences;

create policy "Coordinators edit occurrences" on public.student_occurrences for update to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))
  ))
  with check (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))
  ));

create policy "Coordinators delete occurrences" on public.student_occurrences for delete to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid()
      and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_delete_occurrences)))
  ));
