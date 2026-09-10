-- Lista escolar de usuários para o proprietário controlar o acesso individual
-- ao Assistente SIAP. Não concede acesso e não altera dados existentes.

begin;

create or replace function public.platform_list_siap_school_users()
returns table (
  school_id uuid,
  school_name text,
  member_id uuid,
  user_id uuid,
  full_name text,
  email text,
  member_role text,
  member_status text,
  owner_granted boolean,
  paid_active boolean,
  access_ends_at timestamptz,
  days_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.name::text,
    sm.id,
    sm.user_id,
    p.full_name::text,
    p.email::text,
    sm.role::text,
    sm.status::text,
    (g.user_id is not null and g.revoked_at is null),
    (l.suspended_at is null and l.paid_until > now()),
    case when l.user_id is null then null
      else greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) end,
    case when l.user_id is null then null else greatest(0, ceil(extract(epoch from (
      greatest(l.trial_ends_at, coalesce(l.paid_until, '-infinity'::timestamptz)) - now()
    )) / 86400.0)::integer) end
  from public.schools s
  join public.school_members sm on sm.school_id = s.id
  left join public.profiles p on p.id = sm.user_id
  left join public.siap_assistant_access_grants g on g.user_id = sm.user_id
  left join public.siap_assistant_licenses l on l.user_id = sm.user_id
  order by s.name, coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), sm.created_at;
end;
$function$;

revoke all on function public.platform_list_siap_school_users() from public, anon;
grant execute on function public.platform_list_siap_school_users() to authenticated;

comment on function public.platform_list_siap_school_users() is
  'Lista escolas e seus membros para o proprietário controlar exclusivamente a concessão do Assistente SIAP.';

commit;
