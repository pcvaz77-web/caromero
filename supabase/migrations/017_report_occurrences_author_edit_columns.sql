-- CARÔMETRO COMERCIAL
-- Migration 017: acrescenta autoria/edição reais ao relatório de ocorrências.
--
-- O relatório em PDF (reports.js) hoje só mostra occurred_on e
-- created_by_name. As colunas de edição (updated_by_name, updated_at) e a
-- data/hora real de criação (created_at) já existem em student_occurrences
-- desde sempre, já são preenchidas corretamente por triggers já existentes
-- (set_occurrence_responsible, lock_occurrence_identity — nenhum dos dois é
-- tocado por esta migration) e já são exibidas na tela de Ocorrências. Só
-- faltava a função que alimenta o relatório devolver essas três colunas.
--
-- public.report_occurrences() precisa ser recriada (não CREATE OR REPLACE)
-- porque o Postgres não permite mudar o conjunto de colunas de um
-- RETURNS TABLE por CREATE OR REPLACE FUNCTION — é obrigatório DROP
-- FUNCTION antes. Isso remove os grants da função, por isso eles são
-- reaplicados explicitamente logo abaixo, replicando exatamente (nem mais
-- nem menos) o que a função já tinha: EXECUTE para authenticated e para
-- service_role, nada para anon nem para public.
--
-- Não altera public.is_report_manager(), public.report_students(),
-- public.student_occurrences (tabela/triggers) nem nenhuma política de RLS.

begin;

drop function public.report_occurrences(uuid[], date, date);

create or replace function public.report_occurrences(
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table(
  student_id uuid,
  occurred_on date,
  created_by_name text,
  occurrence_text text,
  created_at timestamptz,
  updated_by_name text,
  updated_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_report_manager() then
    raise exception 'Sem permissão para gerar relatórios.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return;
  end if;

  return query
  select
    o.student_id,
    o.occurred_on,
    o.created_by_name,
    o.occurrence_text::text,
    o.created_at,
    o.updated_by_name,
    o.updated_at
  from public.student_occurrences o
  where o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on;
end;
$function$;

-- Reaplica exatamente os mesmos três grants que a função já tinha antes do
-- DROP — postgres continua dono (acesso implícito); authenticated e
-- service_role explícitos aqui para não depender silenciosamente do default
-- privilege do schema public; anon e public seguem sem nenhum acesso.
revoke all on function public.report_occurrences(uuid[], date, date) from public;
revoke all on function public.report_occurrences(uuid[], date, date) from anon;
grant execute on function public.report_occurrences(uuid[], date, date) to authenticated;
grant execute on function public.report_occurrences(uuid[], date, date) to service_role;

commit;
