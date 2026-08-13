-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Coordenadores são usuários cadastrados que podem receber permissões avançadas.
-- Usuários comuns permanecem somente como visualizadores.

alter table public.user_permissions
  add column if not exists is_coordinator boolean not null default false;

-- A regra passa a valer também para permissões que já existiam: somente
-- administrador e coordenadores mantêm ou recebem direitos avançados.
update public.user_permissions
set
  can_add_students = false,
  can_delete_students = false,
  can_edit_all = false,
  can_edit_photo = false,
  can_edit_name = false,
  can_edit_class = false,
  can_edit_report = false,
  can_edit_uniform = false,
  can_mark_all_uniform_received = false,
  can_register_occurrences = false,
  can_edit_occurrences = false,
  can_delete_occurrences = false
where role <> 'admin' and not is_coordinator;

-- Mesmo uma alteração direta não consegue manter permissões avançadas para
-- quem não é coordenador. Ao remover um coordenador, seus direitos zeram.
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
    new.can_edit_uniform := false;
    new.can_mark_all_uniform_received := false;
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

-- Nenhum conselheiro ou usuário comum pode usar permissões avançadas fora
-- da função de coordenador.
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
  if not coalesce(rights.is_coordinator, false) then
    raise exception 'Somente coordenadores autorizados podem editar alunos';
  end if;

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

create or replace function public.mark_all_uniform_received(target_class_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  affected integer;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role <> 'admin' and (not coalesce(rights.is_coordinator, false) or not coalesce(rights.can_mark_all_uniform_received, false)) then
    raise exception 'Somente coordenadores autorizados podem marcar todos como receberam';
  end if;
  perform set_config('app.uniform_bulk_update', 'true', true);
  update public.students
  set uniform_pending = null, uniform_received = true, shoes_received = true, material_received = true
  where target_class_id is null or class_id = target_class_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.mark_all_uniform_received(uuid) from public;
grant execute on function public.mark_all_uniform_received(uuid) to authenticated;

-- Remove políticas antigas de escrita e recria uma única regra segura por
-- tabela, mantendo as políticas de leitura já existentes.
do $$
declare item record;
begin
  for item in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('students', 'classes', 'student_occurrences')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', item.policyname, item.tablename);
  end loop;
end;
$$;

-- Garante leitura dos dados do sistema caso uma política antiga do tipo ALL
-- tenha sido substituída durante a atualização.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'students' and cmd = 'SELECT') then
    create policy "Authenticated users read students" on public.students for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'classes' and cmd = 'SELECT') then
    create policy "Authenticated users read classes" on public.classes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'student_occurrences' and cmd = 'SELECT') then
    create policy "Authenticated users read occurrences" on public.student_occurrences for select to authenticated using (true);
  end if;
end;
$$;

create policy "Coordinators add students" on public.students for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_add_students or p.can_edit_all)))));
create policy "Coordinators edit students" on public.students for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))));
create policy "Coordinators delete students" on public.students for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));

create policy "Coordinators add classes" on public.classes for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_add_students or p.can_edit_all)))));
create policy "Coordinators edit classes" on public.classes for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))));
create policy "Coordinators delete classes" on public.classes for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));

create policy "Coordinators add occurrences" on public.student_occurrences for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_register_occurrences or p.can_edit_all)))));
create policy "Coordinators edit occurrences" on public.student_occurrences for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (student_occurrences.created_by = auth.uid() and p.is_coordinator and (p.can_edit_occurrences or p.can_edit_all)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (student_occurrences.created_by = auth.uid() and p.is_coordinator and (p.can_edit_occurrences or p.can_edit_all)))));
create policy "Coordinators delete occurrences" on public.student_occurrences for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (student_occurrences.created_by = auth.uid() and p.is_coordinator and (p.can_delete_occurrences or p.can_edit_all)))));

drop policy if exists "Allowed users upload student photos" on storage.objects;
drop policy if exists "Allowed users update student photos" on storage.objects;
drop policy if exists "Allowed users delete student photos" on storage.objects;
create policy "Coordinators upload student photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_add_students or p.can_edit_all or p.can_edit_photo)))));
create policy "Coordinators update student photos" on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo)))));
create policy "Coordinators delete student photos" on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo)))));
