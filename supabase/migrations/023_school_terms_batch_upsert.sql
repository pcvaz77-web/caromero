-- CARÔMETRO COMERCIAL
-- Migration 023: RPC atômica para salvar o calendário letivo (school_terms)
-- dos quatro bimestres de um ano letivo em uma única transação.
--
--   - Motivo: upsert_school_term (migration 022) grava um bimestre por
--     chamada. A UI de Calendário Letivo (school-calendar.js) fazia até 4
--     chamadas independentes ao salvar; se uma chamada intermediária
--     falhasse (inclusive por falso-positivo de sobreposição contra o
--     estado ainda não atualizado de outro bimestre da mesma gravação),
--     o resultado podia ser uma configuração parcial — alguns bimestres
--     salvos, outros não, sem transação nenhuma amarrando as 4 chamadas.
--   - upsert_school_term é preservada sem nenhuma alteração — continua
--     existindo, com os mesmos grants, para compatibilidade. Esta
--     migration só ACRESCENTA uma função nova.
--   - upsert_school_terms_batch recebe os 4 pares início/fim (qualquer
--     um deles pode ser NULL,NULL — "não mexer neste bimestre nesta
--     chamada"; nunca dispara remoção do que já existe). Valida os 4
--     pares (par completo, início <= fim, sem sobreposição entre si E
--     sem sobreposição contra bimestres já salvos que não fazem parte
--     desta chamada) ANTES de qualquer escrita. Se qualquer validação
--     falhar, a função inteira aborta via raise exception — como todo o
--     corpo roda dentro de uma única invocação PL/pgSQL (uma transação
--     implícita), nenhuma linha é gravada. Só depois de todas as
--     validações passarem é que os upserts (só dos bimestres realmente
--     enviados) acontecem, todos dentro dessa mesma transação.
--   - Mesmo modelo de segurança de upsert_school_term: SECURITY DEFINER,
--     search_path='', só school_admin da escola (is_school_admin),
--     nenhuma permissão nova.

create or replace function public.upsert_school_terms_batch(
  target_school_id uuid,
  p_school_year integer,
  p1_starts_on date, p1_ends_on date,
  p2_starts_on date, p2_ends_on date,
  p3_starts_on date, p3_ends_on date,
  p4_starts_on date, p4_ends_on date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_starts date[] := array[p1_starts_on, p2_starts_on, p3_starts_on, p4_starts_on];
  v_ends   date[] := array[p1_ends_on,   p2_ends_on,   p3_ends_on,   p4_ends_on];
  v_submitted boolean[] := array[p1_starts_on is not null, p2_starts_on is not null, p3_starts_on is not null, p4_starts_on is not null];
  v_bimester int;
  v_other int;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if not public.is_school_admin(target_school_id) then
    raise exception 'Somente o administrador da escola pode configurar o calendário letivo.';
  end if;

  -- 1) Cada par precisa estar completo ou totalmente vazio.
  for v_bimester in 1..4 loop
    if (v_starts[v_bimester] is null) <> (v_ends[v_bimester] is null) then
      raise exception '%º bimestre: preencha início e fim, ou deixe os dois em branco.', v_bimester;
    end if;
    if v_starts[v_bimester] is not null and v_starts[v_bimester] > v_ends[v_bimester] then
      raise exception '%º bimestre: a data de início não pode ser depois da data de término.', v_bimester;
    end if;
  end loop;

  -- 2) Para bimestres NÃO enviados nesta chamada, usa o que já existe no
  --    banco só para fins de checagem de sobreposição — nunca escreve
  --    nesses bimestres.
  for v_bimester in 1..4 loop
    if v_starts[v_bimester] is null then
      select t.starts_on, t.ends_on into v_starts[v_bimester], v_ends[v_bimester]
      from public.school_terms t
      where t.school_id = target_school_id
        and t.school_year = p_school_year
        and t.bimester = v_bimester;
    end if;
  end loop;

  -- 3) Sobreposição entre todos os bimestres com data (enviados nesta
  --    chamada + já existentes) — mesmo teste de upsert_school_term,
  --    generalizado para os 4 de uma vez.
  for v_bimester in 1..4 loop
    if v_starts[v_bimester] is null then continue; end if;
    for v_other in (v_bimester + 1)..4 loop
      if v_starts[v_other] is null then continue; end if;
      if v_starts[v_bimester] <= v_ends[v_other] and v_starts[v_other] <= v_ends[v_bimester] then
        raise exception '%º e %º bimestres têm datas sobrepostas.', v_bimester, v_other;
      end if;
    end loop;
  end loop;

  -- 4) Só agora grava — só os bimestres realmente enviados nesta chamada
  --    (v_submitted), nunca os que só entraram no array para checagem de
  --    sobreposição.
  if v_submitted[1] then
    insert into public.school_terms (school_id, school_year, bimester, starts_on, ends_on)
    values (target_school_id, p_school_year, 1, p1_starts_on, p1_ends_on)
    on conflict on constraint school_terms_unique
      do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now();
  end if;
  if v_submitted[2] then
    insert into public.school_terms (school_id, school_year, bimester, starts_on, ends_on)
    values (target_school_id, p_school_year, 2, p2_starts_on, p2_ends_on)
    on conflict on constraint school_terms_unique
      do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now();
  end if;
  if v_submitted[3] then
    insert into public.school_terms (school_id, school_year, bimester, starts_on, ends_on)
    values (target_school_id, p_school_year, 3, p3_starts_on, p3_ends_on)
    on conflict on constraint school_terms_unique
      do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now();
  end if;
  if v_submitted[4] then
    insert into public.school_terms (school_id, school_year, bimester, starts_on, ends_on)
    values (target_school_id, p_school_year, 4, p4_starts_on, p4_ends_on)
    on conflict on constraint school_terms_unique
      do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now();
  end if;
end;
$function$;

revoke all on function public.upsert_school_terms_batch(uuid, integer, date, date, date, date, date, date, date, date) from public;
revoke all on function public.upsert_school_terms_batch(uuid, integer, date, date, date, date, date, date, date, date) from anon;
grant execute on function public.upsert_school_terms_batch(uuid, integer, date, date, date, date, date, date, date, date) to authenticated;
