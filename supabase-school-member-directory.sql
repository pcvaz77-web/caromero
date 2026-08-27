-- CARÔMETRO COMERCIAL
-- Diretório de membros e permissões limitado à escola administrada.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

create or replace function public.list_school_member_directory(target_school_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  member_role text,
  email text,
  full_name text,
  can_add_students boolean,
  can_edit_students boolean,
  can_delete_students boolean,
  can_edit_all boolean,
  can_edit_photo boolean,
  can_edit_name boolean,
  can_edit_class boolean,
  can_edit_report boolean,
  can_manage_observation_options boolean,
  can_invite_teachers boolean,
  can_manage_member_permissions boolean,
  can_view_uniform boolean,
  can_edit_uniform boolean,
  can_mark_all_uniform_received boolean,
  can_view_occurrences boolean,
  can_register_occurrences boolean,
  can_edit_occurrences boolean,
  can_delete_occurrences boolean,
  can_manage_counselors boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if target_school_id is null or not public.is_school_admin(target_school_id) then
    raise exception 'Somente o administrador ativo desta escola pode listar seus membros.';
  end if;

  return query
  select
    sm.id,
    sm.user_id,
    sm.role,
    pr.email::text,
    pr.full_name::text,
    coalesce(smp.can_add_students, false),
    coalesce(smp.can_edit_students, false),
    coalesce(smp.can_delete_students, false),
    coalesce(smp.can_edit_all, false),
    coalesce(smp.can_edit_photo, false),
    coalesce(smp.can_edit_name, false),
    coalesce(smp.can_edit_class, false),
    coalesce(smp.can_edit_report, false),
    coalesce(smp.can_manage_observation_options, false),
    coalesce(smp.can_invite_teachers, false),
    coalesce(smp.can_manage_member_permissions, false),
    coalesce(smp.can_view_uniform, false),
    coalesce(smp.can_edit_uniform, false),
    coalesce(smp.can_mark_all_uniform_received, false),
    coalesce(smp.can_view_occurrences, false),
    coalesce(smp.can_register_occurrences, false),
    coalesce(smp.can_edit_occurrences, false),
    coalesce(smp.can_delete_occurrences, false),
    coalesce(smp.can_manage_counselors, false)
  from public.school_members sm
  left join public.school_member_permissions smp on smp.member_id = sm.id
  left join public.profiles pr on pr.id = sm.user_id
  where sm.school_id = target_school_id
    and sm.status = 'active'
  order by coalesce(nullif(trim(pr.full_name), ''), pr.email, sm.user_id::text);
end;
$function$;

revoke all on function public.list_school_member_directory(uuid) from public;
revoke all on function public.list_school_member_directory(uuid) from anon;
grant execute on function public.list_school_member_directory(uuid) to authenticated;

-- Versão comercial com o status do vínculo. Mantém a assinatura anterior para
-- compatibilidade e permite que o administrador encontre e reative membros
-- suspensos sem ampliar o acesso deles aos dados escolares.
create or replace function public.list_school_member_directory_v2(target_school_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  member_role text,
  member_status text,
  email text,
  full_name text,
  can_add_students boolean,
  can_edit_students boolean,
  can_delete_students boolean,
  can_edit_all boolean,
  can_edit_photo boolean,
  can_edit_name boolean,
  can_edit_class boolean,
  can_edit_report boolean,
  can_manage_observation_options boolean,
  can_invite_teachers boolean,
  can_manage_member_permissions boolean,
  can_view_uniform boolean,
  can_edit_uniform boolean,
  can_mark_all_uniform_received boolean,
  can_view_occurrences boolean,
  can_register_occurrences boolean,
  can_edit_occurrences boolean,
  can_delete_occurrences boolean,
  can_manage_counselors boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if target_school_id is null or not public.is_school_admin(target_school_id) then
    raise exception 'Somente o administrador ativo desta escola pode listar seus membros.';
  end if;

  return query
  select
    sm.id, sm.user_id, sm.role, sm.status,
    pr.email::text, pr.full_name::text,
    coalesce(smp.can_add_students, false),
    coalesce(smp.can_edit_students, false),
    coalesce(smp.can_delete_students, false),
    coalesce(smp.can_edit_all, false),
    coalesce(smp.can_edit_photo, false),
    coalesce(smp.can_edit_name, false),
    coalesce(smp.can_edit_class, false),
    coalesce(smp.can_edit_report, false),
    coalesce(smp.can_manage_observation_options, false),
    coalesce(smp.can_invite_teachers, false),
    coalesce(smp.can_manage_member_permissions, false),
    coalesce(smp.can_view_uniform, false),
    coalesce(smp.can_edit_uniform, false),
    coalesce(smp.can_mark_all_uniform_received, false),
    coalesce(smp.can_view_occurrences, false),
    coalesce(smp.can_register_occurrences, false),
    coalesce(smp.can_edit_occurrences, false),
    coalesce(smp.can_delete_occurrences, false),
    coalesce(smp.can_manage_counselors, false)
  from public.school_members sm
  left join public.school_member_permissions smp on smp.member_id = sm.id
  left join public.profiles pr on pr.id = sm.user_id
  where sm.school_id = target_school_id
  order by
    case sm.status when 'active' then 0 else 1 end,
    coalesce(nullif(trim(pr.full_name), ''), pr.email, sm.user_id::text);
end;
$function$;

revoke all on function public.list_school_member_directory_v2(uuid)
from public, anon;
grant execute on function public.list_school_member_directory_v2(uuid)
to authenticated;

commit;
