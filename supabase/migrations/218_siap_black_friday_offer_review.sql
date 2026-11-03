-- Mostra ao proprietário os dois checkouts que a campanha alterna.
begin;

create or replace function public.platform_get_siap_black_friday()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select jsonb_build_object('active', c.active, 'plans', coalesce(jsonb_agg(
    jsonb_build_object('plan_key', p.plan_key, 'regular_amount', p.regular_amount,
      'promo_amount', p.promo_amount, 'regular_checkout_url', p.regular_checkout_url,
      'promo_checkout_url', p.promo_checkout_url) order by s.display_order), '[]'::jsonb))
  into v_result
  from public.siap_assistant_campaigns c
  left join public.siap_assistant_campaign_prices p on p.campaign_key = c.campaign_key
  left join public.siap_assistant_plans s on s.plan_key = p.plan_key
  where c.campaign_key = 'black_friday'
  group by c.active;
  return v_result;
end;
$function$;

commit;
