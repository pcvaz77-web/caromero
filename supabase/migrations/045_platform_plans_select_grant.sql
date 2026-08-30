-- CARÔMETRO COMERCIAL
-- Corrige a leitura pública de platform_plans (migration 042): a policy de
-- RLS "Anyone can view platform plans" já existia e está correta, mas
-- nunca foi acompanhada do GRANT SELECT de base exigido pelo Postgres —
-- sem ele, a policy nunca chega a ser avaliada e a consulta falha com
-- "permission denied for table platform_plans" para authenticated/anon.
-- Esta migration apenas formaliza o privilégio que faltou. Não altera
-- RLS, a policy existente, os dados dos quatro planos, nem qualquer outra
-- tabela.

begin;

grant select on public.platform_plans to authenticated, anon;

commit;
