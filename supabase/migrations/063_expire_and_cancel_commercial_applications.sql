-- CARÔMETRO COMERCIAL
-- Solicitações abandonadas expiram em 7 dias; o proprietário também pode
-- cancelá-las manualmente. Nenhum histórico financeiro é apagado.

begin;

alter table public.platform_school_applications
  drop constraint if exists platform_school_applications_status_check;
alter table public.platform_school_applications
  add constraint platform_school_applications_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired'));

alter table public.platform_school_applications add column expires_at timestamptz;
update public.platform_school_applications
set expires_at = created_at + interval '7 days' where expires_at is null;
alter table public.platform_school_applications
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

alter table public.platform_payment_subscriptions
  drop constraint if exists platform_payment_subscriptions_status_check;
alter table public.platform_payment_subscriptions
  add constraint platform_payment_subscriptions_status_check
  check (status in ('creating','pending','authorized','paused','cancelled','expired','failed'));

create or replace function public.platform_expire_school_applications()
returns integer language plpgsql security definer set search_path to '' as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  update public.platform_payment_subscriptions p set status = 'expired', updated_at = now()
  from public.platform_school_applications a
  where a.id = p.application_id and a.status = 'pending' and a.expires_at <= now()
    and p.status in ('creating','pending','failed');
  update public.platform_school_applications
  set status = 'expired', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.platform_expire_school_applications() from public, anon;
grant execute on function public.platform_expire_school_applications() to authenticated;

create or replace function public.platform_cancel_school_application(p_application_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if not exists (select 1 from public.platform_school_applications where id = p_application_id and status in ('pending','expired')) then
    raise exception 'Solicitação não está disponível para cancelamento.';
  end if;
  if exists (select 1 from public.platform_payment_subscriptions
    where application_id = p_application_id and (status = 'authorized' or school_id is not null)) then
    raise exception 'Uma assinatura já autorizada não pode ser cancelada por esta ação.';
  end if;
  update public.platform_payment_subscriptions set status = 'cancelled', updated_at = now()
  where application_id = p_application_id and status in ('creating','pending','failed','expired');
  update public.platform_school_applications
  set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = p_application_id;
end;
$function$;
revoke all on function public.platform_cancel_school_application(uuid) from public, anon;
grant execute on function public.platform_cancel_school_application(uuid) to authenticated;

create or replace function public.platform_list_school_applications()
returns setof public.platform_school_applications
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  perform public.platform_expire_school_applications();
  return query select * from public.platform_school_applications order by created_at desc;
end;
$function$;

commit;
