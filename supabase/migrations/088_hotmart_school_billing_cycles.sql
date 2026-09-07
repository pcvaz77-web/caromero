-- CAROMETRO
-- Permite que um mesmo produto Hotmart tenha ofertas mensal e semestral.

begin;

alter table public.hotmart_product_mappings
  add column if not exists offer_code text;

alter table public.hotmart_product_mappings
  drop constraint if exists hotmart_product_mappings_pkey;

alter table public.hotmart_product_mappings
  add constraint hotmart_product_mappings_pkey primary key (product_id, billing_cycle);

create unique index if not exists hotmart_product_mappings_offer_code_uidx
  on public.hotmart_product_mappings (offer_code)
  where offer_code is not null;

insert into public.hotmart_product_mappings
  (product_id, product_name, target, plan_key, billing_cycle, expected_amount, checkout_url, offer_code)
values
  (8470304, 'CAROMETRO - Basico', 'school', 'basic', 'monthly', 189.90, 'https://pay.hotmart.com/M107499784O?off=cikuvxq4', 'cikuvxq4'),
  (8470304, 'CAROMETRO - Basico', 'school', 'basic', 'semiannual', 949.50, 'https://pay.hotmart.com/M107499784O?off=qh3t6opt', 'qh3t6opt'),
  (8470309, 'CAROMETRO - Profissional', 'school', 'professional', 'monthly', 289.90, 'https://pay.hotmart.com/X107499796S?off=rr27tuic', 'rr27tuic'),
  (8470309, 'CAROMETRO - Profissional', 'school', 'professional', 'semiannual', 1449.50, 'https://pay.hotmart.com/X107499796S?off=kc5tk2ve', 'kc5tk2ve')
on conflict (product_id, billing_cycle) do update set
  product_name = excluded.product_name,
  target = excluded.target,
  plan_key = excluded.plan_key,
  expected_amount = excluded.expected_amount,
  checkout_url = excluded.checkout_url,
  offer_code = excluded.offer_code,
  active = true,
  updated_at = now();

comment on column public.hotmart_product_mappings.offer_code is
  'Codigo off da oferta Hotmart; diferencia ciclos do mesmo produto.';

commit;
