-- Permite que a exclusão real de auth.users conclua as ações referenciais
-- internas sem enfraquecer as guardas comerciais para clientes da aplicação.
--
-- O GoTrue executa DELETE de usuário como session_user=supabase_auth_admin,
-- sem JWT/auth.uid(). A cascata remove school_member_permissions; além disso,
-- invited_by usa ON DELETE SET NULL e provoca um UPDATE técnico em convites
-- históricos. Os gatilhos comerciais anteriores confundiam essas operações
-- internas com uma escrita anônima e abortavam toda a exclusão do Auth.

begin;

create or replace function public.enforce_member_permission_effective_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_school_id uuid;
begin
  if tg_op = 'DELETE' then
    v_member_id := old.member_id;
  else
    v_member_id := new.member_id;
  end if;

  -- Única operação adicional autorizada: DELETE interno provocado pela
  -- cascata de auth.users. "authenticator" (anon/authenticated) e chamadas
  -- service_role via PostgREST não assumem este session_user.
  if tg_op = 'DELETE'
     and auth.uid() is null
     and session_user = 'supabase_auth_admin' then
    return old;
  end if;

  if auth.role() = 'service_role'
     or public.is_platform_owner()
     or (auth.uid() is null and session_user in ('postgres', 'supabase_admin')) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select sm.school_id
    into v_school_id
  from public.school_members sm
  where sm.id = v_member_id;

  if v_school_id is null
     or not public.is_active_school_member(v_school_id) then
    raise exception 'O acesso a esta escola está suspenso ou indisponível.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

revoke all on function public.enforce_member_permission_effective_access() from public;
revoke all on function public.enforce_member_permission_effective_access() from anon;
revoke all on function public.enforce_member_permission_effective_access() from authenticated;

create or replace function public.enforce_invitation_effective_school_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- ON DELETE SET NULL de school_invitations.invited_by é a única alteração
  -- interna do auth admin aceita. Todas as demais colunas precisam permanecer
  -- byte-a-byte equivalentes, inclusive status, token, e-mail e escola.
  if tg_op = 'UPDATE'
     and auth.uid() is null
     and session_user = 'supabase_auth_admin'
     and old.invited_by is not null
     and new.invited_by is null
     and (to_jsonb(new) - 'invited_by') = (to_jsonb(old) - 'invited_by') then
    return new;
  end if;

  if auth.role() = 'service_role' or public.is_platform_owner() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'expired'
     and old.expires_at <= now()
     and new.school_id = old.school_id then
    return new;
  end if;

  if auth.uid() is null
     or not public.is_active_school_member(new.school_id) then
    raise exception 'O acesso a esta escola está suspenso ou indisponível.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_invitation_effective_school_access() from public;
revoke all on function public.enforce_invitation_effective_school_access() from anon;
revoke all on function public.enforce_invitation_effective_school_access() from authenticated;

commit;
