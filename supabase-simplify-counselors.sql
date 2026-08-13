-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Conselheiro passa a ser apenas a identificação do usuário responsável por
-- uma turma. Ele NÃO recebe permissões próprias: o acesso vem somente do
-- perfil normal da conta (administrador, coordenador ou professor(a)).

alter table public.class_counselors
  add column if not exists can_add_students boolean not null default false,
  add column if not exists can_delete_students boolean not null default false,
  add column if not exists can_edit_all boolean not null default false,
  add column if not exists can_edit_photo boolean not null default false,
  add column if not exists can_edit_name boolean not null default false,
  add column if not exists can_edit_class boolean not null default false,
  add column if not exists can_edit_report boolean not null default false,
  add column if not exists can_edit_uniform boolean not null default false,
  add column if not exists can_mark_all_uniform_received boolean not null default false,
  add column if not exists can_register_occurrences boolean not null default false,
  add column if not exists can_edit_occurrences boolean not null default false,
  add column if not exists can_delete_occurrences boolean not null default false;

-- Revoga permanentemente as permissões antigas que porventura estejam salvas.
update public.class_counselors
set can_add_students = false,
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
    can_delete_occurrences = false;

create or replace function public.remove_counselor_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  return new;
end;
$$;

drop trigger if exists remove_counselor_permissions on public.class_counselors;
create trigger remove_counselor_permissions
before insert or update on public.class_counselors
for each row execute function public.remove_counselor_permissions();

-- O mesmo usuário pode ser coordenador e conselheiro porque o título de
-- conselheiro não concede mais nenhuma permissão adicional.
drop trigger if exists prevent_coordinator_with_counselor_role on public.user_permissions;
drop trigger if exists prevent_counselor_with_coordinator_role on public.class_counselors;

-- Regra única para alterações de alunos: somente as permissões da conta
-- são consideradas. Conselheiro não altera nem limita essas permissões.
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

  if not coalesce(rights.is_coordinator, false) then
    if not coalesce(rights.can_edit_students, false) then
      raise exception 'Sem permissao para editar alunos';
    end if;
    if uniform_changed then
      raise exception 'Uniforme e material exigem permissao de coordenador';
    end if;
    return new;
  end if;

  if uniform_changed then
    if bulk_update and not coalesce(rights.can_mark_all_uniform_received, false) then
      raise exception 'Sem permissao para marcar todos como receberam';
    end if;
    if not bulk_update and not coalesce(rights.can_edit_all or rights.can_edit_uniform, false) then
      raise exception 'Sem permissao para registrar uniforme e material do aluno';
    end if;
  end if;

  if coalesce(rights.can_edit_all, false) then return new; end if;
  if old.full_name is distinct from new.full_name and not coalesce(rights.can_edit_name, false) then raise exception 'Sem permissao para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not coalesce(rights.can_edit_photo, false) then raise exception 'Sem permissao para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not coalesce(rights.can_edit_class, false) then raise exception 'Sem permissao para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not coalesce(rights.can_edit_report, false) then raise exception 'Sem permissao para editar as observacoes do aluno'; end if;
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
    raise exception 'Sem permissao para marcar todos como receberam';
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

-- Recria as políticas de escrita de alunos e turmas em uma única fonte.
do $$
declare item record;
begin
  for item in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('students', 'classes')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', item.policyname, item.tablename);
  end loop;
end;
$$;

create policy "Account users add students" on public.students for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_add_students or (p.is_coordinator and p.can_edit_all))));
create policy "Account users edit students" on public.students for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))));
create policy "Account users delete students" on public.students for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));
create policy "Account users add classes" on public.classes for insert to authenticated
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_add_students or (p.is_coordinator and p.can_edit_all))));
create policy "Account users edit classes" on public.classes for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_edit_class or p.can_edit_all)))));
create policy "Account users delete classes" on public.classes for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_students or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))));

-- Ocorrências também passam a obedecer somente as permissões da conta.
-- O responsável, o aluno e a turma permanecem imutáveis após o registro.
create or replace function public.lock_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.student_id is distinct from new.student_id
    or old.class_id is distinct from new.class_id
    or old.class_name is distinct from new.class_name
    or old.created_by is distinct from new.created_by
    or old.created_by_name is distinct from new.created_by_name then
    raise exception 'Aluno, turma e responsavel da ocorrencia nao podem ser alterados';
  end if;
  return new;
end;
$$;
drop trigger if exists lock_occurrence_identity on public.student_occurrences;
create trigger lock_occurrence_identity
before update on public.student_occurrences
for each row execute function public.lock_occurrence_identity();

do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'student_occurrences'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.student_occurrences', item.policyname);
  end loop;
end;
$$;

create policy "Account users view occurrences" on public.student_occurrences for select to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_view_occurrences or p.can_register_occurrences or p.can_edit_occurrences or p.can_delete_occurrences)))));
create policy "Account users add occurrences" on public.student_occurrences for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_register_occurrences)))));
create policy "Account users edit occurrences" on public.student_occurrences for update to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences)))));
create policy "Account users delete occurrences" on public.student_occurrences for delete to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_delete_occurrences)))));
