begin;

-- A edição antiga alterava apenas o catálogo local e podia deixar o valor
-- público diferente da oferta da Hotmart. Ela deixa de ser executável pelo
-- painel; a sincronização abaixo atualiza catálogo e valor esperado juntos.
revoke execute on function public.platform_update_siap_assistant_plan(text, numeric, boolean) from authenticated;

create or replace function public.platform_list_siap_assistant_commercial_plans()
returns table (
  plan_key text,
  display_name text,
  description text,
  amount numeric,
  billing_months integer,
  active boolean,
  display_order integer,
  hotmart_expected_amount numeric,
  hotmart_checkout_url text,
  hotmart_product_id bigint
)
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
    select p.plan_key, p.display_name, p.description, p.amount, p.billing_months,
      p.active, p.display_order, h.expected_amount, h.checkout_url, h.product_id
    from public.siap_assistant_plans p
    left join public.hotmart_product_mappings h
      on h.target = 'assistant' and h.plan_key = p.plan_key and h.active = true
    order by p.display_order;
end;
$function$;
revoke all on function public.platform_list_siap_assistant_commercial_plans() from public, anon;
grant execute on function public.platform_list_siap_assistant_commercial_plans() to authenticated;

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
  if p_plan_key not in ('monthly', 'semiannual') or p_amount is null or p_amount <= 0 or p_amount > 999999.99 then
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
