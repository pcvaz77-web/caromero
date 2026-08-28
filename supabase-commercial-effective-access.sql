-- CARÔMETRO COMERCIAL
-- Controle efetivo de acesso às escolas.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.
--
-- Objetivos:
--   * impedir acesso quando a escola estiver suspensa;
--   * impedir acesso quando a assinatura estiver suspensa, expirada ou vencida;
--   * respeitar a suspensão global já registrada em user_permissions;
--   * manter compatibilidade com novos usuários comerciais, cuja autoridade
--     escolar está em school_members/school_member_permissions e que podem não
--     possuir uma linha na tabela legada user_permissions.

begin;

create or replace function public.has_active_platform_account()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    auth.uid() is not null
    and not exists (
      select 1
      from public.platform_account_access paa
      where paa.user_id = auth.uid()
        and paa.status = 'suspended'
    );
$function$;

revoke all on function public.has_active_platform_account() from public;
revoke all on function public.has_active_platform_account() from anon;
grant execute on function public.has_active_platform_account() to authenticated;

create or replace function public.is_school_active(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.schools s
    where s.id = target_school_id
      and s.status = 'active'
  );
$function$;

revoke all on function public.is_school_active(uuid) from public;
revoke all on function public.is_school_active(uuid) from anon;
grant execute on function public.is_school_active(uuid) to authenticated;

create or replace function public.has_active_school_subscription(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.school_subscriptions ss
    where ss.school_id = target_school_id
      and ss.status = 'active'
      and (
        ss.grant_expires_at is null
        or ss.grant_expires_at > now()
      )
  );
$function$;

revoke all on function public.has_active_school_subscription(uuid) from public;
revoke all on function public.has_active_school_subscription(uuid) from anon;
grant execute on function public.has_active_school_subscription(uuid) to authenticated;

-- Esta é a função usada pelas policies comerciais. Ela não concede ao
-- proprietário da plataforma acesso operacional implícito aos dados escolares.
create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    public.has_active_platform_account()
    and public.is_school_active(target_school_id)
    and public.has_active_school_subscription(target_school_id)
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
    );
$function$;

revoke all on function public.is_active_school_member(uuid) from public;
revoke all on function public.is_active_school_member(uuid) from anon;
grant execute on function public.is_active_school_member(uuid) to authenticated;

-- Mantém o nome introduzido pela migration 007, mas sem o atalho que permitia
-- ao proprietário ler dados operacionais de qualquer escola.
create or replace function public.can_access_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.is_active_school_member(target_school_id);
$function$;

revoke all on function public.can_access_school(uuid) from public;
revoke all on function public.can_access_school(uuid) from anon;
grant execute on function public.can_access_school(uuid) to authenticated;

create or replace function public.can_use_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.is_active_school_member(target_school_id);
$function$;

revoke all on function public.can_use_school(uuid) from public;
revoke all on function public.can_use_school(uuid) from anon;
grant execute on function public.can_use_school(uuid) to authenticated;

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role = 'school_admin'
        and sm.status = 'active'
    );
$function$;

revoke all on function public.is_school_admin(uuid) from public;
revoke all on function public.is_school_admin(uuid) from anon;
grant execute on function public.is_school_admin(uuid) to authenticated;

create or replace function public.is_school_coordinator(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role = 'coordinator'
        and sm.status = 'active'
    );
$function$;

revoke all on function public.is_school_coordinator(uuid) from public;
revoke all on function public.is_school_coordinator(uuid) from anon;
grant execute on function public.is_school_coordinator(uuid) to authenticated;

-- Centraliza também as decisões por permissão. Assim, uma função ou policy
-- que consulte uma permissão não continua operando depois do bloqueio efetivo.
create or replace function public.has_school_permission(
  target_school_id uuid,
  permission_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_role text;
  v_allowed boolean := false;
begin
  if not public.is_active_school_member(target_school_id) then
    return false;
  end if;

  select sm.id, sm.role
    into v_member_id, v_role
  from public.school_members sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_member_id is null then
    return false;
  end if;

  if v_role = 'school_admin' then
    return true;
  end if;

  if permission_name not in (
    'can_add_students',
    'can_edit_students',
    'can_delete_students',
    'can_edit_all',
    'can_edit_photo',
    'can_edit_name',
    'can_edit_class',
    'can_edit_report',
    'can_manage_observation_options',
    'can_invite_teachers',
    'can_manage_member_permissions',
    'can_view_uniform',
    'can_edit_uniform',
    'can_mark_all_uniform_received',
    'can_view_occurrences',
    'can_register_occurrences',
    'can_edit_occurrences',
    'can_delete_occurrences',
    'can_manage_counselors',
    'can_view_dashboard',
    'can_view_history',
    'can_manage_alerts',
    'can_record_followups',
    'can_export_reports',
    'can_use_bulk_actions',
    'can_view_audit',
    'can_view_class_summary'
  ) then
    return false;
  end if;

  select coalesce((to_jsonb(p) ->> permission_name)::boolean, false)
    into v_allowed
  from public.school_member_permissions p
  where p.member_id = v_member_id;

  return coalesce(v_allowed, false);
end;
$function$;

revoke all on function public.has_school_permission(uuid, text) from public;
revoke all on function public.has_school_permission(uuid, text) from anon;
grant execute on function public.has_school_permission(uuid, text) to authenticated;

create or replace function public.can_manage_school_member_permissions(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.school_members sm
      join public.school_member_permissions p on p.member_id = sm.id
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role = 'coordinator'
        and sm.status = 'active'
        and p.can_manage_member_permissions = true
    );
$function$;

revoke all on function public.can_manage_school_member_permissions(uuid) from public;
revoke all on function public.can_manage_school_member_permissions(uuid) from anon;
grant execute on function public.can_manage_school_member_permissions(uuid) to authenticated;

create or replace function public.is_member_of_administered_school(
  target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.school_members target
    join public.school_members admin_member
      on admin_member.school_id = target.school_id
    where target.id = target_member_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'school_admin'
      and admin_member.status = 'active'
      and public.is_active_school_member(target.school_id)
  );
$function$;

revoke all on function public.is_member_of_administered_school(uuid) from public;
revoke all on function public.is_member_of_administered_school(uuid) from anon;
grant execute on function public.is_member_of_administered_school(uuid) to authenticated;

-- RPCs de permissões usam SECURITY DEFINER. O gatilho impede que uma RPC
-- válida continue gravando se a conta, escola ou assinatura foi suspensa.
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

  -- Manutenção executada diretamente pelo proprietário do banco (por exemplo,
  -- durante o lote comercial) não possui JWT/auth.uid(). session_user continua
  -- sendo "authenticator" nas chamadas anon/authenticated, portanto clientes
  -- não obtêm este bypass.
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

drop trigger if exists enforce_member_permission_effective_access
on public.school_member_permissions;

create trigger enforce_member_permission_effective_access
before insert or update or delete on public.school_member_permissions
for each row
execute function public.enforce_member_permission_effective_access();

-- As RPCs de convite são SECURITY DEFINER. Este gatilho constitui uma segunda
-- barreira no ponto de escrita e impede criar, aceitar ou cancelar convites
-- quando o acesso comercial à escola estiver bloqueado. Operações internas com
-- service_role continuam disponíveis para manutenção controlada da plataforma.
create or replace function public.enforce_invitation_effective_school_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- O proprietário da plataforma também bypassa: ele precisa poder inserir o
  -- convite school_admin de uma escola recém-criada, onde nunca é membro.
  -- Mesma exceção já existente no trigger irmão
  -- (enforce_member_permission_effective_access), aplicada aqui pela mesma
  -- razão.
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

drop trigger if exists enforce_invitation_effective_school_access
on public.school_invitations;

create trigger enforce_invitation_effective_school_access
before insert or update on public.school_invitations
for each row
execute function public.enforce_invitation_effective_school_access();

-- Funções de gatilho não são endpoints da aplicação.
revoke all on function public.enforce_student_school_scope()
from public, anon, authenticated;
revoke all on function public.limit_student_field_updates()
from public, anon, authenticated;
revoke all on function public.enforce_occurrence_school_scope()
from public, anon, authenticated;
revoke all on function public.enforce_counselor_school_scope()
from public, anon, authenticated;

commit;
