-- CARÔMETRO COMERCIAL
-- Renomeia observation_options.is_positive_highlight para is_pinned
-- Migration 077
--
-- OBJETIVO:
-- A função "Destacar como elogio ⭐" virou "Fixar", genérica para
-- qualquer observação cadastrada — não mais restrita a elogios.
--
-- PROJETO ALVO: ppkndfwmqdmomkjoemre (carometro-comercial-dev) — o
-- backend real que a branch comercial usa (carometro-config.js só
-- permite conectar nele; conectar em ftigviorsuqucxwxqpua é bloqueado
-- no próprio código, por ser o Carômetro legado publicado, que deve
-- permanecer intocado). Confirmado por auditoria antes de aplicar:
-- observation_options.is_positive_highlight existe neste projeto
-- (migration 069 já aplicada aqui) e hoje tem 1 observação marcada
-- como true entre 18 cadastradas.
--
-- RENAME COLUMN preserva automaticamente todos os valores já gravados
-- — a observação hoje marcada como elogio continua marcada (agora como
-- fixa) sem nenhum UPDATE adicional.
--
-- RLS/policies não referenciam o nome da coluna: a policy de gestão
-- (migration 014, "school_authorized_manage_observation_options") é
-- por linha via school_id/is_school_admin()/has_school_permission(),
-- nunca por coluna — confirmado lendo pg_policies neste projeto antes
-- de escrever esta migration. Nenhuma policy precisa mudar.
--
-- Guardado com checagem de information_schema para poder rodar com
-- segurança mesmo que já tenha sido aplicada antes.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'observation_options'
      and column_name = 'is_positive_highlight'
  ) then
    alter table public.observation_options
      rename column is_positive_highlight to is_pinned;
  end if;
end $$;

comment on column public.observation_options.is_pinned is
  'Quando true, a etiqueta fica fixa (exibida permanentemente) abaixo do nome do aluno sempre que estiver atribuída a ele.';

commit;
