begin;

-- A consulta anterior nao entrega a hora nem as ressalvas ao PDF.
-- Nova RPC preserva a autorizacao de relatorios e limita todos os dados a escola ativa.
create function public.report_occurrence_details(
  p_school_id uuid,
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table(
  student_id uuid,
  occurred_on date,
  created_at timestamptz,
  created_by_name text,
  occurrence_text text,
  updated_at timestamptz,
  updated_by_name text,
  remarks jsonb
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissao para gerar relatorios nesta escola.';
  end if;

  perform public.assert_school_feature_access(p_school_id, 'reports');

  if p_student_ids is null or array_length(p_student_ids, 1) is null then return; end if;

  return query
  select
    o.student_id,
    o.occurred_on,
    o.created_at,
    o.created_by_name,
    o.occurrence_text::text,
    o.updated_at,
    o.updated_by_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', r.body,
        'created_by_name', r.created_by_name,
        'created_at', r.created_at
      ) order by r.created_at, r.id)
      from public.student_occurrence_remarks r
      where r.occurrence_id = o.id
        and r.school_id = p_school_id
    ), '[]'::jsonb)
  from public.student_occurrences o
  join public.students s
    on s.id = o.student_id
   and s.school_id = o.school_id
  where o.school_id = p_school_id
    and o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on, o.created_at, o.id;
end;
$function$;

revoke all on function public.report_occurrence_details(uuid,uuid[],date,date) from public, anon;
grant execute on function public.report_occurrence_details(uuid,uuid[],date,date) to authenticated;

commit;
