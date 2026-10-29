-- Secretaria pode gerir o catalogo de observacoes quando autorizada.
-- Altera somente policies e funcoes de autorizacao; nao altera registros existentes.
begin;
drop policy if exists "school_authorized_manage_observation_options" on public.observation_options;
create policy "school_authorized_manage_observation_options"
on public.observation_options for all to authenticated
using (
  public.is_school_admin(school_id) or exists (
    select 1 from public.school_members sm
    join public.school_member_permissions p on p.member_id = sm.id
    where sm.school_id = observation_options.school_id
      and sm.user_id = auth.uid() and sm.status = 'active'
      and sm.role in ('coordinator', 'secretary')
      and p.can_manage_observation_options = true
  )
)
with check (
  public.is_school_admin(school_id) or exists (
    select 1 from public.school_members sm
    join public.school_member_permissions p on p.member_id = sm.id
    where sm.school_id = observation_options.school_id
      and sm.user_id = auth.uid() and sm.status = 'active'
      and sm.role in ('coordinator', 'secretary')
      and p.can_manage_observation_options = true
  )
);

-- O coordenador ativo pode convidar os tres cargos.
-- A secretaria autorizada continua restrita a professores.
create or replace function public.create_school_invitation(target_school_id uuid,target_email text,target_role text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_email text; v_member_id uuid; v_role text; v_can_invite boolean := false; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  v_email:=lower(trim(target_email));
  if v_email='' or length(v_email)>320 or v_email!~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;
  if target_role not in ('coordinator','teacher','secretary') then raise exception 'Funcao de convite invalida.'; end if;
  select sm.id,sm.role into v_member_id,v_role from public.school_members sm
  where sm.school_id=target_school_id and sm.user_id=auth.uid() and sm.status='active' limit 1;
  if v_member_id is null then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_role='school_admin' then null;
  elsif v_role in ('coordinator','secretary') then
    if v_role='secretary' and target_role<>'teacher' then raise exception 'A secretaria so pode convidar professores.'; end if;
    select coalesce(p.can_invite_teachers,false) into v_can_invite
    from public.school_member_permissions p where p.member_id=v_member_id;
    if v_role='secretary' and not v_can_invite then raise exception 'Voce nao possui permissao para enviar convites.'; end if;
  else raise exception 'Voce nao possui permissao para enviar convites.';
  end if;
  if exists(select 1 from public.school_members sm join auth.users u on u.id=sm.user_id
    where sm.school_id=target_school_id and lower(trim(u.email))=v_email) then
    raise exception 'Este usuario ja pertence a esta escola.';
  end if;
  update public.school_invitations set status='expired'
  where school_id=target_school_id and lower(trim(email))=v_email
    and status='pending' and expires_at<=now();
  if exists(select 1 from public.school_invitations where school_id=target_school_id
    and lower(trim(email))=v_email and status='pending' and expires_at>now()) then
    raise exception 'Ja existe um convite valido pendente para este e-mail nesta escola.';
  end if;
  insert into public.school_invitations(school_id,email,role,invited_by)
  values(target_school_id,v_email,target_role,auth.uid()) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ja existe um convite valido pendente para este e-mail nesta escola.';
end;
$function$;
revoke all on function public.create_school_invitation(uuid,text,text) from public, anon;
grant execute on function public.create_school_invitation(uuid,text,text) to authenticated;

drop policy if exists "authorized_members_can_view_school_invitations" on public.school_invitations;
create policy "authorized_members_can_view_school_invitations"
on public.school_invitations for select to authenticated
using (
  public.is_school_admin(school_id) or exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=school_invitations.school_id
      and sm.user_id=auth.uid() and sm.status='active'
      and (sm.role='coordinator' or (sm.role='secretary' and p.can_invite_teachers=true and school_invitations.role='teacher'))
  )
);

create or replace function public.cancel_school_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_inv public.school_invitations%rowtype; v_member_id uuid; v_role text; v_can boolean:=false;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  select * into v_inv from public.school_invitations where id=invitation_id for update;
  if not found then raise exception 'Convite nao encontrado.'; end if;
  if v_inv.status<>'pending' then raise exception 'Este convite nao pode mais ser cancelado.'; end if;
  select sm.id,sm.role into v_member_id,v_role from public.school_members sm
  where sm.school_id=v_inv.school_id and sm.user_id=auth.uid() and sm.status='active' limit 1;
  if v_member_id is null then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_role='school_admin' then null;
  elsif v_role='coordinator' or (v_role='secretary' and v_inv.role='teacher') then
    select coalesce(p.can_invite_teachers,false) into v_can
    from public.school_member_permissions p where p.member_id=v_member_id;
    if v_role='secretary' and not v_can then raise exception 'Voce nao possui permissao para cancelar convites.'; end if;
  else raise exception 'Voce nao possui permissao para cancelar este convite.';
  end if;
  update public.school_invitations set status='cancelled' where id=v_inv.id;
end;
$function$;
revoke all on function public.cancel_school_invitation(uuid) from public, anon;
grant execute on function public.cancel_school_invitation(uuid) to authenticated;
commit;
