-- Unifica as novas vendas mensais e semestrais do Assistente SIAP no produto
-- Hotmart que utiliza a area de membros externa do proprio Assistente.

update public.hotmart_product_mappings
set
  product_name = 'Assistente SIAP do Professor',
  checkout_url = 'https://pay.hotmart.com/S107499429I?off=4khlw0of',
  offer_code = '4khlw0of',
  updated_at = now()
where product_id = 8470115
  and billing_cycle = 'monthly';

insert into public.hotmart_product_mappings (
  product_id,
  product_name,
  target,
  plan_key,
  billing_cycle,
  expected_amount,
  checkout_url,
  offer_code,
  active
)
values (
  8470115,
  'Assistente SIAP do Professor',
  'assistant',
  'semiannual',
  'semiannual',
  129.90,
  'https://pay.hotmart.com/S107499429I?off=2xaozivg',
  '2xaozivg',
  true
)
on conflict (product_id, billing_cycle) do update
set
  product_name = excluded.product_name,
  target = excluded.target,
  plan_key = excluded.plan_key,
  expected_amount = excluded.expected_amount,
  checkout_url = excluded.checkout_url,
  offer_code = excluded.offer_code,
  active = true,
  updated_at = now();

update public.hotmart_product_mappings
set
  active = false,
  updated_at = now()
where product_id = 8469975
  and target = 'assistant'
  and billing_cycle = 'semiannual';
