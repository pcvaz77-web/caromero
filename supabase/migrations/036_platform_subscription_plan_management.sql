-- CARÔMETRO COMERCIAL
-- Alteração auditável do plano de uma escola pelo proprietário da plataforma.

begin;

create or replace function public.platform_list_schools_with_counts_v2()
returns table (
  school_id uuid,
  school_name text,
  school_status text,
  plan text,
  billing_type text,
  price numeric,
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

revoke all on function public.platform_list_schools_with_counts_v2() from public;
revoke all on function public.platform_list_schools_with_counts_v2() from anon;
grant execute on function public.platform_list_schools_with_counts_v2() to authenticated;

create or replace function public.platform_set_subscription_plan(
  p_school_id uuid,
  p_plan text,
  p_price numeric,
  p_billing_type text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous public.school_subscriptions%rowtype;
  v_new public.school_subscriptions%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null
     or p_plan is null or p_plan not in ('free', 'basic', 'professional', 'enterprise')
     or p_billing_type is null or p_billing_type not in ('fixed_school', 'per_student')
     or p_price is null or p_price < 0 or p_price > 99999999.99
     or nullif(btrim(p_reason), '') is null
     or char_length(btrim(p_reason)) > 500 then
    raise exception 'Dados do plano inválidos.';
  end if;

  select * into v_previous
  from public.school_subscriptions
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Assinatura da escola não encontrada.';
  end if;

  update public.school_subscriptions
  set plan = p_plan,
      price = p_price,
      billing_type = p_billing_type,
      granted_by = auth.uid(),
      grant_reason = btrim(p_reason),
      updated_at = now()
  where school_id = p_school_id
  returning * into v_new;

  perform public.record_platform_audit(
    'subscription_plan_changed',
    p_school_id,
    null,
    jsonb_build_object(
      'plan', v_previous.plan,
      'price', v_previous.price,
      'billing_type', v_previous.billing_type,
      'grant_reason', v_previous.grant_reason
    ),
    jsonb_build_object(
      'plan', v_new.plan,
      'price', v_new.price,
      'billing_type', v_new.billing_type,
      'grant_reason', v_new.grant_reason
    )
  );
end;
$function$;

revoke all on function public.platform_set_subscription_plan(uuid, text, numeric, text, text) from public;
revoke all on function public.platform_set_subscription_plan(uuid, text, numeric, text, text) from anon;
grant execute on function public.platform_set_subscription_plan(uuid, text, numeric, text, text) to authenticated;

commit;
