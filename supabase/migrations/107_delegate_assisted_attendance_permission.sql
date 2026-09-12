begin;

create or replace function public.set_school_member_siap_permission(
  target_member_id uuid,
  permission_name text,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.school_members%rowtype;
  v_actor public.school_members%rowtype;
  v_actor_can_manage boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_target
  from public.school_members
  where id = target_member_id;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  select actor.* into v_actor
  from public.school_members actor
  where actor.school_id = v_target.school_id
    and actor.user_id = auth.uid()
    and actor.status = 'active';

  if not found then
    raise exception 'Sem permissão nesta escola.';
  end if;

  select coalesce(rights.can_manage_member_permissions, false)
  into v_actor_can_manage
  from public.school_member_permissions rights
  where rights.member_id = v_actor.id;

  if permission_name = 'can_import_siap_attendance' then
    if v_actor.role = 'school_admin' then
      null;
    elsif v_actor.role = 'coordinator' and v_actor_can_manage then
      if v_target.role <> 'teacher' then
        raise exception 'O coordenador só pode liberar a Frequência Assistida para professores.';
      end if;
    else
      raise exception 'Somente o administrador ou coordenador autorizado pode alterar esta permissão.';
    end if;
  elsif permission_name = 'can_use_siap_assistant' then
    if v_actor.role <> 'school_admin' then
      raise exception 'Somente o administrador da escola pode alterar esta permissão do SIAP.';
    end if;
  else
    raise exception 'Permissão do SIAP inválida.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'As permissões do administrador são determinadas pelo papel.';
  end if;

  insert into public.school_member_permissions (member_id)
  values (v_target.id)
  on conflict (member_id) do nothing;

  if permission_name = 'can_use_siap_assistant' then
    update public.school_member_permissions
    set can_use_siap_assistant = permission_value,
        updated_at = now()
    where member_id = v_target.id;
  else
    update public.school_member_permissions
    set can_import_siap_attendance = permission_value,
        updated_at = now()
    where member_id = v_target.id;
  end if;
end;
$function$;

revoke all on function public.set_school_member_siap_permission(uuid, text, boolean) from public;
revoke all on function public.set_school_member_siap_permission(uuid, text, boolean) from anon;
grant execute on function public.set_school_member_siap_permission(uuid, text, boolean) to authenticated;

comment on function public.set_school_member_siap_permission(uuid, text, boolean) is
  'Administra permissões SIAP; administrador controla ambas e coordenador com gestão de membros controla somente Frequência Assistida de professores.';

commit;
