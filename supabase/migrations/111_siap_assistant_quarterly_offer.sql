-- Oferta temporária trimestral do Assistente SIAP.
-- Mantém o plano semestral cadastrado, mas inativo, para reativação futura.

begin;

alter table public.siap_assistant_plans
  drop constraint if exists siap_assistant_plans_plan_key_check;
alter table public.siap_assistant_plans
  add constraint siap_assistant_plans_plan_key_check
  check (plan_key in ('monthly', 'quarterly', 'semiannual'));

alter table public.siap_assistant_plans
  drop constraint if exists siap_assistant_plans_billing_months_check;
alter table public.siap_assistant_plans
  add constraint siap_assistant_plans_billing_months_check
  check (billing_months in (1, 3, 6));

alter table public.hotmart_product_mappings
  drop constraint if exists hotmart_product_mappings_billing_cycle_check;
alter table public.hotmart_product_mappings
  add constraint hotmart_product_mappings_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'semiannual'));

update public.siap_assistant_plans
set active = false, updated_at = now()
where plan_key = 'semiannual';

insert into public.siap_assistant_plans
  (plan_key, display_name, description, amount, billing_months, active, display_order)
values
  ('quarterly', 'Trimestral', 'Pagamento único para três meses de acesso.', 129.90, 3, true, 2)
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  amount = excluded.amount,
  billing_months = excluded.billing_months,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = now();

update public.hotmart_product_mappings
set plan_key = 'quarterly',
    billing_cycle = 'quarterly',
    expected_amount = 129.90,
    checkout_url = 'https://pay.hotmart.com/S107499429I?off=2xaozivg&checkoutMode=6',
    active = true,
    updated_at = now()
where target = 'assistant'
  and plan_key = 'semiannual'
  and billing_cycle = 'semiannual'
  and product_id = 8470115
  and offer_code = '2xaozivg';

do $verify_mapping$
begin
  if not exists (
    select 1 from public.hotmart_product_mappings
    where product_id = 8470115
      and target = 'assistant'
      and plan_key = 'quarterly'
      and billing_cycle = 'quarterly'
      and offer_code = '2xaozivg'
      and active = true
  ) then
    raise exception 'Oferta Hotmart 2xaozivg não encontrada para conversão trimestral.';
  end if;
end;
$verify_mapping$;

-- Checkouts ainda não pagos dessa mesma oferta passam a registrar o período
-- trimestral. Compras já autorizadas não são alteradas nem encurtadas.
update public.siap_assistant_payment_subscriptions
set plan_key = 'quarterly',
    checkout_url = 'https://pay.hotmart.com/S107499429I?off=2xaozivg&checkoutMode=6',
    updated_at = now()
where provider = 'hotmart'
  and provider_checkout_id = '8470115'
  and plan_key = 'semiannual'
  and amount = 129.90
  and status in ('creating', 'pending', 'expired');

create or replace function public.platform_sync_siap_assistant_plan_price(
  p_plan_key text,
  p_amount numeric,
  p_active boolean,
  p_hotmart_confirmed boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_plan public.siap_assistant_plans%rowtype;
  v_mapping public.hotmart_product_mappings%rowtype;
  v_amount numeric(10,2);
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_hotmart_confirmed is not true then
    raise exception 'Confirme primeiro que o mesmo valor foi salvo na oferta da Hotmart.';
  end if;
  if p_plan_key not in ('monthly', 'quarterly', 'semiannual') or p_amount is null or p_amount <= 0 or p_amount > 999999.99 then
    raise exception 'Plano ou valor inválido.';
  end if;
  v_amount := round(p_amount, 2);

  select * into v_plan from public.siap_assistant_plans where plan_key = p_plan_key for update;
  if not found then raise exception 'Plano não encontrado.'; end if;
  select * into v_mapping from public.hotmart_product_mappings
    where target = 'assistant' and plan_key = p_plan_key and active = true for update;
  if not found then raise exception 'Oferta ativa da Hotmart não encontrada.'; end if;

  update public.siap_assistant_plans
  set amount = v_amount, active = coalesce(p_active, false), updated_at = now()
  where plan_key = p_plan_key;
  update public.hotmart_product_mappings
  set expected_amount = v_amount, updated_at = now()
  where product_id = v_mapping.product_id and billing_cycle = v_mapping.billing_cycle;

  perform public.record_platform_audit(
    'siap_hotmart_price_synchronized', null, null,
    jsonb_build_object('plan_key', v_plan.plan_key, 'amount', v_plan.amount,
      'active', v_plan.active, 'hotmart_expected_amount', v_mapping.expected_amount),
    jsonb_build_object('plan_key', v_plan.plan_key, 'amount', v_amount,
      'active', coalesce(p_active, false), 'hotmart_expected_amount', v_amount,
      'hotmart_product_id', v_mapping.product_id)
  );

  return jsonb_build_object('planKey', v_plan.plan_key, 'amount', v_amount,
    'active', coalesce(p_active, false), 'hotmartProductId', v_mapping.product_id);
end;
$function$;
revoke all on function public.platform_sync_siap_assistant_plan_price(text, numeric, boolean, boolean) from public, anon;
grant execute on function public.platform_sync_siap_assistant_plan_price(text, numeric, boolean, boolean) to authenticated;

commit;
