-- CAROMETRO + ASSISTENTE SIAP
-- Acrescenta pagamento semestral a vista sem alterar contratos existentes.

begin;

alter table public.platform_plans
  add column if not exists semiannual_price numeric
    check (semiannual_price is null or (semiannual_price > 0 and semiannual_price <= 99999999.99)),
  add column if not exists semiannual_active boolean not null default false;

update public.platform_plans
set semiannual_price = round(price * 5, 2),
    semiannual_active = true,
    updated_at = now()
where plan_key in ('basic', 'professional')
  and price is not null and price > 0
  and semiannual_price is null;

alter table public.platform_payment_subscriptions
  add column if not exists billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'semiannual')),
  add column if not exists period_months integer not null default 1
    check (period_months in (1, 6));

create or replace function public.platform_update_plan_billing_options(
  p_plan_key text,
  p_semiannual_price numeric,
  p_semiannual_active boolean
)
returns public.platform_plans
language plpgsql security definer set search_path = ''
as $function$
declare
  v_previous public.platform_plans%rowtype;
  v_new public.platform_plans%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;
  if p_plan_key not in ('free', 'basic', 'professional', 'enterprise') then
    raise exception 'Plano inválido.';
  end if;
  if p_semiannual_active and (p_semiannual_price is null or p_semiannual_price <= 0 or p_semiannual_price > 99999999.99) then
    raise exception 'Informe um valor semestral válido.';
  end if;

  select * into v_previous from public.platform_plans where plan_key = p_plan_key for update;
  if not found then raise exception 'Plano não encontrado.'; end if;

  update public.platform_plans
  set semiannual_price = case when p_semiannual_price is null then null else round(p_semiannual_price, 2) end,
      semiannual_active = coalesce(p_semiannual_active, false),
      updated_at = now()
  where plan_key = p_plan_key
  returning * into v_new;

  perform public.record_platform_audit(
    'plan_billing_options_updated', null, null,
    jsonb_build_object('plan_key', v_previous.plan_key, 'semiannual_price', v_previous.semiannual_price, 'semiannual_active', v_previous.semiannual_active),
    jsonb_build_object('plan_key', v_new.plan_key, 'semiannual_price', v_new.semiannual_price, 'semiannual_active', v_new.semiannual_active)
  );
  return v_new;
end;
$function$;

revoke all on function public.platform_update_plan_billing_options(text,numeric,boolean) from public, anon;
grant execute on function public.platform_update_plan_billing_options(text,numeric,boolean) to authenticated;

create or replace function public.has_active_school_subscription(target_school_id uuid)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.school_subscriptions ss
    where ss.school_id = target_school_id
      and ss.status = 'active'
      and (ss.grant_expires_at is null or ss.grant_expires_at > now())
  );
$$;

revoke all on function public.has_active_school_subscription(uuid) from public;
grant execute on function public.has_active_school_subscription(uuid) to authenticated;

commit;
