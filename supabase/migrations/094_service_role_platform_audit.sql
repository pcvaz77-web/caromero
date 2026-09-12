begin;

create or replace function public.record_platform_audit(
  p_event_type text,
  p_school_id uuid default null,
  p_target_user_id uuid default null,
  p_previous_state jsonb default '{}'::jsonb,
  p_new_state jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not public.is_platform_owner()) then
    raise exception 'Acesso negado.';
  end if;

  if nullif(btrim(p_event_type), '') is null or length(p_event_type) > 80 then
    raise exception 'Evento administrativo inválido.';
  end if;

  insert into public.platform_audit_log (
    actor_user_id,
    event_type,
    school_id,
    target_user_id,
    previous_state,
    new_state
  ) values (
    auth.uid(),
    p_event_type,
    p_school_id,
    p_target_user_id,
    coalesce(p_previous_state, '{}'::jsonb),
    coalesce(p_new_state, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.record_platform_audit(text, uuid, uuid, jsonb, jsonb)
from public, anon, authenticated;

commit;
