-- Oferta anual do Premium. A compra anual usa checkout avulso, com preço
-- próprio para Pix e cartão; não altera a mensalidade nem contratos existentes.
begin;

alter table public.platform_plans
  add column if not exists mercado_pago_semiannual_price numeric(10,2)
    check (mercado_pago_semiannual_price is null or mercado_pago_semiannual_price > 0),
  add column if not exists annual_card_price numeric(10,2)
    check (annual_card_price is null or annual_card_price > 0),
  add column if not exists annual_card_active boolean not null default false,
  add column if not exists annual_pix_price numeric(10,2)
    check (annual_pix_price is null or annual_pix_price > 0);

update public.platform_plans
set mercado_pago_semiannual_price = 1699.90,
    annual_card_price = 3199.90,
    annual_pix_price = 3099.90,
    updated_at = now()
where plan_key = 'professional';

create or replace function public.platform_set_premium_annual_prices(
  p_semiannual_price numeric, p_card_price numeric, p_pix_price numeric
)
returns public.platform_plans
language plpgsql security definer set search_path = ''
as $function$
declare
  v_previous public.platform_plans%rowtype;
  v_new public.platform_plans%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_semiannual_price is null or p_card_price is null or p_pix_price is null
    or p_semiannual_price <= 0 or p_card_price <= 0 or p_pix_price <= 0
    or p_semiannual_price > 99999999.99 or p_card_price > 99999999.99 or p_pix_price > 99999999.99
    or round(p_pix_price, 2) > round(p_card_price, 2) then
    raise exception 'Informe valores anuais válidos para cartão e Pix.';
  end if;
  select * into v_previous from public.platform_plans
    where plan_key = 'professional' for update;
  if not found then raise exception 'Plano Premium não encontrado.'; end if;
  update public.platform_plans
    set mercado_pago_semiannual_price = round(p_semiannual_price, 2),
        annual_card_price = round(p_card_price, 2),
        annual_pix_price = round(p_pix_price, 2), updated_at = now()
    where plan_key = 'professional' returning * into v_new;
  perform public.record_platform_audit('premium_annual_prices_updated', null, null,
    jsonb_build_object('semiannual', v_previous.mercado_pago_semiannual_price, 'card', v_previous.annual_card_price, 'pix', v_previous.annual_pix_price),
    jsonb_build_object('semiannual', v_new.mercado_pago_semiannual_price, 'card', v_new.annual_card_price, 'pix', v_new.annual_pix_price));
  return v_new;
end;
$function$;

revoke all on function public.platform_set_premium_annual_prices(numeric,numeric,numeric)
  from public, anon;
grant execute on function public.platform_set_premium_annual_prices(numeric,numeric,numeric)
  to authenticated;

commit;
