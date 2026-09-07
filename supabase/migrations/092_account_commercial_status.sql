begin;

alter table public.siap_assistant_payment_subscriptions
  drop constraint if exists siap_assistant_payment_subscriptions_status_check;
alter table public.siap_assistant_payment_subscriptions
  add constraint siap_assistant_payment_subscriptions_status_check
  check (status in ('creating', 'pending', 'authorized', 'paused', 'cancelled', 'expired', 'failed'));

create or replace function public.admin_list_accounts_v3()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  access_status text,
  email_confirmed boolean,
  active_memberships bigint,
  pending_invitations bigint,
  assistant_payment_status text,
  assistant_payment_created_at timestamptz,
  assistant_paid_active boolean,
  assistant_free_uses bigint
)
language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  -- Uma tentativa sem confirmação da Hotmart por 24 horas deixa de ocupar o
  -- fluxo aberto. A conta e os usos gratuitos são preservados.
  update public.siap_assistant_payment_subscriptions
  set status = 'expired', provider_status = 'CHECKOUT_ABANDONED', updated_at = now()
  where status in ('creating', 'pending')
    and last_webhook_at is null
    and created_at < now() - interval '24 hours';

  return query
  select
    u.id::uuid,
    u.email::text,
    p.full_name::text,
    case when exists (
      select 1 from public.platform_admins pa
      where pa.user_id = u.id and pa.role = 'owner' and pa.status = 'active'
    ) then 'platform_owner' else up.role::text end,
    paa.status::text,
    (u.email_confirmed_at is not null)::boolean,
    (select count(*) from public.school_members sm where sm.user_id = u.id and sm.status = 'active')::bigint,
    (select count(*) from public.school_invitations si
      where si.email = lower(pg_catalog.btrim(u.email)) and si.status = 'pending' and si.expires_at > now())::bigint,
    payment.status::text,
    payment.created_at,
    exists (
      select 1 from public.siap_assistant_licenses l
      where l.user_id = u.id and l.suspended_at is null and l.paid_until > now()
    )::boolean,
    (select coalesce(sum(f.used_count), 0) from public.siap_assistant_free_usage f where f.user_id = u.id)::bigint
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_permissions up on up.user_id = u.id
  left join public.platform_account_access paa on paa.user_id = u.id
  left join lateral (
    select s.status, s.created_at
    from public.siap_assistant_payment_subscriptions s
    where s.user_id = u.id
    order by s.created_at desc
    limit 1
  ) payment on true
  order by u.created_at;
end;
$function$;

revoke all on function public.admin_list_accounts_v3() from public, anon;
grant execute on function public.admin_list_accounts_v3() to authenticated;

commit;
