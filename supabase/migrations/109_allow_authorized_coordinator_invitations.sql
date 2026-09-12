begin;

create or replace function public.create_school_invitation(
  target_school_id uuid,
  target_email text,
  target_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_inviter_member_id uuid;
  v_inviter_role text;
  v_can_invite_teachers boolean := false;
  v_can_manage_members boolean := false;
  v_can_edit_all boolean := false;
  v_invitation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_email := lower(trim(target_email));
  if v_email = ''
     or length(v_email) > 320
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  if target_role not in ('coordinator', 'teacher') then
    raise exception 'Função de convite inválida.';
  end if;

  select sm.id, sm.role
    into v_inviter_member_id, v_inviter_role
  from public.school_members sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_inviter_member_id is null then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_inviter_role = 'school_admin' then
    null;
  elsif v_inviter_role = 'coordinator' then
    select
      coalesce(p.can_invite_teachers, false),
      coalesce(p.can_manage_member_permissions, false),
      coalesce(p.can_edit_all, false)
      into v_can_invite_teachers, v_can_manage_members, v_can_edit_all
    from public.school_member_permissions p
    where p.member_id = v_inviter_member_id;

    if not (v_can_edit_all or v_can_invite_teachers) then
      raise exception 'Você não possui permissão para enviar convites.';
    end if;

    if target_role = 'coordinator'
       and not (v_can_edit_all or (v_can_invite_teachers and v_can_manage_members)) then
      raise exception 'Você precisa das permissões de convite e gestão de professores para convidar um coordenador.';
    end if;
  else
    raise exception 'Você não possui permissão para enviar convites.';
  end if;

  if exists (
    select 1
    from public.school_members sm
    join auth.users u on u.id = sm.user_id
    where sm.school_id = target_school_id
      and lower(trim(u.email)) = v_email
  ) then
    raise exception 'Este usuário já pertence a esta escola.';
  end if;

  update public.school_invitations i
  set status = 'expired'
  where i.school_id = target_school_id
    and lower(trim(i.email)) = v_email
    and i.status = 'pending'
    and i.expires_at <= now();

  if exists (
    select 1
    from public.school_invitations i
    where i.school_id = target_school_id
      and lower(trim(i.email)) = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.';
  end if;

  begin
    insert into public.school_invitations (school_id, email, role, invited_by)
    values (target_school_id, v_email, target_role, auth.uid())
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.';
  end;

  return v_invitation_id;
end;
$function$;

revoke all on function public.create_school_invitation(uuid, text, text) from public;
revoke all on function public.create_school_invitation(uuid, text, text) from anon;
grant execute on function public.create_school_invitation(uuid, text, text) to authenticated;

comment on function public.create_school_invitation(uuid, text, text) is
  'Cria convite na escola ativa; coordenador só convida outro coordenador quando possui convite e gestão de professores, ou acesso total.';

commit;
