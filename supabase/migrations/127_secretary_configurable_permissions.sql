begin;

-- Secretaria nasce sem acessos opcionais. O administrador pode liberar cada
-- capacidade separadamente; conselheiro de turma continua proibido pelo papel.
alter table public.school_member_permissions
  add column if not exists can_receive_notifications boolean not null default false;

comment on column public.school_member_permissions.can_receive_notifications is
  'Permite que um membro com papel Secretaria receba e consulte notificacoes da escola.';

create or replace function public.enforce_secretary_restricted_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.school_members sm
    where sm.id = new.member_id and sm.role = 'secretary'
  ) then
    -- Estes poderes pertencem a outros fluxos/papeis e nunca sao delegaveis
    -- para Secretaria. Todas as demais caixas permanecem configuraveis.
    new.can_manage_counselors := false;
    new.can_import_siap_attendance := false;
    new.can_use_siap_assistant := false;
    new.can_prepare_school_year := false;
  else
    new.can_receive_notifications := false;
    new.can_import_school_daily_attendance := false;
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_secretary_restricted_permissions on public.school_member_permissions;
create trigger enforce_secretary_restricted_permissions
before insert or update on public.school_member_permissions
for each row execute function public.enforce_secretary_restricted_permissions();

create or replace function public.reset_secretary_permissions(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.school_member_permissions (member_id)
  values (p_member_id)
  on conflict (member_id) do nothing;

  update public.school_member_permissions set
    can_add_students=false, can_edit_students=false, can_delete_students=false,
    can_edit_all=false, can_edit_photo=false, can_edit_name=false,
    can_edit_class=false, can_edit_report=false,
    can_manage_observation_options=false, can_invite_teachers=false,
    can_manage_member_permissions=false, can_view_uniform=false,
    can_edit_uniform=false, can_mark_all_uniform_received=false,
    can_view_occurrences=false, can_register_occurrences=false,
    can_edit_occurrences=false, can_delete_occurrences=false,
    can_manage_counselors=false, can_view_dashboard=false,
    can_view_history=false, can_manage_alerts=false,
    can_record_followups=false, can_export_reports=false,
    can_use_bulk_actions=false, can_view_audit=false,
    can_view_class_summary=false, can_use_siap_assistant=false,
    can_import_siap_attendance=false,
    can_import_school_daily_attendance=false,
    can_receive_notifications=false, can_prepare_school_year=false,
    updated_at=now()
  where member_id=p_member_id;
end;
$function$;

revoke all on function public.reset_secretary_permissions(uuid) from public, anon, authenticated;

-- Alinhe os perfis Secretaria ja existentes ao novo padrao seguro.
do $block$
declare v_member_id uuid;
begin
  for v_member_id in
    select sm.id from public.school_members sm where sm.role='secretary'
  loop
    perform public.reset_secretary_permissions(v_member_id);
  end loop;
end;
$block$;

create or replace function public.restrict_secretary_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op='INSERT' then
    if new.role='secretary' then
      perform public.reset_secretary_permissions(new.id);
      delete from public.class_counselors
      where school_id=new.school_id and counselor_user_id=new.user_id;
    end if;
  elsif new.role='secretary' and old.role is distinct from new.role then
    perform public.reset_secretary_permissions(new.id);
    delete from public.class_counselors
    where school_id=new.school_id and counselor_user_id=new.user_id;
  elsif old.role='secretary' and new.role<>'secretary' then
    update public.school_member_permissions
    set can_import_school_daily_attendance=false,
        can_receive_notifications=false,
        updated_at=now()
    where member_id=new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists restrict_secretary_member_role on public.school_members;
create trigger restrict_secretary_member_role
after insert or update of role on public.school_members
for each row execute function public.restrict_secretary_member_role();

delete from public.class_counselors cc
using public.school_members sm
where sm.school_id=cc.school_id
  and sm.user_id=cc.counselor_user_id
  and sm.role='secretary';

-- A RPC anterior marcava Frequencia da Secretaria automaticamente. Este
-- gatilho, executado ao final da aceitacao, garante o contrato "nada marcado".
create or replace function public.reset_new_secretary_invitation_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_member_id uuid;
begin
  if new.role='secretary' and new.status='accepted'
     and old.status is distinct from new.status then
    select sm.id into v_member_id
    from public.school_members sm
    where sm.school_id=new.school_id
      and sm.user_id=auth.uid()
      and sm.role='secretary'
    limit 1;
    if v_member_id is not null then
      perform public.reset_secretary_permissions(v_member_id);
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.reset_new_secretary_invitation_permissions() from public, anon, authenticated;
drop trigger if exists reset_new_secretary_invitation_permissions on public.school_invitations;
create trigger reset_new_secretary_invitation_permissions
after update of status on public.school_invitations
for each row execute function public.reset_new_secretary_invitation_permissions();

create or replace function public.can_manage_school_member_permissions(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.school_members sm
    join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=target_school_id
      and sm.user_id=auth.uid()
      and sm.role in ('coordinator','secretary')
      and sm.status='active'
      and p.can_manage_member_permissions=true
  );
$function$;

revoke all on function public.can_manage_school_member_permissions(uuid) from public, anon;
grant execute on function public.can_manage_school_member_permissions(uuid) to authenticated;

create or replace function public.set_school_member_permission(
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
  v_actor public.school_members%rowtype;
  v_target public.school_members%rowtype;
  v_actor_has_permission boolean := false;
  v_allowed_keys constant text[] := array[
    'can_add_students','can_edit_students','can_delete_students','can_edit_all',
    'can_edit_photo','can_edit_name','can_edit_class','can_edit_report',
    'can_manage_observation_options','can_invite_teachers','can_manage_member_permissions',
    'can_view_uniform','can_edit_uniform','can_mark_all_uniform_received',
    'can_view_occurrences','can_register_occurrences','can_edit_occurrences',
    'can_delete_occurrences','can_manage_counselors','can_view_dashboard',
    'can_view_history','can_manage_alerts','can_record_followups',
    'can_export_reports','can_use_bulk_actions','can_view_audit',
    'can_view_class_summary','can_import_school_daily_attendance',
    'can_receive_notifications'
  ];
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  if not (permission_name=any(v_allowed_keys)) then raise exception 'Permissao invalida.'; end if;

  select * into v_target from public.school_members where id=target_member_id;
  if not found then raise exception 'Membro nao encontrado.'; end if;
  select * into v_actor from public.school_members
  where school_id=v_target.school_id and user_id=auth.uid() and status='active' limit 1;
  if not found then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_actor.id=v_target.id then raise exception 'Voce nao pode alterar suas proprias permissoes.'; end if;
  if v_target.role='school_admin' then raise exception 'As permissoes do administrador sao determinadas pelo papel.'; end if;

  if v_actor.role='school_admin' then
    null;
  elsif v_actor.role in ('coordinator','secretary')
        and v_target.role='teacher'
        and public.can_manage_school_member_permissions(v_target.school_id) then
    if permission_value then
      execute pg_catalog.format(
        'select coalesce(%I,false) from public.school_member_permissions where member_id=$1',
        permission_name
      ) into v_actor_has_permission using v_actor.id;
      if not coalesce(v_actor_has_permission,false) then
        raise exception 'Voce nao pode conceder uma permissao que nao possui.';
      end if;
    end if;
  else
    raise exception 'Voce nao possui permissao para gerenciar este membro.';
  end if;

  if permission_value and v_target.role='teacher' and permission_name in (
    'can_manage_observation_options','can_invite_teachers',
    'can_manage_member_permissions','can_manage_counselors',
    'can_import_school_daily_attendance','can_receive_notifications'
  ) then
    raise exception 'Esta permissao nao pode ser concedida a professores.';
  end if;

  if permission_value and v_target.role='coordinator'
     and permission_name in ('can_import_school_daily_attendance','can_receive_notifications') then
    raise exception 'Esta permissao pertence ao perfil Secretaria.';
  end if;

  if permission_value and v_target.role='secretary'
     and permission_name='can_manage_counselors' then
    raise exception 'Secretaria nao pode gerenciar nem ser conselheiro de turma.';
  end if;

  insert into public.school_member_permissions(member_id) values(v_target.id)
  on conflict(member_id) do nothing;
  execute pg_catalog.format(
    'update public.school_member_permissions set %I=$1, updated_at=now() where member_id=$2',
    permission_name
  ) using coalesce(permission_value,false),v_target.id;
end;
$function$;

revoke all on function public.set_school_member_permission(uuid,text,boolean) from public, anon;
grant execute on function public.set_school_member_permission(uuid,text,boolean) to authenticated;

create or replace function public.set_school_member_permissions_batch(
  target_member_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item record;
  v_allowed_keys constant text[] := array[
    'can_add_students','can_edit_students','can_delete_students','can_edit_all',
    'can_edit_photo','can_edit_name','can_edit_class','can_edit_report',
    'can_manage_observation_options','can_invite_teachers','can_manage_member_permissions',
    'can_view_uniform','can_edit_uniform','can_mark_all_uniform_received',
    'can_view_occurrences','can_register_occurrences','can_edit_occurrences',
    'can_delete_occurrences','can_manage_counselors','can_view_dashboard',
    'can_view_history','can_manage_alerts','can_record_followups',
    'can_export_reports','can_use_bulk_actions','can_view_audit',
    'can_view_class_summary','can_import_school_daily_attendance',
    'can_receive_notifications'
  ];
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  if target_member_id is null or p_permissions is null
     or jsonb_typeof(p_permissions)<>'object' then
    raise exception 'Conjunto de permissoes invalido.';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_permissions))>cardinality(v_allowed_keys) then
    raise exception 'Conjunto de permissoes invalido.';
  end if;
  for v_item in select item.key,item.value from jsonb_each(p_permissions) item order by item.key loop
    if not(v_item.key=any(v_allowed_keys)) or jsonb_typeof(v_item.value)<>'boolean' then
      raise exception 'Permissao invalida: %.',v_item.key;
    end if;
    perform public.set_school_member_permission(
      target_member_id,v_item.key,(v_item.value#>>'{}')::boolean
    );
  end loop;
end;
$function$;

revoke all on function public.set_school_member_permissions_batch(uuid,jsonb) from public, anon;
grant execute on function public.set_school_member_permissions_batch(uuid,jsonb) to authenticated;

-- Administrador convida qualquer papel permitido. Coordenador/Secretaria com
-- permissao explicita convidam somente professores.
create or replace function public.create_school_invitation(target_school_id uuid,target_email text,target_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
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
    if target_role<>'teacher' then raise exception 'Este perfil so pode convidar professores.'; end if;
    select coalesce(p.can_invite_teachers,false) into v_can_invite
    from public.school_member_permissions p where p.member_id=v_member_id;
    if not v_can_invite then raise exception 'Voce nao possui permissao para convidar professores.'; end if;
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
  public.is_school_admin(school_id)
  or (
    role='teacher' and exists(
      select 1 from public.school_members sm
      join public.school_member_permissions p on p.member_id=sm.id
      where sm.school_id=school_invitations.school_id
        and sm.user_id=auth.uid() and sm.status='active'
        and sm.role in ('coordinator','secretary')
        and p.can_invite_teachers=true
    )
  )
);

create or replace function public.cancel_school_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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
  elsif v_role in ('coordinator','secretary') and v_inv.role='teacher' then
    select coalesce(p.can_invite_teachers,false) into v_can
    from public.school_member_permissions p where p.member_id=v_member_id;
    if not v_can then raise exception 'Voce nao possui permissao para cancelar convites.'; end if;
  else raise exception 'Voce nao possui permissao para cancelar este convite.';
  end if;
  update public.school_invitations set status='cancelled' where id=v_inv.id;
end;
$function$;

revoke all on function public.cancel_school_invitation(uuid) from public, anon;
grant execute on function public.cancel_school_invitation(uuid) to authenticated;

-- Secretaria autorizada a gerenciar professores recebe o mesmo alcance
-- restrito do coordenador: apenas vinculos de professor, nunca outros papeis.
create or replace function public.set_school_member_status(target_member_id uuid,new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_target public.school_members%rowtype; v_actor public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  if new_status not in ('active','suspended') then raise exception 'Status invalido.'; end if;
  select * into v_target from public.school_members where id=target_member_id for update;
  if not found then raise exception 'Membro nao encontrado.'; end if;
  select * into v_actor from public.school_members where school_id=v_target.school_id
    and user_id=auth.uid() and status='active' limit 1;
  if not found then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_actor.id=v_target.id then raise exception 'Voce nao pode alterar seu proprio status.'; end if;
  if v_target.role='school_admin' then raise exception 'Administradores nao podem ser alterados por esta funcao.'; end if;
  if v_actor.role='school_admin' then null;
  elsif v_actor.role in ('coordinator','secretary') and v_target.role='teacher'
    and public.can_manage_school_member_permissions(v_target.school_id) then null;
  else raise exception 'Voce nao possui permissao para alterar este membro.';
  end if;
  if new_status='active' and v_target.status<>'active' then
    perform public.assert_school_staff_capacity(v_target.school_id);
  end if;
  update public.school_members set status=new_status,updated_at=now() where id=v_target.id;
end;
$function$;

revoke all on function public.set_school_member_status(uuid,text) from public, anon;
grant execute on function public.set_school_member_status(uuid,text) to authenticated;

create or replace function public.remove_school_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_target public.school_members%rowtype; v_actor public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  select * into v_target from public.school_members where id=target_member_id for update;
  if not found then raise exception 'Membro nao encontrado.'; end if;
  select * into v_actor from public.school_members where school_id=v_target.school_id
    and user_id=auth.uid() and status='active' limit 1;
  if not found then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_actor.id=v_target.id then raise exception 'Voce nao pode remover seu proprio vinculo.'; end if;
  if v_target.role='school_admin' then raise exception 'O administrador principal nao pode ser removido por este fluxo.'; end if;
  if v_actor.role='school_admin' then null;
  elsif v_actor.role in ('coordinator','secretary') and v_target.role='teacher'
    and public.can_manage_school_member_permissions(v_target.school_id) then null;
  else raise exception 'Voce nao possui permissao para remover este membro.';
  end if;
  delete from public.school_members where id=v_target.id;
end;
$function$;

revoke all on function public.remove_school_member(uuid) from public, anon;
grant execute on function public.remove_school_member(uuid) to authenticated;

-- Secretaria nunca aparece nem pode ser gravada como conselheiro.
create or replace function public.list_counselor_candidates(target_school_id uuid)
returns table(user_id uuid,email text,full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.can_manage_class_counselors(target_school_id) then
    raise exception 'Somente um coordenador autorizado pode listar candidatos a conselheiro';
  end if;
  return query
  select sm.user_id,pr.email::text,pr.full_name::text
  from public.school_members sm join public.profiles pr on pr.id=sm.user_id
  where sm.school_id=target_school_id and sm.status='active' and sm.role<>'secretary'
  order by coalesce(nullif(trim(pr.full_name),''),pr.email);
end;
$function$;

create or replace function public.enforce_counselor_school_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_class_school_id uuid; v_member_role text;
begin
  select c.school_id into v_class_school_id from public.classes c where c.id=new.class_id;
  if v_class_school_id is null then raise exception 'A turma nao possui escola vinculada.'; end if;
  if new.school_id is null then new.school_id:=v_class_school_id; end if;
  if new.school_id<>v_class_school_id then
    raise exception 'O conselheiro e a turma precisam pertencer a mesma escola.';
  end if;
  select sm.role into v_member_role from public.school_members sm
  where sm.school_id=new.school_id and sm.user_id=new.counselor_user_id
    and sm.status='active' limit 1;
  if v_member_role is null then raise exception 'O conselheiro precisa ser membro ativo desta escola.'; end if;
  if v_member_role='secretary' then raise exception 'Secretaria nao pode ser conselheiro de turma.'; end if;
  return new;
end;
$function$;

-- O secretario continua elegivel como Tutor do Meu CEPI. Ocorrencias, porem,
-- so entram no painel do tutor quando a permissao especifica foi liberada.
create or replace function public.get_cepi_tutored_student_activity(p_school_id uuid,p_student_ids uuid[])
returns table(student_id uuid,occurrences jsonb,attendance jsonb,livro_revisa jsonb,counselors jsonb)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id,
    case when exists(
      select 1 from public.school_members actor
      left join public.school_member_permissions ap on ap.member_id=actor.id
      where actor.school_id=p_school_id and actor.user_id=auth.uid() and actor.status='active'
        and (actor.role<>'secretary' or coalesce(ap.can_view_occurrences,false) or coalesce(ap.can_edit_all,false))
    ) then coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'date',o.occurred_on,'text',o.occurrence_text,'responsible',o.created_by_name
    ) order by o.occurred_on desc,o.created_at desc)
      from public.student_occurrences o where o.school_id=p_school_id and o.student_id=s.id),'[]'::jsonb)
    else '[]'::jsonb end,
    coalesce((select jsonb_agg(jsonb_build_object(
      'academic_year',a.academic_year,'term',a.term,'subject',a.subject,
      'percentage',a.percentage,'status',a.status,'updated_at',a.updated_at
    ) order by a.updated_at desc) from public.siap_attendance_current a
      where a.school_id=p_school_id and a.student_id=s.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'school_year',l.school_year,'bimester',l.bimester,'status',l.status,'delivered_at',l.delivered_at
    ) order by l.school_year desc,l.bimester desc) from public.livro_revisa_deliveries l
      where l.school_id=p_school_id and l.student_id=s.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',cc.counselor_user_id,'name',coalesce(nullif(btrim(p.full_name),''),p.email)
    ) order by coalesce(nullif(btrim(p.full_name),''),p.email))
      from public.class_counselors cc join public.profiles p on p.id=cc.counselor_user_id
      where cc.school_id=p_school_id and cc.class_id=s.class_id),'[]'::jsonb)
  from public.students s
  where s.school_id=p_school_id and s.id=any(coalesce(p_student_ids,'{}'::uuid[]))
    and public.can_access_cepi_student(p_school_id,s.id);
$function$;

create or replace function public.can_receive_school_notification(target_user_id uuid,target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select target_user_id is not null and target_school_id is not null
    and exists(select 1 from public.platform_account_access paa where paa.user_id=target_user_id and paa.status='active')
    and exists(select 1 from public.schools s where s.id=target_school_id and s.status='active')
    and exists(
      select 1 from public.school_members sm
      left join public.school_member_permissions p on p.member_id=sm.id
      where sm.user_id=target_user_id and sm.school_id=target_school_id and sm.status='active'
        and (sm.role<>'secretary' or coalesce(p.can_receive_notifications,false))
    )
    and exists(select 1 from public.school_subscriptions ss where ss.school_id=target_school_id
      and ss.status='active' and (ss.grant_expires_at is null or ss.grant_expires_at>now()));
$function$;

revoke all on function public.can_receive_school_notification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_receive_school_notification(uuid,uuid) to service_role;

drop policy if exists "Own notifications" on public.user_notifications;
drop policy if exists "Update own notifications" on public.user_notifications;
create policy "Own notifications" on public.user_notifications for select to authenticated
using (
  recipient_id=auth.uid() and public.can_use_school(school_id)
  and not exists(
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=user_notifications.school_id and sm.user_id=auth.uid()
      and sm.status='active' and sm.role='secretary'
      and not coalesce(p.can_receive_notifications,false)
  )
);
create policy "Update own notifications" on public.user_notifications for update to authenticated
using (
  recipient_id=auth.uid() and public.can_use_school(school_id)
  and not exists(
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=user_notifications.school_id and sm.user_id=auth.uid()
      and sm.status='active' and sm.role='secretary'
      and not coalesce(p.can_receive_notifications,false)
  )
)
with check (
  recipient_id=auth.uid() and public.can_use_school(school_id)
  and not exists(
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=user_notifications.school_id and sm.user_id=auth.uid()
      and sm.status='active' and sm.role='secretary'
      and not coalesce(p.can_receive_notifications,false)
  )
);

commit;
