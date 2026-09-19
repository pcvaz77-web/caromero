begin;

create or replace function public.is_terminal_school_class(p_school_id uuid, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_grade integer;
  v_stage text;
  v_has_upper boolean;
  v_has_middle boolean;
  v_has_later boolean;
  v_has_high boolean;
begin
  v_grade := nullif((regexp_match(btrim(coalesce(p_name,'')), '^([0-9]{1,2})'))[1], '')::integer;
  if v_grade is null then return false; end if;

  select
    exists(select 1 from public.classes c where c.school_id=p_school_id and c.archived_at is null and c.name ~ '^[[:space:]]*[6-9]'),
    exists(select 1 from public.classes c where c.school_id=p_school_id and c.archived_at is null and c.name ~ '^[[:space:]]*[4-5]')
  into v_has_upper, v_has_middle;

  v_stage := case
    when p_name ~* 's(é|e)rie|ensino[[:space:]]*m(é|e)dio|(^|[^[:alpha:]])EM([^[:alpha:]]|$)' then 'high'
    when p_name ~* 'ano[[:space:]]*fundamental|^[[:space:]]*[0-9]+[[:space:]]*[º°]' then 'fund'
    when v_grade <= 3 and v_has_upper and not v_has_middle then 'high'
    else 'fund'
  end;

  select exists(
    select 1
    from public.classes c
    cross join lateral (
      select nullif((regexp_match(btrim(c.name), '^([0-9]{1,2})'))[1], '')::integer as grade,
        case
          when c.name ~* 's(é|e)rie|ensino[[:space:]]*m(é|e)dio|(^|[^[:alpha:]])EM([^[:alpha:]]|$)' then 'high'
          when c.name ~* 'ano[[:space:]]*fundamental|^[[:space:]]*[0-9]+[[:space:]]*[º°]' then 'fund'
          when nullif((regexp_match(btrim(c.name), '^([0-9]{1,2})'))[1], '')::integer <= 3
            and v_has_upper and not v_has_middle then 'high'
          else 'fund'
        end as stage
    ) parsed
    where c.school_id=p_school_id and c.archived_at is null
      and parsed.stage=v_stage and parsed.grade>v_grade
  ) into v_has_later;

  if v_has_later then return false; end if;
  if v_stage='fund' and v_grade=9 then
    select exists(
      select 1 from public.classes c
      where c.school_id=p_school_id and c.archived_at is null
        and c.name ~* 's(é|e)rie|ensino[[:space:]]*m(é|e)dio|(^|[^[:alpha:]])EM([^[:alpha:]]|$)'
    ) or (v_has_upper and not v_has_middle and exists(
      select 1 from public.classes c where c.school_id=p_school_id and c.archived_at is null and c.name ~ '^[[:space:]]*[1-3][A-Za-z]'
    )) into v_has_high;
    if v_has_high then return false; end if;
  end if;
  return true;
end;
$function$;

revoke all on function public.is_terminal_school_class(uuid,text) from public, anon, authenticated;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.apply_school_year_transition(uuid,integer,jsonb)'::regprocedure)
    into v_definition;
  if position('public.is_terminal_school_class(target_school_id, v_row.class_name)' in v_definition) > 0 then
    return;
  end if;
  if position('public.is_terminal_school_class(v_row.class_name)' in v_definition) = 0 then
    raise exception 'Não foi possível localizar a validação terminal vigente.';
  end if;
  v_definition := replace(
    v_definition,
    'public.is_terminal_school_class(v_row.class_name)',
    'public.is_terminal_school_class(target_school_id, v_row.class_name)'
  );
  execute v_definition;
end;
$migration$;

revoke all on function public.apply_school_year_transition(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_school_year_transition(uuid, integer, jsonb) to authenticated;

commit;
