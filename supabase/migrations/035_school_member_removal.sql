-- CARÔMETRO COMERCIAL
-- Remoção segura de um vínculo escolar, sem excluir a conta Auth.

begin;

create or replace function public.list_school_member_directory_v2(target_school_id uuid)
returns table (
  member_id uuid, user_id uuid, member_role text, member_status text,
  email text, full_name text,
  can_add_students boolean, can_edit_students boolean, can_delete_students boolean,
  can_edit_all boolean, can_edit_photo boolean, can_edit_name boolean,
  can_edit_class boolean, can_edit_report boolean,
  can_manage_observation_options boolean, can_invite_teachers boolean,
  can_manage_member_permissions boolean, can_view_uniform boolean,
  can_edit_uniform boolean, can_mark_all_uniform_received boolean,
  can_view_occurrences boolean, can_register_occurrences boolean,
  can_edit_occurrences boolean, can_delete_occurrences boolean,
  can_manage_counselors boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_is_admin boolean;
  v_can_manage_teachers boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_is_admin := public.is_school_admin(target_school_id);
  v_can_manage_teachers := public.can_manage_school_member_permissions(target_school_id);
  if target_school_id is null or not (v_is_admin or v_can_manage_teachers) then
    raise exception 'Você não possui permissão para listar membros desta escola.';
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
    and (v_is_admin or sm.role = 'teacher')
  order by
    case sm.status when 'active' then 0 else 1 end,
    coalesce(nullif(trim(pr.full_name), ''), pr.email, sm.user_id::text);
end;
$function$;

revoke all on function public.list_school_member_directory_v2(uuid) from public, anon;
grant execute on function public.list_school_member_directory_v2(uuid) to authenticated;

create or replace function public.set_school_member_status(
  target_member_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target public.school_members%rowtype;
  v_actor public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if new_status not in ('active', 'suspended') then raise exception 'Status inválido.'; end if;

  select * into v_target from public.school_members where id = target_member_id for update;
  if not found then raise exception 'Membro não encontrado.'; end if;

  select * into v_actor
  from public.school_members
  where school_id = v_target.school_id and user_id = auth.uid() and status = 'active'
  limit 1;
  if not found or not public.is_active_school_member(v_target.school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;
  if v_actor.id = v_target.id then raise exception 'Você não pode alterar seu próprio status.'; end if;
  if v_target.role = 'school_admin' then raise exception 'Administradores não podem ser alterados por esta função.'; end if;

  if v_actor.role = 'school_admin' then
    null;
  elsif v_actor.role = 'coordinator'
    and v_target.role = 'teacher'
    and public.can_manage_school_member_permissions(v_target.school_id) then
    null;
  else
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  update public.school_members
  set status = new_status, updated_at = now()
  where id = v_target.id;
end;
$function$;

revoke all on function public.set_school_member_status(uuid, text) from public, anon;
grant execute on function public.set_school_member_status(uuid, text) to authenticated;

create or replace function public.remove_school_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target public.school_members%rowtype;
  v_actor public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_target from public.school_members where id = target_member_id for update;
  if not found then raise exception 'Membro não encontrado.'; end if;

  select * into v_actor
  from public.school_members
  where school_id = v_target.school_id and user_id = auth.uid() and status = 'active'
  limit 1;
  if not found or not public.is_active_school_member(v_target.school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;
  if v_actor.id = v_target.id then raise exception 'Você não pode remover seu próprio vínculo.'; end if;
  if v_target.role = 'school_admin' then raise exception 'O administrador principal não pode ser removido por este fluxo.'; end if;

  if v_actor.role = 'school_admin' then
    null;
  elsif v_actor.role = 'coordinator'
    and v_target.role = 'teacher'
    and public.can_manage_school_member_permissions(v_target.school_id) then
    null;
  else
    raise exception 'Você não possui permissão para remover este membro.';
  end if;

  -- A FK de school_member_permissions remove somente as permissões deste
  -- vínculo. A conta Auth, outros vínculos e registros escolares permanecem.
  delete from public.school_members where id = v_target.id;
end;
$function$;

revoke all on function public.remove_school_member(uuid) from public, anon;
grant execute on function public.remove_school_member(uuid) to authenticated;

commit;
