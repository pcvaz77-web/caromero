-- CARÔMETRO COMERCIAL
-- Etapa 1 do plano sequencial pós-Etapa 2: migra os dois únicos leitores
-- vivos de school_subscriptions.plan para school_effective_plan(),
-- fechando a fonte de verdade do plano de uma escola no modelo
-- contratado/override, sem quebrar o contrato do frontend.
--
-- platform_list_schools_with_counts_v3: RETURNS TABLE não muda (mesmas
-- 16 colunas, nomes, tipos e ordem já vigentes desde a migration 051) —
-- por isso CREATE OR REPLACE é seguro aqui, sem a janela de DROP+CREATE.
-- A única mudança semântica é a coluna `plan`: antes `ss.plan::text`,
-- agora `public.school_effective_plan(s.id)::text`. O nome da coluna
-- retornada continua "plan" — o frontend não precisa mudar.
--
-- platform_dashboard_summary: os dois FILTER que classificavam
-- free/pago por `ss.plan` passam a usar `public.school_effective_plan(s.id)`.
-- Nenhuma outra coluna/lógica da função muda.
--
-- Não altera school_subscriptions.plan fisicamente (continua existindo e
-- sendo escrito pelas RPCs de override, como espelho de compatibilidade
-- para qualquer leitor futuro que ainda não tenha sido migrado). Não
-- cria cron/job — a expiração de uma concessão temporária já funciona
-- puramente pela passagem do relógio, porque school_effective_plan() é
-- chamada a cada leitura, não armazenada.

begin;

create or replace function public.platform_list_schools_with_counts_v3()
returns table(
  school_id uuid,
  school_name text,
  school_status text,
  archived_at timestamptz,
  plan text,
  billing_type text,
  price numeric,
  subscription_status text,
  created_at timestamptz,
  user_count bigint,
  student_count bigint,
  admin_email text,
  admin_state text,
  contracted_plan text,
  override_plan text,
  override_expires_at timestamptz
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
    s.archived_at,
    public.school_effective_plan(s.id)::text,
    ss.billing_type::text,
    ss.price,
    case
      when ss.status = 'active'
       and ss.grant_expires_at is not null
       and ss.grant_expires_at <= now()
        then 'expired'
      else ss.status
    end::text,
    s.created_at,
    coalesce(members.total, 0),
    coalesce(students.total, 0),
    coalesce(active_admin.admin_email, pending_admin.admin_email),
    coalesce(active_admin.admin_state, pending_admin.admin_state, 'none'),
    ss.contracted_plan::text,
    ss.override_plan::text,
    ss.override_expires_at
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
  left join lateral (
    select u.email::text as admin_email, 'active'::text as admin_state
    from public.school_members sm
    join auth.users u on u.id = sm.user_id
    where sm.school_id = s.id
      and sm.role = 'school_admin'
      and sm.status = 'active'
    order by sm.created_at asc
    limit 1
  ) active_admin on true
  left join lateral (
    select i.email::text as admin_email, 'pending'::text as admin_state
    from public.school_invitations i
    where i.school_id = s.id
      and i.role = 'school_admin'
      and i.status = 'pending'
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
  ) pending_admin on true
  order by s.created_at desc;
end;
$function$;

revoke all on function public.platform_list_schools_with_counts_v3() from public;
revoke all on function public.platform_list_schools_with_counts_v3() from anon;
grant execute on function public.platform_list_schools_with_counts_v3() to authenticated;

create or replace function public.platform_dashboard_summary()
returns table(total_schools bigint, active_schools bigint, suspended_schools bigint, free_schools bigint, paid_schools bigint)
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
    count(*) filter (where public.school_effective_plan(s.id) = 'free')::bigint,
    count(*) filter (where public.school_effective_plan(s.id) <> 'free')::bigint
  from public.schools s
  left join public.school_subscriptions ss on ss.school_id = s.id;
end;
$function$;

revoke all on function public.platform_dashboard_summary() from public;
revoke all on function public.platform_dashboard_summary() from anon;
grant execute on function public.platform_dashboard_summary() to authenticated;

commit;
