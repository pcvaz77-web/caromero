-- Registra compra única semestral/anual sem mudar as ofertas Hotmart.
begin;

alter table public.platform_payment_subscriptions
  drop constraint if exists platform_payment_subscriptions_billing_cycle_check;
alter table public.platform_payment_subscriptions
  add constraint platform_payment_subscriptions_billing_cycle_check
  check (billing_cycle in ('monthly','semiannual','annual'));

alter table public.platform_payment_subscriptions
  drop constraint if exists platform_payment_subscriptions_period_months_check;
alter table public.platform_payment_subscriptions
  add constraint platform_payment_subscriptions_period_months_check
  check (period_months in (1,6,12));

alter table public.platform_payment_subscriptions
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('any','credit_card','pix'));

create unique index if not exists platform_mp_payment_id_uidx
  on public.platform_payment_subscriptions(last_payment_id)
  where provider='mercado_pago' and last_payment_id is not null;

commit;
