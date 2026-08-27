-- CARÔMETRO COMERCIAL
-- Listagem agregada do painel da plataforma.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

create or replace function public.platform_dashboard_summary()
returns table (
  total_schools bigint,
  active_schools bigint,
  suspended_schools bigint,
  free_schools bigint,
  paid_schools bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where s.status = 'active')::bigint,
    count(*) filter (where s.status <> 'active')::bigint,
    count(*) filter (where ss.plan = 'free')::bigint,
    count(*) filter (where ss.plan <> 'free')::bigint
  from public.schools s
  left join public.school_subscriptions ss on ss.school_id = s.id;
end;
$function$;

revoke all on function public.platform_dashboard_summary() from public, anon;
grant execute on function public.platform_dashboard_summary() to authenticated;

create or replace function public.platform_list_schools_with_counts()
returns table (
  school_id uuid,
  school_name text,
  school_status text,
  plan text,
  billing_type text,
  subscription_status text,
  created_at timestamptz,
  user_count bigint,
  student_count bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    s.id,
    s.name::text,
    s.status::text,
    ss.plan::text,
    ss.billing_type::text,
    case
      when ss.status = 'active'
       and ss.grant_expires_at is not null
       and ss.grant_expires_at <= now()
        then 'expired'
      else ss.status
    end::text,
    s.created_at,
    coalesce(members.total, 0),
    coalesce(students.total, 0)
  from public.schools s
  left join public.school_subscriptions ss on ss.school_id = s.id
  left join lateral (
    select count(*)::bigint as total
    from public.school_members sm
    where sm.school_id = s.id
  ) members on true
  left join lateral (
    select count(*)::bigint as total
    from public.students st
    where st.school_id = s.id
  ) students on true
  order by s.created_at desc;
end;
$function$;

revoke all on function public.platform_list_schools_with_counts() from public;
revoke all on function public.platform_list_schools_with_counts() from anon;
grant execute on function public.platform_list_schools_with_counts() to authenticated;

commit;
