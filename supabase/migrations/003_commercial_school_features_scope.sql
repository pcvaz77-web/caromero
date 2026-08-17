-- CARÔMETRO COMERCIAL
-- Escopo por escola das funcionalidades ativas
-- Migration 003
--
-- OBJETIVO:
-- Garantir que ocorrências, conselheiros e notificações
-- permaneçam sempre limitados à escola autorizada.

-- ============================================================
-- 1. OCORRÊNCIAS VINCULADAS À ESCOLA
-- ============================================================

alter table public.student_occurrences
add column if not exists school_id uuid;

alter table public.student_occurrences
drop constraint if exists student_occurrences_school_id_fkey;

alter table public.student_occurrences
add constraint student_occurrences_school_id_fkey
foreign key (school_id)
references public.schools(id)
on delete restrict;

create index if not exists student_occurrences_school_id_idx
on public.student_occurrences (school_id);

-- Garante que aluno, turma e ocorrência pertençam à mesma escola.

create or replace function public.enforce_occurrence_school_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school_id uuid;
  v_class_school_id uuid;
begin
  if new.student_id is null then
    raise exception 'A ocorrência precisa estar vinculada a um aluno.';
  end if;

  select s.school_id
  into v_student_school_id
  from public.students s
  where s.id = new.student_id;

  if v_student_school_id is null then
    raise exception 'O aluno não possui escola vinculada.';
  end if;

  if new.school_id is null then
    new.school_id := v_student_school_id;
  end if;

  if new.school_id <> v_student_school_id then
    raise exception 'A ocorrência e o aluno precisam pertencer à mesma escola.';
  end if;

  if new.class_id is not null then
    select c.school_id
    into v_class_school_id
    from public.classes c
    where c.id = new.class_id;

    if v_class_school_id is null then
      raise exception 'A turma não possui escola vinculada.';
    end if;

    if new.school_id <> v_class_school_id then
      raise exception 'A ocorrência e a turma precisam pertencer à mesma escola.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_occurrence_school_scope
on public.student_occurrences;

create trigger enforce_occurrence_school_scope
before insert or update of student_id, class_id, school_id
on public.student_occurrences
for each row
execute function public.enforce_occurrence_school_scope();

-- ============================================================
-- 2. RLS DAS OCORRÊNCIAS POR ESCOLA
-- ============================================================

alter table public.student_occurrences
enable row level security;

-- Remove policies antigas para impedir que uma regra
-- como USING (true) continue concedendo leitura global.

do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_occurrences'
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

-- LEITURA
-- O usuário somente pode consultar ocorrências
-- pertencentes a uma escola na qual possui vínculo ativo.

create policy "school_members_can_view_occurrences"
on public.student_occurrences
for select
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_view_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- INSERÇÃO

create policy "authorized_school_members_can_add_occurrences"
on public.student_occurrences
for insert
to authenticated
with check (
  school_id is not null
  and created_by = auth.uid()
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_register_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- EDIÇÃO

create policy "authorized_school_members_can_edit_occurrences"
on public.student_occurrences
for update
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    created_by = auth.uid()
    or public.has_school_permission(school_id, 'can_edit_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
)
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    created_by = auth.uid()
    or public.has_school_permission(school_id, 'can_edit_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- EXCLUSÃO

create policy "authorized_school_members_can_delete_occurrences"
on public.student_occurrences
for delete
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    created_by = auth.uid()
    or public.has_school_permission(school_id, 'can_delete_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
  )
);

-- ============================================================
-- 3. CONSELHEIROS DE TURMA VINCULADOS À ESCOLA
-- ============================================================

alter table public.class_counselors
add column if not exists school_id uuid;

alter table public.class_counselors
drop constraint if exists class_counselors_school_id_fkey;

alter table public.class_counselors
add constraint class_counselors_school_id_fkey
foreign key (school_id)
references public.schools(id)
on delete restrict;

create index if not exists class_counselors_school_id_idx
on public.class_counselors (school_id);

-- Garante que a turma e o conselheiro pertençam
-- à mesma escola informada no vínculo.

create or replace function public.enforce_counselor_school_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_school_id uuid;
begin
  select c.school_id
  into v_class_school_id
  from public.classes c
  where c.id = new.class_id;

  if v_class_school_id is null then
    raise exception 'A turma não possui escola vinculada.';
  end if;

  if new.school_id is null then
    new.school_id := v_class_school_id;
  end if;

  if new.school_id <> v_class_school_id then
    raise exception 'O conselheiro e a turma precisam pertencer à mesma escola.';
  end if;

  if not exists (
    select 1
    from public.school_members sm
    where sm.school_id = new.school_id
      and sm.user_id = new.counselor_user_id
      and sm.status = 'active'
  ) then
    raise exception 'O conselheiro precisa ser membro ativo desta escola.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_counselor_school_scope
on public.class_counselors;

create trigger enforce_counselor_school_scope
before insert or update of counselor_user_id, class_id, school_id
on public.class_counselors
for each row
execute function public.enforce_counselor_school_scope();

-- ============================================================
-- 4. RLS DOS CONSELHEIROS POR ESCOLA
-- ============================================================

alter table public.class_counselors
enable row level security;

-- Remove as policies antigas, que ainda utilizavam
-- as permissões globais de user_permissions.

do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_counselors'
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

-- LEITURA
-- Administradores/coordenadores autorizados podem consultar
-- os conselheiros da própria escola.
-- O próprio conselheiro também pode consultar seus vínculos.

create policy "school_members_can_view_class_counselors"
on public.class_counselors
for select
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    counselor_user_id = auth.uid()
    or public.is_school_admin(school_id)
    or public.has_school_permission(
      school_id,
      'can_manage_counselors'
    )
  )
);

-- INSERÇÃO

create policy "authorized_school_members_can_add_class_counselors"
on public.class_counselors
for insert
to authenticated
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.is_school_admin(school_id)
    or public.has_school_permission(
      school_id,
      'can_manage_counselors'
    )
  )
);

-- EDIÇÃO

create policy "authorized_school_members_can_edit_class_counselors"
on public.class_counselors
for update
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.is_school_admin(school_id)
    or public.has_school_permission(
      school_id,
      'can_manage_counselors'
    )
  )
)
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.is_school_admin(school_id)
    or public.has_school_permission(
      school_id,
      'can_manage_counselors'
    )
  )
);

-- EXCLUSÃO

create policy "authorized_school_members_can_delete_class_counselors"
on public.class_counselors
for delete
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.is_school_admin(school_id)
    or public.has_school_permission(
      school_id,
      'can_manage_counselors'
    )
  )
);

-- ============================================================
-- 5. PREFERÊNCIAS DE NOTIFICAÇÃO LIMITADAS À ESCOLA
-- ============================================================

-- Uma preferência de notificação somente é válida quando
-- a turma pertence a uma escola da qual o usuário é membro ativo.

create or replace function public.validate_commercial_favorite_class_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = new.class_id;

  if v_school_id is null then
    raise exception 'A turma não possui escola vinculada.';
  end if;

  if not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = new.user_id
      and sm.status = 'active'
  ) then
    raise exception 'Você não possui acesso a esta escola.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_commercial_favorite_class_access()
from public;

revoke all on function public.validate_commercial_favorite_class_access()
from anon;

revoke all on function public.validate_commercial_favorite_class_access()
from authenticated;

drop trigger if exists validate_favorite_class_access
on public.user_favorite_classes;

create trigger validate_favorite_class_access
before insert or update
on public.user_favorite_classes
for each row
execute function public.validate_commercial_favorite_class_access();


-- ============================================================
-- 6. CRIAÇÃO DE NOTIFICAÇÕES COM ISOLAMENTO POR ESCOLA
-- ============================================================

-- Esta função substitui a lógica antiga de accessible_class_ids().
-- A escola é determinada diretamente pela turma.
-- Nenhum destinatário de outra escola pode receber a notificação.

create or replace function public.create_class_notifications(
  p_class_id uuid,
  p_title text,
  p_body text,
  p_target_type text,
  p_target_id text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if p_class_id is null then
    return;
  end if;

  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    return;
  end if;

  insert into public.user_notifications (
    recipient_id,
    class_id,
    title,
    body,
    target_type,
    target_id
  )
  select
    f.user_id,
    p_class_id,
    p_title,
    p_body,
    p_target_type,
    p_target_id
  from public.user_favorite_classes f
  where f.class_id = p_class_id
    and f.notifications_enabled = true
    and f.user_id is distinct from p_actor
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = v_school_id
        and sm.user_id = f.user_id
        and sm.status = 'active'
    );
end;
$$;

revoke all on function public.create_class_notifications(
  uuid,
  text,
  text,
  text,
  text,
  uuid
) from public;

revoke all on function public.create_class_notifications(
  uuid,
  text,
  text,
  text,
  text,
  uuid
) from anon;

revoke all on function public.create_class_notifications(
  uuid,
  text,
  text,
  text,
  text,
  uuid
) from authenticated;


-- ============================================================
-- 7. ADMINISTRADORES E COORDENADORES DA ESCOLA
-- ============================================================

-- Substitui a lógica global baseada em user_permissions.
-- Administradores/coordenadores recebem somente notificações
-- pertencentes à escola correspondente à turma.

create or replace function public.notify_admins_and_coordinators(
  p_title text,
  p_body text,
  p_class_id uuid,
  p_target_type text,
  p_target_id text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if p_class_id is null then
    return;
  end if;

  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    return;
  end if;

  insert into public.user_notifications (
    recipient_id,
    class_id,
    title,
    body,
    target_type,
    target_id
  )
  select
    sm.user_id,
    p_class_id,
    p_title,
    p_body,
    p_target_type,
    p_target_id
  from public.school_members sm
  where sm.school_id = v_school_id
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator')
    and sm.user_id is distinct from p_actor;
end;
$$;

revoke all on function public.notify_admins_and_coordinators(
  text,
  text,
  uuid,
  text,
  text,
  uuid
) from public;

revoke all on function public.notify_admins_and_coordinators(
  text,
  text,
  uuid,
  text,
  text,
  uuid
) from anon;

revoke all on function public.notify_admins_and_coordinators(
  text,
  text,
  uuid,
  text,
  text,
  uuid
) from authenticated;