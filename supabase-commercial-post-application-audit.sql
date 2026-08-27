-- CARÔMETRO COMERCIAL — AUDITORIA PÓS-APLICAÇÃO SOMENTE LEITURA
-- Executar futuramente apenas no projeto separado de homologação.
-- Não cria, altera ou remove registros ou objetos.

-- 1. Objetos obrigatórios e RLS.
with required_tables(table_name) as (
  values
    ('schools'), ('school_members'), ('school_member_permissions'),
    ('school_invitations'), ('school_subscriptions'), ('platform_admins'),
    ('platform_account_access'), ('platform_audit_log'), ('profiles'),
    ('user_permissions'), ('classes'), ('students'),
    ('student_occurrences'), ('class_counselors'), ('observation_options'),
    ('user_favorite_classes'), ('user_notifications'),
    ('report_generation_log'), ('push_subscriptions')
)
select
  r.table_name,
  (c.oid is not null) as exists_in_public,
  coalesce(c.relrowsecurity, false) as rls_enabled
from required_tables r
left join pg_class c
  on c.relname = r.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by r.table_name;

-- 2. RPCs obrigatórias e exposição efetiva por papel.
with required_functions(signature) as (
  values
    ('public.is_platform_owner()'),
    ('public.can_use_school(uuid)'),
    ('public.accept_school_invitation(uuid)'),
    ('public.create_school_invitation(uuid,text,text)'),
    ('public.cancel_school_invitation(uuid)'),
    ('public.get_invitation_preview(uuid)'),
    ('public.invitation_email_matches(uuid,text)'),
    ('public.list_school_member_directory_v2(uuid)'),
    ('public.set_school_member_permissions_batch(uuid,jsonb)'),
    ('public.configure_school_member_role(uuid,text,jsonb)'),
    ('public.platform_provision_school(text,text,text,numeric)'),
    ('public.platform_set_school_status(uuid,text)'),
    ('public.platform_set_subscription_status(uuid,text)'),
    ('public.platform_set_account_access(uuid,text)'),
    ('public.platform_dashboard_summary()'),
    ('public.platform_list_schools_with_counts()'),
    ('public.platform_list_audit(integer)'),
    ('public.report_students(uuid,text,uuid,uuid)'),
    ('public.report_occurrences(uuid,uuid[],date,date)'),
    ('public.log_report_generation(uuid,text,uuid,text,jsonb,date,date,integer)'),
    ('public.claim_push_subscription(text,text,text,text)'),
    ('public.can_receive_school_notification(uuid,uuid)')
)
select
  signature,
  to_regprocedure(signature) is not null as exists,
  case when to_regprocedure(signature) is null then null
       else has_function_privilege('anon', to_regprocedure(signature), 'execute') end as anon_can_execute,
  case when to_regprocedure(signature) is null then null
       else has_function_privilege('authenticated', to_regprocedure(signature), 'execute') end as authenticated_can_execute,
  case when to_regprocedure(signature) is null then null
       else has_function_privilege('service_role', to_regprocedure(signature), 'execute') end as service_role_can_execute
from required_functions
order by signature;

-- 2a. Nenhuma SECURITY DEFINER comercial pode conservar o EXECUTE implícito
-- do papel PUBLIC. As funções públicas de convite recebem grants específicos
-- para anon, e por isso esta consulta também deve retornar zero linhas.
select
  p.oid::regprocedure::text as publicly_executable_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('public', p.oid, 'execute')
order by 1;

-- 2b. O cliente autenticado precisa alcançar as tabelas antes de a RLS
-- aplicar as regras por escola. O resultado esperado é true em todas.
with client_tables(table_name) as (
  values
    ('profiles'), ('schools'), ('school_members'),
    ('school_member_permissions'), ('school_subscriptions'),
    ('classes'), ('students'), ('student_occurrences'),
    ('class_counselors'), ('observation_options'),
    ('user_favorite_classes'), ('user_notifications'),
    ('user_notification_shifts'), ('school_terms'),
    ('livro_revisa_deliveries'), ('user_permissions')
)
select
  table_name,
  has_table_privilege('authenticated', format('public.%I', table_name), 'select') as authenticated_can_select
from client_tables
order by table_name;

-- 2c. A Edge Function usa service_role e precisa alcançar as tabelas antes da
-- validação interna. O resultado esperado é true em todas.
with edge_tables(table_name) as (
  values ('push_subscriptions'), ('user_notifications'), ('school_members'),
         ('schools'), ('school_subscriptions'), ('platform_account_access')
)
select
  table_name,
  has_table_privilege('service_role', format('public.%I', table_name), 'select') as service_role_can_select
from edge_tables
order by table_name;

-- 2d. O webhook Push deve existir somente para INSERT em user_notifications.
-- Uma linha com fires_on_insert=true e os demais eventos=false é obrigatória.
select
  t.tgname as trigger_name,
  c.relname as table_name,
  (t.tgtype & 4) <> 0 as fires_on_insert,
  (t.tgtype & 16) <> 0 as fires_on_update,
  (t.tgtype & 8) <> 0 as fires_on_delete,
  not t.tgisinternal as is_user_trigger
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'user_notifications'
  and t.tgname = 'send_user_notification_push';

-- 3. SECURITY DEFINER sem search_path vazio. O resultado esperado é zero
-- linhas para as funções comerciais listadas no manifesto.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.proname in (
    'is_platform_owner', 'can_use_school', 'accept_school_invitation',
    'create_school_invitation', 'cancel_school_invitation',
    'get_invitation_preview', 'invitation_email_matches',
    'list_school_member_directory_v2', 'platform_provision_school',
    'platform_set_school_status', 'platform_set_subscription_status',
    'platform_set_account_access', 'platform_dashboard_summary',
    'platform_list_schools_with_counts',
    'platform_list_audit', 'report_students', 'report_occurrences',
    'log_report_generation', 'claim_push_subscription',
    'can_receive_school_notification',
    'create_class_notifications', 'notify_admins_and_coordinators',
    'notify_class_subscribers', 'notify_student_updated',
    'set_occurrence_responsible', 'lock_occurrence_identity',
    'ensure_school_member_permissions',
    'enforce_member_permission_effective_access',
    'enforce_student_school_scope', 'limit_student_field_updates',
    'enforce_occurrence_school_scope', 'enforce_counselor_school_scope',
    'validate_commercial_favorite_class_access',
    'resolve_authorized_observation_school', 'expire_school_invitations',
    'is_platform_admin', 'platform_list_schools',
    'platform_school_student_count', 'platform_school_user_count',
    'provision_school', 'set_school_member_status',
    'has_workflow_permission', 'is_carometro_admin', 'is_report_manager',
    'log_student_change', 'log_workflow_change',
    'set_school_member_permission', 'set_school_member_role'
  )
  and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'];

-- 4. Linhas escolares que ficaram sem escola após a migração. Todos os
-- totais devem ser zero.
select 'classes_without_school' as check_name, count(*) as invalid_rows
from public.classes where school_id is null
union all
select 'students_without_school', count(*)
from public.students where school_id is null
union all
select 'occurrences_without_school', count(*)
from public.student_occurrences where school_id is null
union all
select 'counselors_without_school', count(*)
from public.class_counselors where school_id is null
union all
select 'notifications_without_school', count(*)
from public.user_notifications where school_id is null;

-- 5. Integridade dos vínculos e permissões. Todos os totais devem ser zero.
select 'active_members_without_permission_row' as check_name, count(*) as invalid_rows
from public.school_members sm
left join public.school_member_permissions smp on smp.member_id = sm.id
where sm.status = 'active' and smp.member_id is null
union all
select 'members_without_auth_user', count(*)
from public.school_members sm
left join auth.users u on u.id = sm.user_id
where u.id is null
union all
select 'subscriptions_without_school', count(*)
from public.school_subscriptions ss
left join public.schools s on s.id = ss.school_id
where s.id is null;

-- 6. Confirma que produção não foi usada como destino por engano. O valor
-- precisa ser conferido com o project ref exibido no painel de homologação;
-- esta consulta deliberadamente não tenta acessar nenhum outro projeto.
select
  current_database() as database_name,
  current_user as executing_role,
  now() as audited_at;
