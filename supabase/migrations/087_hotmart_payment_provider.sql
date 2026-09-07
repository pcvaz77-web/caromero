-- CAROMETRO + ASSISTENTE SIAP
-- Integra a Hotmart sem remover os provedores anteriores.

begin;

alter table public.platform_payment_subscriptions drop constraint if exists platform_payment_subscriptions_provider_check;
alter table public.platform_payment_subscriptions add constraint platform_payment_subscriptions_provider_check check (provider in ('mercado_pago', 'asaas', 'hotmart'));
alter table public.platform_payment_events drop constraint if exists platform_payment_events_provider_check;
alter table public.platform_payment_events add constraint platform_payment_events_provider_check check (provider in ('mercado_pago', 'asaas', 'hotmart'));
alter table public.siap_assistant_payment_subscriptions drop constraint if exists siap_assistant_payment_subscriptions_provider_check;
alter table public.siap_assistant_payment_subscriptions add constraint siap_assistant_payment_subscriptions_provider_check check (provider in ('mercado_pago', 'asaas', 'hotmart'));
alter table public.siap_assistant_payment_events drop constraint if exists siap_assistant_payment_events_provider_check;
alter table public.siap_assistant_payment_events add constraint siap_assistant_payment_events_provider_check check (provider in ('mercado_pago', 'asaas', 'hotmart'));

alter table public.platform_payment_subscriptions add column if not exists provider_subscriber_code text, add column if not exists provider_transaction_id text;
alter table public.siap_assistant_payment_subscriptions add column if not exists provider_subscriber_code text, add column if not exists provider_transaction_id text;
create unique index if not exists platform_hotmart_transaction_uidx on public.platform_payment_subscriptions(provider_transaction_id) where provider = 'hotmart' and provider_transaction_id is not null;
create index if not exists platform_hotmart_subscriber_idx on public.platform_payment_subscriptions(provider_subscriber_code) where provider = 'hotmart' and provider_subscriber_code is not null;
create unique index if not exists siap_hotmart_transaction_uidx on public.siap_assistant_payment_subscriptions(provider_transaction_id) where provider = 'hotmart' and provider_transaction_id is not null;
create index if not exists siap_hotmart_subscriber_idx on public.siap_assistant_payment_subscriptions(provider_subscriber_code) where provider = 'hotmart' and provider_subscriber_code is not null;

create table if not exists public.hotmart_product_mappings (
  product_id bigint primary key,
  product_name text not null,
  target text not null check (target in ('school', 'assistant')),
  plan_key text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'semiannual')),
  expected_amount numeric(10,2) not null check (expected_amount > 0),
  checkout_url text not null check (checkout_url like 'https://pay.hotmart.com/%'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hotmart_product_mappings (product_id,product_name,target,plan_key,billing_cycle,expected_amount,checkout_url) values
  (8469975,'Assistente SIAP do Professor','assistant','semiannual','semiannual',129.90,'https://pay.hotmart.com/U107499137G'),
  (8470115,'Assistente SIAP do Professor - Mensal','assistant','monthly','monthly',89.90,'https://pay.hotmart.com/S107499429I'),
  (8470304,'CAROMETRO - Basico','school','basic','monthly',189.90,'https://pay.hotmart.com/M107499784O'),
  (8470309,'CAROMETRO - Profissional','school','professional','monthly',289.90,'https://pay.hotmart.com/X107499796S')
on conflict (product_id) do update set product_name=excluded.product_name,target=excluded.target,plan_key=excluded.plan_key,billing_cycle=excluded.billing_cycle,expected_amount=excluded.expected_amount,checkout_url=excluded.checkout_url,active=true,updated_at=now();

alter table public.hotmart_product_mappings enable row level security;
revoke all on public.hotmart_product_mappings from public, anon, authenticated;
comment on table public.hotmart_product_mappings is 'Produtos Hotmart autorizados a conceder acesso no Carometro ou no Assistente SIAP.';

create table if not exists public.hotmart_webhook_events (
  event_id text primary key,
  event_type text not null,
  product_id bigint,
  transaction_id text,
  subscriber_code text,
  buyer_email text,
  linked_target text check (linked_target is null or linked_target in ('school', 'assistant')),
  linked_payment_id uuid,
  status text not null check (status in ('received', 'processed', 'unlinked', 'failed', 'ignored')),
  processing_error text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.hotmart_webhook_events enable row level security;
revoke all on public.hotmart_webhook_events from public, anon, authenticated;
comment on table public.hotmart_webhook_events is 'Caixa de entrada idempotente da Hotmart; eventos sem vinculo ficam preservados para conciliacao.';

-- Compra externa nao recebe trinta dias artificiais antes do periodo pago.
-- Se a pessoa ja tem o teste do Carometro, preserva o restante desse teste.
create or replace function public.siap_activate_paid_subscription(
  p_payment_subscription_id uuid,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_payment public.siap_assistant_payment_subscriptions%rowtype;
  v_plan public.siap_assistant_plans%rowtype;
  v_license public.siap_assistant_licenses%rowtype;
  v_had_license boolean;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into v_payment from public.siap_assistant_payment_subscriptions where id=p_payment_subscription_id for update;
  if not found then raise exception 'Assinatura nao encontrada.'; end if;
  select * into v_plan from public.siap_assistant_plans where plan_key=v_payment.plan_key;
  if not found or v_plan.amount is null or v_payment.amount<>v_plan.amount then raise exception 'Plano ou valor divergente.'; end if;

  select exists(select 1 from public.siap_assistant_licenses where user_id=v_payment.user_id) into v_had_license;
  insert into public.siap_assistant_licenses(user_id,entitlement_type,trial_started_at,trial_ends_at,paid_until)
  values(v_payment.user_id,'subscription',p_paid_at-interval '30 days',p_paid_at,null)
  on conflict(user_id) do nothing;
  select * into v_license from public.siap_assistant_licenses where user_id=v_payment.user_id for update;

  v_period_start := greatest(p_paid_at,coalesce(v_license.paid_until,'-infinity'::timestamptz),
    case when v_had_license then v_license.trial_ends_at else p_paid_at end);
  v_period_end := v_period_start + make_interval(months=>v_plan.billing_months);
  update public.siap_assistant_licenses set entitlement_type='subscription',paid_until=v_period_end,suspended_at=null,updated_at=now() where user_id=v_payment.user_id;
  update public.siap_assistant_payment_subscriptions set status='authorized',current_period_end=v_period_end,updated_at=now() where id=v_payment.id;
  return jsonb_build_object('userId',v_payment.user_id,'paidUntil',v_period_end);
end;
$function$;
revoke all on function public.siap_activate_paid_subscription(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.siap_activate_paid_subscription(uuid,timestamptz) to service_role;

commit;
