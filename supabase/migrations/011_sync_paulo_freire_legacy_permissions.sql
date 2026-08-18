-- CARÔMETRO COMERCIAL
-- Ressincronização inicial: user_permissions -> school_members / school_member_permissions
-- Migration 011
--
-- ESCOPO: EXCLUSIVAMENTE o Colégio Estadual Paulo Freire
-- (slug = 'colegio-estadual-paulo-freire').
--
-- Objetivo:
-- user_permissions é hoje a única fonte viva do estado real de
-- acesso e permissões da Paulo Freire (todo ajuste feito pelo
-- administrador via app grava só ali). school_members e
-- school_member_permissions ficaram congelados no momento das
-- migrations 005/006 e não recebem mais nenhuma atualização.
-- Esta migration copia o estado atual de user_permissions para
-- dentro do sistema comercial, apenas para os vínculos da Paulo
-- Freire, sem tocar em nenhuma outra escola.
--
-- NÃO cria usuários. NÃO cria escolas. NÃO altera alunos/turmas.
-- NÃO altera a coluna "role" de school_members (função/cargo).
-- NÃO altera platform_admins. NÃO altera RLS.
-- NÃO altera as permissões exclusivamente comerciais que não têm
-- correspondência seguraem user_permissions:
--   can_manage_observation_options, can_invite_teachers,
--   can_manage_member_permissions.
--
-- Direção única de sincronização:
--   user_permissions  ->  school_members / school_member_permissions
-- Nunca o contrário.
--
-- Idempotente: pode ser executada mais de uma vez sem efeito
-- colateral. Cada UPDATE só grava quando o valor realmente muda
-- (is distinct from), então updated_at só avança quando há
-- diferença de fato.

begin;


-- ============================================================
-- 1. STATUS DO VÍNCULO (school_members.status)
-- ============================================================
--
-- Copia user_permissions.access_status para school_members.status,
-- somente para vínculos da Paulo Freire.

update public.school_members sm
set
  status = up.access_status,
  updated_at = now()
from public.user_permissions up
join public.schools s
  on s.slug = 'colegio-estadual-paulo-freire'
where sm.user_id = up.user_id
  and sm.school_id = s.id
  and sm.status is distinct from up.access_status;


-- ============================================================
-- 2. PERMISSÕES (school_member_permissions)
-- ============================================================
--
-- Copia as 24 flags com correspondência direta em user_permissions,
-- somente para membros da Paulo Freire.
--
-- Preservadas sem alteração (não existem em user_permissions):
--   can_manage_observation_options, can_invite_teachers,
--   can_manage_member_permissions.

update public.school_member_permissions smp
set
  can_add_students             = up.can_add_students,
  can_edit_students            = up.can_edit_students,
  can_delete_students          = up.can_delete_students,
  can_edit_all                 = up.can_edit_all,
  can_edit_photo               = up.can_edit_photo,
  can_edit_name                = up.can_edit_name,
  can_edit_class                = up.can_edit_class,
  can_edit_report               = up.can_edit_report,
  can_view_uniform              = up.can_view_uniform,
  can_edit_uniform               = up.can_edit_uniform,
  can_mark_all_uniform_received  = up.can_mark_all_uniform_received,
  can_view_occurrences           = up.can_view_occurrences,
  can_register_occurrences       = up.can_register_occurrences,
  can_edit_occurrences           = up.can_edit_occurrences,
  can_delete_occurrences         = up.can_delete_occurrences,
  can_manage_counselors          = up.can_manage_counselors,
  can_view_dashboard             = up.can_view_dashboard,
  can_view_history                = up.can_view_history,
  can_manage_alerts               = up.can_manage_alerts,
  can_record_followups            = up.can_record_followups,
  can_export_reports              = up.can_export_reports,
  can_use_bulk_actions            = up.can_use_bulk_actions,
  can_view_audit                  = up.can_view_audit,
  can_view_class_summary          = up.can_view_class_summary,
  updated_at = now()
from public.school_members sm
join public.user_permissions up
  on up.user_id = sm.user_id
join public.schools s
  on s.id = sm.school_id
where smp.member_id = sm.id
  and s.slug = 'colegio-estadual-paulo-freire'
  and (
    smp.can_add_students is distinct from up.can_add_students
    or smp.can_edit_students is distinct from up.can_edit_students
    or smp.can_delete_students is distinct from up.can_delete_students
    or smp.can_edit_all is distinct from up.can_edit_all
    or smp.can_edit_photo is distinct from up.can_edit_photo
    or smp.can_edit_name is distinct from up.can_edit_name
    or smp.can_edit_class is distinct from up.can_edit_class
    or smp.can_edit_report is distinct from up.can_edit_report
    or smp.can_view_uniform is distinct from up.can_view_uniform
    or smp.can_edit_uniform is distinct from up.can_edit_uniform
    or smp.can_mark_all_uniform_received is distinct from up.can_mark_all_uniform_received
    or smp.can_view_occurrences is distinct from up.can_view_occurrences
    or smp.can_register_occurrences is distinct from up.can_register_occurrences
    or smp.can_edit_occurrences is distinct from up.can_edit_occurrences
    or smp.can_delete_occurrences is distinct from up.can_delete_occurrences
    or smp.can_manage_counselors is distinct from up.can_manage_counselors
    or smp.can_view_dashboard is distinct from up.can_view_dashboard
    or smp.can_view_history is distinct from up.can_view_history
    or smp.can_manage_alerts is distinct from up.can_manage_alerts
    or smp.can_record_followups is distinct from up.can_record_followups
    or smp.can_export_reports is distinct from up.can_export_reports
    or smp.can_use_bulk_actions is distinct from up.can_use_bulk_actions
    or smp.can_view_audit is distinct from up.can_view_audit
    or smp.can_view_class_summary is distinct from up.can_view_class_summary
  );


commit;
