-- CARÔMETRO COMERCIAL
-- Neutraliza platform_set_subscription_plan sem removê-la: o frontend
-- publicado não a chama mais desde o commit 024eb9f (Etapa 2), os dois
-- leitores vivos (platform_list_schools_with_counts_v3,
-- platform_dashboard_summary) já usam school_effective_plan() desde a
-- migration 053, e nenhuma outra função instalada depende dela
-- internamente — confirmado por auditoria imediatamente antes desta
-- migration. Ela só escreve a coluna legada `plan`, então mantê-la
-- chamável recriaria o risco de plan != school_effective_plan().
--
-- Revoga apenas o EXECUTE de authenticated. anon nunca teve EXECUTE
-- nesta função (confirmado antes desta migration) — nada a fazer além
-- de documentar esse fato aqui. Não há DROP: a função continua
-- instalada, como legado histórico e reversível (bastaria um novo GRANT
-- EXECUTE para restaurá-la, sem precisar reescrever nada).

begin;

revoke execute on function public.platform_set_subscription_plan(uuid, text, numeric, text, text) from authenticated;

commit;
