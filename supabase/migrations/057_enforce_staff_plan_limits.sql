-- CARÔMETRO COMERCIAL
-- Enforcement de platform_plans.max_staff. Conta como staff:
-- status='active' AND role IN ('teacher','coordinator') — school_admin
-- nunca conta. Limite dinâmico via school_effective_plan(school_id) →
-- platform_plans.max_staff (NULL = ilimitado).
--
-- CENTRALIZAÇÃO: toda a regra comercial (travar school_subscriptions,
-- falhar fechado se ausente, resolver plano efetivo, ler display_name/
-- max_staff, contar, decidir) vive em UMA função helper,
-- assert_school_staff_capacity(school_id), chamada por dentro de cada
-- uma das 4 RPCs de crescimento — nunca exposta como RPC própria
-- (revogada de public/authenticated/anon).
--
-- A checagem é um PRÉ-check (conta ANTES de escrever; bloqueia quando
-- contagem_atual >= limite, equivalente a "contagem_atual + 1 > limite"):
-- isso garante que, em transfer_school_admin, nenhuma escrita acontece
-- se o resultado ultrapassaria o limite — nunca uma promoção parcial
-- seguida de falha. Em accept_school_invitation, o convite nunca chega a
-- ser marcado 'accepted' se a checagem falhar (ela roda antes do INSERT
-- em school_members, que por sua vez roda antes do UPDATE do convite).
--
-- DEFESA EM PROFUNDIDADE: dois triggers/funções de segurança em
-- school_members, mesmo padrão estrutural da migration 056
-- (REFERENCING ... FOR EACH STATEMENT, agrupado e travado por school_id
-- em ordem determinística), reaproveitando a mesma checagem pós-escrita
-- via check_staff_limit_for_school(school_id) (regra "total > limite").
-- Precisou ser DOIS triggers, não um só: o Postgres rejeita transition
-- tables em um único trigger que responda a mais de um evento
-- ("transition tables cannot be specified for triggers with more than
-- one event") — por isso enforce_school_staff_limit_insert (AFTER
-- INSERT, só NEW TABLE) e enforce_school_staff_limit_update (AFTER
-- UPDATE, OLD TABLE + NEW TABLE) são funções separadas. Também não é
-- possível usar transition tables com lista de colunas
-- ("transition tables cannot be specified for triggers with column
-- lists") — por isso o de UPDATE dispara em qualquer UPDATE, não só
-- "OF role, status"; a própria lógica interna (comparação old_rows/
-- new_rows) já ignora corretamente qualquer UPDATE que não mude
-- status/role, sem custo de correção, só de uma checagem a mais por
-- UPDATE irrelevante. Ambas as descobertas foram confirmadas ao
-- aplicar esta migration.
--
-- Como as 4 RPCs já bloqueiam ANTES de escrever, estes triggers nunca
-- deveriam disparar de fato pelo caminho normal — protegem
-- exclusivamente contra um futuro caminho de escrita que esqueça de
-- chamar o helper.
--
-- O trigger de UPDATE NUNCA bloqueia uma operação neutra ou que reduz
-- staff, mesmo com a escola já acima do limite por concessão/downgrade:
-- só aplica a checagem quando pelo menos uma linha do lote fez uma
-- transição real de "não contável" para "contável" (comparando
-- old_rows/new_rows por id) — nunca com base só no estado final. O
-- trigger de INSERT não precisa dessa comparação: toda linha nova já
-- ativa/contável é, por definição, crescimento (não havia OLD).

begin;

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

  select p.display_name, p.max_staff
    into v_display_name, v_limit
  from public.platform_plans p
  where p.plan_key = v_effective_plan;

  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;

  if v_limit is null then
    return;
  end if;

  select count(*)
    into v_current
  from public.school_members
  where school_id = p_school_id
    and status = 'active'
    and role in ('teacher', 'coordinator');

  if v_current >= v_limit then
    raise exception 'LIMITE_EQUIPE: Sua escola atingiu o limite de % professores/coordenadores do plano %. Para adicionar ou reativar membros, altere o plano.', v_limit, v_display_name;
  end if;
end;
$function$;

revoke all on function public.assert_school_staff_capacity(uuid) from public;

-- 1) accept_school_invitation: checagem antes do INSERT em
-- school_members (e, portanto, antes do UPDATE que marca o convite como
-- accepted) — corpo idêntico ao instalado, só com essa linha inserida.
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
    set can_view_occurrences = true,
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

-- 2) restore_school_membership: checagem só quando o vínculo-alvo NÃO
-- está atualmente ativo (linha inexistente ou suspended) — reativar um
-- vínculo já ativo continua sempre permitido, sem checar capacidade.
create or replace function public.restore_school_membership(target_user_id uuid, target_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_member_role text;
  v_members_created boolean;
  v_permissions_created boolean;
  v_target_email text;
  v_email_confirmed boolean;
  v_existing_status text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.school_members admin_member
    where admin_member.school_id = target_school_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'school_admin'
      and admin_member.status = 'active'
  ) then
    raise exception 'Somente o administrador desta escola pode restaurar vínculos.';
  end if;

  select email, (email_confirmed_at is not null)
    into v_target_email, v_email_confirmed
  from auth.users
  where id = target_user_id;

  if v_target_email is null then
    raise exception 'Usuário não encontrado.';
  end if;

  if not v_email_confirmed then
    raise exception 'A conta ainda não confirmou o e-mail — não é possível restaurar o vínculo agora.';
  end if;

  -- Só checa capacidade se o vínculo-alvo não estiver já ativo: uma
  -- reativação que na prática é um no-op (já ativo) nunca deve ser
  -- bloqueada por limite.
  select status into v_existing_status
  from public.school_members
  where school_id = target_school_id and user_id = target_user_id;

  if v_existing_status is distinct from 'active' then
    perform public.assert_school_staff_capacity(target_school_id);
  end if;

  insert into public.school_members (school_id, user_id, role, status)
  values (target_school_id, target_user_id, 'teacher', 'active')
  on conflict (school_id, user_id) do nothing
  returning id into v_member_id;

  v_members_created := found;

  if v_members_created then
    v_member_role := 'teacher';
  else
    update public.school_members
    set status = 'active', updated_at = now()
    where school_id = target_school_id and user_id = target_user_id
    returning id, role into v_member_id, v_member_role;
  end if;

  if v_members_created and not exists (
    select 1 from public.cancelled_logins cl
    where lower(trim(cl.email)) = lower(trim(v_target_email))
  ) then
    raise exception 'Esta conta não possui histórico de cancelamento de login — use o fluxo de convite normal.';
  end if;

  insert into public.school_member_permissions (member_id)
  values (v_member_id)
  on conflict (member_id) do nothing;

  v_permissions_created := found;

  if v_permissions_created and v_member_role = 'teacher' then
    update public.school_member_permissions
    set
      can_view_occurrences = true,
      can_register_occurrences = true,
      updated_at = now()
    where member_id = v_member_id;
  end if;

  if v_permissions_created and v_member_role = 'coordinator' then
    update public.school_member_permissions
    set
      can_manage_counselors = true,
      updated_at = now()
    where member_id = v_member_id;
  end if;

  return v_member_id;
end;
$function$;

revoke all on function public.restore_school_membership(uuid, uuid) from public;
revoke all on function public.restore_school_membership(uuid, uuid) from anon;
grant execute on function public.restore_school_membership(uuid, uuid) to authenticated;
grant execute on function public.restore_school_membership(uuid, uuid) to service_role;

-- 3) set_school_member_status: checagem só na transição real
-- suspended/inexistente -> active (v_target.status já reflete o estado
-- ANTES da alteração, capturado pelo SELECT ... FOR UPDATE acima).
create or replace function public.set_school_member_status(target_member_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target public.school_members%rowtype;
  v_actor public.school_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if new_status not in ('active', 'suspended') then raise exception 'Status inválido.'; end if;

  select * into v_target from public.school_members where id = target_member_id for update;
  if not found then raise exception 'Membro não encontrado.'; end if;

  select * into v_actor
  from public.school_members
  where school_id = v_target.school_id and user_id = auth.uid() and status = 'active'
  limit 1;
  if not found or not public.is_active_school_member(v_target.school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;
  if v_actor.id = v_target.id then raise exception 'Você não pode alterar seu próprio status.'; end if;
  if v_target.role = 'school_admin' then raise exception 'Administradores não podem ser alterados por esta função.'; end if;

  if v_actor.role = 'school_admin' then
    null;
  elsif v_actor.role = 'coordinator'
    and v_target.role = 'teacher'
    and public.can_manage_school_member_permissions(v_target.school_id) then
    null;
  else
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  if new_status = 'active' and v_target.status <> 'active' then
    perform public.assert_school_staff_capacity(v_target.school_id);
  end if;

  update public.school_members
  set status = new_status, updated_at = now()
  where id = v_target.id;
end;
$function$;

revoke all on function public.set_school_member_status(uuid, text) from public;
revoke all on function public.set_school_member_status(uuid, text) from anon;
grant execute on function public.set_school_member_status(uuid, text) to authenticated;

-- 4) transfer_school_admin: checagem só quando p_previous_admin_action
-- IN ('coordinator','teacher'), colocada ANTES de qualquer UPDATE —
-- garante que, se bloquear, nada foi escrito (nem a promoção do novo
-- admin, nem o rebaixamento do antigo). left_school nunca é checado,
-- pois nunca aumenta a contagem de staff.
create or replace function public.transfer_school_admin(p_target_member_id uuid, p_previous_admin_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_school public.schools%rowtype;
  v_target public.school_members%rowtype;
  v_actor public.school_members%rowtype;
  v_previous_admin_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_target_member_id is null then
    raise exception 'Candidato inválido.';
  end if;

  if p_previous_admin_action not in ('coordinator', 'teacher', 'left_school') then
    raise exception 'Ação final inválida.';
  end if;

  select school_id into v_school_id
  from public.school_members
  where id = p_target_member_id;

  if v_school_id is null then
    raise exception 'Candidato não encontrado.';
  end if;

  select *
    into v_school
  from public.schools
  where id = v_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = p_target_member_id
  for update;

  if not found or v_target.school_id <> v_school.id then
    raise exception 'Candidato não encontrado.';
  end if;

  select *
    into v_actor
  from public.school_members
  where school_id = v_school.id
    and user_id = auth.uid()
  for update;

  if not found or not public.is_active_school_member(v_school.id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_actor.role <> 'school_admin' or v_actor.status <> 'active' then
    raise exception 'Somente o administrador ativo desta escola pode transferir a administração.';
  end if;

  if v_target.user_id = v_actor.user_id then
    raise exception 'Você não pode transferir a administração para si mesmo.';
  end if;

  if v_target.status <> 'active' then
    raise exception 'O candidato selecionado não está ativo nesta escola.';
  end if;

  if v_target.role not in ('coordinator', 'teacher') then
    raise exception 'O candidato selecionado precisa ser coordenador ou professor desta escola.';
  end if;

  if p_previous_admin_action in ('coordinator', 'teacher') then
    perform public.assert_school_staff_capacity(v_school.id);
  end if;

  v_previous_admin_user_id := v_actor.user_id;

  update public.school_members
  set role = 'school_admin', updated_at = now()
  where id = v_target.id;

  update public.school_member_permissions
  set
    can_add_students = false, can_edit_students = false, can_delete_students = false,
    can_edit_all = false, can_edit_photo = false, can_edit_name = false,
    can_edit_class = false, can_edit_report = false,
    can_manage_observation_options = false, can_invite_teachers = false,
    can_manage_member_permissions = false, can_view_uniform = false,
    can_edit_uniform = false, can_mark_all_uniform_received = false,
    can_view_occurrences = false, can_register_occurrences = false,
    can_edit_occurrences = false, can_delete_occurrences = false,
    can_manage_counselors = false, can_view_dashboard = false,
    can_view_history = false, can_manage_alerts = false,
    can_record_followups = false, can_export_reports = false,
    can_use_bulk_actions = false, can_view_audit = false,
    can_view_class_summary = false,
    updated_at = now()
  where member_id = v_target.id;

  if p_previous_admin_action = 'left_school' then
    delete from public.school_member_permissions where member_id = v_actor.id;
    delete from public.school_members where id = v_actor.id;
  else
    update public.school_members
    set role = p_previous_admin_action, updated_at = now()
    where id = v_actor.id;

    if p_previous_admin_action = 'coordinator' then
      update public.school_member_permissions
      set
        can_add_students = false, can_edit_students = false, can_delete_students = false,
        can_edit_all = false, can_edit_photo = false, can_edit_name = false,
        can_edit_class = false, can_edit_report = false,
        can_manage_observation_options = false, can_invite_teachers = false,
        can_manage_member_permissions = false, can_view_uniform = false,
        can_edit_uniform = false, can_mark_all_uniform_received = false,
        can_view_occurrences = false, can_register_occurrences = false,
        can_edit_occurrences = false, can_delete_occurrences = false,
        can_manage_counselors = true,
        can_view_dashboard = false, can_view_history = false,
        can_manage_alerts = false, can_record_followups = false,
        can_export_reports = false, can_use_bulk_actions = false,
        can_view_audit = false, can_view_class_summary = false,
        updated_at = now()
      where member_id = v_actor.id;
    elsif p_previous_admin_action = 'teacher' then
      update public.school_member_permissions
      set
        can_add_students = false, can_edit_students = false, can_delete_students = false,
        can_edit_all = false, can_edit_photo = false, can_edit_name = false,
        can_edit_class = false, can_edit_report = false,
        can_manage_observation_options = false, can_invite_teachers = false,
        can_manage_member_permissions = false, can_view_uniform = false,
        can_edit_uniform = false, can_mark_all_uniform_received = false,
        can_view_occurrences = true, can_register_occurrences = true,
        can_edit_occurrences = false, can_delete_occurrences = false,
        can_manage_counselors = false,
        can_view_dashboard = false, can_view_history = false,
        can_manage_alerts = false, can_record_followups = false,
        can_export_reports = false, can_use_bulk_actions = false,
        can_view_audit = false, can_view_class_summary = false,
        updated_at = now()
      where member_id = v_actor.id;
    end if;
  end if;

  insert into public.school_audit_log (
    school_id, event_type, actor_user_id,
    previous_admin_user_id, new_admin_user_id, previous_admin_final_role
  ) values (
    v_school.id, 'school_admin_transferred', auth.uid(),
    v_previous_admin_user_id, v_target.user_id, p_previous_admin_action
  );

  return jsonb_build_object(
    'school_id', v_school.id,
    'new_admin_user_id', v_target.user_id,
    'previous_admin_user_id', v_previous_admin_user_id,
    'previous_admin_final_role', p_previous_admin_action
  );
end;
$function$;

revoke all on function public.transfer_school_admin(uuid, text) from public;
revoke all on function public.transfer_school_admin(uuid, text) from anon;
grant execute on function public.transfer_school_admin(uuid, text) to authenticated;

-- Defesa em profundidade: trigger central. Só aplica a checagem de
-- total quando pelo menos uma linha do lote fez uma transição real de
-- "não contável" para "contável" (comparação old_rows/new_rows por id);
-- nunca bloqueia atualização neutra ou que reduz staff, mesmo com a
-- escola já acima do limite.
-- Postgres não permite transition tables em um trigger que responde a
-- mais de um evento (INSERT OR UPDATE) — "transition tables cannot be
-- specified for triggers with more than one event", confirmado ao
-- aplicar esta migration. Por isso a checagem pós-escrita fica numa
-- função comum (mesma regra "total > limite" da 056), chamada por dois
-- triggers/funções separados: um só para INSERT (toda linha nova
-- ativa/contável já é crescimento, não há OLD para comparar), outro só
-- para UPDATE OF role, status (compara old_rows/new_rows por id, só
-- aplica a checagem quando pelo menos uma linha realmente transicionou
-- de não-contável para contável).
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

  select p.display_name, p.max_staff
    into v_display_name, v_limit
  from public.platform_plans p
  where p.plan_key = v_effective_plan;

  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;

  if v_limit is not null then
    select count(*) into v_total
    from public.school_members
    where school_id = p_school_id and status = 'active' and role in ('teacher', 'coordinator');

    if v_total > v_limit then
      raise exception 'LIMITE_EQUIPE: Sua escola atingiu o limite de % professores/coordenadores do plano %. Para adicionar ou reativar membros, altere o plano.', v_limit, v_display_name;
    end if;
  end if;
end;
$function$;

revoke all on function public.check_staff_limit_for_school(uuid) from public;

create or replace function public.enforce_school_staff_limit_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
begin
  for v_school_id in
    select distinct new_rows.school_id
    from new_rows
    where new_rows.school_id is not null
      and new_rows.status = 'active'
      and new_rows.role in ('teacher', 'coordinator')
    order by new_rows.school_id
  loop
    perform public.check_staff_limit_for_school(v_school_id);
  end loop;

  return null;
end;
$function$;

revoke all on function public.enforce_school_staff_limit_insert() from public;

create or replace function public.enforce_school_staff_limit_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_grew boolean;
begin
  for v_school_id in
    select distinct new_rows.school_id
    from new_rows
    where new_rows.school_id is not null
    order by new_rows.school_id
  loop
    select exists (
      select 1
      from new_rows n
      left join old_rows o on o.id = n.id
      where n.school_id = v_school_id
        and n.status = 'active' and n.role in ('teacher', 'coordinator')
        and not (
          o.id is not null
          and o.status = 'active' and o.role in ('teacher', 'coordinator')
        )
    ) into v_grew;

    if v_grew then
      perform public.check_staff_limit_for_school(v_school_id);
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function public.enforce_school_staff_limit_update() from public;

drop trigger if exists enforce_school_staff_limit_insert on public.school_members;
create trigger enforce_school_staff_limit_insert
after insert on public.school_members
referencing new table as new_rows
for each statement
execute function public.enforce_school_staff_limit_insert();

drop trigger if exists enforce_school_staff_limit_update on public.school_members;
create trigger enforce_school_staff_limit_update
after update on public.school_members
referencing old table as old_rows new table as new_rows
for each statement
execute function public.enforce_school_staff_limit_update();

commit;
