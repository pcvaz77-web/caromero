-- Oferta anual de pagamento único do Assistente SIAP.
begin;

alter table public.siap_assistant_plans
  drop constraint if exists siap_assistant_plans_plan_key_check;
alter table public.siap_assistant_plans
  add constraint siap_assistant_plans_plan_key_check
  check (plan_key in ('monthly', 'quarterly', 'semiannual', 'annual'));

alter table public.siap_assistant_plans
  drop constraint if exists siap_assistant_plans_billing_months_check;
alter table public.siap_assistant_plans
  add constraint siap_assistant_plans_billing_months_check
  check (billing_months in (1, 3, 6, 12));

alter table public.hotmart_product_mappings
  drop constraint if exists hotmart_product_mappings_billing_cycle_check;
alter table public.hotmart_product_mappings
  add constraint hotmart_product_mappings_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'quarterly_legacy', 'semiannual', 'semiannual_legacy', 'annual'));

insert into public.siap_assistant_plans
  (plan_key, display_name, description, amount, billing_months, active, display_order)
values
  ('annual', 'Anual', 'Pagamento único para doze meses de acesso, sem renovação automática.', 269.90, 12, true, 4)
on conflict (plan_key) do nothing;

insert into public.hotmart_product_mappings
  (product_id, product_name, target, plan_key, billing_cycle,
   expected_amount, checkout_url, offer_code, active)
values
  (8470115, 'Assistente SIAP do Professor', 'assistant', 'annual',
   'annual', 269.90,
   'https://pay.hotmart.com/S107499429I?off=c4sm8bdn&checkoutMode=6',
   'c4sm8bdn', true)
on conflict (product_id, billing_cycle) do nothing;

commit;
