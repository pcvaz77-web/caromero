-- CAROMETRO + ASSISTENTE SIAP
-- Permissões mínimas para as Edge Functions de checkout, webhook e lembretes.
-- Não altera nem remove dados.

begin;

grant select on table public.platform_school_applications to service_role;
grant select on table public.platform_plans to service_role;
grant select, insert, update on table public.platform_payment_subscriptions to service_role;
grant select, insert, update on table public.platform_payment_events to service_role;
grant select, update on table public.school_subscriptions to service_role;

grant select on table public.siap_assistant_plans to service_role;
grant select, insert, update on table public.siap_assistant_licenses to service_role;
grant select, insert, update on table public.siap_assistant_payment_subscriptions to service_role;
grant select, insert, update on table public.siap_assistant_payment_events to service_role;
grant select, insert, update on table public.siap_assistant_reminder_deliveries to service_role;

grant select on table public.hotmart_product_mappings to service_role;
grant select, insert, update on table public.hotmart_webhook_events to service_role;

commit;
