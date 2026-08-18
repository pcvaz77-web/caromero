-- CARÔMETRO COMERCIAL
-- Correção da assinatura inicial da escola
-- Migration 008
--
-- Objetivo:
-- Criar a assinatura inicial gratuita da primeira escola.
-- Não altera usuários, alunos ou turmas.

begin;


-- ============================================================
-- CRIAR ASSINATURA INICIAL DA ESCOLA
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


commit;