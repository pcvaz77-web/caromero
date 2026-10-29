-- Coordenadores so podem ver e cancelar convites dos tres cargos permitidos.
begin;
drop policy if exists "authorized_members_can_view_school_invitations" on public.school_invitations;
create policy "authorized_members_can_view_school_invitations"
on public.school_invitations for select to authenticated
using (
  public.is_school_admin(school_id) or exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=school_invitations.school_id
      and sm.user_id=auth.uid() and sm.status='active'
      and (
        (sm.role='coordinator' and school_invitations.role in ('coordinator','secretary','teacher'))
        or (sm.role='secretary' and p.can_invite_teachers=true and school_invitations.role='teacher')
      )
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
  elsif (v_role='coordinator' and v_inv.role in ('coordinator','secretary','teacher'))
    or (v_role='secretary' and v_inv.role='teacher') then
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
