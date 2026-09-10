-- CARÔMETRO COMERCIAL
-- Autorização individual do Assistente SIAP, concedida exclusivamente pelo
-- proprietário da plataforma. Nenhuma permissão escolar concede este acesso.

begin;

create table if not exists public.siap_assistant_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.siap_assistant_access_grants enable row level security;
revoke all on table public.siap_assistant_access_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.siap_assistant_access_grants to service_role;

create or replace function public.get_siap_assistant_button_visibility()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_owner_grant boolean := false;
  v_paid boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.siap_assistant_access_grants sag
    where sag.user_id = v_user_id and sag.revoked_at is null
  ) into v_owner_grant;

  select exists (
    select 1 from public.siap_assistant_licenses sal
    where sal.user_id = v_user_id
      and sal.suspended_at is null
      and sal.paid_until > now()
  ) into v_paid;

  return jsonb_build_object(
    'visible', v_owner_grant or v_paid,
    'ownerGranted', v_owner_grant,
    'paid', v_paid
  );
end;
$function$;
revoke all on function public.get_siap_assistant_button_visibility() from public, anon;
grant execute on function public.get_siap_assistant_button_visibility() to authenticated;

create or replace function public.platform_set_siap_assistant_access(
  p_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_previous boolean := false;
  v_now timestamptz := now();
  v_paid_active boolean := false;
begin
  if v_actor is null or not public.is_platform_owner() then
    raise exception 'Somente o proprietário da plataforma pode autorizar o Assistente SIAP.' using errcode = '42501';
  end if;
  if p_user_id is null or p_enabled is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário inválido.';
  end if;

  select exists (
    select 1 from public.siap_assistant_access_grants
    where user_id = p_user_id and revoked_at is null
  ) into v_previous;

  insert into public.siap_assistant_access_grants(user_id, granted_by, granted_at, revoked_at, updated_at)
  values(p_user_id, v_actor, v_now, case when p_enabled then null else v_now end, v_now)
  on conflict(user_id) do update set
    granted_by = v_actor,
    granted_at = case when p_enabled and public.siap_assistant_access_grants.revoked_at is not null then v_now else public.siap_assistant_access_grants.granted_at end,
    revoked_at = case when p_enabled then null else v_now end,
    updated_at = v_now;

  select exists (
    select 1 from public.siap_assistant_licenses
    where user_id = p_user_id and paid_until > v_now and suspended_at is null
  ) into v_paid_active;

  if not v_paid_active then
    update public.siap_assistant_licenses
    set suspended_at = case when p_enabled then null else v_now end,
        updated_at = v_now
    where user_id = p_user_id;
  end if;

  insert into public.platform_audit_log(
    actor_user_id, event_type, target_user_id, previous_state, new_state
  ) values (
    v_actor,
    case when p_enabled then 'siap_assistant_access_granted' else 'siap_assistant_access_revoked' end,
    p_user_id,
    jsonb_build_object('owner_granted', v_previous),
    jsonb_build_object('owner_granted', p_enabled, 'paid_access_preserved', v_paid_active)
  );

  return jsonb_build_object('ownerGranted', p_enabled, 'paidAccessPreserved', v_paid_active);
end;
$function$;
revoke all on function public.platform_set_siap_assistant_access(uuid, boolean) from public, anon;
grant execute on function public.platform_set_siap_assistant_access(uuid, boolean) to authenticated;

create or replace function public.platform_list_siap_assistant_customers()
returns table (
  user_id uuid,
  email text,
  full_name text,
  customer_since timestamptz,
  owner_granted boolean,
  entitlement_type text,
  plan_key text,
  plan_name text,
  payment_status text,
  trial_started_at timestamptz,
  access_ends_at timestamptz,
  days_remaining integer,
  access_status text,
  is_new_customer boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name::text,
    least(
      coalesce(g.granted_at, 'infinity'::timestamptz),
      coalesce(l.trial_started_at, 'infinity'::timestamptz),
      coalesce(pay.created_at, 'infinity'::timestamptz)
    ) as customer_since,
    (g.user_id is not null and g.revoked_at is null) as owner_granted,
    l.entitlement_type,
    pay.plan_key,
    sp.display_name::text,
    pay.status::text,
    l.trial_started_at,
    case when l.user_id is null then null else greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) end as access_ends_at,
    case when l.user_id is null then null else greatest(0, ceil(extract(epoch from (
      greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) - now()
    )) / 86400.0)::integer) end as days_remaining,
    case
      when l.suspended_at is not null then 'suspended'
      when l.paid_until > now() then case when l.paid_until <= now() + interval '30 days' then 'expiring' else 'active' end
      when g.user_id is not null and g.revoked_at is null and l.user_id is null then 'authorized'
      when l.trial_ends_at > now() then case when l.trial_ends_at <= now() + interval '7 days' then 'expiring' else 'trial' end
      when pay.status in ('creating', 'pending') then 'pending_payment'
      else 'expired'
    end::text as access_status,
    (least(
      coalesce(g.granted_at, 'infinity'::timestamptz),
      coalesce(l.trial_started_at, 'infinity'::timestamptz),
      coalesce(pay.created_at, 'infinity'::timestamptz)
    ) >= now() - interval '30 days') as is_new_customer
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.siap_assistant_access_grants g on g.user_id = u.id
  left join public.siap_assistant_licenses l on l.user_id = u.id
  left join lateral (
    select s.plan_key, s.status, s.created_at
    from public.siap_assistant_payment_subscriptions s
    where s.user_id = u.id
    order by s.created_at desc
    limit 1
  ) pay on true
  left join public.siap_assistant_plans sp on sp.plan_key = pay.plan_key
  where g.user_id is not null or l.user_id is not null or pay.plan_key is not null
  order by
    case
      when l.suspended_at is null and greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) > now() then 0
      when g.user_id is not null and g.revoked_at is null then 1
      else 2
    end,
    case when l.user_id is null then null else greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) end nulls last,
    least(
      coalesce(g.granted_at, 'infinity'::timestamptz),
      coalesce(l.trial_started_at, 'infinity'::timestamptz),
      coalesce(pay.created_at, 'infinity'::timestamptz)
    ) desc;
end;
$function$;
revoke all on function public.platform_list_siap_assistant_customers() from public, anon;
grant execute on function public.platform_list_siap_assistant_customers() to authenticated;

create or replace function public.activate_siap_assistant_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_license public.siap_assistant_licenses%rowtype;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_effective_end timestamptz;
  v_active boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.siap_assistant_access_grants sag
    where sag.user_id = v_user_id and sag.revoked_at is null
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Assistente SIAP não autorizado pelo proprietário da plataforma.' using errcode = '42501';
  end if;

  insert into public.siap_assistant_licenses (
    user_id, entitlement_type, trial_started_at, trial_ends_at
  ) values (
    v_user_id, 'trial', v_now, v_now + interval '30 days'
  )
  on conflict (user_id) do update
    set suspended_at = null,
        updated_at = v_now;

  select * into v_license
  from public.siap_assistant_licenses
  where user_id = v_user_id;

  v_effective_end := greatest(v_license.trial_ends_at, coalesce(v_license.paid_until, '-infinity'::timestamptz));
  v_active := v_license.suspended_at is null and v_effective_end > v_now;

  return jsonb_build_object(
    'active', v_active,
    'status', case
      when v_license.suspended_at is not null then 'suspended'
      when v_active and v_license.paid_until is not null and v_license.paid_until >= v_license.trial_ends_at then 'subscribed'
      when v_active then 'trial'
      else 'expired'
    end,
    'trialStartedAt', v_license.trial_started_at,
    'trialEndsAt', v_license.trial_ends_at,
    'accessEndsAt', v_effective_end,
    'daysRemaining', greatest(0, ceil(extract(epoch from (v_effective_end - v_now)) / 86400.0)::integer)
  );
end;
$function$;

create or replace function public.get_siap_assistant_access_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_owner_grant boolean := false;
  v_license public.siap_assistant_licenses%rowtype;
  v_status jsonb;
  v_now timestamptz := now();
  v_end timestamptz;
  v_planning integer := 0;
  v_content integer := 0;
  v_attendance integer := 0;
  v_pei integer := 0;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;

  select exists (
    select 1 from public.siap_assistant_access_grants sag
    where sag.user_id = v_user_id and sag.revoked_at is null
  ) into v_owner_grant;

  if v_owner_grant then
    v_status := public.activate_siap_assistant_trial();
    return v_status || jsonb_build_object('mode', 'carometro', 'freeUses', null);
  end if;

  select * into v_license from public.siap_assistant_licenses where user_id = v_user_id;
  if found then
    v_end := greatest(v_license.trial_ends_at, coalesce(v_license.paid_until, '-infinity'::timestamptz));
    if v_license.suspended_at is null and v_license.paid_until is not null and v_end > v_now then
      return jsonb_build_object('active', true, 'status', 'subscribed', 'mode', 'subscription',
        'accessEndsAt', v_end, 'daysRemaining', greatest(0, ceil(extract(epoch from (v_end-v_now))/86400.0)::integer), 'freeUses', null);
    end if;
  end if;

  select
    coalesce(max(used_count) filter (where feature_key='planning'),0),
    coalesce(max(used_count) filter (where feature_key='content'),0),
    coalesce(max(used_count) filter (where feature_key='attendance'),0),
    coalesce(max(used_count) filter (where feature_key='pei'),0)
  into v_planning, v_content, v_attendance, v_pei
  from public.siap_assistant_free_usage where user_id = v_user_id;
  return jsonb_build_object('active', least(v_planning,v_content,v_attendance,v_pei) < 2,
    'status', 'free', 'mode', 'external', 'daysRemaining', null,
    'freeUses', jsonb_build_object('planning',2-v_planning,'content',2-v_content,'attendance',2-v_attendance,'pei',2-v_pei));
end;
$function$;

-- A antiga RPC escolar deixa de conceder qualquer permissão do Assistente.
-- Mantém a assinatura para instalações antigas falharem de forma explícita.
create or replace function public.set_school_member_siap_permission(
  target_member_id uuid,
  permission_name text,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Somente o proprietário da plataforma pode autorizar o Assistente SIAP.' using errcode = '42501';
end;
$function$;

comment on table public.siap_assistant_access_grants is
  'Concessões individuais do Assistente SIAP feitas exclusivamente pelo proprietário da plataforma.';
comment on function public.get_siap_assistant_button_visibility() is
  'Informa se o botão do Assistente SIAP deve aparecer para o usuário autenticado, sem iniciar o teste gratuito.';

commit;
