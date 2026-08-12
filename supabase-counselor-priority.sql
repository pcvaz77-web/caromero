-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Para usuários cadastrados como conselheiros, as permissões da turma
-- substituem as permissões gerais. Administradores não são restringidos.

create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  counselor public.class_counselors%rowtype;
  is_counselor boolean;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' then return new; end if;

  select exists (
    select 1 from public.class_counselors c where c.counselor_user_id = auth.uid()
  ) into is_counselor;

  if is_counselor then
    select * into counselor from public.class_counselors
      where counselor_user_id = auth.uid() and class_id = old.class_id;
    if counselor.id is null then
      raise exception 'Conselheiros só podem editar alunos de suas turmas';
    end if;
    if old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name then
      raise exception 'Conselheiros não podem mover alunos de turma';
    end if;
    if old.full_name is distinct from new.full_name and not (counselor.can_edit_all or counselor.can_edit_name) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
    if old.photo_path is distinct from new.photo_path and not (counselor.can_edit_all or counselor.can_edit_photo) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
    if old.has_report is distinct from new.has_report and not (counselor.can_edit_all or counselor.can_edit_report) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
    return new;
  end if;

  if rights.can_edit_all then return new; end if;
  if old.full_name is distinct from new.full_name and not rights.can_edit_name then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not rights.can_edit_photo then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not rights.can_edit_class then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not rights.can_edit_report then raise exception 'Sem permissão para editar as observações do aluno'; end if;
  return new;
end;
$$;

-- Remove políticas antigas permissivas, que poderiam continuar valendo em paralelo.
drop policy if exists "Authenticated users can update students" on public.students;
drop policy if exists "Allowed users edit students" on public.students;
create policy "Allowed users edit students" on public.students for update to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report))
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report))
    )
  )
  with check (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report))
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report))
    )
  );

drop policy if exists "Authenticated users can add students" on public.students;
drop policy if exists "Allowed users add students" on public.students;
create policy "Allowed users add students" on public.students for insert to authenticated
  with check (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_add_students or p.can_edit_all))
    )
  );

drop policy if exists "Authenticated users can delete students" on public.students;
drop policy if exists "Allowed users delete students" on public.students;
create policy "Allowed users delete students" on public.students for delete to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_delete_students or p.can_edit_all))
    )
  );
