-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Restaura as permissões gerais antigas para usuários comuns, mantendo
-- Uniforme e Ocorrências exclusivamente como permissões avançadas de coordenadores.

create or replace function public.enforce_coordinator_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Somente editores podem receber as permissões gerais da lista principal.
  if new.role not in ('admin', 'editor') then
    new.can_add_students := false;
    new.can_edit_students := false;
  end if;

  -- Direitos avançados continuam restritos a administradores e coordenadores.
  if new.role <> 'admin' and not coalesce(new.is_coordinator, false) then
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

create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  uniform_changed boolean;
  bulk_update boolean;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' then return new; end if;

  uniform_changed :=
    old.uniform_received is distinct from new.uniform_received
    or old.shoes_received is distinct from new.shoes_received
    or old.material_received is distinct from new.material_received
    or old.uniform_size is distinct from new.uniform_size
    or old.shoe_size is distinct from new.shoe_size
    or old.uniform_received_at is distinct from new.uniform_received_at
    or old.uniform_notes is distinct from new.uniform_notes
    or old.uniform_pending is distinct from new.uniform_pending;
  bulk_update := current_setting('app.uniform_bulk_update', true) = 'true';

  -- Editores comuns mantêm as permissões gerais antigas, mas não alteram
  -- dados de Uniforme e material, que são recursos avançados.
  if not coalesce(rights.is_coordinator, false) then
    if not coalesce(rights.can_edit_students, false) then
      raise exception 'Sem permissão para editar alunos';
    end if;
    if uniform_changed then
      raise exception 'Uniforme e material exigem permissão de coordenador';
    end if;
    return new;
  end if;

  if uniform_changed then
    if bulk_update and not coalesce(rights.can_mark_all_uniform_received, false) then
      raise exception 'Sem permissão para marcar todos como receberam';
    end if;
    if not bulk_update and not coalesce(rights.can_edit_all or rights.can_edit_uniform, false) then
      raise exception 'Sem permissão para registrar uniforme e material do aluno';
    end if;
  end if;

  if coalesce(rights.can_edit_all, false) then return new; end if;
  if old.full_name is distinct from new.full_name and not coalesce(rights.can_edit_name, false) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not coalesce(rights.can_edit_photo, false) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not coalesce(rights.can_edit_class, false) then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not coalesce(rights.can_edit_report, false) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
  return new;
end;
$$;

drop policy if exists "Coordinators add students" on public.students;
drop policy if exists "Coordinators edit students" on public.students;
drop policy if exists "Coordinators delete students" on public.students;
drop policy if exists "Coordinators add classes" on public.classes;
drop policy if exists "Coordinators edit classes" on public.classes;
drop policy if exists "Coordinators delete classes" on public.classes;
drop policy if exists "Coordinators upload student photos" on storage.objects;
drop policy if exists "Coordinators update student photos" on storage.objects;
drop policy if exists "Coordinators delete student photos" on storage.objects;

create policy "Coordinators add students" on public.students for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_add_students or (p.is_coordinator and p.can_edit_all))));
create policy "Coordinators edit students" on public.students for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))));
create policy "Coordinators delete students" on public.students for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));

create policy "Coordinators add classes" on public.classes for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_add_students or (p.is_coordinator and p.can_edit_all))));
create policy "Coordinators edit classes" on public.classes for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))));
create policy "Coordinators delete classes" on public.classes for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));

create policy "Coordinators upload student photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_add_students or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo)))));
create policy "Coordinators update student photos" on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo)))));
create policy "Coordinators delete student photos" on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo)))));
