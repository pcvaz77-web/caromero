-- CARÔMETRO COMERCIAL
-- Virada segura de ano letivo: preserva alunos, fotos e ocorrências.
-- A migration apenas cria estrutura. Nenhuma escola ou dado existente é
-- alterado até que um administrador/coordenador autorizado confirme a RPC.

begin;

alter table public.classes
  add column if not exists school_year integer,
  add column if not exists archived_at timestamptz;

alter table public.students
  add column if not exists enrollment_status text not null default 'active';

alter table public.students drop constraint if exists students_enrollment_status_check;
alter table public.students add constraint students_enrollment_status_check
  check (enrollment_status in ('active', 'transferred'));

alter table public.school_member_permissions
  add column if not exists can_prepare_school_year boolean not null default false;

-- Registros arquivados continuam no histórico, mas não consomem os limites
-- operacionais do plano da escola.
create or replace function public.enforce_student_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_total integer;
begin
  for v_school_id in select distinct school_id from new_rows where school_id is not null order by school_id loop
    perform 1 from public.school_subscriptions where school_id = v_school_id for update;
    if not found then raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.'; end if;
    v_effective_plan := public.school_effective_plan(v_school_id);
    select p.display_name, p.max_students into v_display_name, v_limit
    from public.platform_plans p where p.plan_key = v_effective_plan;
    if not found then raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.'; end if;
    if v_limit is not null then
      select count(*) into v_total from public.students
      where school_id = v_school_id and enrollment_status = 'active';
      if v_total > v_limit then
        raise exception 'LIMITE_ALUNOS: Sua escola atingiu o limite de % alunos do plano %. Para cadastrar novos alunos, altere o plano.', v_limit, v_display_name;
      end if;
    end if;
  end loop;
  return null;
end;
$function$;

create or replace function public.enforce_class_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_total integer;
begin
  for v_school_id in select distinct school_id from new_rows where school_id is not null order by school_id loop
    perform 1 from public.school_subscriptions where school_id = v_school_id for update;
    if not found then raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.'; end if;
    v_effective_plan := public.school_effective_plan(v_school_id);
    select p.display_name, p.max_classes into v_display_name, v_limit
    from public.platform_plans p where p.plan_key = v_effective_plan;
    if not found then raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.'; end if;
    if v_limit is not null then
      select count(*) into v_total from public.classes
      where school_id = v_school_id and archived_at is null;
      if v_total > v_limit then
        raise exception 'LIMITE_TURMAS: Sua escola atingiu o limite de % turmas do plano %. Para cadastrar novas turmas, altere o plano.', v_limit, v_display_name;
      end if;
    end if;
  end loop;
  return null;
end;
$function$;

create table if not exists public.student_class_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null,
  school_year integer not null,
  transition_result text not null default 'remapped'
    check (transition_result in ('remapped', 'repeated', 'transferred')),
  ended_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  student_snapshot jsonb not null default '{}'::jsonb,
  unique (student_id, school_year)
);

create index if not exists student_class_history_school_student_idx
  on public.student_class_history (school_id, student_id, school_year desc);

alter table public.student_class_history enable row level security;
grant select on public.student_class_history to authenticated;

create or replace function public.report_students(
  p_school_id uuid,
  p_shift text default null,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns table (student_id uuid, full_name text, class_id uuid, class_name text,
  shift text, has_report text, photo_path text)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;
  return query
  select s.id, s.full_name, s.class_id, coalesce(c.name, s.class_name, ''),
    coalesce(c.shift, 'Matutino'), s.has_report, s.photo_path
  from public.students s
  left join public.classes c on c.id = s.class_id and c.school_id = s.school_id
  where s.school_id = p_school_id
    and (s.enrollment_status = 'active' or p_student_id = s.id)
    and (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name, s.id;
end;
$function$;

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
    (select count(*)::integer from public.school_members sm where sm.school_id = p_school_id and sm.status = 'active' and sm.role in ('teacher', 'coordinator'));
end;
$function$;

drop policy if exists "School members view student class history" on public.student_class_history;
create policy "School members view student class history"
on public.student_class_history for select to authenticated
using (public.is_active_school_member(school_id));

create or replace function public.set_school_year_transition_permission(
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
  select * into v_target from public.school_members where id = target_member_id;
  if not found then raise exception 'Membro não encontrado.'; end if;
  if not public.is_school_admin(v_target.school_id) then
    raise exception 'Somente o administrador da escola pode alterar esta permissão.';
  end if;
  if v_target.role <> 'coordinator' then
    raise exception 'Esta permissão é exclusiva para coordenadores.';
  end if;
  insert into public.school_member_permissions (member_id)
  values (v_target.id) on conflict (member_id) do nothing;
  update public.school_member_permissions
  set can_prepare_school_year = permission_value, updated_at = now()
  where member_id = v_target.id;
end;
$function$;

revoke all on function public.set_school_year_transition_permission(uuid, boolean) from public, anon;
grant execute on function public.set_school_year_transition_permission(uuid, boolean) to authenticated;

create or replace function public.apply_school_year_transition(
  target_school_id uuid,
  target_school_year integer,
  assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member public.school_members%rowtype;
  v_count integer;
  v_input_count integer;
  v_moved integer := 0;
  v_inactive integer := 0;
  v_classes integer := 0;
  v_removed_photo_paths text[] := array[]::text[];
  v_row record;
  v_class_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if target_school_year < 2020 or target_school_year > 2200 then
    raise exception 'Ano letivo inválido.';
  end if;
  if jsonb_typeof(assignments) <> 'array' then raise exception 'Lista de remanejamento inválida.'; end if;

  select sm.* into v_member
  from public.school_members sm
  left join public.school_member_permissions smp on smp.member_id = sm.id
  where sm.school_id = target_school_id and sm.user_id = auth.uid() and sm.status = 'active'
    and (sm.role = 'school_admin' or (sm.role = 'coordinator' and coalesce(smp.can_prepare_school_year, false)));
  if not found then raise exception 'Sem permissão para preparar o novo ano letivo.'; end if;

  if target_school_year <= coalesce((
    select max(c.school_year) from public.classes c
    where c.school_id = target_school_id and c.school_year is not null
  ), target_school_year - 1) then
    raise exception 'O novo ano letivo precisa ser posterior ao último ano já preparado.';
  end if;

  select count(*) into v_count from public.students
  where school_id = target_school_id and enrollment_status = 'active';
  select count(distinct (item->>'student_id')) into v_input_count
  from jsonb_array_elements(assignments) item;
  if v_input_count <> v_count or jsonb_array_length(assignments) <> v_count then
    raise exception 'Todos os alunos ativos precisam ter um destino antes da confirmação.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(assignments) item
    left join public.students s on s.id = (item->>'student_id')::uuid
      and s.school_id = target_school_id and s.enrollment_status = 'active'
    where s.id is null
  ) then raise exception 'A lista contém aluno inválido ou de outra escola.'; end if;

  -- Dentro da mesma transação: deixa as turmas anteriores fora do limite
  -- antes de criar as novas. Qualquer erro posterior desfaz também este passo.
  update public.classes set archived_at = now(), updated_at = now()
  where school_id = target_school_id and archived_at is null
    and school_year is distinct from target_school_year;

  for v_row in
    select s.*, item->>'status' as next_status,
      trim(item->>'class_name') as next_class_name,
      coalesce(nullif(trim(item->>'shift'), ''), 'Matutino') as next_shift
    from jsonb_array_elements(assignments) item
    join public.students s on s.id = (item->>'student_id')::uuid
    where s.school_id = target_school_id
  loop
    if v_row.next_status not in ('active', 'repeated', 'transferred') then
      raise exception 'Situação inválida para %.', v_row.full_name;
    end if;
    if v_row.next_status in ('active', 'repeated') and coalesce(v_row.next_class_name, '') = '' then
      raise exception 'Informe a nova turma de %.', v_row.full_name;
    end if;

    insert into public.student_class_history
      (school_id, student_id, class_id, class_name, school_year, transition_result, created_by, student_snapshot)
    select target_school_id, v_row.id, c.id, coalesce(v_row.class_name, c.name),
      coalesce(c.school_year, target_school_year - 1),
      case v_row.next_status when 'repeated' then 'repeated' when 'transferred' then 'transferred' else 'remapped' end,
      auth.uid(), jsonb_build_object(
        'full_name', v_row.full_name,
        'has_report', v_row.has_report,
        'uniform_received', v_row.uniform_received,
        'shoes_received', v_row.shoes_received,
        'material_received', v_row.material_received,
        'uniform_size', v_row.uniform_size,
        'shoe_size', v_row.shoe_size,
        'uniform_received_at', v_row.uniform_received_at,
        'uniform_notes', v_row.uniform_notes
      )
    from public.classes c where c.id = v_row.class_id
    on conflict (student_id, school_year) do nothing;

    if v_row.next_status in ('active', 'repeated') then
      select id into v_class_id from public.classes
      where school_id = target_school_id and school_year = target_school_year
        and lower(trim(name)) = lower(v_row.next_class_name)
        and lower(trim(shift)) = lower(v_row.next_shift) and archived_at is null
      limit 1;
      if v_class_id is null then
        insert into public.classes (school_id, name, shift, school_year)
        values (target_school_id, v_row.next_class_name, v_row.next_shift, target_school_year)
        returning id into v_class_id;
        v_classes := v_classes + 1;
      end if;
      update public.students set class_id = v_class_id, class_name = v_row.next_class_name,
        enrollment_status = 'active', updated_at = now() where id = v_row.id;
      v_moved := v_moved + 1;
    else
      if v_row.photo_path is not null then
        v_removed_photo_paths := array_append(v_removed_photo_paths, v_row.photo_path);
      end if;
      update public.students set enrollment_status = v_row.next_status, photo_path = null, updated_at = now()
      where id = v_row.id;
      v_inactive := v_inactive + 1;
    end if;
  end loop;

  return jsonb_build_object('students_moved', v_moved, 'students_inactivated', v_inactive,
    'classes_created', v_classes, 'school_year', target_school_year,
    'removed_photo_paths', to_jsonb(v_removed_photo_paths));
end;
$function$;

revoke all on function public.apply_school_year_transition(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_school_year_transition(uuid, integer, jsonb) to authenticated;

commit;
