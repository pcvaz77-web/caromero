-- Seller-funded installments up to 12x were enabled in Mercado Pago for
-- Checkout, with a R$ 3.199 minimum for every installment count.
update public.platform_plans
set annual_card_active = true
where plan_key = 'professional'
  and annual_card_price = 3199.90;
