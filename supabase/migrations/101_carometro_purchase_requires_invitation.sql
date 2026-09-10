-- Compras do Carometro sempre exigem aceite de convite proprio do produto.
-- Uma identidade Auth existente (inclusive criada pelo Assistente SIAP) nao
-- recebe vinculo escolar automatico. Nenhum dado existente e alterado por esta
-- migration; a regra vale para ativacoes futuras.
begin;

create or replace function public.platform_activate_paid_subscription(p_payment_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payment public.platform_payment_subscriptions%rowtype;
  v_application public.platform_school_applications%rowtype;
  v_owner_id uuid;
  v_school_id uuid;
  v_invitation_id uuid;
  v_invitation_token uuid;
  v_slug_base text;
  v_slug text;
begin
  if auth.role() <> 'service_role' then raise exception 'Acesso negado.'; end if;

  select * into v_payment from public.platform_payment_subscriptions
  where id = p_payment_subscription_id for update;
  if not found then raise exception 'Assinatura de pagamento não encontrada.'; end if;
  if v_payment.status <> 'authorized' or v_payment.last_payment_status <> 'approved' then
    raise exception 'Pagamento ainda não confirmado.';
  end if;
  if v_payment.school_id is not null then
    return jsonb_build_object('school_id', v_payment.school_id, 'already_activated', true);
  end if;

  select * into v_application from public.platform_school_applications
  where id = v_payment.application_id for update;
  if not found or v_application.status <> 'pending' then raise exception 'Solicitação não está disponível.'; end if;
  if v_application.plan_key <> v_payment.plan_key or v_application.email <> v_payment.payer_email then
    raise exception 'Dados comerciais inconsistentes.';
  end if;

  select pa.user_id into v_owner_id from public.platform_admins pa
  where pa.role = 'owner' and pa.status = 'active' order by pa.created_at limit 1;
  if v_owner_id is null then raise exception 'Proprietário da plataforma não configurado.'; end if;

  v_slug_base := trim(both '-' from regexp_replace(lower(v_application.school_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then v_slug_base := 'escola'; end if;
  v_slug := left(v_slug_base, 120) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.schools(name, slug, status)
  values(v_application.school_name, v_slug, 'active') returning id into v_school_id;

  insert into public.school_subscriptions(
    school_id, plan, billing_type, status, price, granted_by, grant_reason,
    contracted_plan, override_plan, override_expires_at
  ) values(
    v_school_id, v_payment.plan_key, 'fixed_school', 'active', v_payment.amount,
    v_owner_id, 'Contratação confirmada pelo provedor de pagamento',
    v_payment.plan_key, null, null
  );

  insert into public.school_billing_contacts(school_id, full_name, email, phone, updated_by)
  values(v_school_id, v_application.responsible_name, v_application.email, v_application.phone, v_owner_id);

  insert into public.school_invitations(school_id, email, role, invited_by)
  values(v_school_id, v_application.email, 'school_admin', v_owner_id)
  returning id, token into v_invitation_id, v_invitation_token;

  update public.platform_payment_subscriptions
  set school_id = v_school_id, updated_at = now() where id = v_payment.id;
  update public.platform_school_applications
  set status = 'approved', school_id = v_school_id, decided_by = v_owner_id,
      decided_at = now(), updated_at = now() where id = v_application.id;

  perform public.record_platform_audit('school_provisioned', v_school_id, null, '{}'::jsonb,
    jsonb_build_object('school_name',v_application.school_name,'plan',v_payment.plan_key,
      'price',v_payment.amount,'admin_state','invited','source',v_payment.provider));

  return jsonb_build_object('school_id',v_school_id,'admin_state','invited',
    'admin_email',v_application.email,'invitation_id',v_invitation_id,
    'invitation_token',v_invitation_token,'already_activated',false);
end;
$function$;

revoke all on function public.platform_activate_paid_subscription(uuid) from public, anon, authenticated;
grant execute on function public.platform_activate_paid_subscription(uuid) to service_role;

commit;
