-- Mantém ofertas normais e promocionais separadas. A troca da campanha
-- atualiza preço e checkout juntos, preservando as assinaturas já iniciadas.
begin;

alter table public.siap_assistant_campaign_prices
  add column if not exists regular_checkout_url text,
  add column if not exists regular_offer_code text,
  add column if not exists promo_checkout_url text,
  add column if not exists promo_offer_code text;

update public.siap_assistant_campaign_prices
set regular_checkout_url = case plan_key
      when 'monthly' then 'https://pay.hotmart.com/S107499429I?off=4khlw0of'
      when 'quarterly' then 'https://pay.hotmart.com/S107499429I?off=604f4sx0&checkoutMode=6'
      when 'semiannual' then 'https://pay.hotmart.com/S107499429I?off=jjlp7c2v&checkoutMode=6'
      when 'annual' then 'https://pay.hotmart.com/S107499429I?off=c4sm8bdn&checkoutMode=6'
    end,
    regular_offer_code = case plan_key
      when 'monthly' then '4khlw0of'
      when 'quarterly' then '604f4sx0'
      when 'semiannual' then 'jjlp7c2v'
      when 'annual' then 'c4sm8bdn'
    end,
    promo_checkout_url = case plan_key
      when 'monthly' then 'https://pay.hotmart.com/S107499429I?off=qje7tqpx'
      when 'quarterly' then 'https://pay.hotmart.com/S107499429I?off=5tu51u79&checkoutMode=6'
      when 'semiannual' then 'https://pay.hotmart.com/S107499429I?off=rr2amtkx&checkoutMode=6'
      when 'annual' then 'https://pay.hotmart.com/S107499429I?off=y8mobnqd&checkoutMode=6'
    end,
    promo_offer_code = case plan_key
      when 'monthly' then 'qje7tqpx'
      when 'quarterly' then '5tu51u79'
      when 'semiannual' then 'rr2amtkx'
      when 'annual' then 'y8mobnqd'
    end,
    updated_at = now()
where campaign_key = 'black_friday';

alter table public.siap_assistant_campaign_prices
  drop constraint if exists siap_campaign_checkout_pairs_valid;

alter table public.siap_assistant_campaign_prices
  add constraint siap_campaign_checkout_pairs_valid check (
    regular_checkout_url ~ '^https://pay[.]hotmart[.]com/'
    and promo_checkout_url ~ '^https://pay[.]hotmart[.]com/'
    and regular_offer_code ~ '^[a-z0-9]{8}$'
    and promo_offer_code ~ '^[a-z0-9]{8}$'
    and regular_checkout_url like '%off=' || regular_offer_code || '%'
    and promo_checkout_url like '%off=' || promo_offer_code || '%'
  );

create or replace function public.platform_set_siap_black_friday_active(
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
    hm.expected_amount <> sp.amount or
    hm.offer_code is distinct from case when v_was_active then cp.promo_offer_code else cp.regular_offer_code end or
    hm.checkout_url is distinct from case when v_was_active then cp.promo_checkout_url else cp.regular_checkout_url end)
  into v_count, v_bad
  from public.siap_assistant_campaign_prices cp
  join public.siap_assistant_plans sp on sp.plan_key = cp.plan_key
  left join public.hotmart_product_mappings hm on hm.target = 'assistant'
    and hm.plan_key = cp.plan_key and hm.active = true
  where cp.campaign_key = 'black_friday';
  if v_count <> 4 or v_bad <> 0 then
    raise exception 'Confira os quatro preços e os vínculos atuais dos checkouts.';
  end if;
  update public.siap_assistant_plans sp
  set amount = case when p_active then cp.promo_amount else cp.regular_amount end,
      updated_at = now()
  from public.siap_assistant_campaign_prices cp
  where cp.campaign_key = 'black_friday' and cp.plan_key = sp.plan_key;
  update public.hotmart_product_mappings hm
  set expected_amount = case when p_active then cp.promo_amount else cp.regular_amount end,
      checkout_url = case when p_active then cp.promo_checkout_url else cp.regular_checkout_url end,
      offer_code = case when p_active then cp.promo_offer_code else cp.regular_offer_code end,
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

update public.hotmart_product_mappings hm
set checkout_url = case when c.active then cp.promo_checkout_url else cp.regular_checkout_url end,
    offer_code = case when c.active then cp.promo_offer_code else cp.regular_offer_code end,
    updated_at = now()
from public.siap_assistant_campaign_prices cp
join public.siap_assistant_campaigns c on c.campaign_key = cp.campaign_key
where cp.campaign_key = 'black_friday' and cp.plan_key = hm.plan_key
  and hm.target = 'assistant' and hm.active = true
  and hm.checkout_url = cp.regular_checkout_url;

commit;
