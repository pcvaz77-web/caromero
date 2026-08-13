-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Requer os scripts anteriores de Uniforme e de permissões já instalados.
-- Os alunos já cadastrados começam como "recebeu material" para que não
-- sejam criadas pendências artificiais ao ativar esta nova função.

alter table public.students
  add column if not exists material_received boolean not null default true;

-- Material usa a mesma permissão já concedida para o controle de Uniforme.
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
    or old.material_received is distinct from new.material_received
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
      raise exception 'Sem permissão para registrar uniforme e material do aluno';
    elsif not is_counselor and not coalesce(rights.can_edit_all or rights.can_edit_uniform, false) then
      raise exception 'Sem permissão para registrar uniforme e material do aluno';
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

-- A ação coletiva passa a incluir material, mantendo as mesmas permissões.
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
      set uniform_pending = null, uniform_received = true, shoes_received = true, material_received = true
      where target_class_id is null or class_id = target_class_id;
    get diagnostics affected = row_count;
    return affected;
  end if;

  select exists (
    select 1 from public.class_counselors c where c.counselor_user_id = auth.uid()
  ) into is_counselor;

  if is_counselor then
    if target_class_id is null then raise exception 'Conselheiros devem selecionar uma turma'; end if;
    select * into counselor from public.class_counselors
      where counselor_user_id = auth.uid() and class_id = target_class_id;
    if counselor.id is null or not coalesce(counselor.can_mark_all_uniform_received, false) then
      raise exception 'Sem permissão para marcar todos como receberam nesta turma';
    end if;
    perform set_config('app.uniform_bulk_update', 'true', true);
    update public.students
      set uniform_pending = null, uniform_received = true, shoes_received = true, material_received = true
      where class_id = target_class_id;
    get diagnostics affected = row_count;
    return affected;
  end if;

  if not coalesce(rights.can_mark_all_uniform_received, false) then
    raise exception 'Sem permissão para marcar todos como receberam';
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
