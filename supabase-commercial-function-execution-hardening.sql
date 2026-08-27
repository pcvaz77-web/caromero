-- CARÔMETRO COMERCIAL — privilégios explícitos de funções herdadas.
-- Aplicar somente no projeto comercial separado.

begin;

-- Funções SECURITY DEFINER herdadas das migrations iniciais não podem resolver
-- objetos por um schema mutável. Os corpos já qualificam explicitamente as
-- tabelas/funções usadas; o ajuste preserva o comportamento e elimina a busca
-- implícita em public.
alter function public.enforce_student_school_scope() set search_path to '';
alter function public.limit_student_field_updates() set search_path to '';
alter function public.enforce_occurrence_school_scope() set search_path to '';
alter function public.enforce_counselor_school_scope() set search_path to '';
alter function public.validate_commercial_favorite_class_access() set search_path to '';
alter function public.resolve_authorized_observation_school() set search_path to '';
alter function public.expire_school_invitations() set search_path to '';
alter function public.is_platform_admin() set search_path to '';
alter function public.platform_list_schools() set search_path to '';
alter function public.platform_school_student_count(uuid) set search_path to '';
alter function public.platform_school_user_count(uuid) set search_path to '';
alter function public.provision_school(text, text, uuid) set search_path to '';
alter function public.set_school_member_status(uuid, text) set search_path to '';
alter function public.has_workflow_permission(text) set search_path to '';
alter function public.is_carometro_admin() set search_path to '';
alter function public.is_report_manager() set search_path to '';
alter function public.log_student_change() set search_path to '';
alter function public.log_workflow_change() set search_path to '';
alter function public.set_school_member_permission(uuid, text, boolean) set search_path to '';
alter function public.set_school_member_role(uuid, text) set search_path to '';

-- Funções executadas exclusivamente por triggers nunca são RPCs do cliente.
revoke all on function public.enforce_student_school_scope()
from public, anon, authenticated;
revoke all on function public.limit_student_field_updates()
from public, anon, authenticated;
revoke all on function public.enforce_occurrence_school_scope()
from public, anon, authenticated;
revoke all on function public.enforce_counselor_school_scope()
from public, anon, authenticated;
revoke all on function public.validate_commercial_favorite_class_access()
from public, anon, authenticated;
revoke all on function public.set_occurrence_responsible()
from public, anon, authenticated;
revoke all on function public.lock_occurrence_identity()
from public, anon, authenticated;

-- Função de apoio usada por policies legadas. Não pode herdar o EXECUTE
-- público concedido por padrão pelo PostgreSQL.
revoke all on function public.has_workflow_permission(text) from public, anon;
grant execute on function public.has_workflow_permission(text)
to authenticated, service_role;

-- RPCs funcionais destinadas exclusivamente a sessões autenticadas.
revoke all on function public.restore_school_membership(uuid, uuid)
from public, anon;
grant execute on function public.restore_school_membership(uuid, uuid)
to authenticated, service_role;

revoke all on function public.upsert_school_terms_batch(
  uuid, integer, date, date, date, date, date, date, date, date
) from public, anon;
grant execute on function public.upsert_school_terms_batch(
  uuid, integer, date, date, date, date, date, date, date, date
) to authenticated, service_role;

-- Funções de trigger/event trigger nunca são APIs chamáveis pelo cliente.
revoke all on function public.log_student_change()
from public, anon, authenticated;
revoke all on function public.log_workflow_change()
from public, anon, authenticated;
revoke all on function public.rls_auto_enable()
from public, anon, authenticated;

commit;
