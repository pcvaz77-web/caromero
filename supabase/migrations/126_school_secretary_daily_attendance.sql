begin;

-- Novo papel escolar, restritivo por padrão.
alter table public.school_members drop constraint if exists school_members_role_check;
alter table public.school_members
  add constraint school_members_role_check
  check (role in ('school_admin', 'coordinator', 'teacher', 'secretary'));

alter table public.school_invitations drop constraint if exists school_invitations_role_check;
alter table public.school_invitations
  add constraint school_invitations_role_check
  check (role in ('school_admin', 'coordinator', 'teacher', 'secretary'));

alter table public.school_member_permissions
  add column if not exists can_import_school_daily_attendance boolean not null default false;

comment on column public.school_member_permissions.can_import_school_daily_attendance is
  'Permite importar a Frequencia Diaria da escola. Nao concede permissoes de ocorrencia nem de edicao de alunos.';

create or replace function public.enforce_secretary_restricted_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.school_members sm
    where sm.id=new.member_id and sm.role='secretary'
  ) then
    new.can_add_students:=false;new.can_edit_students:=false;new.can_delete_students:=false;new.can_edit_all:=false;
    new.can_edit_photo:=false;new.can_edit_name:=false;new.can_edit_class:=false;new.can_edit_report:=false;
    new.can_manage_observation_options:=false;new.can_invite_teachers:=false;new.can_manage_member_permissions:=false;
    new.can_view_uniform:=false;new.can_edit_uniform:=false;new.can_mark_all_uniform_received:=false;
    new.can_view_occurrences:=false;new.can_register_occurrences:=false;new.can_edit_occurrences:=false;new.can_delete_occurrences:=false;
    new.can_manage_counselors:=false;new.can_view_dashboard:=false;new.can_view_history:=false;new.can_manage_alerts:=false;
    new.can_record_followups:=false;new.can_export_reports:=false;new.can_use_bulk_actions:=false;new.can_view_audit:=false;
    new.can_view_class_summary:=false;new.can_use_siap_assistant:=false;new.can_import_siap_attendance:=false;new.can_prepare_school_year:=false;
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_secretary_restricted_permissions on public.school_member_permissions;
create trigger enforce_secretary_restricted_permissions
before insert or update on public.school_member_permissions
for each row execute function public.enforce_secretary_restricted_permissions();

-- Se um vínculo já existente for convertido para Secretaria, permissões antigas
-- também são removidas imediatamente. Assim a restrição não depende apenas do
-- fluxo de convite usado pelo frontend.
create or replace function public.restrict_secretary_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_became_secretary boolean := false;
begin
  if tg_op = 'INSERT' then
    v_became_secretary := new.role = 'secretary';
  else
    v_became_secretary := new.role = 'secretary' and old.role is distinct from new.role;
  end if;
  if v_became_secretary then
    insert into public.school_member_permissions (member_id,can_import_school_daily_attendance)
    values (new.id,false)
    on conflict (member_id) do update set can_import_school_daily_attendance=false,updated_at=now();
  elsif tg_op = 'UPDATE' and old.role = 'secretary' and new.role <> 'secretary' then
    update public.school_member_permissions
    set can_import_school_daily_attendance=false,updated_at=now()
    where member_id=new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists restrict_secretary_member_role on public.school_members;
create trigger restrict_secretary_member_role
after insert or update of role on public.school_members
for each row execute function public.restrict_secretary_member_role();

-- Secretaria ocupa uma vaga de equipe, assim como professor e coordenador.
create or replace function public.assert_school_staff_capacity(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_current integer;
begin
  perform 1 from public.school_subscriptions where school_id = p_school_id for update;
  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;
  v_effective_plan := public.school_effective_plan(p_school_id);
  select p.display_name, p.max_staff into v_display_name, v_limit
  from public.platform_plans p where p.plan_key = v_effective_plan;
  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;
  if v_limit is null then return; end if;
  select count(*) into v_current
  from public.school_members
  where school_id = p_school_id and status = 'active'
    and role in ('teacher', 'coordinator', 'secretary');
  if v_current >= v_limit then
    raise exception 'LIMITE_EQUIPE: Sua escola atingiu o limite de % membros da equipe do plano %. Para adicionar ou reativar membros, altere o plano.', v_limit, v_display_name;
  end if;
end;
$function$;

create or replace function public.check_staff_limit_for_school(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_total integer;
begin
  perform 1 from public.school_subscriptions where school_id = p_school_id for update;
  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;
  v_effective_plan := public.school_effective_plan(p_school_id);
  select p.display_name, p.max_staff into v_display_name, v_limit
  from public.platform_plans p where p.plan_key = v_effective_plan;
  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;
  if v_limit is not null then
    select count(*) into v_total
    from public.school_members
    where school_id = p_school_id and status = 'active'
      and role in ('teacher', 'coordinator', 'secretary');
    if v_total > v_limit then
      raise exception 'LIMITE_EQUIPE: Sua escola atingiu o limite de % membros da equipe do plano %. Para adicionar ou reativar membros, altere o plano.', v_limit, v_display_name;
    end if;
  end if;
end;
$function$;

create or replace function public.enforce_school_staff_limit_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_school_id uuid;
begin
  for v_school_id in
    select distinct new_rows.school_id from new_rows
    where new_rows.school_id is not null and new_rows.status = 'active'
      and new_rows.role in ('teacher', 'coordinator', 'secretary')
    order by new_rows.school_id
  loop
    perform public.check_staff_limit_for_school(v_school_id);
  end loop;
  return null;
end;
$function$;

create or replace function public.enforce_school_staff_limit_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_school_id uuid; v_grew boolean;
begin
  for v_school_id in
    select distinct new_rows.school_id from new_rows
    where new_rows.school_id is not null order by new_rows.school_id
  loop
    select exists (
      select 1 from new_rows n left join old_rows o on o.id = n.id
      where n.school_id = v_school_id
        and n.status = 'active' and n.role in ('teacher', 'coordinator', 'secretary')
        and not (o.id is not null and o.status = 'active' and o.role in ('teacher', 'coordinator', 'secretary'))
    ) into v_grew;
    if v_grew then perform public.check_staff_limit_for_school(v_school_id); end if;
  end loop;
  return null;
end;
$function$;

-- Mantém o número exibido no painel do plano igual ao limite efetivamente
-- aplicado pelo banco.
create or replace function public.get_active_school_plan_capabilities(p_school_id uuid)
returns table(
  school_id uuid, plan_key text, display_name text, max_students integer,
  max_staff integer, max_classes integer, item_control boolean, reports boolean,
  class_counselors boolean, student_count integer, class_count integer, staff_count integer
)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_plan_key text;
  v_display_name text;
  v_max_students integer;
  v_max_staff integer;
  v_max_classes integer;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.'; end if;
  if p_school_id is null or not public.is_active_school_member(p_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;
  v_plan_key := public.school_effective_plan_strict(p_school_id);
  select p.display_name, p.max_students, p.max_staff, p.max_classes
    into v_display_name, v_max_students, v_max_staff, v_max_classes
  from public.platform_plans p where p.plan_key = v_plan_key;
  if not found then raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.'; end if;
  return query select p_school_id, v_plan_key, v_display_name, v_max_students,
    v_max_staff, v_max_classes,
    public.school_has_feature_strict(p_school_id, 'item_control'),
    public.school_has_feature_strict(p_school_id, 'reports'),
    public.school_has_feature_strict(p_school_id, 'class_counselors'),
    (select count(*)::integer from public.students s where s.school_id = p_school_id and s.enrollment_status = 'active'),
    (select count(*)::integer from public.classes c where c.school_id = p_school_id and c.archived_at is null),
    (select count(*)::integer from public.school_members sm where sm.school_id = p_school_id and sm.status = 'active' and sm.role in ('teacher', 'coordinator', 'secretary'));
end;
$function$;

-- O administrador pode convidar Secretaria. Coordenadores continuam limitados
-- exclusivamente a convites de professor.
create or replace function public.create_school_invitation(target_school_id uuid, target_email text, target_role text)
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
  v_invitation_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  v_email := lower(trim(target_email));
  if v_email = '' or length(v_email) > 320 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if target_role not in ('coordinator', 'teacher', 'secretary') then raise exception 'Função de convite inválida.'; end if;
  select sm.id, sm.role into v_inviter_member_id, v_inviter_role
  from public.school_members sm
  where sm.school_id = target_school_id and sm.user_id = auth.uid() and sm.status = 'active'
  limit 1;
  if v_inviter_member_id is null then raise exception 'Você não possui acesso ativo a esta escola.'; end if;
  if v_inviter_role = 'school_admin' then
    null;
  elsif v_inviter_role = 'coordinator' then
    if target_role <> 'teacher' then raise exception 'Coordenadores só podem convidar professores.'; end if;
    select coalesce(p.can_invite_teachers, false) into v_can_invite_teachers
    from public.school_member_permissions p where p.member_id = v_inviter_member_id;
    if not v_can_invite_teachers then raise exception 'Você não possui permissão para convidar professores.'; end if;
  else
    raise exception 'Você não possui permissão para enviar convites.';
  end if;
  if exists (
    select 1 from public.school_members sm join auth.users u on u.id = sm.user_id
    where sm.school_id = target_school_id and lower(trim(u.email)) = v_email
  ) then raise exception 'Este usuário já pertence a esta escola.'; end if;
  update public.school_invitations i set status = 'expired'
  where i.school_id = target_school_id and lower(trim(i.email)) = v_email
    and i.status = 'pending' and i.expires_at <= now();
  if exists (
    select 1 from public.school_invitations i
    where i.school_id = target_school_id and lower(trim(i.email)) = v_email
      and i.status = 'pending' and i.expires_at > now()
  ) then raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.'; end if;
  begin
    insert into public.school_invitations (school_id,email,role,invited_by)
    values (target_school_id,v_email,target_role,auth.uid()) returning id into v_invitation_id;
  exception when unique_violation then
    raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.';
  end;
  return v_invitation_id;
end;
$function$;

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
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  select lower(trim(email)), email_confirmed_at into v_user_email, v_email_confirmed_at
  from auth.users where id = v_user_id;
  if v_user_email is null then raise exception 'E-mail do usuário não encontrado.'; end if;
  if v_email_confirmed_at is null then raise exception 'Confirme seu e-mail antes de aceitar o convite.'; end if;
  select * into v_invitation from public.school_invitations where token = invitation_token for update;
  if not found then raise exception 'Convite inválido.'; end if;
  if v_invitation.status <> 'pending' then raise exception 'Este convite não está mais disponível.'; end if;
  if v_invitation.expires_at <= now() then raise exception 'Este convite expirou.'; end if;
  if lower(trim(v_invitation.email)) <> v_user_email then raise exception 'Este convite pertence a outro usuário.'; end if;
  perform public.assert_school_staff_capacity(v_invitation.school_id);
  insert into public.school_members (school_id,user_id,role,status)
  values (v_invitation.school_id,v_user_id,v_invitation.role,'active')
  on conflict (school_id,user_id) do nothing returning id into v_member_id;
  if v_member_id is null then raise exception 'Este usuário já pertence a esta escola.'; end if;
  insert into public.school_member_permissions (member_id) values (v_member_id)
  on conflict (member_id) do nothing;
  if v_invitation.role = 'teacher' then
    update public.school_member_permissions
    set can_view_class_summary=true,can_view_occurrences=true,can_register_occurrences=true,updated_at=now()
    where member_id=v_member_id;
  elsif v_invitation.role = 'coordinator' then
    update public.school_member_permissions set can_manage_counselors=true,updated_at=now()
    where member_id=v_member_id;
  elsif v_invitation.role = 'secretary' then
    update public.school_member_permissions
    set can_import_school_daily_attendance=true,
        can_view_occurrences=false,can_register_occurrences=false,
        can_edit_occurrences=false,can_delete_occurrences=false,
        updated_at=now()
    where member_id=v_member_id;
  end if;
  update public.school_invitations set status='accepted',accepted_at=now() where id=v_invitation.id;
  return v_member_id;
end;
$function$;

-- Permissão específica: só o administrador pode liberar a leitura diária, e
-- exclusivamente para Secretaria.
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
  v_actor public.school_members%rowtype;
  v_actor_can_manage boolean := false;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select * into v_target from public.school_members where id=target_member_id;
  if not found then raise exception 'Membro não encontrado.'; end if;
  select actor.* into v_actor from public.school_members actor
  where actor.school_id=v_target.school_id and actor.user_id=auth.uid() and actor.status='active';
  if not found then raise exception 'Sem permissão nesta escola.'; end if;
  select coalesce(rights.can_manage_member_permissions,false) into v_actor_can_manage
  from public.school_member_permissions rights where rights.member_id=v_actor.id;
  if permission_name = 'can_import_siap_attendance' then
    if v_actor.role='school_admin' then null;
    elsif v_actor.role='coordinator' and v_actor_can_manage then
      if v_target.role<>'teacher' then raise exception 'O coordenador só pode liberar a Frequência Assistida para professores.'; end if;
    else raise exception 'Somente o administrador ou coordenador autorizado pode alterar esta permissão.';
    end if;
  elsif permission_name = 'can_use_siap_assistant' then
    if v_actor.role<>'school_admin' then raise exception 'Somente o administrador da escola pode alterar esta permissão do SIAP.'; end if;
  elsif permission_name = 'can_import_school_daily_attendance' then
    if v_actor.role<>'school_admin' then raise exception 'Somente o administrador da escola pode alterar a Frequência da Secretaria.'; end if;
    if v_target.role<>'secretary' then raise exception 'A Frequência da Secretaria só pode ser liberada para o perfil Secretaria.'; end if;
  else
    raise exception 'Permissão do SIAP inválida.';
  end if;
  if v_target.role='school_admin' then raise exception 'As permissões do administrador são determinadas pelo papel.'; end if;
  insert into public.school_member_permissions (member_id) values (v_target.id)
  on conflict (member_id) do nothing;
  if permission_name='can_use_siap_assistant' then
    update public.school_member_permissions set can_use_siap_assistant=permission_value,updated_at=now() where member_id=v_target.id;
  elsif permission_name='can_import_siap_attendance' then
    update public.school_member_permissions set can_import_siap_attendance=permission_value,updated_at=now() where member_id=v_target.id;
  else
    update public.school_member_permissions set can_import_school_daily_attendance=permission_value,updated_at=now() where member_id=v_target.id;
  end if;
end;
$function$;

create table public.siap_school_daily_attendance_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year integer not null,
  term text not null,
  months text[] not null,
  school_day_count integer not null check (school_day_count > 0),
  presences integer not null check (presences >= 0),
  absences integer not null check (absences >= 0),
  percentage integer not null check (percentage between 0 and 100),
  status text not null check (status in ('frequent','absent','active_search')),
  period_key text not null,
  source_dates text[] not null default '{}',
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (school_id,student_id,period_key)
);

create table public.siap_school_daily_attendance_current (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year integer not null,
  term text not null,
  months text[] not null,
  school_day_count integer not null check (school_day_count > 0),
  presences integer not null check (presences >= 0),
  absences integer not null check (absences >= 0),
  percentage integer not null check (percentage between 0 and 100),
  status text not null check (status in ('frequent','absent','active_search')),
  period_key text not null,
  source_dates text[] not null default '{}',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (school_id,student_id,academic_year,term)
);

alter table public.siap_school_daily_attendance_history enable row level security;
alter table public.siap_school_daily_attendance_current enable row level security;

create policy members_view_school_daily_attendance_history
on public.siap_school_daily_attendance_history for select to authenticated
using (public.is_active_school_member(school_id));

create policy members_view_school_daily_attendance_current
on public.siap_school_daily_attendance_current for select to authenticated
using (public.is_active_school_member(school_id));

create index siap_school_daily_history_school_student_idx
on public.siap_school_daily_attendance_history(school_id,student_id,imported_at desc);

create index siap_school_daily_current_school_status_idx
on public.siap_school_daily_attendance_current(school_id,status,updated_at desc);

grant select on public.siap_school_daily_attendance_history to authenticated;
grant select on public.siap_school_daily_attendance_current to authenticated;

create or replace function public.import_siap_school_daily_attendance(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  item jsonb;
  actor_id uuid := auth.uid();
  item_school uuid; item_student uuid; item_class uuid; item_year integer;
  item_term text; item_months text[]; item_days integer; item_presences integer; item_absences integer;
  item_percentage integer; item_status text; item_period text; item_source_dates text[];
  frequent_minimum integer; absent_minimum integer; imported_count integer := 0; changed_time timestamptz := now();
begin
  if actor_id is null then raise exception 'Usuário não autenticado.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows deve ser uma lista.'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    item_school := (item->>'school_id')::uuid;
    item_student := (item->>'student_id')::uuid;
    item_class := (item->>'class_id')::uuid;
    item_year := (item->>'academic_year')::integer;
    item_term := nullif(trim(item->>'term'),'');
    item_months := array(select jsonb_array_elements_text(item->'months'));
    item_days := (item->>'school_day_count')::integer;
    item_presences := (item->>'presences')::integer;
    item_absences := (item->>'absences')::integer;
    item_period := nullif(trim(item->>'period_key'),'');
    item_source_dates := array(select jsonb_array_elements_text(item->'source_dates'));
    if not exists (
      select 1 from public.school_members sm
      left join public.school_member_permissions p on p.member_id=sm.id
      where sm.school_id=item_school and sm.user_id=actor_id and sm.status='active'
        and (sm.role='school_admin' or (sm.role='secretary' and coalesce(p.can_import_school_daily_attendance,false)))
    ) then raise exception 'Sem permissão para importar a Frequência da Secretaria.'; end if;
    if not exists (
      select 1 from public.students s
      where s.id=item_student and s.school_id=item_school and s.class_id=item_class
    ) then raise exception 'Aluno ou turma não pertence à escola informada.'; end if;
    if item_year < 2000 or item_year > 2100 or item_term is null or item_period is null or cardinality(item_months)=0 then
      raise exception 'Período inválido para a Frequência da Secretaria.';
    end if;
    if item_days <= 0 or item_presences < 0 or item_absences < 0 or item_presences + item_absences <> item_days then
      raise exception 'Totais inválidos para a Frequência da Secretaria.';
    end if;
    item_percentage := round(item_presences::numeric / item_days::numeric * 100)::integer;
    select coalesce(cfg.frequent_minimum,75),coalesce(cfg.absent_minimum,60)
      into frequent_minimum,absent_minimum
    from (select 1) base
    left join public.school_siap_attendance_settings cfg on cfg.school_id=item_school;
    item_status := case when item_percentage>=frequent_minimum then 'frequent'
      when item_percentage>=absent_minimum then 'absent' else 'active_search' end;
    insert into public.siap_school_daily_attendance_history
      (school_id,student_id,class_id,academic_year,term,months,school_day_count,presences,absences,percentage,status,period_key,source_dates,imported_by,imported_at)
    values
      (item_school,item_student,item_class,item_year,item_term,item_months,item_days,item_presences,item_absences,item_percentage,item_status,item_period,item_source_dates,actor_id,changed_time)
    on conflict (school_id,student_id,period_key) do update set
      class_id=excluded.class_id,months=excluded.months,school_day_count=excluded.school_day_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,
      status=excluded.status,source_dates=excluded.source_dates,imported_by=actor_id,imported_at=changed_time;
    insert into public.siap_school_daily_attendance_current
      (school_id,student_id,class_id,academic_year,term,months,school_day_count,presences,absences,percentage,status,period_key,source_dates,updated_by,updated_at)
    values
      (item_school,item_student,item_class,item_year,item_term,item_months,item_days,item_presences,item_absences,item_percentage,item_status,item_period,item_source_dates,actor_id,changed_time)
    on conflict (school_id,student_id,academic_year,term) do update set
      class_id=excluded.class_id,months=excluded.months,school_day_count=excluded.school_day_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,
      status=excluded.status,period_key=excluded.period_key,source_dates=excluded.source_dates,
      updated_by=actor_id,updated_at=changed_time;
    imported_count := imported_count + 1;
  end loop;
  return imported_count;
end;
$function$;

revoke all on function public.import_siap_school_daily_attendance(jsonb) from public;
revoke all on function public.import_siap_school_daily_attendance(jsonb) from anon;
grant execute on function public.import_siap_school_daily_attendance(jsonb) to authenticated;

comment on table public.siap_school_daily_attendance_current is
  'Frequencia diaria geral da escola, separada da frequencia por professor e disciplina.';

commit;
