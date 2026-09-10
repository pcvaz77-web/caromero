begin;

-- A área geral de contas do Carômetro deve listar somente pessoas que
-- realmente pertencem ao produto escolar. Contas criadas exclusivamente pelo
-- login do Assistente SIAP continuam no Auth compartilhado, mas são exibidas
-- apenas pelas funções específicas do Assistente.
create or replace function public.admin_list_carometro_accounts()
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
language plpgsql security definer set search_path to ''
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
    case when exists (
      select 1 from public.platform_admins pa
      where pa.user_id = u.id and pa.role = 'owner' and pa.status = 'active'
    ) then 'platform_owner' else up.role::text end,
    paa.status::text,
    (u.email_confirmed_at is not null)::boolean,
    (select count(*) from public.school_members sm
      where sm.user_id = u.id and sm.status = 'active')::bigint,
    (select count(*) from public.school_invitations si
      where si.email = lower(pg_catalog.btrim(u.email))
        and si.status = 'pending' and si.expires_at > now())::bigint
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_permissions up on up.user_id = u.id
  left join public.platform_account_access paa on paa.user_id = u.id
  where exists (
      select 1 from public.platform_admins pa where pa.user_id = u.id
    )
    or exists (
      select 1 from public.school_members sm where sm.user_id = u.id
    )
    or exists (
      select 1 from public.school_invitations si
      where si.email = lower(pg_catalog.btrim(u.email))
    )
  order by u.created_at;
end;
$function$;

revoke all on function public.admin_list_carometro_accounts() from public, anon;
grant execute on function public.admin_list_carometro_accounts() to authenticated;

commit;
