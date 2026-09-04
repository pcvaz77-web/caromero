-- Novos professores que aceitam convite recebem acesso de consulta ao Painel da Turma.
-- Nenhuma permissao existente e alterada; regras de edicao do mapeamento permanecem intactas.
-- Base: accept_school_invitation da migration 057. Conferir definicao em uso antes de aplicar.
begin;

create or replace function public.accept_school_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_user_id uuid;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_member_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select lower(trim(email)), email_confirmed_at
    into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    raise exception 'E-mail do usuário não encontrado.';
  end if;

  if v_email_confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de aceitar o convite.';
  end if;

  select *
    into v_invitation
  from public.school_invitations
  where token = invitation_token
  for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Este convite não está mais disponível.';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Este convite expirou.';
  end if;

  if lower(trim(v_invitation.email)) <> v_user_email then
    raise exception 'Este convite pertence a outro usuário.';
  end if;

  perform public.assert_school_staff_capacity(v_invitation.school_id);

  insert into public.school_members (
    school_id,
    user_id,
    role,
    status
  )
  values (
    v_invitation.school_id,
    v_user_id,
    v_invitation.role,
    'active'
  )
  on conflict (school_id, user_id)
  do nothing
  returning id into v_member_id;

  if v_member_id is null then
    raise exception 'Este usuário já pertence a esta escola.';
  end if;

  insert into public.school_member_permissions (member_id)
  values (v_member_id)
  on conflict (member_id) do nothing;

  if v_invitation.role = 'teacher' then
    update public.school_member_permissions
    set can_view_class_summary = true,
        can_view_occurrences = true,
        can_register_occurrences = true,
        updated_at = now()
    where member_id = v_member_id;
  end if;

  if v_invitation.role = 'coordinator' then
    update public.school_member_permissions
    set can_manage_counselors = true,
        updated_at = now()
    where member_id = v_member_id;
  end if;

  update public.school_invitations
  set
    status = 'accepted',
    accepted_at = now()
  where id = v_invitation.id;

  return v_member_id;
end;
$function$;

revoke all on function public.accept_school_invitation(uuid) from public;
revoke all on function public.accept_school_invitation(uuid) from anon;
grant execute on function public.accept_school_invitation(uuid) to authenticated;

commit;
