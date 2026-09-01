-- CARÔMETRO COMERCIAL
-- Privilégios mínimos para as Edge Functions do fluxo Mercado Pago.
--
-- As migrations 060/061 removeram corretamente o acesso direto de anon e
-- authenticated, mas as tabelas também ficaram sem privilégios SQL para o
-- service_role. RLS bypass não substitui GRANT de tabela; por isso a função
-- não conseguia sequer consultar a solicitação pública já criada.

begin;

grant select on table public.platform_school_applications to service_role;
grant select on table public.platform_plans to service_role;

grant select, insert, update
  on table public.platform_payment_subscriptions
  to service_role;

grant select, insert, update
  on table public.platform_payment_events
  to service_role;

-- Reafirma o isolamento público: somente as RPCs deliberadamente expostas
-- continuam disponíveis para visitantes e usuários autenticados.
revoke all on table public.platform_school_applications from public, anon, authenticated;
revoke all on table public.platform_payment_subscriptions from public, anon, authenticated;
revoke all on table public.platform_payment_events from public, anon, authenticated;

commit;
