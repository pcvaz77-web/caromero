begin;

do $migration$
declare
  v_definition text;
  v_marker text := $marker$    if v_row.next_status in ('active', 'repeated') and coalesce(v_row.next_class_name, '') = '' then
      raise exception 'Informe a nova turma de %.', v_row.full_name;
    end if;
$marker$;
  v_replacement text := $replacement$    if v_row.next_status in ('active', 'repeated') and coalesce(v_row.next_class_name, '') = '' then
      raise exception 'Informe a nova turma de %.', v_row.full_name;
    end if;
    if v_row.next_status = 'repeated' and (
      nullif((regexp_match(btrim(coalesce(v_row.class_name, '')), '^([0-9]{1,2})'))[1], '') is null
      or nullif((regexp_match(btrim(coalesce(v_row.next_class_name, '')), '^([0-9]{1,2})'))[1], '') is null
      or nullif((regexp_match(btrim(v_row.class_name), '^([0-9]{1,2})'))[1], '')::integer
        <> nullif((regexp_match(btrim(v_row.next_class_name), '^([0-9]{1,2})'))[1], '')::integer
    ) then
      raise exception 'Repetente % deve permanecer na mesma série.', v_row.full_name;
    end if;
    if v_row.next_status in ('transferred', 'concluded') and coalesce(v_row.next_class_name, '') <> '' then
      raise exception 'Aluno transferido ou concluinte não deve possuir turma de destino.';
    end if;
$replacement$;
begin
  select pg_get_functiondef('public.apply_school_year_transition(uuid,integer,jsonb)'::regprocedure)
    into v_definition;
  if position('Repetente % deve permanecer na mesma série.' in v_definition) > 0 then
    return;
  end if;
  if position(v_marker in v_definition) = 0 then
    raise exception 'Não foi possível localizar a validação de turma de destino vigente.';
  end if;
  execute replace(v_definition, v_marker, v_replacement);
end;
$migration$;

revoke all on function public.apply_school_year_transition(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_school_year_transition(uuid, integer, jsonb) to authenticated;

commit;
