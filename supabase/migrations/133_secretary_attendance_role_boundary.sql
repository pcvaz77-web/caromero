-- CARÔMETRO COMERCIAL
-- A Frequência da Secretaria só pode ser importada pelo papel Secretaria.
-- Administrador e coordenador autorizado apenas controlam a permissão.

begin;

create or replace function public.set_secretary_daily_attendance_permission(
  target_member_id uuid,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;

  select * into v_target
  from public.school_members
  where id=target_member_id and status='active';
  if not found then raise exception 'Membro ativo nao encontrado.'; end if;
  if v_target.role<>'secretary' then
    raise exception 'A Frequencia da Secretaria so pode ser configurada para o perfil Secretaria.';
  end if;

  if not exists (
    select 1
    from public.school_members actor
    left join public.school_member_permissions permissions on permissions.member_id=actor.id
    where actor.school_id=v_target.school_id
      and actor.user_id=auth.uid()
      and actor.status='active'
      and (
        actor.role='school_admin'
        or (
          actor.role='coordinator'
          and coalesce(permissions.can_manage_member_permissions,false)
        )
      )
  ) then
    raise exception 'Sem permissao para configurar a Frequencia da Secretaria.';
  end if;

  insert into public.school_member_permissions(member_id)
  values(v_target.id)
  on conflict(member_id) do nothing;

  update public.school_member_permissions
  set can_import_school_daily_attendance=coalesce(permission_value,false),
      updated_at=now()
  where member_id=v_target.id;
end;
$function$;

revoke all on function public.set_secretary_daily_attendance_permission(uuid,boolean)
from public, anon;
grant execute on function public.set_secretary_daily_attendance_permission(uuid,boolean)
to authenticated;

alter function public.import_siap_school_daily_attendance(jsonb)
rename to import_siap_school_daily_attendance_internal;

revoke all on function public.import_siap_school_daily_attendance_internal(jsonb)
from public, anon, authenticated;

create function public.import_siap_school_daily_attendance(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'p_rows deve ser uma lista.'; end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) item
    where not exists (
      select 1
      from public.school_members sm
      join public.school_member_permissions permissions on permissions.member_id=sm.id
      where sm.school_id=(item->>'school_id')::uuid
        and sm.user_id=auth.uid()
        and sm.status='active'
        and sm.role='secretary'
        and coalesce(permissions.can_import_school_daily_attendance,false)
    )
  ) then
    raise exception 'Sem permissão para importar a Frequência da Secretaria.';
  end if;

  return public.import_siap_school_daily_attendance_internal(p_rows);
end;
$function$;

revoke all on function public.import_siap_school_daily_attendance(jsonb)
from public, anon;
grant execute on function public.import_siap_school_daily_attendance(jsonb)
to authenticated;

commit;
