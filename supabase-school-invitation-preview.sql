-- CARÔMETRO COMERCIAL — preparar e revisar antes de aplicar.
-- Este arquivo não é executado automaticamente.
begin;

create or replace function public.get_invitation_preview(invitation_token uuid)
returns table(school_name text, role text, masked_email text, email_has_account boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_local text;
  v_domain text;
begin
  select i.* into v_invitation
  from public.school_invitations i
  where i.token = invitation_token
    and i.status = 'pending'
    and i.expires_at > now();

  if not found then return; end if;
  v_local := split_part(v_invitation.email, '@', 1);
  v_domain := split_part(v_invitation.email, '@', 2);

  return query
  select s.name,
         v_invitation.role,
         left(v_local, least(3, length(v_local))) || '***@' || v_domain,
         exists (
           select 1 from auth.users u
           where lower(trim(u.email)) = lower(trim(v_invitation.email))
             and u.deleted_at is null
             and u.email_confirmed_at is not null
         )
  from public.schools s
  where s.id = v_invitation.school_id
    and s.status = 'active'
    and exists (
      select 1
      from public.school_subscriptions ss
      where ss.school_id = s.id
        and ss.status = 'active'
        and (ss.grant_expires_at is null or ss.grant_expires_at > now())
    );
end;
$function$;

revoke all on function public.get_invitation_preview(uuid) from public;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated, service_role;

create or replace function public.invitation_email_matches(
  invitation_token uuid,
  candidate_email text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    invitation_token is not null
    and candidate_email is not null
    and length(candidate_email) <= 320
    and exists (
      select 1
      from public.school_invitations i
      join public.schools s on s.id = i.school_id
      join public.school_subscriptions ss on ss.school_id = i.school_id
      where i.token = invitation_token
        and i.status = 'pending'
        and i.expires_at > now()
        and lower(trim(i.email)) = lower(trim(candidate_email))
        and s.status = 'active'
        and ss.status = 'active'
        and (ss.grant_expires_at is null or ss.grant_expires_at > now())
    );
$function$;

revoke all on function public.invitation_email_matches(uuid, text) from public;
grant execute on function public.invitation_email_matches(uuid, text)
to anon, authenticated, service_role;

commit;
