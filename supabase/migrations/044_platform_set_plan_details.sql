-- CARÔMETRO COMERCIAL
-- RPC para o proprietário da plataforma editar os campos públicos de um
-- plano já existente em platform_plans (migration 042). Não cria linha
-- nova, não altera plan_key, não toca em school_subscriptions nem em
-- school_billing_contacts.

begin;

create or replace function public.platform_set_plan_details(
  p_plan_key text,
  p_display_name text,
  p_price numeric,
  p_description text,
  p_cta_label text,
  p_highlighted boolean,
  p_contact_only boolean,
  p_display_order integer
)
returns public.platform_plans
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous public.platform_plans%rowtype;
  v_new public.platform_plans%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_plan_key is null or p_plan_key not in ('free', 'basic', 'professional', 'enterprise') then
    raise exception 'Plano inválido.';
  end if;

  if nullif(btrim(coalesce(p_display_name, '')), '') is null then
    raise exception 'Informe o nome de exibição do plano.';
  end if;

  if nullif(btrim(coalesce(p_cta_label, '')), '') is null then
    raise exception 'Informe o texto do botão do plano.';
  end if;

  if p_price is not null and p_price < 0 then
    raise exception 'O preço não pode ser negativo.';
  end if;

  if p_display_order is null then
    raise exception 'Informe a ordem de apresentação.';
  end if;

  -- Trava a linha do plano (nunca cria uma nova: se plan_key não
  -- corresponder a uma linha já existente, a function falha aqui — as
  -- únicas 4 linhas possíveis já são garantidas pelo CHECK da tabela e
  -- pelo seed da migration 042).
  select *
    into v_previous
  from public.platform_plans
  where plan_key = p_plan_key
  for update;

  if not found then
    raise exception 'Plano não encontrado.';
  end if;

  -- No máximo um plano destacado: marcar este como destaque remove o
  -- destaque de qualquer outro. Não obriga que sempre exista um
  -- destacado — só impede mais de um simultâneo.
  if p_highlighted then
    update public.platform_plans
    set highlighted = false, updated_at = now()
    where plan_key <> p_plan_key
      and highlighted = true;
  end if;

  update public.platform_plans
  set
    display_name = btrim(p_display_name),
    price = p_price,
    description = nullif(btrim(coalesce(p_description, '')), ''),
    cta_label = btrim(p_cta_label),
    highlighted = p_highlighted,
    contact_only = p_contact_only,
    display_order = p_display_order,
    updated_at = now()
  where plan_key = p_plan_key
  returning * into v_new;

  -- Campos públicos de exibição do plano — sem PII, então o padrão
  -- existente de guardar estado anterior/novo completo em jsonb se aplica
  -- normalmente, igual a subscription_plan_changed.
  perform public.record_platform_audit(
    'plan_catalog_updated',
    null,
    null,
    jsonb_build_object(
      'plan_key', v_previous.plan_key,
      'display_name', v_previous.display_name,
      'price', v_previous.price,
      'description', v_previous.description,
      'cta_label', v_previous.cta_label,
      'highlighted', v_previous.highlighted,
      'contact_only', v_previous.contact_only,
      'display_order', v_previous.display_order
    ),
    jsonb_build_object(
      'plan_key', v_new.plan_key,
      'display_name', v_new.display_name,
      'price', v_new.price,
      'description', v_new.description,
      'cta_label', v_new.cta_label,
      'highlighted', v_new.highlighted,
      'contact_only', v_new.contact_only,
      'display_order', v_new.display_order
    )
  );

  return v_new;
end;
$function$;

revoke all on function public.platform_set_plan_details(text, text, numeric, text, text, boolean, boolean, integer) from public;
revoke all on function public.platform_set_plan_details(text, text, numeric, text, text, boolean, boolean, integer) from anon;
grant execute on function public.platform_set_plan_details(text, text, numeric, text, text, boolean, boolean, integer) to authenticated;

commit;
