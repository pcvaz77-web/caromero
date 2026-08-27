-- CARÔMETRO COMERCIAL
-- Correção estrutural: limpeza completa de permissões avançadas ao
-- rebaixar coordinator -> teacher, e proteção de can_edit_all.
--
-- Escopo: só as duas funções abaixo. Não altera nenhuma migration
-- existente (001-015), não é a Migration 016, não cria tabela nova,
-- não faz sincronização global.
--
-- Motivação (auditoria em sessão): set_school_member_role só zerava
-- 4 das ~22 colunas administrativas de school_member_permissions ao
-- rebaixar para teacher. can_edit_all (e outras) podiam sobreviver ao
-- rebaixamento como resíduo, concedendo poder real via RLS (caso
-- confirmado em pcvaz77@gmail.com). can_edit_all também não estava
-- protegida em set_school_member_permission como as demais permissões
-- exclusivas de coordenador.

create or replace function public.set_school_member_role(
  target_member_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if new_role not in ('coordinator', 'teacher') then
    raise exception 'Função inválida.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  if not public.is_member_of_administered_school(v_target.id) then
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'Você não pode alterar sua própria função.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'A função de administradores não pode ser alterada.';
  end if;

  update public.school_members
  set
    role = new_role,
    updated_at = now()
  where id = v_target.id;

  -- A limpeza só ocorre numa transição REAL de coordenador para
  -- professor (v_target.role, lido antes do update acima, ainda
  -- reflete o papel anterior) — nunca quando o alvo já era professor.
  -- Isso protege qualquer concessão individual futura feita
  -- diretamente a um professor: essa concessão nunca passaria por
  -- este bloco, pois ele só executa numa transição efetiva de papel.
  if v_target.role = 'coordinator' and new_role = 'teacher' then
    update public.school_member_permissions
    set
      -- Permissões administrativas exclusivas de coordenador.
      can_manage_observation_options = false,
      can_invite_teachers = false,
      can_manage_member_permissions = false,
      can_manage_counselors = false,
      -- Bypass total: nunca deve sobreviver a um rebaixamento.
      can_edit_all = false,
      -- Demais permissões avançadas herdadas da coordenação.
      can_add_students = false,
      can_edit_students = false,
      can_delete_students = false,
      can_edit_photo = false,
      can_edit_name = false,
      can_edit_class = false,
      can_edit_report = false,
      can_view_uniform = false,
      can_edit_uniform = false,
      can_mark_all_uniform_received = false,
      can_edit_occurrences = false,
      can_delete_occurrences = false,
      can_view_dashboard = false,
      can_view_history = false,
      can_manage_alerts = false,
      can_record_followups = false,
      can_export_reports = false,
      can_use_bulk_actions = false,
      can_view_audit = false,
      can_view_class_summary = false,
      -- Padrão obrigatório de professor.
      can_view_occurrences = true,
      can_register_occurrences = true,
      updated_at = now()
    where member_id = v_target.id;
  end if;
end;
$$;

revoke all on function public.set_school_member_role(uuid, text) from public;
revoke all on function public.set_school_member_role(uuid, text) from anon;
grant execute on function public.set_school_member_role(uuid, text) to authenticated;


create or replace function public.set_school_member_permission(
  target_member_id uuid,
  permission_name text,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.school_members%rowtype;
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  select *
    into v_actor
  from public.school_members
  where school_id = v_target.school_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_actor.id = v_target.id then
    raise exception 'Você não pode alterar suas próprias permissões.';
  end if;  -- Administrador pode alterar permissões de coordenadores e professores
  -- da própria escola, mas nunca de outro administrador.

  if v_actor.role = 'school_admin' then
    if v_target.role = 'school_admin' then
      raise exception 'Não é permitido alterar permissões de outro administrador.';
    end if;

  -- Coordenador precisa de autorização específica e só pode
  -- administrar permissões de professores.
  elsif v_actor.role = 'coordinator' then

    if v_target.role <> 'teacher' then
      raise exception 'Coordenadores só podem alterar permissões de professores.';
    end if;

    if not public.can_manage_school_member_permissions(v_target.school_id) then
      raise exception 'Você não possui permissão para gerenciar permissões de professores.';
    end if;

  else
    raise exception 'Você não possui permissão para gerenciar permissões.';
  end if;  -- Apenas permissões conhecidas podem ser alteradas.

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
    raise exception 'Permissão inválida.';
  end if;

  -- Estas permissões administrativas pertencem somente a coordenadores.
  -- can_edit_all incluída aqui: é um bypass total (alunos, turmas,
  -- uniforme e ocorrências) e não deve poder ser concedida a um professor.
  if permission_value = true
     and permission_name in (
       'can_manage_observation_options',
       'can_invite_teachers',
       'can_manage_member_permissions',
       'can_manage_counselors',
       'can_edit_all'
     )
     and v_target.role <> 'coordinator'
  then
    raise exception 'Esta permissão só pode ser concedida a coordenadores.';
  end if;

  -- Coordenador nunca pode conceder uma permissão que ele próprio não possui.
  if v_actor.role = 'coordinator' and permission_value = true then
    if not exists (
      select 1
      from public.school_member_permissions p
      where p.member_id = v_actor.id
        and (
          case permission_name
            when 'can_add_students' then p.can_add_students
            when 'can_edit_students' then p.can_edit_students
            when 'can_delete_students' then p.can_delete_students
            when 'can_edit_all' then p.can_edit_all
            when 'can_edit_photo' then p.can_edit_photo
            when 'can_edit_name' then p.can_edit_name
            when 'can_edit_class' then p.can_edit_class
            when 'can_edit_report' then p.can_edit_report
            when 'can_manage_observation_options' then p.can_manage_observation_options
            when 'can_invite_teachers' then p.can_invite_teachers
            when 'can_manage_member_permissions' then p.can_manage_member_permissions
            when 'can_view_uniform' then p.can_view_uniform
            when 'can_edit_uniform' then p.can_edit_uniform
            when 'can_mark_all_uniform_received' then p.can_mark_all_uniform_received
            when 'can_view_occurrences' then p.can_view_occurrences
            when 'can_register_occurrences' then p.can_register_occurrences
            when 'can_edit_occurrences' then p.can_edit_occurrences
            when 'can_delete_occurrences' then p.can_delete_occurrences
            when 'can_manage_counselors' then p.can_manage_counselors
            when 'can_view_dashboard' then p.can_view_dashboard
            when 'can_view_history' then p.can_view_history
            when 'can_manage_alerts' then p.can_manage_alerts
            when 'can_record_followups' then p.can_record_followups
            when 'can_export_reports' then p.can_export_reports
            when 'can_use_bulk_actions' then p.can_use_bulk_actions
            when 'can_view_audit' then p.can_view_audit
            when 'can_view_class_summary' then p.can_view_class_summary
            else false
          end
        ) = true
    ) then
      raise exception 'Você não pode conceder uma permissão que não possui.';
    end if;
  end if;

  -- Garante que o membro tenha uma linha de permissões.
  insert into public.school_member_permissions (member_id)
  values (v_target.id)
  on conflict (member_id) do nothing;

  -- Altera somente a permissão solicitada.
  case permission_name
    when 'can_add_students' then
      update public.school_member_permissions
      set can_add_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_students' then
      update public.school_member_permissions
      set can_edit_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_delete_students' then
      update public.school_member_permissions
      set can_delete_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_all' then
      update public.school_member_permissions
      set can_edit_all = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_photo' then
      update public.school_member_permissions
      set can_edit_photo = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_name' then
      update public.school_member_permissions
      set can_edit_name = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_class' then
      update public.school_member_permissions
      set can_edit_class = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_report' then
      update public.school_member_permissions
      set can_edit_report = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_observation_options' then
      update public.school_member_permissions
      set can_manage_observation_options = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_invite_teachers' then
      update public.school_member_permissions
      set can_invite_teachers = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_member_permissions' then
      update public.school_member_permissions
      set can_manage_member_permissions = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_view_uniform' then
      update public.school_member_permissions
      set can_view_uniform = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_uniform' then
      update public.school_member_permissions
      set can_edit_uniform = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_mark_all_uniform_received' then
      update public.school_member_permissions
      set can_mark_all_uniform_received = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_view_occurrences' then
      update public.school_member_permissions
      set can_view_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_register_occurrences' then
      update public.school_member_permissions
      set can_register_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_occurrences' then
      update public.school_member_permissions
      set can_edit_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_delete_occurrences' then
      update public.school_member_permissions
      set can_delete_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_counselors' then
  update public.school_member_permissions
  set can_manage_counselors = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_dashboard' then
  update public.school_member_permissions
  set can_view_dashboard = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_history' then
  update public.school_member_permissions
  set can_view_history = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_manage_alerts' then
  update public.school_member_permissions
  set can_manage_alerts = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_record_followups' then
  update public.school_member_permissions
  set can_record_followups = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_export_reports' then
  update public.school_member_permissions
  set can_export_reports = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_use_bulk_actions' then
  update public.school_member_permissions
  set can_use_bulk_actions = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_audit' then
  update public.school_member_permissions
  set can_view_audit = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_class_summary' then
  update public.school_member_permissions
  set can_view_class_summary = permission_value, updated_at = now()
  where member_id = v_target.id;
  end case;

end;
$$;

revoke all on function public.set_school_member_permission(uuid, text, boolean) from public;
revoke all on function public.set_school_member_permission(uuid, text, boolean) from anon;
grant execute on function public.set_school_member_permission(uuid, text, boolean) to authenticated;
