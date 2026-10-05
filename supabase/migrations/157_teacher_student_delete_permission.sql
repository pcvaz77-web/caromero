-- A opção de professor "Pode editar e excluir" grava can_edit_students.
-- Mantém a exclusão restrita à escola ativa e preserva as permissões próprias
-- de exclusão e de edição total dos demais papéis.
drop policy if exists "authorized_school_members_can_delete_students" on public.students;

create policy "authorized_school_members_can_delete_students"
on public.students
for delete
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_delete_students')
    or public.has_school_permission(school_id, 'can_edit_all')
    or (
      public.has_school_permission(school_id, 'can_edit_students')
      and exists (
        select 1
        from public.school_members sm
        where sm.school_id = students.school_id
          and sm.user_id = auth.uid()
          and sm.status = 'active'
          and sm.role = 'teacher'
      )
    )
  )
);
