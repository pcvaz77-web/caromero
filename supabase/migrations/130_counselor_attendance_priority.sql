begin;

-- A Frequência Assistida do professor passa a ser uma atribuição
-- contextual: somente um professor ativo que seja o conselheiro da turma
-- informada pode importar. A verificação fica no banco para que ocultar ou
-- forjar um botão no navegador nunca amplie a autorização.
create or replace function public.can_import_counselor_attendance(
  target_school_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_members sm
      join public.class_counselors cc
        on cc.school_id = sm.school_id
       and cc.counselor_user_id = sm.user_id
       and cc.class_id = target_class_id
      join public.classes c
        on c.id = cc.class_id
       and c.school_id = sm.school_id
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role = 'teacher'
    );
$function$;

revoke all on function public.can_import_counselor_attendance(uuid,uuid) from public, anon;
grant execute on function public.can_import_counselor_attendance(uuid,uuid) to authenticated;

-- Escritas diretas deixam de ser uma rota alternativa. Também são retirados
-- TRUNCATE/TRIGGER/REFERENCES herdados de grants antigos. As tabelas continuam
-- legíveis pelos membros autorizados, e toda gravação passa pela RPC abaixo.
revoke all privileges on public.siap_attendance_history from authenticated;
revoke all privileges on public.siap_attendance_current from authenticated;
revoke all privileges on public.siap_attendance_status_events from authenticated;
grant select on public.siap_attendance_history to authenticated;
grant select on public.siap_attendance_current to authenticated;
grant select on public.siap_attendance_status_events to authenticated;

drop policy if exists "authorized_import_attendance_history" on public.siap_attendance_history;
drop policy if exists "authorized_update_attendance_history" on public.siap_attendance_history;
drop policy if exists "authorized_import_current_attendance" on public.siap_attendance_current;
drop policy if exists "authorized_update_current_attendance" on public.siap_attendance_current;
drop policy if exists "authorized_insert_attendance_status_events" on public.siap_attendance_status_events;

create or replace function public.import_siap_attendance_results(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  item jsonb;
  actor_id uuid := auth.uid();
  previous_status text;
  previous_percentage integer;
  changed_time timestamptz := now();
  imported_count integer := 0;
  item_school uuid;
  item_student uuid;
  item_class uuid;
  item_year integer;
  item_term text;
  item_subject text;
  item_months text[];
  item_lessons integer;
  item_presences integer;
  item_absences integer;
  item_percentage integer;
  item_status text;
  item_period text;
  item_source_dates text[];
  frequent_minimum integer;
  absent_minimum integer;
begin
  if actor_id is null then raise exception 'Usuário não autenticado.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows deve ser uma lista.'; end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    item_school := (item->>'school_id')::uuid;
    item_student := (item->>'student_id')::uuid;
    item_class := (item->>'class_id')::uuid;
    item_year := (item->>'academic_year')::integer;
    item_term := nullif(pg_catalog.btrim(item->>'term'),'');
    item_subject := nullif(pg_catalog.btrim(item->>'subject'),'');
    item_months := array(select jsonb_array_elements_text(item->'months'));
    item_lessons := (item->>'lesson_count')::integer;
    item_presences := (item->>'presences')::integer;
    item_absences := (item->>'absences')::integer;
    item_period := nullif(pg_catalog.btrim(item->>'period_key'),'');
    item_source_dates := array(select jsonb_array_elements_text(item->'source_dates'));

    if not public.can_import_counselor_attendance(item_school,item_class) then
      raise exception 'Somente o professor conselheiro desta turma pode importar a Frequência Assistida.';
    end if;
    if not exists (
      select 1 from public.students s
      where s.id=item_student and s.school_id=item_school and s.class_id=item_class
    ) then
      raise exception 'Aluno ou turma não pertence à escola informada.';
    end if;
    if item_year < 2000 or item_year > 2100 or item_term is null or item_subject is null
       or item_period is null or cardinality(item_months)=0 then
      raise exception 'Período inválido para a Frequência Assistida.';
    end if;
    if item_lessons <= 0 or item_presences < 0 or item_absences < 0
       or item_presences + item_absences <> item_lessons then
      raise exception 'Totais inválidos para a Frequência Assistida.';
    end if;

    item_percentage := pg_catalog.round(item_presences::numeric / item_lessons::numeric * 100)::integer;
    select coalesce(cfg.frequent_minimum,75),coalesce(cfg.absent_minimum,60)
      into frequent_minimum,absent_minimum
    from (select 1) base
    left join public.school_siap_attendance_settings cfg on cfg.school_id=item_school;
    item_status := case
      when item_percentage >= frequent_minimum then 'frequent'
      when item_percentage >= absent_minimum then 'absent'
      else 'active_search'
    end;

    select current_row.status,current_row.percentage
      into previous_status,previous_percentage
    from public.siap_attendance_current current_row
    where current_row.school_id=item_school
      and current_row.student_id=item_student
      and current_row.subject=item_subject
      and current_row.academic_year=item_year
      and current_row.term=item_term
      and current_row.updated_by=actor_id;

    insert into public.siap_attendance_history
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,source_dates,imported_by,imported_at)
    values
      (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,item_source_dates,actor_id,changed_time)
    on conflict (school_id,student_id,period_key,imported_by) do update set
      class_id=excluded.class_id,months=excluded.months,lesson_count=excluded.lesson_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,
      status=excluded.status,source_dates=excluded.source_dates,imported_at=changed_time;

    insert into public.siap_attendance_current
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,updated_by,updated_at)
    values
      (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,actor_id,changed_time)
    on conflict (school_id,student_id,subject,academic_year,term,updated_by) do update set
      class_id=excluded.class_id,months=excluded.months,lesson_count=excluded.lesson_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,
      status=excluded.status,period_key=excluded.period_key,updated_at=changed_time;

    if previous_status is distinct from item_status then
      insert into public.siap_attendance_status_events
        (school_id,student_id,class_id,academic_year,term,subject,months,from_status,to_status,previous_percentage,percentage,changed_by,changed_at)
      values
        (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,previous_status,item_status,previous_percentage,item_percentage,actor_id,changed_time);
    end if;

    imported_count := imported_count + 1;
    previous_status := null;
    previous_percentage := null;
  end loop;
  return imported_count;
end;
$function$;

revoke all on function public.import_siap_attendance_results(jsonb) from public, anon;
grant execute on function public.import_siap_attendance_results(jsonb) to authenticated;

-- Entrega aos cards uma única situação efetiva por aluno. Primeiro é
-- escolhido o período mais recentemente capturado. Dentro do mesmo período,
-- a captura do professor conselheiro prevalece; sem ela, entra a Secretaria.
create or replace function public.get_effective_siap_attendance_labels(p_school_id uuid)
returns table (
  student_id uuid,
  source_key text,
  status text,
  percentage integer,
  academic_year integer,
  term text,
  months text[],
  teacher_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_active_school_member(p_school_id) then
    raise exception 'Acesso restrito aos membros ativos da escola.';
  end if;

  return query
  with teacher_base as (
    select
      a.id,
      a.student_id as row_student_id,
      case
        when a.percentage >= coalesce(cfg.frequent_minimum,75) then 'frequent'
        when a.percentage >= coalesce(cfg.absent_minimum,60) then 'absent'
        else 'active_search'
      end::text as row_status,
      a.percentage as row_percentage,
      a.academic_year as row_year,
      a.term as row_term,
      a.months as row_months,
      array_to_string(array(select month_name from unnest(a.months) as month_values(month_name) order by month_name),'|') as period_months,
      (select max(case month_name
        when 'Janeiro' then 1 when 'Fevereiro' then 2 when 'Março' then 3 when 'Abril' then 4
        when 'Maio' then 5 when 'Junho' then 6 when 'Julho' then 7 when 'Agosto' then 8
        when 'Setembro' then 9 when 'Outubro' then 10 when 'Novembro' then 11 when 'Dezembro' then 12
        else 0 end)
       from unnest(a.months) as month_values(month_name)) as period_month_rank,
      coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')::text as row_teacher_name,
      a.updated_at as row_updated_at
    from public.siap_attendance_current a
    left join public.profiles p on p.id=a.updated_by
    left join public.school_siap_attendance_settings cfg on cfg.school_id=a.school_id
    where a.school_id=p_school_id
  ),
  teacher_ranked as (
    select
      teacher_base.*,
      row_number() over (
        partition by row_student_id,row_year,row_term,period_months
        order by case row_status when 'active_search' then 2 when 'absent' then 1 else 0 end desc,
          row_updated_at desc,id
      ) as priority
    from teacher_base
  ),
  teacher_period as (
    select * from teacher_ranked where priority=1
  ),
  secretary_period as (
    select
      a.id,
      a.student_id as row_student_id,
      case
        when a.percentage >= coalesce(cfg.frequent_minimum,75) then 'frequent'
        when a.percentage >= coalesce(cfg.absent_minimum,60) then 'absent'
        else 'active_search'
      end::text as row_status,
      a.percentage as row_percentage,
      a.academic_year as row_year,
      a.term as row_term,
      a.months as row_months,
      array_to_string(array(select month_name from unnest(a.months) as month_values(month_name) order by month_name),'|') as period_months,
      (select max(case month_name
        when 'Janeiro' then 1 when 'Fevereiro' then 2 when 'Março' then 3 when 'Abril' then 4
        when 'Maio' then 5 when 'Junho' then 6 when 'Julho' then 7 when 'Agosto' then 8
        when 'Setembro' then 9 when 'Outubro' then 10 when 'Novembro' then 11 when 'Dezembro' then 12
        else 0 end)
       from unnest(a.months) as month_values(month_name)) as period_month_rank,
      a.updated_at as row_updated_at
    from public.siap_school_daily_attendance_current a
    left join public.school_siap_attendance_settings cfg on cfg.school_id=a.school_id
    where a.school_id=p_school_id
  ),
  available_periods as (
    select row_student_id,row_year,row_term,period_months,period_month_rank,row_updated_at from teacher_period
    union all
    select row_student_id,row_year,row_term,period_months,period_month_rank,row_updated_at from secretary_period
  ),
  latest_period as (
    select distinct on (row_student_id)
      row_student_id,row_year,row_term,period_months,period_month_rank,row_updated_at
    from available_periods
    order by row_student_id,row_year desc,period_month_rank desc,row_updated_at desc,row_term desc
  )
  select
    latest.row_student_id,
    case when teacher.id is not null then 'teacher' else 'secretary' end::text,
    coalesce(teacher.row_status,secretary.row_status)::text,
    coalesce(teacher.row_percentage,secretary.row_percentage)::integer,
    latest.row_year,
    latest.row_term::text,
    coalesce(teacher.row_months,secretary.row_months),
    teacher.row_teacher_name,
    coalesce(teacher.row_updated_at,secretary.row_updated_at)
  from latest_period latest
  left join teacher_period teacher
    on teacher.row_student_id=latest.row_student_id
   and teacher.row_year=latest.row_year
   and teacher.row_term=latest.row_term
   and teacher.period_months=latest.period_months
  left join secretary_period secretary
    on secretary.row_student_id=latest.row_student_id
   and secretary.row_year=latest.row_year
   and secretary.row_term=latest.row_term
   and secretary.period_months=latest.period_months;
end;
$function$;

revoke all on function public.get_effective_siap_attendance_labels(uuid) from public, anon;
grant execute on function public.get_effective_siap_attendance_labels(uuid) to authenticated;

comment on function public.get_effective_siap_attendance_labels(uuid) is
  'Etiqueta efetiva por aluno e período: professor conselheiro primeiro, Secretaria como fallback.';

commit;
