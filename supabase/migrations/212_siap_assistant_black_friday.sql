-- Preços de Black Friday ficam em rascunho até o proprietário confirmar os
-- quatro checkouts Hotmart. A troca de catálogo e valores esperados é atômica.
begin;

create table public.siap_assistant_campaigns (
  campaign_key text primary key check (campaign_key = 'black_friday'),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.siap_assistant_campaigns (campaign_key) values ('black_friday');
revoke all on public.siap_assistant_campaigns from public, anon, authenticated;

create table public.siap_assistant_campaign_prices (
  campaign_key text not null references public.siap_assistant_campaigns(campaign_key),
  plan_key text not null references public.siap_assistant_plans(plan_key),
  regular_amount numeric(10,2) not null check (regular_amount > 0),
  promo_amount numeric(10,2) check (promo_amount > 0 and promo_amount < regular_amount),
  updated_at timestamptz not null default now(),
  primary key (campaign_key, plan_key)
);
insert into public.siap_assistant_campaign_prices (campaign_key, plan_key, regular_amount)
select 'black_friday', plan_key, amount from public.siap_assistant_plans
where plan_key in ('monthly', 'quarterly', 'semiannual', 'annual');
revoke all on public.siap_assistant_campaign_prices from public, anon, authenticated;

create function public.platform_get_siap_black_friday()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select jsonb_build_object('active', c.active, 'plans', coalesce(jsonb_agg(
    jsonb_build_object('plan_key', p.plan_key, 'regular_amount', p.regular_amount,
      'promo_amount', p.promo_amount) order by s.display_order), '[]'::jsonb))
  into v_result
  from public.siap_assistant_campaigns c
  left join public.siap_assistant_campaign_prices p on p.campaign_key = c.campaign_key
  left join public.siap_assistant_plans s on s.plan_key = p.plan_key
  where c.campaign_key = 'black_friday'
  group by c.active;
  return v_result;
end;
$function$;
revoke all on function public.platform_get_siap_black_friday() from public, anon;
grant execute on function public.platform_get_siap_black_friday() to authenticated;

create function public.get_siap_black_friday()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_active boolean; v_prices jsonb;
begin
  select active into v_active from public.siap_assistant_campaigns where campaign_key = 'black_friday';
  if not coalesce(v_active, false) then return jsonb_build_object('active', false); end if;
  select coalesce(jsonb_object_agg(plan_key, regular_amount), '{}'::jsonb)
  into v_prices from public.siap_assistant_campaign_prices where campaign_key = 'black_friday';
  return jsonb_build_object('active', true, 'regular_prices', v_prices);
end;
$function$;
revoke all on function public.get_siap_black_friday() from public;
grant execute on function public.get_siap_black_friday() to anon, authenticated;

create function public.platform_save_siap_black_friday_price(
  p_plan_key text, p_regular_amount numeric, p_promo_amount numeric
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_current numeric; v_mapping numeric; v_active boolean;
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select active into v_active from public.siap_assistant_campaigns where campaign_key = 'black_friday' for update;
  if v_active then raise exception 'Desative a campanha antes de editar os valores.'; end if;
  if p_plan_key not in ('monthly','quarterly','semiannual','annual')
     or p_regular_amount is null or p_promo_amount is null
     or p_promo_amount <= 0 or p_promo_amount >= p_regular_amount then
    raise exception 'O preço promocional precisa ser menor que o preço normal.';
  end if;
  select amount into v_current from public.siap_assistant_plans where plan_key = p_plan_key for update;
  select expected_amount into v_mapping from public.hotmart_product_mappings
    where target = 'assistant' and plan_key = p_plan_key and active = true;
  if v_current is null or v_mapping is null or round(p_regular_amount,2) <> v_current or v_current <> v_mapping then
    raise exception 'O preço normal deve coincidir com o valor atual no catálogo e na Hotmart. Sincronize o valor normal antes.';
  end if;
  insert into public.siap_assistant_campaign_prices (campaign_key,plan_key,regular_amount,promo_amount)
  values ('black_friday',p_plan_key,round(p_regular_amount,2),round(p_promo_amount,2))
  on conflict (campaign_key,plan_key) do update set
    regular_amount = excluded.regular_amount, promo_amount = excluded.promo_amount, updated_at = now();
  return jsonb_build_object('plan_key',p_plan_key,'promo_amount',round(p_promo_amount,2));
end;
$function$;
revoke all on function public.platform_save_siap_black_friday_price(text,numeric,numeric) from public, anon;
grant execute on function public.platform_save_siap_black_friday_price(text,numeric,numeric) to authenticated;

create function public.platform_set_siap_black_friday_active(
  p_active boolean, p_hotmart_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_was_active boolean; v_count integer; v_bad integer;
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_hotmart_confirmed is not true then raise exception 'Confirme os quatro preços nos checkouts da Hotmart.'; end if;
  select active into v_was_active from public.siap_assistant_campaigns
    where campaign_key = 'black_friday' for update;
  if p_active = v_was_active then return jsonb_build_object('active',v_was_active); end if;
  select count(*), count(*) filter (where cp.promo_amount is null or
    cp.promo_amount >= cp.regular_amount or
    sp.amount <> case when v_was_active then cp.promo_amount else cp.regular_amount end or
    hm.expected_amount <> sp.amount or hm.offer_code is null)
  into v_count, v_bad
  from public.siap_assistant_campaign_prices cp
  join public.siap_assistant_plans sp on sp.plan_key = cp.plan_key
  left join public.hotmart_product_mappings hm on hm.target = 'assistant'
    and hm.plan_key = cp.plan_key and hm.active = true
  where cp.campaign_key = 'black_friday';
  if v_count <> 4 or v_bad <> 0 then
    raise exception 'Confira os quatro preços promocionais e os valores atuais dos checkouts.';
  end if;
  update public.siap_assistant_plans sp
  set amount = case when p_active then cp.promo_amount else cp.regular_amount end,
      updated_at = now()
  from public.siap_assistant_campaign_prices cp
  where cp.campaign_key = 'black_friday' and cp.plan_key = sp.plan_key;
  update public.hotmart_product_mappings hm
  set expected_amount = case when p_active then cp.promo_amount else cp.regular_amount end,
      updated_at = now()
  from public.siap_assistant_campaign_prices cp
  where cp.campaign_key = 'black_friday' and cp.plan_key = hm.plan_key
    and hm.target = 'assistant' and hm.active = true;
  update public.siap_assistant_campaigns set active = p_active, updated_at = now()
    where campaign_key = 'black_friday';
  perform public.record_platform_audit('siap_black_friday_toggled',null,null,
    jsonb_build_object('active',v_was_active),jsonb_build_object('active',p_active));
  return jsonb_build_object('active',p_active);
end;
$function$;
revoke all on function public.platform_set_siap_black_friday_active(boolean,boolean) from public, anon;
grant execute on function public.platform_set_siap_black_friday_active(boolean,boolean) to authenticated;

create or replace function public.platform_sync_siap_assistant_plan_price(
  p_plan_key text, p_amount numeric, p_active boolean, p_hotmart_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_plan public.siap_assistant_plans%rowtype;
        v_mapping public.hotmart_product_mappings%rowtype;
        v_amount numeric(10,2);
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_hotmart_confirmed is not true then raise exception 'Confirme o valor na Hotmart.'; end if;
  if (select active from public.siap_assistant_campaigns where campaign_key = 'black_friday') then
    raise exception 'Desative a Black Friday antes de alterar preços normais.';
  end if;
  if p_plan_key not in ('monthly','quarterly','semiannual','annual') or
     p_amount is null or p_amount <= 0 or p_amount > 999999.99 then
    raise exception 'Plano ou valor inválido.';
  end if;
  v_amount := round(p_amount,2);
  select * into v_plan from public.siap_assistant_plans where plan_key = p_plan_key for update;
  if not found then raise exception 'Plano não encontrado.'; end if;
  select * into v_mapping from public.hotmart_product_mappings where target = 'assistant'
    and plan_key = p_plan_key and active = true for update;
  if not found then raise exception 'Oferta ativa da Hotmart não encontrada.'; end if;
  update public.siap_assistant_plans set amount = v_amount, active = coalesce(p_active,false), updated_at = now()
    where plan_key = p_plan_key;
  update public.hotmart_product_mappings set expected_amount = v_amount, updated_at = now()
    where product_id = v_mapping.product_id and billing_cycle = v_mapping.billing_cycle;
  update public.siap_assistant_campaign_prices set regular_amount = v_amount,
    promo_amount = case when promo_amount < v_amount then promo_amount else null end,
    updated_at = now()
    where campaign_key = 'black_friday' and plan_key = p_plan_key;
  perform public.record_platform_audit('siap_hotmart_price_synchronized',null,null,
    jsonb_build_object('plan_key',p_plan_key,'amount',v_plan.amount,'active',v_plan.active),
    jsonb_build_object('plan_key',p_plan_key,'amount',v_amount,'active',p_active));
  return jsonb_build_object('planKey',p_plan_key,'amount',v_amount,'active',coalesce(p_active,false));
end;
$function$;

commit;
