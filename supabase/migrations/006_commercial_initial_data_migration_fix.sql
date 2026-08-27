-- CARÔMETRO COMERCIAL
-- Correção da migração inicial de dados
-- Migration 006
--
-- Objetivo:
-- Migrar os dados existentes para a primeira escola comercial
-- usando uma operação administrativa segura.

begin;

-- ============================================================
-- 1. CRIAR ESCOLA INICIAL
-- ============================================================

insert into public.schools (
  name,
  slug,
  status
)
values (
  'Colégio Estadual Paulo Freire',
  'colegio-estadual-paulo-freire',
  'active'
)
on conflict (slug) do nothing;


-- ============================================================
-- 2. CRIAR OWNER DA PLATAFORMA
-- ============================================================

insert into public.platform_admins (
  user_id,
  role,
  status
)
select
  id,
  'owner',
  'active'
from auth.users
where lower(trim(email)) = 'passosdigital77@gmail.com'
  and email_confirmed_at is not null
  and deleted_at is null
on conflict (user_id) do nothing;


-- ============================================================
-- 3. CRIAR VÍNCULO DO ADMINISTRADOR DA ESCOLA
-- ============================================================

insert into public.school_members (
  school_id,
  user_id,
  role,
  status
)
select
  s.id,
  u.id,
  'school_admin',
  'active'
from public.schools s,
     auth.users u
where s.slug = 'colegio-estadual-paulo-freire'
and lower(trim(u.email)) = 'passosdigital77@gmail.com'
and u.email_confirmed_at is not null
and u.deleted_at is null
on conflict (school_id, user_id) do nothing;


-- ============================================================
-- 4. CRIAR PERMISSÃO TOTAL PARA O ADMINISTRADOR INICIAL
-- ============================================================

insert into public.school_member_permissions (
  member_id,
  can_add_students,
  can_edit_students,
  can_delete_students,
  can_edit_all
)
select
  sm.id,
  true,
  true,
  true,
  true
from public.school_members sm
join auth.users u
on u.id = sm.user_id
where lower(trim(u.email)) = 'passosdigital77@gmail.com'
  and u.email_confirmed_at is not null
  and u.deleted_at is null
on conflict (member_id) do nothing;


-- ============================================================
-- 5. CRIAR VÍNCULOS DOS DEMAIS USUÁRIOS
-- ============================================================

insert into public.school_members (
  school_id,
  user_id,
  role,
  status
)
select
  s.id,
  up.user_id,
  case
    when up.role = 'admin' then 'school_admin'
    when up.is_coordinator = true then 'coordinator'
    else 'teacher'
  end,
  'active'
from public.user_permissions up
cross join public.schools s
where s.slug = 'colegio-estadual-paulo-freire'
on conflict (school_id, user_id) do nothing;


-- ============================================================
-- 6. COPIAR PERMISSÕES EXISTENTES
-- ============================================================

insert into public.school_member_permissions (
  member_id,
  can_add_students,
  can_edit_students,
  can_delete_students,
  can_edit_all,
  can_edit_photo,
  can_edit_name,
  can_edit_class,
  can_edit_report,
  can_view_occurrences,
  can_register_occurrences,
  can_edit_occurrences,
  can_delete_occurrences
)
select
  sm.id,
  up.can_add_students,
  up.can_edit_students,
  up.can_delete_students,
  up.can_edit_all,
  up.can_edit_photo,
  up.can_edit_name,
  up.can_edit_class,
  up.can_edit_report,
  up.can_view_occurrences,
  up.can_register_occurrences,
  up.can_edit_occurrences,
  up.can_delete_occurrences
from public.user_permissions up
join public.school_members sm
on sm.user_id = up.user_id
on conflict (member_id) do nothing;


-- ============================================================
-- 7. VINCULAR TURMAS
-- ============================================================

update public.classes
set school_id = (
  select id
  from public.schools
  where slug = 'colegio-estadual-paulo-freire'
)
where school_id is null;


-- ============================================================
-- 8. VINCULAR ALUNOS
-- ============================================================

alter table public.students
disable trigger limit_student_field_updates;

update public.students
set school_id = (
  select id
  from public.schools
  where slug = 'colegio-estadual-paulo-freire'
)
where school_id is null;

alter table public.students
enable trigger limit_student_field_updates;


-- ============================================================
-- 9. VINCULAR OCORRÊNCIAS HISTÓRICAS
-- ============================================================

update public.student_occurrences o
set school_id = s.school_id
from public.students s
where s.id = o.student_id
  and o.school_id is null;

do $$
begin
  if exists (
    select 1 from public.student_occurrences where school_id is null
  ) then
    raise exception 'Existem ocorrências que não puderam ser vinculadas a uma escola.';
  end if;
end $$;

alter table public.student_occurrences
alter column school_id set not null;


-- ============================================================
-- 10. VINCULAR CONSELHEIROS HISTÓRICOS
-- ============================================================

update public.class_counselors cc
set school_id = c.school_id
from public.classes c
where c.id = cc.class_id
  and cc.school_id is null;

do $$
begin
  if exists (
    select 1 from public.class_counselors where school_id is null
  ) then
    raise exception 'Existem conselheiros que não puderam ser vinculados a uma escola.';
  end if;
end $$;

alter table public.class_counselors
alter column school_id set not null;


commit;
