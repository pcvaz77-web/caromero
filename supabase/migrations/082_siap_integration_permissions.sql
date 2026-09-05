-- CARÔMETRO COMERCIAL
-- Etapa 1 da integração SIAP: permissões explícitas e isoladas por escola.
-- Esta migration não importa frequência, não cria tabela de frequência e não
-- altera permissões existentes. As novas permissões começam desativadas.

begin;

alter table public.school_member_permissions
  add column if not exists can_use_siap_assistant boolean not null default false,
  add column if not exists can_import_siap_attendance boolean not null default false;

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

  if not exists (
    select 1
    from public.school_members actor
    where actor.school_id = v_target.school_id
      and actor.user_id = auth.uid()
      and actor.status = 'active'
      and actor.role = 'school_admin'
  ) then
    raise exception 'Somente o administrador da escola pode alterar permissões do SIAP.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'As permissões do administrador são determinadas pelo papel.';
  end if;

  if permission_name not in ('can_use_siap_assistant', 'can_import_siap_attendance') then
    raise exception 'Permissão do SIAP inválida.';
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

comment on column public.school_member_permissions.can_use_siap_assistant is
  'Permite exibir o acesso controlado ao Assistente SIAP no Painel da Turma.';
comment on column public.school_member_permissions.can_import_siap_attendance is
  'Habilita a preparação da importação de frequência; o acesso final também exige ser conselheiro da turma ou gestão.';

commit;
