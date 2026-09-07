begin;

create or replace function public.platform_list_school_commercial_mappings()
returns table (plan_key text, billing_cycle text, expected_amount numeric, checkout_url text, product_id bigint, offer_code text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
    select h.plan_key, h.billing_cycle, h.expected_amount, h.checkout_url, h.product_id, h.offer_code
    from public.hotmart_product_mappings h
    where h.target = 'school' and h.active = true
      and h.plan_key in ('basic', 'professional')
      and h.billing_cycle in ('monthly', 'semiannual')
    order by h.plan_key, h.billing_cycle;
end;
$function$;
revoke all on function public.platform_list_school_commercial_mappings() from public, anon;
grant execute on function public.platform_list_school_commercial_mappings() to authenticated;

-- Catálogo e valores usados para validar a Hotmart mudam na mesma transação.
-- Se qualquer etapa falhar, nenhuma alteração é persistida.
create or replace function public.platform_sync_school_plan(
  p_plan_key text, p_display_name text, p_price numeric,
  p_semiannual_price numeric, p_semiannual_active boolean,
  p_description text, p_cta_label text, p_highlighted boolean,
  p_contact_only boolean, p_display_order integer,
  p_monthly_hotmart_confirmed boolean, p_semiannual_hotmart_confirmed boolean
)
returns public.platform_plans
language plpgsql security definer set search_path = ''
as $function$
declare
  v_previous public.platform_plans%rowtype;
  v_new public.platform_plans%rowtype;
  v_monthly public.hotmart_product_mappings%rowtype;
  v_semiannual public.hotmart_product_mappings%rowtype;
  v_price numeric(10,2);
  v_semiannual_price numeric(10,2);
  v_is_hotmart_plan boolean;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_plan_key is null or p_plan_key not in ('free', 'basic', 'professional', 'enterprise') then raise exception 'Plano inválido.'; end if;
  if nullif(btrim(coalesce(p_display_name, '')), '') is null then raise exception 'Informe o nome de exibição do plano.'; end if;
  if nullif(btrim(coalesce(p_cta_label, '')), '') is null then raise exception 'Informe o texto do botão do plano.'; end if;
  if p_price is not null and (p_price < 0 or p_price > 99999999.99) then raise exception 'Informe um preço mensal válido.'; end if;
  if p_semiannual_active and (p_semiannual_price is null or p_semiannual_price <= 0 or p_semiannual_price > 99999999.99) then raise exception 'Informe um valor semestral válido.'; end if;
  if p_display_order is null or p_display_order < 1 then raise exception 'Informe a ordem de apresentação.'; end if;

  v_is_hotmart_plan := p_plan_key in ('basic', 'professional');
  if v_is_hotmart_plan and (p_price is null or p_price <= 0) then raise exception 'Informe um preço mensal maior que zero para este plano.'; end if;
  if v_is_hotmart_plan and (p_semiannual_price is null or p_semiannual_price <= 0) then raise exception 'Informe um preço semestral maior que zero para este plano.'; end if;
  v_price := case when p_price is null then null else round(p_price, 2) end;
  v_semiannual_price := case when p_semiannual_price is null then null else round(p_semiannual_price, 2) end;

  select * into v_previous from public.platform_plans where plan_key = p_plan_key for update;
  if not found then raise exception 'Plano não encontrado.'; end if;

  if v_is_hotmart_plan then
    select * into v_monthly from public.hotmart_product_mappings
      where target = 'school' and plan_key = p_plan_key and billing_cycle = 'monthly' and active = true for update;
    if not found then raise exception 'Oferta mensal ativa da Hotmart não encontrada.'; end if;
    select * into v_semiannual from public.hotmart_product_mappings
      where target = 'school' and plan_key = p_plan_key and billing_cycle = 'semiannual' and active = true for update;
    if not found then raise exception 'Oferta semestral ativa da Hotmart não encontrada.'; end if;
    if v_price is distinct from round(v_monthly.expected_amount, 2) and p_monthly_hotmart_confirmed is not true then
      raise exception 'Confirme primeiro que o novo valor mensal foi salvo na oferta da Hotmart.';
    end if;
    if v_semiannual_price is distinct from round(v_semiannual.expected_amount, 2) and p_semiannual_hotmart_confirmed is not true then
      raise exception 'Confirme primeiro que o novo valor semestral foi salvo na oferta da Hotmart.';
    end if;
  end if;

  if p_highlighted then
    update public.platform_plans set highlighted = false, updated_at = now()
    where plan_key <> p_plan_key and highlighted = true;
  end if;
  update public.platform_plans set
    display_name = btrim(p_display_name), price = v_price,
    semiannual_price = v_semiannual_price, semiannual_active = coalesce(p_semiannual_active, false),
    description = nullif(btrim(coalesce(p_description, '')), ''), cta_label = btrim(p_cta_label),
    highlighted = coalesce(p_highlighted, false), contact_only = coalesce(p_contact_only, false),
    display_order = p_display_order, updated_at = now()
  where plan_key = p_plan_key returning * into v_new;

  if v_is_hotmart_plan then
    update public.hotmart_product_mappings set expected_amount = v_price, updated_at = now()
      where product_id = v_monthly.product_id and billing_cycle = v_monthly.billing_cycle;
    update public.hotmart_product_mappings set expected_amount = v_semiannual_price, updated_at = now()
      where product_id = v_semiannual.product_id and billing_cycle = v_semiannual.billing_cycle;
  end if;

  perform public.record_platform_audit('school_hotmart_plan_synchronized', null, null,
    jsonb_build_object('plan_key', v_previous.plan_key, 'price', v_previous.price,
      'semiannual_price', v_previous.semiannual_price, 'semiannual_active', v_previous.semiannual_active,
      'display_name', v_previous.display_name, 'description', v_previous.description,
      'cta_label', v_previous.cta_label, 'highlighted', v_previous.highlighted,
      'contact_only', v_previous.contact_only, 'display_order', v_previous.display_order,
      'hotmart_monthly_expected_amount', case when v_is_hotmart_plan then v_monthly.expected_amount else null end,
      'hotmart_semiannual_expected_amount', case when v_is_hotmart_plan then v_semiannual.expected_amount else null end),
    jsonb_build_object('plan_key', v_new.plan_key, 'price', v_new.price,
      'semiannual_price', v_new.semiannual_price, 'semiannual_active', v_new.semiannual_active,
      'display_name', v_new.display_name, 'description', v_new.description,
      'cta_label', v_new.cta_label, 'highlighted', v_new.highlighted,
      'contact_only', v_new.contact_only, 'display_order', v_new.display_order,
      'hotmart_monthly_expected_amount', case when v_is_hotmart_plan then v_price else null end,
      'hotmart_semiannual_expected_amount', case when v_is_hotmart_plan then v_semiannual_price else null end));
  return v_new;
end;
$function$;
revoke all on function public.platform_sync_school_plan(text,text,numeric,numeric,boolean,text,text,boolean,boolean,integer,boolean,boolean) from public, anon;
grant execute on function public.platform_sync_school_plan(text,text,numeric,numeric,boolean,text,text,boolean,boolean,integer,boolean,boolean) to authenticated;

commit;
