-- CAROMETRO + ASSISTENTE SIAP
-- Permite a transicao controlada do Mercado Pago para o Asaas.
-- Nao altera assinaturas escolares nem licencas existentes.

begin;

alter table public.platform_payment_subscriptions
  drop constraint if exists platform_payment_subscriptions_provider_check;
alter table public.platform_payment_subscriptions
  add constraint platform_payment_subscriptions_provider_check
  check (provider in ('mercado_pago', 'asaas'));
alter table public.platform_payment_subscriptions
  add column if not exists provider_checkout_id text;

alter table public.platform_payment_events
  drop constraint if exists platform_payment_events_provider_check;
alter table public.platform_payment_events
  add constraint platform_payment_events_provider_check
  check (provider in ('mercado_pago', 'asaas'));

alter table public.siap_assistant_payment_subscriptions
  add column if not exists provider text not null default 'asaas'
    check (provider in ('mercado_pago', 'asaas')),
  add column if not exists provider_checkout_id text;

alter table public.siap_assistant_payment_events
  add column if not exists provider text not null default 'asaas'
    check (provider in ('mercado_pago', 'asaas'));

create index if not exists platform_payment_subscriptions_provider_checkout_idx
  on public.platform_payment_subscriptions(provider, provider_checkout_id);
create index if not exists siap_payment_subscriptions_provider_checkout_idx
  on public.siap_assistant_payment_subscriptions(provider, provider_checkout_id);

commit;
