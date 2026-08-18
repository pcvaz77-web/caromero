-- CARÔMETRO COMERCIAL
-- Migração inicial dos dados existentes
-- Migration 005
--
-- Objetivo:
-- Transformar o Carômetro atual na primeira escola
-- da plataforma comercial.
--
-- Não remove dados existentes.
-- Mantém user_permissions para compatibilidade.

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
-- 2. CRIAR ASSINATURA INICIAL GRATUITA
-- ============================================================

insert into public.school_subscriptions (
  school_id,
  plan,
  billing_type,
  status,
  price
)
select
  id,
  'free',
  'fixed_school',
  'active',
  0
from public.schools
where slug = 'colegio-estadual-paulo-freire'
on conflict (school_id) do nothing;


-- ============================================================
-- 3. INSERIR OWNER DA PLATAFORMA
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
-- 4. CRIAR VÍNCULO DO OWNER COM A ESCOLA
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
-- 5. CRIAR PERMISSÕES DO OWNER DA ESCOLA
-- ============================================================

insert into public.school_member_permissions (
  member_id,
  can_add_students,
  can_edit_students,
  can_delete_students,
  can_edit_all,
  can_manage_member_permissions
)
select
  sm.id,
  true,
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
-- 6. VINCULAR TURMAS EXISTENTES À ESCOLA
-- ============================================================

update public.classes
set school_id = (
  select id
  from public.schools
  where slug = 'colegio-estadual-paulo-freire'
)
where school_id is null;


-- ============================================================
-- 7. VINCULAR ALUNOS EXISTENTES À ESCOLA
-- ============================================================

update public.students
set school_id = (
  select id
  from public.schools
  where slug = 'colegio-estadual-paulo-freire'
)
where school_id is null;


-- ============================================================
-- 8. CRIAR MEMBROS DOS DEMAIS USUÁRIOS EXISTENTES
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
-- 9. COPIAR PERMISSÕES EXISTENTES
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
  can_delete_occurrences,
  can_manage_counselors
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
  up.can_delete_occurrences,
  up.can_manage_counselors
from public.user_permissions up
join public.school_members sm
on sm.user_id = up.user_id
on conflict (member_id) do nothing;


commit;