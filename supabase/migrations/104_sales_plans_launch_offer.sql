-- CARÔMETRO COMERCIAL
-- Atualiza a apresentação comercial dos planos e adiciona um preço anterior
-- opcional. compare_at_price é somente visual: não participa de checkout,
-- cobrança, limites ou validação de valores da Hotmart.

begin;

alter table public.platform_plans
  add column compare_at_price numeric(10,2) null
    check (compare_at_price is null or compare_at_price > 0);

update public.platform_plans
set max_students = 100,
    max_staff = 5,
    max_classes = 2,
    description = 'Para conhecer o Carômetro e começar com uma equipe pequena.',
    updated_at = now()
where plan_key = 'free';

update public.platform_plans
set max_students = 1000,
    max_staff = 10,
    max_classes = 12,
    description = 'Gestão escolar completa para escolas em crescimento.',
    updated_at = now()
where plan_key = 'basic';

update public.platform_plans
set display_name = 'Premium',
    max_students = null,
    max_staff = null,
    max_classes = null,
    description = 'Todas as funcionalidades do Básico, com capacidade ilimitada e recursos avançados.',
    updated_at = now()
where plan_key = 'professional';

insert into public.platform_features (feature_key, label, description) values
  ('student_observations', 'Observações de alunos', 'Registro e acompanhamento de observações dos alunos.'),
  ('coordinator_management', 'Gestão de coordenadores', 'Organização dos coordenadores da escola.'),
  ('permission_management', 'Gestão completa de permissões', 'Aplicação e gerenciamento de todas as permissões disponíveis.')
on conflict (feature_key) do update set
  label = excluded.label,
  description = excluded.description,
  updated_at = now();

insert into public.platform_plan_features (plan_key, feature_key, enabled) values
  ('free', 'student_observations', false),
  ('free', 'coordinator_management', false),
  ('free', 'permission_management', false),
  ('basic', 'class_counselors', true),
  ('basic', 'student_observations', true),
  ('basic', 'coordinator_management', true),
  ('basic', 'permission_management', false),
  ('professional', 'class_counselors', true),
  ('professional', 'student_observations', true),
  ('professional', 'coordinator_management', true),
  ('professional', 'permission_management', true),
  ('professional', 'item_control', true),
  ('professional', 'reports', true)
on conflict (plan_key, feature_key) do update set enabled = excluded.enabled;

create or replace function public.platform_sync_school_plan(
  p_plan_key text, p_display_name text, p_price numeric,
  p_compare_at_price numeric, p_semiannual_price numeric,
  p_semiannual_active boolean, p_description text, p_cta_label text,
  p_highlighted boolean, p_contact_only boolean, p_display_order integer,
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
  v_compare_at_price numeric(10,2);
  v_semiannual_price numeric(10,2);
  v_is_hotmart_plan boolean;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_plan_key is null or p_plan_key not in ('free', 'basic', 'professional', 'enterprise') then raise exception 'Plano inválido.'; end if;
  if nullif(btrim(coalesce(p_display_name, '')), '') is null then raise exception 'Informe o nome de exibição do plano.'; end if;
  if nullif(btrim(coalesce(p_cta_label, '')), '') is null then raise exception 'Informe o texto do botão do plano.'; end if;
  if p_price is not null and (p_price < 0 or p_price > 99999999.99) then raise exception 'Informe um preço mensal válido.'; end if;
  if p_compare_at_price is not null and (p_compare_at_price <= coalesce(p_price, 0) or p_compare_at_price > 99999999.99) then raise exception 'O preço anterior deve ser maior que o preço mensal.'; end if;
  if p_semiannual_active and (p_semiannual_price is null or p_semiannual_price <= 0 or p_semiannual_price > 99999999.99) then raise exception 'Informe um valor semestral válido.'; end if;
  if p_display_order is null or p_display_order < 1 then raise exception 'Informe a ordem de apresentação.'; end if;

  v_is_hotmart_plan := p_plan_key in ('basic', 'professional');
  if v_is_hotmart_plan and (p_price is null or p_price <= 0) then raise exception 'Informe um preço mensal maior que zero para este plano.'; end if;
  if v_is_hotmart_plan and (p_semiannual_price is null or p_semiannual_price <= 0) then raise exception 'Informe um preço semestral maior que zero para este plano.'; end if;
  v_price := case when p_price is null then null else round(p_price, 2) end;
  v_compare_at_price := case when p_compare_at_price is null then null else round(p_compare_at_price, 2) end;
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
    compare_at_price = v_compare_at_price,
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
      'compare_at_price', v_previous.compare_at_price,
      'semiannual_price', v_previous.semiannual_price, 'semiannual_active', v_previous.semiannual_active,
      'display_name', v_previous.display_name, 'description', v_previous.description,
      'cta_label', v_previous.cta_label, 'highlighted', v_previous.highlighted,
      'contact_only', v_previous.contact_only, 'display_order', v_previous.display_order,
      'hotmart_monthly_expected_amount', case when v_is_hotmart_plan then v_monthly.expected_amount else null end,
      'hotmart_semiannual_expected_amount', case when v_is_hotmart_plan then v_semiannual.expected_amount else null end),
    jsonb_build_object('plan_key', v_new.plan_key, 'price', v_new.price,
      'compare_at_price', v_new.compare_at_price,
      'semiannual_price', v_new.semiannual_price, 'semiannual_active', v_new.semiannual_active,
      'display_name', v_new.display_name, 'description', v_new.description,
      'cta_label', v_new.cta_label, 'highlighted', v_new.highlighted,
      'contact_only', v_new.contact_only, 'display_order', v_new.display_order,
      'hotmart_monthly_expected_amount', case when v_is_hotmart_plan then v_price else null end,
      'hotmart_semiannual_expected_amount', case when v_is_hotmart_plan then v_semiannual_price else null end));
  return v_new;
end;
$function$;

revoke all on function public.platform_sync_school_plan(text,text,numeric,numeric,numeric,boolean,text,text,boolean,boolean,integer,boolean,boolean) from public, anon;
grant execute on function public.platform_sync_school_plan(text,text,numeric,numeric,numeric,boolean,text,text,boolean,boolean,integer,boolean,boolean) to authenticated;

commit;
