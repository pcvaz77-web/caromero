begin;

-- Frequencia da Secretaria e a funcao central desse papel. Contas novas
-- recebem somente este acesso; todas as demais permissoes continuam falsas.
create or replace function public.reset_secretary_permissions(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.school_member_permissions (member_id)
  values (p_member_id)
  on conflict (member_id) do nothing;

  update public.school_member_permissions set
    can_add_students=false, can_edit_students=false, can_delete_students=false,
    can_edit_all=false, can_edit_photo=false, can_edit_name=false,
    can_edit_class=false, can_edit_report=false,
    can_manage_observation_options=false, can_invite_teachers=false,
    can_manage_member_permissions=false, can_view_uniform=false,
    can_edit_uniform=false, can_mark_all_uniform_received=false,
    can_view_occurrences=false, can_register_occurrences=false,
    can_edit_occurrences=false, can_delete_occurrences=false,
    can_manage_counselors=false, can_view_dashboard=false,
    can_view_history=false, can_manage_alerts=false,
    can_record_followups=false, can_export_reports=false,
    can_use_bulk_actions=false, can_view_audit=false,
    can_view_class_summary=false, can_use_siap_assistant=false,
    can_import_siap_attendance=false,
    can_import_school_daily_attendance=true,
    can_receive_notifications=false, can_prepare_school_year=false,
    updated_at=now()
  where member_id=p_member_id;
end;
$function$;

revoke all on function public.reset_secretary_permissions(uuid)
from public, anon, authenticated;

-- Corrige imediatamente as contas Secretaria criadas depois da migration 127.
update public.school_member_permissions p
set can_import_school_daily_attendance=true, updated_at=now()
from public.school_members sm
where sm.id=p.member_id and sm.role='secretary' and sm.status='active';

commit;
