begin;

create table if not exists public.siap_assistant_install_email_deliveries (
  payment_subscription_id uuid primary key references public.siap_assistant_payment_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  processing_error text
);

alter table public.siap_assistant_install_email_deliveries enable row level security;
revoke all on public.siap_assistant_install_email_deliveries from public, anon, authenticated;
grant select, insert, update on public.siap_assistant_install_email_deliveries to service_role;

create or replace function public.siap_claim_install_email(p_payment_subscription_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_claimed uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  insert into public.siap_assistant_install_email_deliveries(payment_subscription_id)
  values (p_payment_subscription_id)
  on conflict (payment_subscription_id) do update
    set status = 'sending', claimed_at = now(), processing_error = null
    where public.siap_assistant_install_email_deliveries.status = 'failed'
      or (public.siap_assistant_install_email_deliveries.status = 'sending'
        and public.siap_assistant_install_email_deliveries.claimed_at < now() - interval '10 minutes')
  returning payment_subscription_id into v_claimed;
  return v_claimed is not null;
end;
$function$;

revoke all on function public.siap_claim_install_email(uuid) from public, anon, authenticated;
grant execute on function public.siap_claim_install_email(uuid) to service_role;

commit;
