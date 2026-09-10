-- Concessões gratuitas do Assistente SIAP por prazo ou permanentes.
-- Somente o proprietário da plataforma pode criar, alterar ou cancelar.

begin;

alter table public.siap_assistant_access_grants
  add column if not exists expires_at timestamptz;

create or replace function public.platform_set_siap_assistant_access(
  p_user_id uuid,
  p_enabled boolean,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_previous public.siap_assistant_access_grants%rowtype;
  v_now timestamptz := now();
  v_paid_active boolean := false;
begin
  if v_actor is null or not public.is_platform_owner() then
    raise exception 'Somente o proprietário da plataforma pode autorizar o Assistente SIAP.' using errcode = '42501';
  end if;
  if p_user_id is null or p_enabled is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário inválido.';
  end if;
  if p_enabled and p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'A data final deve estar no futuro.';
  end if;

  select * into v_previous from public.siap_assistant_access_grants where user_id = p_user_id;

  insert into public.siap_assistant_access_grants(user_id, granted_by, granted_at, expires_at, revoked_at, updated_at)
  values(p_user_id, v_actor, v_now, case when p_enabled then p_expires_at else null end, case when p_enabled then null else v_now end, v_now)
  on conflict(user_id) do update set
    granted_by = v_actor,
    granted_at = case when p_enabled then v_now else public.siap_assistant_access_grants.granted_at end,
    expires_at = case when p_enabled then p_expires_at else public.siap_assistant_access_grants.expires_at end,
    revoked_at = case when p_enabled then null else v_now end,
    updated_at = v_now;

  select exists (
    select 1 from public.siap_assistant_licenses
    where user_id = p_user_id and paid_until > v_now and suspended_at is null
  ) into v_paid_active;

  insert into public.platform_audit_log(actor_user_id,event_type,target_user_id,previous_state,new_state)
  values(
    v_actor,
    case when p_enabled then 'siap_assistant_access_granted' else 'siap_assistant_access_revoked' end,
    p_user_id,
    jsonb_build_object('owner_granted', v_previous.user_id is not null and v_previous.revoked_at is null,
      'expires_at', v_previous.expires_at),
    jsonb_build_object('owner_granted', p_enabled, 'expires_at', case when p_enabled then p_expires_at else null end,
      'permanent', p_enabled and p_expires_at is null, 'paid_access_preserved', v_paid_active)
  );

  return jsonb_build_object('ownerGranted',p_enabled,'expiresAt',case when p_enabled then p_expires_at else null end,
    'permanent',p_enabled and p_expires_at is null,'paidAccessPreserved',v_paid_active);
end;
$function$;

revoke all on function public.platform_set_siap_assistant_access(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.platform_set_siap_assistant_access(uuid, boolean, timestamptz) to authenticated;

create or replace function public.get_siap_assistant_button_visibility()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_paid boolean := false;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  select * into v_grant from public.siap_assistant_access_grants
  where user_id=v_user_id and revoked_at is null and (expires_at is null or expires_at > now());
  select exists(select 1 from public.siap_assistant_licenses
    where user_id=v_user_id and suspended_at is null and paid_until > now()) into v_paid;
  return jsonb_build_object('visible',v_grant.user_id is not null or v_paid,
    'ownerGranted',v_grant.user_id is not null,'grantExpiresAt',v_grant.expires_at,
    'grantPermanent',v_grant.user_id is not null and v_grant.expires_at is null,'paid',v_paid);
end;
$function$;

create or replace function public.activate_siap_assistant_trial()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_days integer;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  select * into v_grant from public.siap_assistant_access_grants
  where user_id=v_user_id and revoked_at is null and (expires_at is null or expires_at > now());
  if v_grant.user_id is null then
    raise exception 'Assistente SIAP não autorizado pelo proprietário da plataforma.' using errcode = '42501';
  end if;
  v_days := case when v_grant.expires_at is null then null
    else greatest(0,ceil(extract(epoch from (v_grant.expires_at-now()))/86400.0)::integer) end;
  return jsonb_build_object('active',true,'status','manual','trialStartedAt',null,'trialEndsAt',null,
    'accessEndsAt',v_grant.expires_at,'daysRemaining',v_days,'permanent',v_grant.expires_at is null);
end;
$function$;

create or replace function public.get_siap_assistant_access_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_license public.siap_assistant_licenses%rowtype;
  v_now timestamptz := now();
  v_end timestamptz;
  v_planning integer := 0; v_content integer := 0; v_attendance integer := 0; v_pei integer := 0;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  select * into v_grant from public.siap_assistant_access_grants
  where user_id=v_user_id and revoked_at is null and (expires_at is null or expires_at > v_now);
  if v_grant.user_id is not null then
    return public.activate_siap_assistant_trial() || jsonb_build_object('mode','carometro','freeUses',null);
  end if;
  select * into v_license from public.siap_assistant_licenses where user_id=v_user_id;
  if found then
    v_end:=greatest(v_license.trial_ends_at,coalesce(v_license.paid_until,'-infinity'::timestamptz));
    if v_license.suspended_at is null and v_license.paid_until is not null and v_end>v_now then
      return jsonb_build_object('active',true,'status','subscribed','mode','subscription','accessEndsAt',v_end,
        'daysRemaining',greatest(0,ceil(extract(epoch from (v_end-v_now))/86400.0)::integer),'freeUses',null);
    end if;
  end if;
  select coalesce(max(used_count) filter(where feature_key='planning'),0),
    coalesce(max(used_count) filter(where feature_key='content'),0),coalesce(max(used_count) filter(where feature_key='attendance'),0),
    coalesce(max(used_count) filter(where feature_key='pei'),0)
  into v_planning,v_content,v_attendance,v_pei from public.siap_assistant_free_usage where user_id=v_user_id;
  return jsonb_build_object('active',least(v_planning,v_content,v_attendance,v_pei)<2,'status','free','mode','external',
    'daysRemaining',null,'freeUses',jsonb_build_object('planning',2-v_planning,'content',2-v_content,
    'attendance',2-v_attendance,'pei',2-v_pei));
end;
$function$;

create or replace function public.platform_list_siap_assistant_customers()
returns table(user_id uuid,email text,full_name text,customer_since timestamptz,owner_granted boolean,
  entitlement_type text,plan_key text,plan_name text,payment_status text,trial_started_at timestamptz,
  access_ends_at timestamptz,days_remaining integer,access_status text,is_new_customer boolean)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query
  select u.id,u.email::text,p.full_name::text,
    least(coalesce(g.granted_at,'infinity'::timestamptz),coalesce(l.trial_started_at,'infinity'::timestamptz),coalesce(pay.created_at,'infinity'::timestamptz)),
    (g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())),
    l.entitlement_type,pay.plan_key,sp.display_name::text,pay.status::text,l.trial_started_at,
    case when g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()) then g.expires_at
      when l.user_id is not null then greatest(l.trial_ends_at,coalesce(l.paid_until,'-infinity'::timestamptz)) else null end,
    case when g.user_id is not null and g.revoked_at is null and g.expires_at is null then null
      when g.user_id is not null and g.revoked_at is null and g.expires_at>now() then greatest(0,ceil(extract(epoch from(g.expires_at-now()))/86400.0)::integer)
      when l.user_id is not null then greatest(0,ceil(extract(epoch from(greatest(l.trial_ends_at,coalesce(l.paid_until,'-infinity'::timestamptz))-now()))/86400.0)::integer)
      else null end,
    case
      when g.user_id is not null and g.revoked_at is null and g.expires_at is null then 'active'
      when g.user_id is not null and g.revoked_at is null and g.expires_at>now() then case when g.expires_at<=now()+interval '7 days' then 'expiring' else 'active' end
      when l.suspended_at is null and l.paid_until>now() then case when l.paid_until<=now()+interval '30 days' then 'expiring' else 'active' end
      when pay.status in('creating','pending') then 'pending_payment' else 'expired' end::text,
    (least(coalesce(g.granted_at,'infinity'::timestamptz),coalesce(l.trial_started_at,'infinity'::timestamptz),coalesce(pay.created_at,'infinity'::timestamptz))>=now()-interval '30 days')
  from auth.users u left join public.profiles p on p.id=u.id left join public.siap_assistant_access_grants g on g.user_id=u.id
  left join public.siap_assistant_licenses l on l.user_id=u.id
  left join lateral(select x.plan_key,x.status,x.created_at from public.siap_assistant_payment_subscriptions x where x.user_id=u.id order by x.created_at desc limit 1) pay on true
  left join public.siap_assistant_plans sp on sp.plan_key=pay.plan_key
  where g.user_id is not null or l.user_id is not null or pay.plan_key is not null
  order by 13,12 nulls last,4 desc;
end;
$function$;

drop function if exists public.platform_list_siap_school_users();
create function public.platform_list_siap_school_users()
returns table(school_id uuid,school_name text,member_id uuid,user_id uuid,full_name text,email text,
  member_role text,member_status text,owner_granted boolean,paid_active boolean,grant_expires_at timestamptz,
  grant_permanent boolean,access_ends_at timestamptz,days_remaining integer)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query select s.id,s.name::text,sm.id,sm.user_id,p.full_name::text,p.email::text,sm.role::text,sm.status::text,
    (g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())),
    (l.suspended_at is null and l.paid_until>now()),g.expires_at,
    (g.user_id is not null and g.revoked_at is null and g.expires_at is null),
    case when g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()) then g.expires_at
      when l.user_id is not null then greatest(l.trial_ends_at,coalesce(l.paid_until,'-infinity'::timestamptz)) else null end,
    case when g.user_id is not null and g.revoked_at is null and g.expires_at is null then null
      when g.user_id is not null and g.revoked_at is null and g.expires_at>now() then greatest(0,ceil(extract(epoch from(g.expires_at-now()))/86400.0)::integer)
      when l.user_id is not null then greatest(0,ceil(extract(epoch from(greatest(l.trial_ends_at,coalesce(l.paid_until,'-infinity'::timestamptz))-now()))/86400.0)::integer)
      else null end
  from public.schools s join public.school_members sm on sm.school_id=s.id left join public.profiles p on p.id=sm.user_id
  left join public.siap_assistant_access_grants g on g.user_id=sm.user_id left join public.siap_assistant_licenses l on l.user_id=sm.user_id
  order by s.name,coalesce(nullif(pg_catalog.btrim(p.full_name),''),p.email),sm.created_at;
end;
$function$;
revoke all on function public.platform_list_siap_school_users() from public,anon;
grant execute on function public.platform_list_siap_school_users() to authenticated;

commit;
