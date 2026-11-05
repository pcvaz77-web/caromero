-- A compra única usa o preço confirmado no pedido, inclusive quando uma
-- campanha termina antes da confirmação do pagamento pelo provedor.
begin;

alter table public.siap_assistant_payment_subscriptions
  add column if not exists last_activated_payment_id text;

update public.siap_assistant_payment_subscriptions
set last_activated_payment_id = coalesce(nullif(last_payment_id,''), nullif(last_invoice_id,''))
where status = 'authorized' and current_period_end is not null
  and last_activated_payment_id is null;

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
  v_activation_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_payment from public.siap_assistant_payment_subscriptions
    where id=p_payment_subscription_id for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  v_activation_key := coalesce(nullif(v_payment.last_payment_id,''), nullif(v_payment.last_invoice_id,''));
  if v_payment.last_payment_status <> 'approved' or v_activation_key is null then
    raise exception 'Pagamento ainda não aprovado.';
  end if;
  if v_payment.last_activated_payment_id = v_activation_key then
    return jsonb_build_object('userId',v_payment.user_id,'paidUntil',v_payment.current_period_end,'alreadyActivated',true);
  end if;
  select * into v_plan from public.siap_assistant_plans where plan_key=v_payment.plan_key;
  if not found or v_plan.billing_months not in (1,3,6,12) or v_payment.amount <= 0 then
    raise exception 'Plano ou valor divergente.';
  end if;

  select exists(select 1 from public.siap_assistant_licenses where user_id=v_payment.user_id) into v_had_license;
  insert into public.siap_assistant_licenses(user_id,entitlement_type,trial_started_at,trial_ends_at,paid_until)
  values(v_payment.user_id,'subscription',p_paid_at-interval '30 days',p_paid_at,null)
  on conflict(user_id) do nothing;
  select * into v_license from public.siap_assistant_licenses where user_id=v_payment.user_id for update;
  v_period_start := greatest(p_paid_at,coalesce(v_license.paid_until,'-infinity'::timestamptz),
    case when v_had_license then v_license.trial_ends_at else p_paid_at end);
  v_period_end := v_period_start + make_interval(months=>v_plan.billing_months);
  update public.siap_assistant_licenses
    set entitlement_type='subscription',paid_until=v_period_end,suspended_at=null,updated_at=now()
    where user_id=v_payment.user_id;
  update public.siap_assistant_payment_subscriptions
    set status='authorized',current_period_end=v_period_end,
        last_activated_payment_id=v_activation_key,updated_at=now()
    where id=v_payment.id;
  return jsonb_build_object('userId',v_payment.user_id,'paidUntil',v_period_end,'alreadyActivated',false);
end;
$function$;

revoke all on function public.siap_activate_paid_subscription(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.siap_activate_paid_subscription(uuid,timestamptz)
  to service_role;

commit;
