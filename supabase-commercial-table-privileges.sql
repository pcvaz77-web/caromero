-- CARÔMETRO COMERCIAL
-- Privilégios mínimos de tabela para o cliente autenticado.
-- A autorização de linha e de operação continua integralmente nas policies RLS.

begin;

grant usage on schema public to authenticated, service_role;

revoke all on table
  public.cancelled_logins,
  public.class_counselors,
  public.classes,
  public.livro_revisa_deliveries,
  public.observation_options,
  public.platform_account_access,
  public.platform_admins,
  public.platform_audit_log,
  public.platform_settings,
  public.profiles,
  public.push_subscriptions,
  public.report_generation_log,
  public.school_invitations,
  public.school_member_permissions,
  public.school_members,
  public.school_subscriptions,
  public.school_terms,
  public.schools,
  public.student_activity,
  public.student_alerts,
  public.student_followups,
  public.student_occurrences,
  public.students,
  public.user_favorite_classes,
  public.user_notification_shifts,
  public.user_notifications,
  public.user_permissions
from public, anon;

grant select, insert, update, delete on table
  public.cancelled_logins,
  public.class_counselors,
  public.classes,
  public.livro_revisa_deliveries,
  public.observation_options,
  public.platform_account_access,
  public.platform_admins,
  public.platform_audit_log,
  public.platform_settings,
  public.profiles,
  public.push_subscriptions,
  public.report_generation_log,
  public.school_invitations,
  public.school_member_permissions,
  public.school_members,
  public.school_subscriptions,
  public.school_terms,
  public.schools,
  public.student_activity,
  public.student_alerts,
  public.student_followups,
  public.student_occurrences,
  public.students,
  public.user_favorite_classes,
  public.user_notification_shifts,
  public.user_notifications,
  public.user_permissions
to authenticated, service_role;

commit;
