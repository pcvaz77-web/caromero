-- CARÔMETRO: correção mínima de report_occurrences() (RELATÓRIOS).
-- Execute uma vez no Supabase SQL Editor.
--
-- Causa: student_occurrences.occurrence_text é varchar(500) (supabase-
-- occurrences.sql), mas report_occurrences() (supabase-reports.sql)
-- declarava a coluna de retorno como text. O Postgres recusa a função com
-- o erro 42804 "structure of query does not match function result type"
-- ao tentar devolver varchar(500) onde text foi declarado.
--
-- Correção: cast explícito o.occurrence_text::text no RETURN QUERY.
-- Assinatura pública da função, proteção (is_report_manager/auth.uid()),
-- SECURITY DEFINER, search_path e GRANT/REVOKE permanecem exatamente como
-- já estavam. Não altera student_occurrences, nenhuma RLS/policy nem
-- nenhuma outra função.

begin;

create or replace function public.report_occurrences(
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table (
  student_id uuid,
  occurred_on date,
  created_by_name text,
  occurrence_text text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_report_manager() then
    raise exception 'Sem permissão para gerar relatórios.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return;
  end if;

  return query
  select o.student_id, o.occurred_on, o.created_by_name, o.occurrence_text::text
  from public.student_occurrences o
  where o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on;
end;
$$;
revoke execute on function public.report_occurrences(uuid[], date, date) from public, anon;
grant execute on function public.report_occurrences(uuid[], date, date) to authenticated;

commit;
