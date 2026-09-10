begin;

create or replace function public.platform_list_siap_assistant_customers()
returns table(user_id uuid,email text,full_name text,customer_since timestamptz,owner_granted boolean,
  entitlement_type text,plan_key text,plan_name text,payment_status text,trial_started_at timestamptz,
  access_ends_at timestamptz,days_remaining integer,access_status text,is_new_customer boolean)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  return query
  with customers as (
    select
      u.id,
      u.email,
      p.full_name,
      g.granted_at,
      g.expires_at as grant_expires_at,
      (g.user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())) as active_grant,
      l.entitlement_type,
      l.trial_started_at,
      l.trial_ends_at,
      l.paid_until,
      l.suspended_at,
      pay.plan_key as latest_plan_key,
      pay.status as latest_payment_status,
      pay.created_at as latest_payment_created_at,
      sp.display_name as latest_plan_name,
      (l.user_id is not null and l.suspended_at is null and l.paid_until > now()) as active_subscription,
      (l.user_id is not null and l.suspended_at is null and l.trial_ends_at > now()) as active_trial
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.siap_assistant_access_grants g on g.user_id=u.id
    left join public.siap_assistant_licenses l on l.user_id=u.id
    left join lateral (
      select x.plan_key,x.status,x.created_at
      from public.siap_assistant_payment_subscriptions x
      where x.user_id=u.id
      order by x.created_at desc
      limit 1
    ) pay on true
    left join public.siap_assistant_plans sp on sp.plan_key=pay.plan_key
    where g.user_id is not null or l.user_id is not null or pay.plan_key is not null
  ), effective as (
    select
      c.*,
      case
        when c.active_grant then c.granted_at
        when c.active_subscription then c.latest_payment_created_at
        when c.active_trial then c.trial_started_at
        else least(coalesce(c.granted_at,'infinity'::timestamptz),coalesce(c.trial_started_at,'infinity'::timestamptz),coalesce(c.latest_payment_created_at,'infinity'::timestamptz))
      end as effective_start,
      case
        when c.active_grant then c.grant_expires_at
        when c.active_subscription then c.paid_until
        when c.active_trial then c.trial_ends_at
        else coalesce(c.grant_expires_at,c.paid_until,c.trial_ends_at)
      end as effective_end
    from customers c
  )
  select
    e.id,
    e.email::text,
    e.full_name::text,
    e.effective_start,
    e.active_grant,
    case
      when e.active_subscription then 'subscription'
      when e.active_trial then 'trial'
      else e.entitlement_type
    end::text,
    case when e.active_subscription then e.latest_plan_key else null end::text,
    case when e.active_subscription then e.latest_plan_name else null end::text,
    e.latest_payment_status::text,
    e.trial_started_at,
    e.effective_end,
    case
      when e.active_grant and e.grant_expires_at is null then null
      when e.effective_end is not null then greatest(0,ceil(extract(epoch from(e.effective_end-now()))/86400.0)::integer)
      else null
    end,
    case
      when e.active_grant and e.grant_expires_at is null then 'active'
      when e.active_grant then case when e.grant_expires_at <= now()+interval '3 days' then 'expiring' else 'active' end
      when e.active_subscription then case when e.paid_until <= now()+interval '5 days' then 'expiring' else 'active' end
      when e.active_trial then case when e.trial_ends_at <= now()+interval '3 days' then 'expiring' else 'trial' end
      when e.latest_payment_status in('creating','pending') then 'pending_payment'
      else 'expired'
    end::text,
    (e.effective_start >= now()-interval '30 days')
  from effective e
  order by 13,12 nulls last,4 desc;
end;
$function$;

revoke all on function public.platform_list_siap_assistant_customers() from public,anon;
grant execute on function public.platform_list_siap_assistant_customers() to authenticated;

commit;
