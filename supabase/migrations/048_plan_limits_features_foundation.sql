-- CARÔMETRO COMERCIAL
-- Fundação de banco para Planos, Limites e Recursos. Migration
-- exclusivamente aditiva e DELIBERADAMENTE INERTE: cria colunas, tabelas
-- e funções novas, mas nenhum fluxo existente passa a usá-las aqui.
--
-- Precedência do plano efetivo (implementada em school_effective_plan):
--   override_plan válido (não nulo e não expirado) > contracted_plan > 'free'
-- Isso existe para que uma concessão manual do Proprietário da Plataforma
-- nunca possa ser sobrescrita por uma automação financeira futura, e para
-- que uma concessão temporária expirada volte ao plano contratado vigente
-- — nunca direto para o Grátis.
--
-- REGRA CRÍTICA DE COMPATIBILIDADE: a coluna legada
-- school_subscriptions.plan continua sendo a única fonte de verdade usada
-- pela aplicação após esta migration. Nenhum leitor/escritor existente
-- (platform_list_schools_with_counts_v3, platform_dashboard_summary,
-- platform_set_subscription_plan, platform_provision_school, frontend,
-- Edge Functions) é alterado. As colunas novas (contracted_plan,
-- override_plan, override_expires_at) ficam NULL para as escolas já
-- existentes — sem backfill nesta etapa. school_effective_plan() passa a
-- existir, mas não é chamada por nenhum fluxo real ainda.
--
-- Nenhum enforcement de limite ou de recurso é introduzido aqui — apenas
-- a fonte de verdade configurável. Portal da Família não é catalogado
-- nesta migration: só existe implementação real de item_control, reports
-- e class_counselors hoje.

begin;

-- ---------------------------------------------------------------------
-- 1. school_subscriptions: colunas aditivas para separar plano
--    contratado/financeiro de concessão manual/override.
-- ---------------------------------------------------------------------

alter table public.school_subscriptions
  add column contracted_plan text null
    references public.platform_plans(plan_key),
  add column override_plan text null
    references public.platform_plans(plan_key),
  add column override_expires_at timestamptz null;

-- ---------------------------------------------------------------------
-- 2. platform_plans: limites configuráveis. NULL = ilimitado.
-- ---------------------------------------------------------------------

alter table public.platform_plans
  add column max_students integer null
    check (max_students is null or max_students > 0),
  add column max_staff integer null
    check (max_staff is null or max_staff > 0),
  add column max_classes integer null
    check (max_classes is null or max_classes > 0);

update public.platform_plans set max_students = 800,  max_staff = 20, max_classes = 20 where plan_key = 'free';
update public.platform_plans set max_students = 1400, max_staff = 30, max_classes = 36 where plan_key = 'basic';
update public.platform_plans set max_students = null, max_staff = null, max_classes = null where plan_key in ('professional', 'enterprise');

-- ---------------------------------------------------------------------
-- 3. Catálogo de recursos comerciais (platform_features) e sua matriz
--    por plano (platform_plan_features). Leitura pública (mesmo padrão
--    de platform_plans), sem policy de escrita — toda escrita fica para
--    uma RPC futura, fora desta migration.
-- ---------------------------------------------------------------------

create table public.platform_features (
  feature_key text primary key,
  label text not null,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_features enable row level security;

create policy "Anyone can view platform features"
on public.platform_features for select to authenticated, anon using (true);

grant select on public.platform_features to authenticated, anon;

create table public.platform_plan_features (
  plan_key text not null references public.platform_plans(plan_key),
  feature_key text not null references public.platform_features(feature_key),
  enabled boolean not null default true,
  primary key (plan_key, feature_key)
);

alter table public.platform_plan_features enable row level security;

create policy "Anyone can view platform plan features"
on public.platform_plan_features for select to authenticated, anon using (true);

grant select on public.platform_plan_features to authenticated, anon;

insert into public.platform_features (feature_key, label, description) values
  ('item_control', 'Controle de Itens', 'Controle de uniforme, materiais e Livro/Revisa por aluno.'),
  ('reports', 'Relatórios', 'Geração de relatórios de alunos e turmas.'),
  ('class_counselors', 'Conselheiros de turma', 'Designação de conselheiros por turma.')
on conflict (feature_key) do nothing;

insert into public.platform_plan_features (plan_key, feature_key, enabled) values
  ('free',         'item_control',     false),
  ('basic',        'item_control',     false),
  ('professional', 'item_control',     true),
  ('enterprise',   'item_control',     true),
  ('free',         'reports',          false),
  ('basic',        'reports',          false),
  ('professional', 'reports',          true),
  ('enterprise',   'reports',          true),
  ('free',         'class_counselors', false),
  ('basic',        'class_counselors', true),
  ('professional', 'class_counselors', true),
  ('enterprise',   'class_counselors', true)
on conflict (plan_key, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 4. Funções auxiliares — SECURITY DEFINER, mesmo padrão de
--    is_platform_owner()/record_platform_audit(), para serem chamáveis
--    de qualquer contexto (futuras triggers/RPCs) sem depender da
--    visibilidade RLS do chamador sobre school_subscriptions.
-- ---------------------------------------------------------------------

create or replace function public.school_effective_plan(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.school_subscriptions%rowtype;
begin
  select * into v_row
  from public.school_subscriptions
  where school_id = p_school_id;

  if not found then
    return 'free';
  end if;

  if v_row.override_plan is not null
     and (v_row.override_expires_at is null or v_row.override_expires_at > now()) then
    return v_row.override_plan;
  end if;

  if v_row.contracted_plan is not null then
    return v_row.contracted_plan;
  end if;

  return 'free';
end;
$function$;

create or replace function public.school_has_feature(p_school_id uuid, p_feature_key text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_key text;
  v_enabled boolean;
begin
  v_plan_key := public.school_effective_plan(p_school_id);

  select enabled into v_enabled
  from public.platform_plan_features
  where plan_key = v_plan_key
    and feature_key = p_feature_key;

  return coalesce(v_enabled, false);
end;
$function$;

create or replace function public.school_plan_limits(p_school_id uuid)
returns table(max_students integer, max_staff integer, max_classes integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_key text;
begin
  v_plan_key := public.school_effective_plan(p_school_id);

  return query
  select p.max_students, p.max_staff, p.max_classes
  from public.platform_plans p
  where p.plan_key = v_plan_key;
end;
$function$;

revoke all on function public.school_effective_plan(uuid) from public;
revoke all on function public.school_effective_plan(uuid) from anon;
grant execute on function public.school_effective_plan(uuid) to authenticated;

revoke all on function public.school_has_feature(uuid, text) from public;
revoke all on function public.school_has_feature(uuid, text) from anon;
grant execute on function public.school_has_feature(uuid, text) to authenticated;

revoke all on function public.school_plan_limits(uuid) from public;
revoke all on function public.school_plan_limits(uuid) from anon;
grant execute on function public.school_plan_limits(uuid) to authenticated;

commit;
