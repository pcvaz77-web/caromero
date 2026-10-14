-- A administração decide, por escola e por coordenador, quem gerencia o Portal da Família.
-- NULL mantém o acesso padrão dos coordenadores atuais e recém-promovidos;
-- false registra uma revogação explícita. Professores e Secretaria nunca recebem acesso.
begin;

alter table public.school_member_permissions
  add column if not exists can_manage_family_portal boolean default null;

comment on column public.school_member_permissions.can_manage_family_portal is
  'NULL: acesso padrão para coordenador; FALSE: revogado pela administração; TRUE: liberado explicitamente. O papel continua obrigatório.';

create or replace function public.family_school_manager(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members m
    join public.schools s on s.id = m.school_id
    left join public.school_member_permissions p on p.member_id = m.id
    where m.school_id = p_school_id and m.user_id = auth.uid()
      and m.status = 'active' and s.status = 'active'
      and (m.role = 'school_admin'
        or (m.role = 'coordinator' and coalesce(p.can_manage_family_portal, true)))
  );
$$;
revoke all on function public.family_school_manager(uuid) from public, anon;
grant execute on function public.family_school_manager(uuid) to authenticated;

create or replace function public.set_family_portal_permission(target_member_id uuid, permitted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null or target_member_id is null or permitted is null then
    raise exception 'Solicitação inválida.' using errcode = '22023';
  end if;

  select * into v_target from public.school_members
  where id = target_member_id and role = 'coordinator' and status = 'active';
  if not found then
    raise exception 'Coordenador ativo não encontrado.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.school_members actor
    join public.schools s on s.id = actor.school_id
    where actor.school_id = v_target.school_id and actor.user_id = auth.uid()
      and actor.role = 'school_admin' and actor.status = 'active' and s.status = 'active'
  ) then
    raise exception 'Somente a administração desta escola pode alterar esta permissão.' using errcode = '42501';
  end if;

  insert into public.school_member_permissions (member_id, can_manage_family_portal)
  values (v_target.id, permitted)
  on conflict (member_id) do update
    set can_manage_family_portal = excluded.can_manage_family_portal, updated_at = now();
end;
$$;
revoke all on function public.set_family_portal_permission(uuid, boolean) from public, anon;
grant execute on function public.set_family_portal_permission(uuid, boolean) to authenticated;

commit;
