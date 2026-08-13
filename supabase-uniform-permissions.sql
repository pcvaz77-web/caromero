-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Requer os scripts de Uniforme e de Conselheiros já instalados.
--
-- Cria duas permissões independentes:
--   1. Registrar uniforme: altera o seletor individual de cada aluno.
--   2. Marcar todos como receberam: executa somente a ação coletiva.

alter table public.user_permissions
  add column if not exists can_edit_uniform boolean not null default false,
  add column if not exists can_mark_all_uniform_received boolean not null default false;

alter table public.class_counselors
  add column if not exists can_edit_uniform boolean not null default false,
  add column if not exists can_mark_all_uniform_received boolean not null default false;

-- Impede alterações diretas de Uniforme sem a permissão individual e
-- mantém a prioridade das permissões por turma para conselheiros.
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
  uniform_changed boolean;
  bulk_update boolean;
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
  end if;

  uniform_changed :=
    old.uniform_received is distinct from new.uniform_received
    or old.shoes_received is distinct from new.shoes_received
    or old.uniform_size is distinct from new.uniform_size
    or old.shoe_size is distinct from new.shoe_size
    or old.uniform_received_at is distinct from new.uniform_received_at
    or old.uniform_notes is distinct from new.uniform_notes
    or old.uniform_pending is distinct from new.uniform_pending;
  bulk_update := current_setting('app.uniform_bulk_update', true) = 'true';

  if uniform_changed then
    if bulk_update then
      if is_counselor and not coalesce(counselor.can_mark_all_uniform_received, false) then
        raise exception 'Sem permissão para marcar todos como receberam';
      end if;
      if not is_counselor and not coalesce(rights.can_mark_all_uniform_received, false) then
        raise exception 'Sem permissão para marcar todos como receberam';
      end if;
    elsif is_counselor and not coalesce(counselor.can_edit_all or counselor.can_edit_uniform, false) then
      raise exception 'Sem permissão para registrar o uniforme do aluno';
    elsif not is_counselor and not coalesce(rights.can_edit_all or rights.can_edit_uniform, false) then
      raise exception 'Sem permissão para registrar o uniforme do aluno';
    end if;
  end if;

  if is_counselor then
    if old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name then
      raise exception 'Conselheiros não podem mover alunos de turma';
    end if;
    if old.full_name is distinct from new.full_name and not coalesce(counselor.can_edit_all or counselor.can_edit_name, false) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
    if old.photo_path is distinct from new.photo_path and not coalesce(counselor.can_edit_all or counselor.can_edit_photo, false) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
    if old.has_report is distinct from new.has_report and not coalesce(counselor.can_edit_all or counselor.can_edit_report, false) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
    return new;
  end if;

  if coalesce(rights.can_edit_all, false) then return new; end if;
  if old.full_name is distinct from new.full_name and not coalesce(rights.can_edit_name, false) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not coalesce(rights.can_edit_photo, false) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not coalesce(rights.can_edit_class, false) then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not coalesce(rights.can_edit_report, false) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
  return new;
end;
$$;

-- A permissão coletiva usa esta função, sem conceder o seletor individual.
-- Conselheiros sempre precisam informar a própria turma e não podem atingir
-- alunos de outras turmas.
create or replace function public.mark_all_uniform_received(target_class_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  counselor public.class_counselors%rowtype;
  is_counselor boolean;
  affected integer;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' then
    update public.students
      set uniform_pending = null, uniform_received = true, shoes_received = true
      where target_class_id is null or class_id = target_class_id;
    get diagnostics affected = row_count;
    return affected;
  end if;

  select exists (
    select 1 from public.class_counselors c where c.counselor_user_id = auth.uid()
  ) into is_counselor;

  if is_counselor then
    if target_class_id is null then
      raise exception 'Conselheiros devem selecionar uma turma';
    end if;
    select * into counselor from public.class_counselors
      where counselor_user_id = auth.uid() and class_id = target_class_id;
    if counselor.id is null or not coalesce(counselor.can_mark_all_uniform_received, false) then
      raise exception 'Sem permissão para marcar todos como receberam nesta turma';
    end if;
    perform set_config('app.uniform_bulk_update', 'true', true);
    update public.students
      set uniform_pending = null, uniform_received = true, shoes_received = true
      where class_id = target_class_id;
    get diagnostics affected = row_count;
    return affected;
  end if;

  if not coalesce(rights.can_mark_all_uniform_received, false) then
    raise exception 'Sem permissão para marcar todos como receberam';
  end if;
  perform set_config('app.uniform_bulk_update', 'true', true);
  update public.students
    set uniform_pending = null, uniform_received = true, shoes_received = true
    where target_class_id is null or class_id = target_class_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.mark_all_uniform_received(uuid) from public;
grant execute on function public.mark_all_uniform_received(uuid) to authenticated;

-- A atualização comum depende somente de permissão de edição individual.
-- A ação coletiva acima tem validação própria e não amplia essa permissão.
drop policy if exists "Authenticated users can update students" on public.students;
drop policy if exists "Allowed users edit students" on public.students;
create policy "Allowed users edit students" on public.students for update to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report or c.can_edit_uniform))
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform))
    )
  )
  with check (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report or c.can_edit_uniform))
    or (
      not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform))
    )
  );
