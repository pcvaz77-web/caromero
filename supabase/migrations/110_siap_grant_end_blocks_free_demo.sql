-- Uma concessão manual encerrada não reabre a demonstração gratuita.
-- A assinatura paga continua tendo precedência sobre o histórico da concessão.
create or replace function public.get_siap_assistant_access_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_had_grant boolean := false;
  v_license public.siap_assistant_licenses%rowtype;
  v_now timestamptz := now();
  v_end timestamptz;
  v_planning integer := 0;
  v_content integer := 0;
  v_attendance integer := 0;
  v_pei integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select * into v_grant
  from public.siap_assistant_access_grants
  where user_id = v_user_id;
  v_had_grant := found;

  if v_had_grant and v_grant.revoked_at is null and (v_grant.expires_at is null or v_grant.expires_at > v_now) then
    return public.activate_siap_assistant_trial() || jsonb_build_object(
      'mode','carometro',
      'freeUses',null,
      'permanent',v_grant.expires_at is null,
      'accessEndsAt',v_grant.expires_at,
      'daysRemaining',case when v_grant.expires_at is null then null else greatest(0,ceil(extract(epoch from(v_grant.expires_at-v_now))/86400.0)::integer) end
    );
  end if;

  select * into v_license from public.siap_assistant_licenses where user_id = v_user_id;
  if found then
    v_end := greatest(v_license.trial_ends_at,coalesce(v_license.paid_until,'-infinity'::timestamptz));
    if v_license.suspended_at is null and v_license.paid_until is not null and v_end > v_now then
      return jsonb_build_object('active',true,'status','subscribed','mode','subscription','accessEndsAt',v_end,
        'daysRemaining',greatest(0,ceil(extract(epoch from(v_end-v_now))/86400.0)::integer),'freeUses',null);
    end if;
  end if;

  if v_had_grant then
    return jsonb_build_object('active',false,'status','grant_ended','mode','external','accessEndsAt',v_grant.expires_at,
      'daysRemaining',0,'freeUses',jsonb_build_object('planning',0,'content',0,'attendance',0,'pei',0));
  end if;

  select coalesce(max(used_count) filter(where feature_key='planning'),0),
    coalesce(max(used_count) filter(where feature_key='content'),0),
    coalesce(max(used_count) filter(where feature_key='attendance'),0),
    coalesce(max(used_count) filter(where feature_key='pei'),0)
  into v_planning,v_content,v_attendance,v_pei
  from public.siap_assistant_free_usage where user_id=v_user_id;

  return jsonb_build_object('active',least(v_planning,v_content,v_attendance,v_pei)<2,'status','free','mode','external',
    'daysRemaining',null,'freeUses',jsonb_build_object('planning',2-v_planning,'content',2-v_content,
    'attendance',2-v_attendance,'pei',2-v_pei));
end;
$function$;

revoke all on function public.get_siap_assistant_access_status() from public, anon;
grant execute on function public.get_siap_assistant_access_status() to authenticated;
