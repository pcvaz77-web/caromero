begin;

alter table public.students drop constraint if exists students_enrollment_status_check;
alter table public.students add constraint students_enrollment_status_check
  check (enrollment_status in ('active', 'transferred', 'concluded'));

alter table public.student_class_history
  drop constraint if exists student_class_history_transition_result_check;
alter table public.student_class_history
  add constraint student_class_history_transition_result_check
  check (transition_result in ('remapped', 'repeated', 'transferred', 'concluded'));

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
  v_terminal boolean;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if target_school_year < 2020 or target_school_year > 2200 then
    raise exception 'Ano letivo inválido.';
  end if;
  if jsonb_typeof(assignments) <> 'array' then
    raise exception 'Lista de remanejamento inválida.';
  end if;

  select sm.* into v_member
  from public.school_members sm
  left join public.school_member_permissions smp on smp.member_id = sm.id
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
    and (sm.role = 'school_admin'
      or (sm.role = 'coordinator' and coalesce(smp.can_prepare_school_year, false)));
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
  ) then
    raise exception 'A lista contém aluno inválido ou de outra escola.';
  end if;

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
    v_terminal := coalesce(v_row.class_name, '') ~* '(^|[[:space:]])3[[:space:]]*(ª|a)[[:space:]]*s(é|e)rie([[:space:]]|$)'
      or coalesce(v_row.class_name, '') ~* '(^|[[:space:]])3[[:space:]]*(º|o)?[[:space:]]*ano[[:space:]]*(do[[:space:]]*)?(ensino[[:space:]]*m(é|e)dio|em)([[:space:]]|$)';

    if v_row.next_status not in ('active', 'repeated', 'transferred', 'concluded') then
      raise exception 'Situação inválida para %.', v_row.full_name;
    end if;
    if v_terminal and v_row.next_status = 'active' then
      raise exception 'Aluno aprovado da 3ª série deve ser marcado como concluinte.';
    end if;
    if not v_terminal and v_row.next_status = 'concluded' then
      raise exception 'Somente alunos da 3ª série podem concluir a etapa.';
    end if;
    if v_row.next_status in ('active', 'repeated') and coalesce(v_row.next_class_name, '') = '' then
      raise exception 'Informe a nova turma de %.', v_row.full_name;
    end if;

    insert into public.student_class_history
      (school_id, student_id, class_id, class_name, school_year, transition_result, created_by, student_snapshot)
    select target_school_id, v_row.id, c.id, coalesce(v_row.class_name, c.name),
      coalesce(c.school_year, target_school_year - 1),
      case v_row.next_status
        when 'repeated' then 'repeated'
        when 'transferred' then 'transferred'
        when 'concluded' then 'concluded'
        else 'remapped'
      end,
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
      v_class_id := null;
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
    elsif v_row.next_status = 'transferred' then
      if v_row.photo_path is not null then
        v_removed_photo_paths := array_append(v_removed_photo_paths, v_row.photo_path);
      end if;
      update public.students set enrollment_status = 'transferred', photo_path = null, updated_at = now()
      where id = v_row.id;
      v_inactive := v_inactive + 1;
    else
      update public.students set enrollment_status = 'concluded', updated_at = now()
      where id = v_row.id;
      v_inactive := v_inactive + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'students_moved', v_moved,
    'students_inactivated', v_inactive,
    'classes_created', v_classes,
    'school_year', target_school_year,
    'removed_photo_paths', to_jsonb(v_removed_photo_paths)
  );
end;
$function$;

revoke all on function public.apply_school_year_transition(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_school_year_transition(uuid, integer, jsonb) to authenticated;

commit;
