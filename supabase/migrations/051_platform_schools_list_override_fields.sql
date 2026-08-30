-- CARÔMETRO COMERCIAL
-- Etapa 1 da transição de leitores para o modelo de override de plano.
-- Esta migration NÃO migra nenhum leitor para school_effective_plan() —
-- só prepara os dados que o futuro Painel precisará (Etapa 2, frontend,
-- em migration/commit separados) para exibir plano contratado, override
-- atual e sua expiração ao lado do plano legado.
--
-- plan continua vindo de ss.plan, exatamente como hoje. Só são
-- acrescentadas três colunas novas ao final do retorno de
-- platform_list_schools_with_counts_v3: contracted_plan, override_plan,
-- override_expires_at. Nenhuma coluna existente, seu nome, tipo, ordem
-- ou valor é alterado. platform_dashboard_summary não é tocada nesta
-- migration.
--
-- Como RETURNS TABLE muda (colunas novas), CREATE OR REPLACE não é
-- suficiente (Postgres rejeita mudança de tipo de retorno em função
-- existente) — por isso esta migration faz DROP FUNCTION seguido de
-- CREATE FUNCTION, preservando STABLE, SECURITY DEFINER, search_path='',
-- o gate is_platform_owner() e o GRANT EXECUTE só para authenticated
-- (mesmo estado de antes, confirmado por leitura antes de escrever esta
-- migration).
--
-- Só depois que o novo Painel (Etapa 2) estiver publicado e validado é
-- que uma migration futura (Etapa 3) fará plan passar a refletir
-- school_effective_plan(school_id) de fato, e só então
-- platform_set_subscription_plan poderá ser neutralizada com segurança.

begin;

drop function if exists public.platform_list_schools_with_counts_v3();

create function public.platform_list_schools_with_counts_v3()
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
    ss.plan::text,
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

commit;
