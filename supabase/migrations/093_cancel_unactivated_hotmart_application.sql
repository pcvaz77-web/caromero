-- CARÔMETRO COMERCIAL
-- Permite ao proprietário encerrar uma solicitação de compra que não criou
-- escola, inclusive quando a Hotmart já registrou pagamento. O histórico
-- financeiro é preservado e nenhuma escola ou conta de usuário é removida.

begin;

create or replace function public.platform_cancel_school_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_application public.platform_school_applications%rowtype;
  v_payment public.platform_payment_subscriptions%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  select * into v_application
  from public.platform_school_applications
  where id = p_application_id
  for update;

  if not found or v_application.status not in ('pending', 'expired') then
    raise exception 'Solicitação não está disponível para cancelamento.';
  end if;

  if v_application.school_id is not null then
    raise exception 'Esta solicitação já possui uma escola vinculada e não pode ser cancelada por esta ação.';
  end if;

  select * into v_payment
  from public.platform_payment_subscriptions
  where application_id = p_application_id
  for update;

  if found and v_payment.school_id is not null then
    raise exception 'Esta solicitação já possui uma escola vinculada e não pode ser cancelada por esta ação.';
  end if;

  -- Um pagamento aprovado continua registrado como aprovado. Apenas estados
  -- ainda não pagos são encerrados localmente; cancelamento ou reembolso do
  -- pagamento aprovado deve ser feito no provedor.
  if found and v_payment.status in ('creating', 'pending', 'failed', 'expired') then
    update public.platform_payment_subscriptions
    set status = 'cancelled', updated_at = now()
    where id = v_payment.id;
  end if;

  update public.platform_school_applications
  set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = p_application_id;

  perform public.record_platform_audit(
    'unactivated_school_application_cancelled',
    null,
    null,
    jsonb_build_object(
      'application_id', v_application.id,
      'application_status', v_application.status,
      'payment_id', case when v_payment.id is null then null else v_payment.id end,
      'payment_status', case when v_payment.id is null then null else v_payment.status end,
      'provider', case when v_payment.id is null then null else v_payment.provider end
    ),
    jsonb_build_object(
      'application_id', v_application.id,
      'application_status', 'cancelled',
      'email_released', true,
      'financial_history_preserved', true
    )
  );
end;
$function$;

revoke all on function public.platform_cancel_school_application(uuid) from public, anon;
grant execute on function public.platform_cancel_school_application(uuid) to authenticated;

commit;
