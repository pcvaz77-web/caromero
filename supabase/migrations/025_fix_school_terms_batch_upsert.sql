-- CARÔMETRO COMERCIAL
-- Migration 025: corrige bug de sintaxe em upsert_school_terms_batch
-- (migration 023, já aplicada).
--
-- Bug encontrado em teste funcional real (branch production, dados
-- temporários, revertidos): a etapa que busca do banco os bimestres NÃO
-- enviados nesta chamada (para checagem de sobreposição) usava
--   select ... into v_starts[v_bimester], v_ends[v_bimester]
-- PL/pgSQL não aceita elemento de array com subscrito como alvo de
-- SELECT INTO — só variáveis simples, record ou row. Isso fazia a função
-- falhar com "cannot subscript type date because it does not support
-- subscripting" sempre que pelo menos um bimestre era deixado em branco
-- (NULL,NULL) — exatamente o caso de uso de "configurar só um bimestre
-- por enquanto", que a função foi desenhada para suportar.
--
-- Não é falha de segurança/atomicidade: confirmado por teste que nenhuma
-- escrita parcial acontecia — a função falhava antes de qualquer INSERT.
--
-- Correção: SELECT INTO para duas variáveis escalares temporárias, depois
-- atribuição simples (:=) aos elementos do array — sintaticamente válida.
-- Nenhuma outra linha da função muda: mesma assinatura, mesma validação,
-- mesma ordem de operações, mesmos grants (preservados, não reafirmados
-- aqui pois CREATE OR REPLACE mantém os grants já existentes de uma
-- função ao mesmo nome/assinatura).

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
  v_existing_start date;
  v_existing_end date;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if not public.is_school_admin(target_school_id) then
    raise exception 'Somente o administrador da escola pode configurar o calendário letivo.';
  end if;

  for v_bimester in 1..4 loop
    if (v_starts[v_bimester] is null) <> (v_ends[v_bimester] is null) then
      raise exception '%º bimestre: preencha início e fim, ou deixe os dois em branco.', v_bimester;
    end if;
    if v_starts[v_bimester] is not null and v_starts[v_bimester] > v_ends[v_bimester] then
      raise exception '%º bimestre: a data de início não pode ser depois da data de término.', v_bimester;
    end if;
  end loop;

  for v_bimester in 1..4 loop
    if v_starts[v_bimester] is null then
      v_existing_start := null;
      v_existing_end := null;
      select t.starts_on, t.ends_on into v_existing_start, v_existing_end
      from public.school_terms t
      where t.school_id = target_school_id
        and t.school_year = p_school_year
        and t.bimester = v_bimester;
      v_starts[v_bimester] := v_existing_start;
      v_ends[v_bimester] := v_existing_end;
    end if;
  end loop;

  for v_bimester in 1..4 loop
    if v_starts[v_bimester] is null then continue; end if;
    for v_other in (v_bimester + 1)..4 loop
      if v_starts[v_other] is null then continue; end if;
      if v_starts[v_bimester] <= v_ends[v_other] and v_starts[v_other] <= v_ends[v_bimester] then
        raise exception '%º e %º bimestres têm datas sobrepostas.', v_bimester, v_other;
      end if;
    end loop;
  end loop;

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
