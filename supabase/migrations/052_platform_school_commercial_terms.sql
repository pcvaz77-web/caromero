-- CARÔMETRO COMERCIAL
-- RPC dedicada às condições comerciais de uma escola (preço e tipo de
-- cobrança), separada deliberadamente de platform_set_subscription_plan
-- e das RPCs de override de plano (migration 050) — desmontando a mesma
-- ambiguidade que motivou criar platform_set_plan_override/
-- platform_remove_plan_override em vez de evoluir a RPC antiga.
--
-- Altera exclusivamente school_subscriptions.price e .billing_type.
-- NUNCA toca plan, contracted_plan, override_plan, override_expires_at,
-- status ou grant_expires_at.
--
-- Sobre granted_by/grant_reason: auditados antes de decidir. Hoje esses
-- dois campos são escritos por platform_set_subscription_plan e pelas
-- RPCs de override (050) para representar quem concedeu manualmente um
-- PLANO e por quê — é a mesma semântica de "concessão de plano", não de
-- "termos comerciais". Se esta RPC os sobrescrevesse a cada ajuste de
-- preço/cobrança, apagaria o rastro de uma concessão de plano vigente
-- (ex.: o motivo de uma concessão de cortesia seria substituído por algo
-- como "ajuste de preço"). Por isso esta RPC NÃO escreve granted_by nem
-- grant_reason — autor e motivo da alteração comercial ficam registrados
-- somente em platform_audit_log (actor_user_id, já capturado por
-- record_platform_audit, e o motivo dentro de new_state).
--
-- platform_set_subscription_plan permanece instalada e com EXECUTE
-- intacto — o frontend publicado ainda depende dela. Nada aqui a altera
-- ou revoga.

begin;

create or replace function public.platform_set_school_commercial_terms(
  p_school_id uuid,
  p_price numeric,
  p_billing_type text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous public.school_subscriptions%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_billing_type is null or p_billing_type not in ('fixed_school', 'per_student') then
    raise exception 'Tipo de cobrança inválido.';
  end if;

  if p_price is null or p_price < 0 or p_price > 99999999.99 then
    raise exception 'Preço inválido.';
  end if;

  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'Informe um motivo válido para a alteração comercial.';
  end if;

  select * into v_previous
  from public.school_subscriptions
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Assinatura da escola não encontrada.';
  end if;

  update public.school_subscriptions
  set
    price = p_price,
    billing_type = p_billing_type,
    updated_at = now()
  where school_id = p_school_id;

  perform public.record_platform_audit(
    'subscription_commercial_terms_changed',
    p_school_id,
    null,
    jsonb_build_object(
      'price', v_previous.price,
      'billing_type', v_previous.billing_type
    ),
    jsonb_build_object(
      'price', p_price,
      'billing_type', p_billing_type,
      'reason', v_reason
    )
  );
end;
$function$;

revoke all on function public.platform_set_school_commercial_terms(uuid, numeric, text, text) from public;
revoke all on function public.platform_set_school_commercial_terms(uuid, numeric, text, text) from anon;
grant execute on function public.platform_set_school_commercial_terms(uuid, numeric, text, text) to authenticated;

commit;
