-- CARÔMETRO COMERCIAL
-- Preserva as datas exatas da captura efetiva para distinguir mês isolado,
-- bimestre completo e intervalo parcial na apresentação da frequência.

begin;

alter table public.siap_attendance_current
  add column if not exists source_dates text[] not null default '{}';

comment on column public.siap_attendance_current.source_dates is
  'Datas efetivamente lidas no SIAP na captura atual do professor.';

create or replace function public.sync_siap_attendance_current_source_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matched_dates text[];
begin
  select h.source_dates
  into matched_dates
  from public.siap_attendance_history h
  where h.school_id = new.school_id
    and h.student_id = new.student_id
    and h.academic_year = new.academic_year
    and h.term = new.term
    and h.subject = new.subject
    and h.period_key = new.period_key
    and h.imported_by = new.updated_by
  order by h.imported_at desc
  limit 1;

  if found then
    new.source_dates := coalesce(matched_dates, '{}'::text[]);
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_siap_attendance_current_source_dates
on public.siap_attendance_current;
create trigger sync_siap_attendance_current_source_dates
before insert or update on public.siap_attendance_current
for each row execute function public.sync_siap_attendance_current_source_dates();

update public.siap_attendance_current current_row
set source_dates = coalesce((
  select history_row.source_dates
  from public.siap_attendance_history history_row
  where history_row.school_id = current_row.school_id
    and history_row.student_id = current_row.student_id
    and history_row.academic_year = current_row.academic_year
    and history_row.term = current_row.term
    and history_row.subject = current_row.subject
    and history_row.period_key = current_row.period_key
    and history_row.imported_by = current_row.updated_by
  order by history_row.imported_at desc
  limit 1
), '{}'::text[])
where coalesce(cardinality(current_row.source_dates), 0) = 0;

create or replace function public.get_effective_siap_attendance_labels_v2(p_school_id uuid)
returns table (
  student_id uuid,
  source_key text,
  status text,
  percentage integer,
  academic_year integer,
  term text,
  months text[],
  source_dates text[],
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
      a.source_dates as row_source_dates,
      array_to_string(array(
        select month_name
        from unnest(a.months) as month_values(month_name)
        order by month_name
      ),'|') as period_months,
      (select max(case month_name
        when 'Janeiro' then 1 when 'Fevereiro' then 2 when 'Março' then 3 when 'Abril' then 4
        when 'Maio' then 5 when 'Junho' then 6 when 'Julho' then 7 when 'Agosto' then 8
        when 'Setembro' then 9 when 'Outubro' then 10 when 'Novembro' then 11 when 'Dezembro' then 12
        else 0 end)
       from unnest(a.months) as month_values(month_name)) as period_month_rank,
      coalesce(
        nullif(pg_catalog.btrim(p.full_name),''),
        nullif(pg_catalog.btrim(p.email),''),
        'Professor não identificado'
      )::text as row_teacher_name,
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
      a.source_dates as row_source_dates,
      array_to_string(array(
        select month_name
        from unnest(a.months) as month_values(month_name)
        order by month_name
      ),'|') as period_months,
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
    coalesce(teacher.row_source_dates,secretary.row_source_dates,'{}'::text[]),
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

revoke all on function public.sync_siap_attendance_current_source_dates() from public, anon, authenticated;
revoke all on function public.get_effective_siap_attendance_labels_v2(uuid) from public, anon;
grant execute on function public.get_effective_siap_attendance_labels_v2(uuid) to authenticated;

comment on function public.get_effective_siap_attendance_labels_v2(uuid) is
  'Etiqueta efetiva com datas capturadas para distinguir mês, bimestre completo e período parcial.';

commit;
