-- CARÔMETRO COMERCIAL
-- Integração segura de assinaturas recorrentes do Mercado Pago.
-- Nenhuma credencial é armazenada no banco. Edge Functions usam secrets.

begin;

alter table public.platform_plans
  add column publicly_available boolean not null default true;

-- O plano continua cadastrado e pode continuar sendo usado internamente,
-- mas fica fora da oferta pública até nova decisão do proprietário.
update public.platform_plans set publicly_available = false where plan_key = 'enterprise';

create or replace function public.enforce_public_application_plan()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.platform_plans p
    where p.plan_key = new.plan_key and p.publicly_available
  ) then
    raise exception 'Este plano não está disponível na oferta pública.';
  end if;
  return new;
end;
$function$;

create trigger enforce_public_application_plan_trigger
before insert or update of plan_key on public.platform_school_applications
for each row execute function public.enforce_public_application_plan();

revoke all on function public.enforce_public_application_plan() from public, anon, authenticated;

create table public.platform_payment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.platform_school_applications(id) on delete restrict,
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_subscription_id text unique,
  external_reference uuid not null unique default gen_random_uuid(),
  plan_key text not null references public.platform_plans(plan_key),
  amount numeric not null check (amount > 0 and amount <= 99999999.99),
  currency text not null default 'BRL' check (currency = 'BRL'),
  payer_email text not null,
  status text not null default 'creating' check (status in ('creating','pending','authorized','paused','cancelled','failed')),
  provider_status text,
  checkout_url text,
  school_id uuid unique references public.schools(id) on delete set null,
  last_invoice_id text,
  last_payment_id text,
  last_payment_status text,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_event_id text not null,
  event_type text not null,
  action text,
  resource_id text not null,
  signature_valid boolean not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, provider_event_id, event_type, resource_id)
);

create index platform_payment_subscriptions_status_idx on public.platform_payment_subscriptions(status, updated_at desc);
create index platform_payment_events_created_idx on public.platform_payment_events(created_at desc);

alter table public.platform_payment_subscriptions enable row level security;
alter table public.platform_payment_events enable row level security;
revoke all on table public.platform_payment_subscriptions from public, anon, authenticated;
revoke all on table public.platform_payment_events from public, anon, authenticated;

create or replace function public.platform_list_payment_subscriptions()
returns setof public.platform_payment_subscriptions
language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  return query select * from public.platform_payment_subscriptions order by created_at desc;
end;
$function$;

revoke all on function public.platform_list_payment_subscriptions() from public, anon;
grant execute on function public.platform_list_payment_subscriptions() to authenticated;

-- Chamado exclusivamente pela Edge Function autenticada com service_role.
-- Cria a escola paga na mesma estrutura multi-escola do fluxo manual, mas
-- registra contracted_plan (e nunca override_plan), pois aqui há prova de
-- pagamento aprovada pelo provedor.
create or replace function public.platform_activate_paid_subscription(p_payment_subscription_id uuid)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_payment public.platform_payment_subscriptions%rowtype;
  v_application public.platform_school_applications%rowtype;
  v_owner_id uuid;
  v_user_id uuid;
  v_school_id uuid;
  v_member_id uuid;
  v_invitation_id uuid;
  v_invitation_token uuid;
  v_slug_base text;
  v_slug text;
  v_admin_state text;
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

  select u.id into v_user_id from auth.users u
  where lower(btrim(u.email)) = v_application.email
    and u.email_confirmed_at is not null and u.deleted_at is null;

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
    v_owner_id, 'Contratação confirmada pelo Mercado Pago',
    v_payment.plan_key, null, null
  );

  insert into public.school_billing_contacts(school_id, full_name, email, phone, user_id, updated_by)
  values(v_school_id, v_application.responsible_name, v_application.email, v_application.phone, v_user_id, v_owner_id);

  if v_user_id is not null then
    insert into public.school_members(school_id, user_id, role, status)
    values(v_school_id, v_user_id, 'school_admin', 'active') returning id into v_member_id;
    insert into public.school_member_permissions(member_id) values(v_member_id) on conflict(member_id) do nothing;
    v_admin_state := 'linked';
  else
    insert into public.school_invitations(school_id, email, role, invited_by)
    values(v_school_id, v_application.email, 'school_admin', v_owner_id)
    returning id, token into v_invitation_id, v_invitation_token;
    v_admin_state := 'invited';
  end if;

  update public.platform_payment_subscriptions
  set school_id = v_school_id, updated_at = now() where id = v_payment.id;
  update public.platform_school_applications
  set status = 'approved', school_id = v_school_id, decided_by = v_owner_id,
      decided_at = now(), updated_at = now() where id = v_application.id;

  perform public.record_platform_audit('school_provisioned', v_school_id, v_user_id, '{}'::jsonb,
    jsonb_build_object('school_name',v_application.school_name,'plan',v_payment.plan_key,
      'price',v_payment.amount,'admin_state',v_admin_state,'source','mercado_pago'));

  return jsonb_build_object('school_id',v_school_id,'admin_state',v_admin_state,
    'admin_email',v_application.email,'invitation_id',v_invitation_id,
    'invitation_token',v_invitation_token,'already_activated',false);
end;
$function$;

revoke all on function public.platform_activate_paid_subscription(uuid) from public, anon, authenticated;
grant execute on function public.platform_activate_paid_subscription(uuid) to service_role;

-- Pausa ou reativa somente a assinatura/acesso da escola. Nunca apaga dados.
create or replace function public.platform_sync_paid_subscription_access(
  p_payment_subscription_id uuid,
  p_access_active boolean
)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare v_school_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Acesso negado.'; end if;
  select school_id into v_school_id from public.platform_payment_subscriptions where id = p_payment_subscription_id;
  if v_school_id is null then return; end if;
  update public.school_subscriptions set status = case when p_access_active then 'active' else 'suspended' end,
    updated_at = now() where school_id = v_school_id;
end;
$function$;

revoke all on function public.platform_sync_paid_subscription_access(uuid,boolean) from public, anon, authenticated;
grant execute on function public.platform_sync_paid_subscription_access(uuid,boolean) to service_role;

commit;
