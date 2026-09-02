-- Distingue uma conta criada/confirmada no Auth de um convite escolar
-- efetivamente aceito. Uma conta sem vínculo ativo e com convite pendente
-- deve aparecer como "Convite pendente" no painel administrativo.

begin;

create or replace function public.admin_list_accounts_v2()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  access_status text,
  email_confirmed boolean,
  active_memberships bigint,
  pending_invitations bigint
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    u.id::uuid,
    u.email::text,
    p.full_name::text,
    case
      when exists (
        select 1 from public.platform_admins pa
        where pa.user_id = u.id and pa.role = 'owner' and pa.status = 'active'
      ) then 'platform_owner'
      else up.role::text
    end,
    paa.status::text,
    (u.email_confirmed_at is not null)::boolean,
    (
      select count(*) from public.school_members sm
      where sm.user_id = u.id and sm.status = 'active'
    )::bigint,
    (
      select count(*) from public.school_invitations si
      where si.email = lower(pg_catalog.btrim(u.email))
        and si.status = 'pending'
        and si.expires_at > now()
    )::bigint
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_permissions up on up.user_id = u.id
  left join public.platform_account_access paa on paa.user_id = u.id
  order by u.created_at;
end;
$function$;

revoke all on function public.admin_list_accounts_v2() from public;
revoke all on function public.admin_list_accounts_v2() from anon;
grant execute on function public.admin_list_accounts_v2() to authenticated;

commit;
