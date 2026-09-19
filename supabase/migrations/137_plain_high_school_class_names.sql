begin;

create or replace function public.is_terminal_school_class(p_name text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $function$
  select
    p_name ~* '^[[:space:]]*3[A-Z]([[:space:]]|$)'
    or p_name ~* '(^|[[:space:]])3[[:space:]]*(ª|a)[[:space:]]*s(é|e)rie([[:space:]]|$)'
    or p_name ~* '(^|[[:space:]])3[[:space:]]*(º|o)?[[:space:]]*ano[[:space:]]*(do[[:space:]]*)?(ensino[[:space:]]*m(é|e)dio|em)([[:space:]]|$)';
$function$;

revoke all on function public.is_terminal_school_class(text) from public, anon, authenticated;

do $migration$
declare
  v_definition text;
  v_old text := $old$v_terminal := coalesce(v_row.class_name, '') ~* '(^|[[:space:]])3[[:space:]]*(ª|a)[[:space:]]*s(é|e)rie([[:space:]]|$)'
      or coalesce(v_row.class_name, '') ~* '(^|[[:space:]])3[[:space:]]*(º|o)?[[:space:]]*ano[[:space:]]*(do[[:space:]]*)?(ensino[[:space:]]*m(é|e)dio|em)([[:space:]]|$)';$old$;
begin
  select pg_get_functiondef('public.apply_school_year_transition(uuid,integer,jsonb)'::regprocedure)
    into v_definition;
  if position('public.is_terminal_school_class(v_row.class_name)' in v_definition) > 0 then
    return;
  end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'Não foi possível localizar a validação terminal vigente.';
  end if;
  v_definition := replace(
    v_definition,
    v_old,
    'v_terminal := public.is_terminal_school_class(v_row.class_name);'
  );
  execute v_definition;
end;
$migration$;

revoke all on function public.apply_school_year_transition(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_school_year_transition(uuid, integer, jsonb) to authenticated;

commit;
