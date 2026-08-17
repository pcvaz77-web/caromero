-- CARÔMETRO COMERCIAL
-- Escopo de dados por escola
-- Migration 002
--
-- OBJETIVO:
-- Vincular turmas e alunos a uma escola específica.
-- Nenhuma regra desta migration deve permitir acesso
-- a dados pertencentes a outra escola.

-- ============================================================
-- 1. VÍNCULO DAS TURMAS COM A ESCOLA
-- ============================================================

alter table public.classes
add column if not exists school_id uuid;

alter table public.classes
drop constraint if exists classes_school_id_fkey;

alter table public.classes
add constraint classes_school_id_fkey
foreign key (school_id)
references public.schools(id)
on delete restrict;

create index if not exists classes_school_id_idx
on public.classes (school_id);

-- ============================================================
-- 2. VÍNCULO DOS ALUNOS COM A ESCOLA
-- ============================================================

alter table public.students
add column if not exists school_id uuid;

alter table public.students
drop constraint if exists students_school_id_fkey;

alter table public.students
add constraint students_school_id_fkey
foreign key (school_id)
references public.schools(id)
on delete restrict;

create index if not exists students_school_id_idx
on public.students (school_id);

-- ============================================================
-- 3. CONSISTÊNCIA ALUNO -> TURMA -> ESCOLA
-- ============================================================
--
-- A escola gravada no aluno deve ser a mesma escola
-- à qual pertence a turma selecionada.

create or replace function public.enforce_student_school_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_school_id uuid;
begin
  if new.class_id is null then
    raise exception 'O aluno precisa estar vinculado a uma turma.';
  end if;

  select c.school_id
    into v_class_school_id
  from public.classes c
  where c.id = new.class_id;

  if not found then
    raise exception 'Turma não encontrada.';
  end if;

  if v_class_school_id is null then
    raise exception 'A turma ainda não está vinculada a uma escola.';
  end if;

  if new.school_id is null then
    new.school_id := v_class_school_id;
  end if;

  if new.school_id <> v_class_school_id then
    raise exception 'Aluno e turma precisam pertencer à mesma escola.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_student_school_scope
on public.students;

create trigger enforce_student_school_scope
before insert or update of class_id, school_id
on public.students
for each row
execute function public.enforce_student_school_scope();

-- ============================================================
-- 4. RLS DE LEITURA POR ESCOLA
-- ============================================================
--
-- Um usuário autenticado somente pode visualizar turmas e alunos
-- pertencentes a escolas nas quais possui vínculo ativo.
--
-- IMPORTANTE:
-- Estas policies pertencem à arquitetura comercial e substituem
-- o modelo antigo de leitura global using (true).

alter table public.classes enable row level security;
alter table public.students enable row level security;

-- Remove as policies existentes das tabelas classes e students.
-- Na versão comercial, nenhuma policy antiga deve continuar
-- concedendo acesso global aos dados.

do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('students', 'classes')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      item.policyname,
      item.schemaname,
      item.tablename
    );
  end loop;
end;
$$;

-- TURMAS
-- Somente membros ativos da escola podem visualizar suas turmas.

create policy "school_members_can_view_classes"
on public.classes
for select
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
);

-- ALUNOS
-- Somente membros ativos da escola podem visualizar seus alunos.

create policy "school_members_can_view_students"
on public.students
for select
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
);

-- ============================================================
-- 5. VERIFICAÇÃO CENTRAL DE PERMISSÃO POR ESCOLA
-- ============================================================
--
-- Esta função garante que uma permissão só tenha efeito dentro
-- da escola à qual pertence o vínculo do usuário.
--
-- Administradores da escola possuem autoridade operacional
-- dentro da própria escola.
--
-- Coordenadores e professores dependem das permissões
-- existentes em school_member_permissions.

create or replace function public.has_school_permission(
  target_school_id uuid,
  permission_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_role text;
  v_allowed boolean := false;
begin
  if auth.uid() is null or target_school_id is null then
    return false;
  end if;

  select sm.id, sm.role
    into v_member_id, v_role
  from public.school_members sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_member_id is null then
    return false;
  end if;

  -- O administrador possui autoridade somente
  -- dentro da escola deste vínculo.
  if v_role = 'school_admin' then
    return true;
  end if;

  -- Somente permissões conhecidas podem ser consultadas.
  if permission_name not in (
    'can_add_students',
    'can_edit_students',
    'can_delete_students',
    'can_edit_all',
    'can_edit_photo',
    'can_edit_name',
    'can_edit_class',
    'can_edit_report',
    'can_manage_observation_options',
    'can_invite_teachers',
    'can_manage_member_permissions',
    'can_view_uniform',
    'can_edit_uniform',
    'can_mark_all_uniform_received',
    'can_view_occurrences',
    'can_register_occurrences',
    'can_edit_occurrences',
    'can_delete_occurrences',
    'can_manage_counselors'
  ) then
    return false;
  end if;

  select
    case permission_name
      when 'can_add_students' then p.can_add_students
      when 'can_edit_students' then p.can_edit_students
      when 'can_delete_students' then p.can_delete_students
      when 'can_edit_all' then p.can_edit_all
      when 'can_edit_photo' then p.can_edit_photo
      when 'can_edit_name' then p.can_edit_name
      when 'can_edit_class' then p.can_edit_class
      when 'can_edit_report' then p.can_edit_report
      when 'can_manage_observation_options' then p.can_manage_observation_options
      when 'can_invite_teachers' then p.can_invite_teachers
      when 'can_manage_member_permissions' then p.can_manage_member_permissions
      when 'can_view_uniform' then p.can_view_uniform
      when 'can_edit_uniform' then p.can_edit_uniform
      when 'can_mark_all_uniform_received' then p.can_mark_all_uniform_received
      when 'can_view_occurrences' then p.can_view_occurrences
      when 'can_register_occurrences' then p.can_register_occurrences
      when 'can_edit_occurrences' then p.can_edit_occurrences
      when 'can_delete_occurrences' then p.can_delete_occurrences
      when 'can_manage_counselors' then p.can_manage_counselors
      else false
    end
    into v_allowed
  from public.school_member_permissions p
  where p.member_id = v_member_id;

  return coalesce(v_allowed, false);
end;
$$;

revoke all
on function public.has_school_permission(uuid, text)
from public;

revoke all
on function public.has_school_permission(uuid, text)
from anon;

grant execute
on function public.has_school_permission(uuid, text)
to authenticated;

-- ============================================================
-- 6. ESCRITA DE ALUNOS LIMITADA À ESCOLA
-- ============================================================
--
-- Uma permissão de escrita nunca amplia o universo de dados.
-- Ela somente permite uma operação dentro da escola
-- à qual o usuário possui vínculo ativo.

-- INSERIR ALUNOS
--
-- O usuário precisa:
-- 1. pertencer à escola do novo aluno;
-- 2. possuir can_add_students ou can_edit_all nessa escola.

create policy "authorized_school_members_can_add_students"
on public.students
for insert
to authenticated
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_add_students')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- EDITAR ALUNOS
--
-- USING protege a linha existente.
-- WITH CHECK protege o estado final da linha.
--
-- Isso também impede usar um UPDATE para transferir
-- um aluno para uma escola não autorizada.

create policy "authorized_school_members_can_edit_students"
on public.students
for update
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_all')
    or public.has_school_permission(school_id, 'can_edit_photo')
    or public.has_school_permission(school_id, 'can_edit_name')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_report')
    or public.has_school_permission(school_id, 'can_edit_uniform')
  )
)
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_all')
    or public.has_school_permission(school_id, 'can_edit_photo')
    or public.has_school_permission(school_id, 'can_edit_name')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_report')
    or public.has_school_permission(school_id, 'can_edit_uniform')
  )
);

-- EXCLUIR ALUNOS
--
-- A exclusão exige autorização específica ou can_edit_all.

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
  )
);

-- ============================================================
-- 7. ESCRITA DE TURMAS LIMITADA À ESCOLA
-- ============================================================
--
-- Mantém a lógica atual do Carômetro, mas agora
-- sempre limitada à escola do vínculo ativo.

-- INSERIR TURMAS
--
-- Pode criar turma quem possui can_add_students
-- ou can_edit_all dentro daquela escola.

create policy "authorized_school_members_can_add_classes"
on public.classes
for insert
to authenticated
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_add_students')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- EDITAR TURMAS
--
-- Pode editar turma quem possui can_edit_students,
-- can_edit_class ou can_edit_all dentro daquela escola.

create policy "authorized_school_members_can_edit_classes"
on public.classes
for update
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
)
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- EXCLUIR TURMAS
--
-- Mantém a regra atual: somente o administrador
-- ativo da própria escola pode excluir uma turma.

create policy "school_admins_can_delete_classes"
on public.classes
for delete
to authenticated
using (
  school_id is not null
  and public.is_school_admin(school_id)
);

-- ============================================================
-- 8. PROTEÇÃO DE CAMPOS DO ALUNO POR ESCOLA
-- ============================================================
--
-- Substitui a validação antiga baseada em user_permissions
-- pela autorização comercial vinculada à escola do aluno.
--
-- Uma permissão concedida em uma escola nunca autoriza
-- alterações em alunos pertencentes a outra escola.

create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uniform_changed boolean;
  bulk_update boolean;
begin
  -- O usuário precisa possuir vínculo ativo com a escola
  -- do registro que está sendo alterado.
  if new.school_id is null
     or not public.is_active_school_member(new.school_id) then
    raise exception 'Sem permissao para editar alunos desta escola';
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

  bulk_update :=
    current_setting('app.uniform_bulk_update', true) = 'true';

  -- Permissão total dentro da própria escola.
  if public.has_school_permission(new.school_id, 'can_edit_all') then
    return new;
  end if;

  -- Uniforme/material possui permissões próprias.
  if uniform_changed then
    if bulk_update then
      if not public.has_school_permission(
        new.school_id,
        'can_mark_all_uniform_received'
      ) then
        raise exception 'Sem permissao para marcar todos como receberam';
      end if;
    else
      if not public.has_school_permission(
        new.school_id,
        'can_edit_uniform'
      ) then
        raise exception 'Sem permissao para registrar uniforme e material do aluno';
      end if;
    end if;
  end if;

  -- Nome.
  if old.full_name is distinct from new.full_name
     and not public.has_school_permission(
       new.school_id,
       'can_edit_name'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar o nome do aluno';
  end if;

  -- Foto.
  if old.photo_path is distinct from new.photo_path
     and not public.has_school_permission(
       new.school_id,
       'can_edit_photo'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar a foto do aluno';
  end if;

  -- Turma.
  if (
       old.class_id is distinct from new.class_id
       or old.class_name is distinct from new.class_name
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_class'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para mudar o aluno de turma';
  end if;

  -- Observações / laudo.
  if old.has_report is distinct from new.has_report
     and not public.has_school_permission(
       new.school_id,
       'can_edit_report'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar as observacoes do aluno';
  end if;

  return new;
end;
$$;

drop trigger if exists limit_student_field_updates
on public.students;

create trigger limit_student_field_updates
before update on public.students
for each row
execute function public.limit_student_field_updates();