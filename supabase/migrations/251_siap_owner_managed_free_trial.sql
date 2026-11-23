begin;

create table if not exists public.siap_assistant_manual_trials (
  email text primary key,
  user_id uuid not null unique,
  granted_by uuid not null,
  granted_at timestamptz not null default now()
);
alter table public.siap_assistant_manual_trials enable row level security;
revoke all on public.siap_assistant_manual_trials from public, anon, authenticated;
grant select, insert, update, delete on public.siap_assistant_manual_trials to service_role;

create or replace function public.platform_grant_siap_assistant_free_trial(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_now timestamptz := now();
  v_previous jsonb;
begin
  if v_actor is null or not public.is_platform_owner() then
    raise exception 'Somente o proprietário da plataforma pode liberar o teste grátis.' using errcode='42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=p_user_id;
  if p_user_id is null or v_email is null or v_email = '' then
    raise exception 'Usuário inválido.';
  end if;
  if exists(select 1 from public.siap_assistant_manual_trials t where t.email=v_email or t.user_id=p_user_id) then
    raise exception 'manual_trial_already_granted';
  end if;
  if exists(select 1 from public.siap_assistant_access_grants g where g.user_id=p_user_id and g.revoked_at is null and (g.expires_at is null or g.expires_at>v_now))
    or exists(select 1 from public.siap_assistant_licenses l where l.user_id=p_user_id and l.suspended_at is null and l.paid_until>v_now) then
    raise exception 'active_access_exists';
  end if;

  select coalesce(jsonb_object_agg(f.feature_key,f.used_count),'{}'::jsonb) into v_previous
    from public.siap_assistant_free_usage f where f.user_id=p_user_id;
  insert into public.siap_assistant_manual_trials(email,user_id,granted_by,granted_at)
    values(v_email,p_user_id,v_actor,v_now);
  insert into public.siap_assistant_free_usage(user_id,feature_key,used_count,updated_at)
    values (p_user_id,'planning',0,v_now),(p_user_id,'content',0,v_now),(p_user_id,'attendance',0,v_now),(p_user_id,'pei',0,v_now)
  on conflict(user_id,feature_key) do update set used_count=0,updated_at=v_now;
  insert into public.platform_audit_log(actor_user_id,event_type,target_user_id,previous_state,new_state)
    values(v_actor,'siap_assistant_free_trial_granted',p_user_id,v_previous,
      jsonb_build_object('email',v_email,'uses_per_feature',2,'features',jsonb_build_array('planning','content','attendance','pei'),'granted_at',v_now));
  return jsonb_build_object('granted',true,'email',v_email,'usesPerFeature',2,'grantedAt',v_now);
end;
$function$;
revoke all on function public.platform_grant_siap_assistant_free_trial(uuid) from public,anon;
grant execute on function public.platform_grant_siap_assistant_free_trial(uuid) to authenticated;

create or replace function public.siap_access_before_exam_commerce()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_had_grant boolean := false;
  v_license public.siap_assistant_licenses%rowtype;
  v_now timestamptz := now();
  v_end timestamptz;
  v_planning integer := 0;
  v_content integer := 0;
  v_attendance integer := 0;
  v_pei integer := 0;
  v_email text;
  v_history public.siap_assistant_email_eligibility%rowtype;
  v_manual_trial boolean := false;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  select * into v_grant from public.siap_assistant_access_grants where user_id=v_user_id;
  v_had_grant := found;
  if v_had_grant and v_grant.revoked_at is null and (v_grant.expires_at is null or v_grant.expires_at>v_now) then
    return public.activate_siap_assistant_trial() || jsonb_build_object('mode','carometro','freeUses',null,'permanent',v_grant.expires_at is null,
      'accessEndsAt',v_grant.expires_at,'daysRemaining',case when v_grant.expires_at is null then null else greatest(0,ceil(extract(epoch from(v_grant.expires_at-v_now))/86400.0)::integer) end);
  end if;
  select lower(btrim(email)) into v_email from auth.users where id=v_user_id;
  select exists(select 1 from public.siap_assistant_manual_trials t where t.user_id=v_user_id or t.email=v_email) into v_manual_trial;
  select * into v_license from public.siap_assistant_licenses where user_id=v_user_id;
  if found then
    v_end := greatest(v_license.trial_ends_at,coalesce(v_license.paid_until,'-infinity'::timestamptz));
    if v_license.suspended_at is null and v_license.paid_until is not null and v_end>v_now then
      return jsonb_build_object('active',true,'status','subscribed','mode','subscription','accessEndsAt',v_end,
        'daysRemaining',greatest(0,ceil(extract(epoch from(v_end-v_now))/86400.0)::integer),'freeUses',null);
    end if;
    if not v_manual_trial and v_license.paid_until is not null and v_end<=v_now then
      return jsonb_build_object('active',false,'status','expired','mode','subscription','accessEndsAt',v_end,'daysRemaining',0,'freeUses',null);
    end if;
  end if;
  if v_had_grant and not v_manual_trial then
    return jsonb_build_object('active',false,'status','grant_ended','mode','external','accessEndsAt',v_grant.expires_at,
      'daysRemaining',0,'freeUses',jsonb_build_object('planning',0,'content',0,'attendance',0,'pei',0));
  end if;
  select * into v_history from public.siap_assistant_email_eligibility where email=v_email;
  if not v_manual_trial and found and (v_history.had_grant or v_history.had_paid or (v_history.trial_user_id is not null and v_history.trial_user_id<>v_user_id)) then
    return jsonb_build_object('active',false,'status','trial_ineligible','mode','external','daysRemaining',0,
      'freeUses',jsonb_build_object('planning',0,'content',0,'attendance',0,'pei',0));
  end if;
  select coalesce(max(used_count) filter(where feature_key='planning'),0),coalesce(max(used_count) filter(where feature_key='content'),0),
    coalesce(max(used_count) filter(where feature_key='attendance'),0),coalesce(max(used_count) filter(where feature_key='pei'),0)
  into v_planning,v_content,v_attendance,v_pei from public.siap_assistant_free_usage where user_id=v_user_id;
  return jsonb_build_object('active',least(v_planning,v_content,v_attendance,v_pei)<2,'status','free','mode','external','daysRemaining',null,
    'freeUses',jsonb_build_object('planning',2-v_planning,'content',2-v_content,'attendance',2-v_attendance,'pei',2-v_pei));
end;
$function$;
revoke all on function public.siap_access_before_exam_commerce() from public,anon,authenticated;
grant execute on function public.siap_access_before_exam_commerce() to authenticated;

create or replace function public.platform_list_siap_assistant_customers()
returns table(user_id uuid,email text,full_name text,customer_since timestamptz,owner_granted boolean,
  entitlement_type text,plan_key text,plan_name text,payment_status text,trial_started_at timestamptz,
  access_ends_at timestamptz,days_remaining integer,access_status text,is_new_customer boolean)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query
  with customers as (
    select u.id,u.email,p.full_name,g.granted_at,g.expires_at as grant_expires_at,
      (g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) as active_grant,
      l.entitlement_type,l.trial_started_at,l.trial_ends_at,l.paid_until,l.suspended_at,
      pay.plan_key as latest_plan_key,pay.status as latest_payment_status,pay.created_at as latest_payment_created_at,
      sp.display_name as latest_plan_name,
      (l.user_id is not null and l.suspended_at is null and l.paid_until>now()) as active_subscription,
      (l.user_id is not null and l.suspended_at is null and l.trial_ends_at>now()) as active_trial,
      mt.granted_at as manual_trial_started,
      coalesce(fu.remaining_features,0)>0 as manual_trial_remaining
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.siap_assistant_access_grants g on g.user_id=u.id
    left join public.siap_assistant_licenses l on l.user_id=u.id
    left join public.siap_assistant_manual_trials mt on mt.user_id=u.id
    left join lateral (select count(*) filter(where x.used_count<2)::integer as remaining_features from public.siap_assistant_free_usage x where x.user_id=u.id) fu on true
    left join lateral (select x.plan_key,x.status,x.created_at from public.siap_assistant_payment_subscriptions x where x.user_id=u.id order by x.created_at desc limit 1) pay on true
    left join public.siap_assistant_plans sp on sp.plan_key=pay.plan_key
    where g.user_id is not null or l.user_id is not null or pay.plan_key is not null or mt.user_id is not null
  ), effective as (
    select c.*,
      case when c.active_grant then c.granted_at when c.active_subscription then c.latest_payment_created_at when c.active_trial then c.trial_started_at
        when c.manual_trial_started is not null then c.manual_trial_started
        else least(coalesce(c.granted_at,'infinity'::timestamptz),coalesce(c.trial_started_at,'infinity'::timestamptz),coalesce(c.latest_payment_created_at,'infinity'::timestamptz)) end as effective_start,
      case when c.active_grant then c.grant_expires_at when c.active_subscription then c.paid_until when c.active_trial then c.trial_ends_at
        else coalesce(c.grant_expires_at,c.paid_until,c.trial_ends_at) end as effective_end
    from customers c
  )
  select e.id,e.email::text,e.full_name::text,e.effective_start,e.active_grant,
    case when e.active_subscription then 'subscription' when e.active_trial then 'trial' when e.manual_trial_started is not null then 'trial' else e.entitlement_type end::text,
    case when e.active_subscription then e.latest_plan_key else null end::text,
    case when e.manual_trial_started is not null then 'Teste grátis manual' when e.active_subscription then e.latest_plan_name else null end::text,
    e.latest_payment_status::text,e.trial_started_at,
    case when e.manual_trial_started is not null then null else e.effective_end end,
    case when e.manual_trial_started is not null then null when e.active_grant and e.grant_expires_at is null then null
      when e.effective_end is not null then greatest(0,ceil(extract(epoch from(e.effective_end-now()))/86400.0)::integer) else null end,
    case when e.active_grant and e.grant_expires_at is null then 'active' when e.active_grant then case when e.grant_expires_at<=now()+interval '3 days' then 'expiring' else 'active' end
      when e.active_subscription then case when e.paid_until<=now()+interval '5 days' then 'expiring' else 'active' end
      when e.active_trial then case when e.trial_ends_at<=now()+interval '3 days' then 'expiring' else 'trial' end
      when e.manual_trial_started is not null then case when e.manual_trial_remaining then 'trial' else 'expired' end
      when e.latest_payment_status in('creating','pending') then 'pending_payment' else 'expired' end::text,
    (e.effective_start>=now()-interval '3 days')
  from effective e order by 13,12 nulls last,4 desc;
end;
$function$;
revoke all on function public.platform_list_siap_assistant_customers() from public,anon;
grant execute on function public.platform_list_siap_assistant_customers() to authenticated;

commit;
