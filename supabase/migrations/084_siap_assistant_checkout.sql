-- ASSISTENTE SIAP
-- Checkout individual isolado das assinaturas escolares do Carômetro.
-- Valores definidos pelo proprietário: R$ 89,90/mês e R$ 129,90/6 meses.

begin;

create table if not exists public.siap_assistant_plans (
  plan_key text primary key check (plan_key in ('monthly', 'semiannual')),
  display_name text not null,
  description text not null default '',
  amount numeric(10,2) check (amount is null or amount > 0),
  billing_months integer not null check (billing_months in (1, 6)),
  active boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.siap_assistant_plans
  (plan_key, display_name, description, amount, billing_months, active, display_order)
values
  ('monthly', 'Mensal', 'Renovação mensal, com cancelamento a qualquer momento.', 89.90, 1, true, 1),
  ('semiannual', 'Semestral', 'Renovação a cada seis meses, com melhor condição.', 129.90, 6, true, 2)
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  amount = excluded.amount,
  billing_months = excluded.billing_months,
  active = excluded.active,
  display_order = excluded.display_order;

alter table public.siap_assistant_plans enable row level security;
drop policy if exists "anyone_can_view_active_siap_plans" on public.siap_assistant_plans;
create policy "anyone_can_view_active_siap_plans"
on public.siap_assistant_plans for select to anon, authenticated
using (active and amount is not null);
revoke all on public.siap_assistant_plans from public, anon, authenticated;
grant select on public.siap_assistant_plans to anon, authenticated;

create table if not exists public.siap_assistant_payment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.siap_assistant_plans(plan_key),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  payer_email text not null,
  legal_accepted_at timestamptz not null,
  terms_version text not null default '2026-09-06',
  status text not null default 'creating'
    check (status in ('creating', 'pending', 'authorized', 'paused', 'cancelled', 'failed')),
  external_reference text not null unique default ('siap:' || gen_random_uuid()::text),
  provider_subscription_id text unique,
  provider_status text,
  checkout_url text,
  last_invoice_id text,
  last_payment_id text,
  last_payment_status text,
  current_period_end timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists siap_assistant_one_open_subscription_per_user
on public.siap_assistant_payment_subscriptions(user_id)
where status in ('creating', 'pending', 'authorized', 'paused');

alter table public.siap_assistant_payment_subscriptions enable row level security;
drop policy if exists "users_can_view_own_siap_subscriptions" on public.siap_assistant_payment_subscriptions;
create policy "users_can_view_own_siap_subscriptions"
on public.siap_assistant_payment_subscriptions for select to authenticated
using (user_id = auth.uid());
revoke all on public.siap_assistant_payment_subscriptions from public, anon, authenticated;
grant select on public.siap_assistant_payment_subscriptions to authenticated;

create table if not exists public.siap_assistant_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null,
  event_type text not null,
  resource_id text not null,
  signature_valid boolean not null default false,
  processed boolean not null default false,
  processing_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider_event_id, event_type, resource_id)
);
alter table public.siap_assistant_payment_events enable row level security;
revoke all on public.siap_assistant_payment_events from public, anon, authenticated;

create table if not exists public.siap_assistant_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_day integer not null check (reminder_day in (7, 3, 1, 0)),
  channel text not null check (channel in ('email', 'assistant')),
  access_ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  processing_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(user_id, reminder_day, channel, access_ends_at)
);
alter table public.siap_assistant_reminder_deliveries enable row level security;
revoke all on public.siap_assistant_reminder_deliveries from public, anon, authenticated;

create table if not exists public.siap_assistant_free_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null check (feature_key in ('planning', 'content', 'attendance', 'pei')),
  used_count integer not null default 0 check (used_count between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);
alter table public.siap_assistant_free_usage enable row level security;
drop policy if exists "users_can_view_own_siap_free_usage" on public.siap_assistant_free_usage;
create policy "users_can_view_own_siap_free_usage" on public.siap_assistant_free_usage
for select to authenticated using (user_id = auth.uid());
revoke all on public.siap_assistant_free_usage from public, anon, authenticated;
grant select on public.siap_assistant_free_usage to authenticated;

create or replace function public.get_siap_assistant_access_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_carometro boolean;
  v_license public.siap_assistant_licenses%rowtype;
  v_status jsonb;
  v_now timestamptz := now();
  v_end timestamptz;
  v_planning integer := 0;
  v_content integer := 0;
  v_attendance integer := 0;
  v_pei integer := 0;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  select exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions smp on smp.member_id = sm.id
    where sm.user_id = v_user_id and sm.status = 'active'
      and (sm.role = 'school_admin' or coalesce(smp.can_use_siap_assistant, false))
  ) into v_carometro;

  if v_carometro then
    v_status := public.activate_siap_assistant_trial();
    return v_status || jsonb_build_object('mode', 'carometro', 'freeUses', null);
  end if;

  select * into v_license from public.siap_assistant_licenses where user_id = v_user_id;
  if found then
    v_end := greatest(v_license.trial_ends_at, coalesce(v_license.paid_until, '-infinity'::timestamptz));
    if v_license.suspended_at is null and v_license.paid_until is not null and v_end > v_now then
      return jsonb_build_object('active', true, 'status', 'subscribed', 'mode', 'subscription',
        'accessEndsAt', v_end, 'daysRemaining', greatest(0, ceil(extract(epoch from (v_end-v_now))/86400.0)::integer), 'freeUses', null);
    end if;
  end if;

  select
    coalesce(max(used_count) filter (where feature_key='planning'),0),
    coalesce(max(used_count) filter (where feature_key='content'),0),
    coalesce(max(used_count) filter (where feature_key='attendance'),0),
    coalesce(max(used_count) filter (where feature_key='pei'),0)
  into v_planning, v_content, v_attendance, v_pei
  from public.siap_assistant_free_usage where user_id = v_user_id;
  return jsonb_build_object('active', least(v_planning,v_content,v_attendance,v_pei) < 2,
    'status', 'free', 'mode', 'external', 'daysRemaining', null,
    'freeUses', jsonb_build_object('planning',2-v_planning,'content',2-v_content,'attendance',2-v_attendance,'pei',2-v_pei));
end;
$function$;
revoke all on function public.get_siap_assistant_access_status() from public, anon;
grant execute on function public.get_siap_assistant_access_status() to authenticated;

create or replace function public.consume_siap_assistant_feature(p_feature_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status jsonb;
  v_count integer;
begin
  if p_feature_key not in ('planning','content','attendance','pei') then raise exception 'Função inválida.'; end if;
  v_status := public.get_siap_assistant_access_status();
  if (v_status->>'mode') in ('carometro','subscription') and (v_status->>'active')::boolean then
    return jsonb_build_object('allowed',true,'unlimited',true,'remaining',null,'access',v_status);
  end if;
  if v_status->>'mode' <> 'external' then
    return jsonb_build_object('allowed',false,'unlimited',false,'remaining',0,'access',v_status);
  end if;
  insert into public.siap_assistant_free_usage(user_id,feature_key,used_count)
  values(v_user_id,p_feature_key,1)
  on conflict(user_id,feature_key) do update set used_count=public.siap_assistant_free_usage.used_count+1,updated_at=now()
  where public.siap_assistant_free_usage.used_count < 2
  returning used_count into v_count;
  if v_count is null then return jsonb_build_object('allowed',false,'unlimited',false,'remaining',0,'access',v_status); end if;
  return jsonb_build_object('allowed',true,'unlimited',false,'remaining',2-v_count,'access',public.get_siap_assistant_access_status());
end;
$function$;
revoke all on function public.consume_siap_assistant_feature(text) from public, anon;
grant execute on function public.consume_siap_assistant_feature(text) to authenticated;

create or replace function public.siap_activate_paid_subscription(
  p_payment_subscription_id uuid,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.siap_assistant_payment_subscriptions%rowtype;
  v_plan public.siap_assistant_plans%rowtype;
  v_license public.siap_assistant_licenses%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select * into v_payment from public.siap_assistant_payment_subscriptions
  where id = p_payment_subscription_id for update;
  if not found then raise exception 'Assinatura não encontrada.'; end if;

  select * into v_plan from public.siap_assistant_plans where plan_key = v_payment.plan_key;
  if not found or v_plan.amount is null or v_payment.amount <> v_plan.amount then
    raise exception 'Plano ou valor divergente.';
  end if;

  insert into public.siap_assistant_licenses
    (user_id, entitlement_type, trial_started_at, trial_ends_at, paid_until)
  values
    (v_payment.user_id, 'subscription', p_paid_at, p_paid_at + interval '30 days', null)
  on conflict (user_id) do nothing;

  select * into v_license from public.siap_assistant_licenses
  where user_id = v_payment.user_id for update;
  v_period_start := greatest(p_paid_at, v_license.trial_ends_at, coalesce(v_license.paid_until, '-infinity'::timestamptz));
  v_period_end := v_period_start + make_interval(months => v_plan.billing_months);

  update public.siap_assistant_licenses set
    entitlement_type = 'subscription', paid_until = v_period_end,
    suspended_at = null, updated_at = now()
  where user_id = v_payment.user_id;

  update public.siap_assistant_payment_subscriptions set
    status = 'authorized', current_period_end = v_period_end, updated_at = now()
  where id = v_payment.id;

  return jsonb_build_object('userId', v_payment.user_id, 'paidUntil', v_period_end);
end;
$function$;
revoke all on function public.siap_activate_paid_subscription(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.platform_list_siap_assistant_plans()
returns setof public.siap_assistant_plans
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query select * from public.siap_assistant_plans order by display_order;
end;
$function$;
revoke all on function public.platform_list_siap_assistant_plans() from public, anon;
grant execute on function public.platform_list_siap_assistant_plans() to authenticated;

create or replace function public.platform_update_siap_assistant_plan(p_plan_key text, p_amount numeric, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_plan_key not in ('monthly', 'semiannual') or p_amount is null or p_amount <= 0 or p_amount > 999999.99 then
    raise exception 'Plano ou valor inválido.';
  end if;
  update public.siap_assistant_plans set amount = round(p_amount, 2), active = p_active, updated_at = now()
  where plan_key = p_plan_key;
  if not found then raise exception 'Plano não encontrado.'; end if;
end;
$function$;
revoke all on function public.platform_update_siap_assistant_plan(text, numeric, boolean) from public, anon;
grant execute on function public.platform_update_siap_assistant_plan(text, numeric, boolean) to authenticated;

comment on table public.siap_assistant_payment_subscriptions is
  'Cobranças pessoais do Assistente SIAP; não concede nem modifica plano de escola.';

commit;
