-- Email-only Assistente access explicitly requested by the product owner.
-- Only the Edge Function service role can resolve an existing account.
-- Does not create users, change grants, or expose Carometro data.
create or replace function public.siap_assistant_resolve_access_email(p_email text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from auth.users
  where lower(email) = lower(btrim(p_email))
    and deleted_at is null
    and (banned_until is null or banned_until <= now())
  limit 1;
$$;
revoke all on function public.siap_assistant_resolve_access_email(text) from public, anon, authenticated;
grant execute on function public.siap_assistant_resolve_access_email(text) to service_role;
