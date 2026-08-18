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
where email = 'passosdigital77@gmail.com'
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
and u.email = 'passosdigital77@gmail.com'
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
where u.email = 'passosdigital77@gmail.com'
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


commit;