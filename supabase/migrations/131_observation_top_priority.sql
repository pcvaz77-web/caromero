-- CARÔMETRO COMERCIAL
-- Prioridade configurável de alunos nas listas a partir de uma observação.
-- Migration 131

begin;

alter table public.observation_options
  add column if not exists is_top_priority boolean not null default false;

comment on column public.observation_options.is_top_priority is
  'Quando true, alunos com esta observação aparecem primeiro nas listas da escola, preservando ordem alfabética dentro de cada grupo.';

-- Preserva o comportamento já conhecido: Representante de turma e qualquer
-- etiqueta que contenha a palavra Líder começam marcadas. Depois disso, cada
-- escola pode alterar a opção livremente em Gerenciar observações.
update public.observation_options
set is_top_priority = true
where lower(btrim(label)) = 'representante de turma'
   or regexp_replace(
        translate(lower(label), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g'
      ) ~ '(^| )lider( |$)';

commit;
