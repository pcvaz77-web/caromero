-- CARÔMETRO COMERCIAL
-- Corrige public.set_occurrence_responsible(): a função chamava
-- pg_catalog.trim(...), que não existe no Postgres (TRIM(...) é açúcar
-- sintático do parser para btrim/ltrim/rtrim, não uma função de catálogo
-- chamada "trim"). Isso fazia TODA tentativa de criar ou editar uma
-- ocorrência falhar com "function pg_catalog.trim(text) does not exist",
-- para qualquer escola e qualquer papel — confirmado que nenhuma
-- ocorrência jamais foi gravada no Comercial (student_occurrences com 0
-- linhas), então não há dado parcial a corrigir.
--
-- Única mudança: pg_catalog.trim(...) -> pg_catalog.btrim(...), a função
-- real do catálogo (equivalente ao TRIM(...) padrão), qualificada
-- explicitamente porque a função usa search_path=''. Assinatura, SECURITY
-- DEFINER, search_path, corpo/lógica e o restante do texto permanecem
-- idênticos ao que já estava aplicado. Não altera a trigger, RLS,
-- lock_occurrence_identity, notificações nem nenhuma outra função.

create or replace function public.set_occurrence_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- O responsável é histórico e não pode ser trocado ao editar o texto.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;

    -- Assinatura da última edição. Se o próprio responsável original
    -- editar, updated_by/updated_by_name naturalmente ficam iguais a
    -- created_by/created_by_name, já que auth.uid() é o mesmo.
    new.updated_by := auth.uid();
    select coalesce(nullif(pg_catalog.btrim(full_name), ''), nullif(pg_catalog.btrim(email), ''), 'Não informado')
      into new.updated_by_name
    from public.profiles
    where id = auth.uid();
    new.updated_by_name := coalesce(new.updated_by_name, 'Não informado');
    new.updated_at := now();
    return new;
  end if;

  new.created_by := auth.uid();
  select coalesce(nullif(pg_catalog.btrim(full_name), ''), nullif(pg_catalog.btrim(email), ''), 'Não informado')
    into new.created_by_name
  from public.profiles
  where id = auth.uid();
  new.created_by_name := coalesce(new.created_by_name, 'Não informado');
  return new;
end;
$$;
