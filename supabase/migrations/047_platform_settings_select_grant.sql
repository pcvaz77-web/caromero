-- CARÔMETRO COMERCIAL
-- Corrige a leitura pública de platform_settings.show_subscription: a
-- policy de RLS "Anyone can view platform settings" já existia e está
-- correta (FOR SELECT TO authenticated, anon USING (true)), mas o GRANT
-- SELECT de base nunca foi concedido a anon — só a authenticated. Sem
-- ele, a policy nunca chega a ser avaliada e a consulta feita pela tela
-- de login (visitante não autenticado, papel anon) falha com "permission
-- denied for table platform_settings" — mesma classe de bug já corrigida
-- para platform_plans na migration 045. Esta migration apenas formaliza o
-- privilégio que faltou. Não altera RLS, a policy existente, os dados de
-- platform_settings, nem platform_set_subscription_visibility.

begin;

grant select on public.platform_settings to anon;

commit;
