begin;

-- A Edge Function consulta o histórico de elegibilidade e registra os usos
-- gratuitos com a chave service_role. RLS continua ativo para outros papéis.
grant select on table public.siap_assistant_email_eligibility to service_role;
grant select, insert, update on table public.siap_assistant_free_usage to service_role;

commit;
