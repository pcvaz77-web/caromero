-- Remove o bloqueio de exclusao da conta sem excluir frequencias escolares.
-- Nenhuma conta ou registro existente e excluido por esta migration.
-- Defaults auth.uid(), RLS e permissoes de importacao permanecem iguais.
-- A referencia de autoria fica NULL somente quando a conta for excluida.
begin;

alter table public.siap_attendance_history
  alter column imported_by drop not null,
  drop constraint siap_attendance_history_imported_by_fkey,
  add constraint siap_attendance_history_imported_by_fkey
    foreign key (imported_by) references auth.users(id) on delete set null;

alter table public.siap_attendance_current
  alter column updated_by drop not null,
  drop constraint siap_attendance_current_updated_by_fkey,
  add constraint siap_attendance_current_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.siap_attendance_status_events
  alter column changed_by drop not null,
  drop constraint siap_attendance_status_events_changed_by_fkey,
  add constraint siap_attendance_status_events_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;


-- Nome historico controlado pelo servidor; nao depende da sobrevivencia do perfil.
alter table public.siap_attendance_history add column actor_name text;
alter table public.siap_attendance_current add column actor_name text;
alter table public.siap_attendance_status_events add column actor_name text;

create function public.preserve_attendance_actor_name()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare actor_id uuid;
begin
  actor_id := (pg_catalog.to_jsonb(new)->>tg_argv[0])::uuid;
  if tg_op = 'UPDATE' and actor_id is null then
    new.actor_name := old.actor_name;
  else
    select coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')
      into new.actor_name from public.profiles p where p.id=actor_id;
    new.actor_name := coalesce(new.actor_name,'Professor não identificado');
  end if;
  return new;
end;
$function$;
revoke all on function public.preserve_attendance_actor_name() from public, anon, authenticated;

-- Sincronizacao de datas nao precisa rodar em uma mudanca apenas de autoria.
-- Mantem a funcao existente e limita o disparo aos campos de origem.
drop trigger sync_siap_attendance_current_source_dates on public.siap_attendance_current;
create trigger sync_siap_attendance_current_source_dates
before insert or update of school_id,student_id,academic_year,term,subject,period_key,updated_by
on public.siap_attendance_current for each row
execute function public.sync_siap_attendance_current_source_dates();

update public.siap_attendance_history a set actor_name=coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')
from public.profiles p where p.id=a.imported_by;
create trigger preserve_attendance_actor_name
before insert or update on public.siap_attendance_history
for each row execute function public.preserve_attendance_actor_name('imported_by');

update public.siap_attendance_current a set actor_name=coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')
from public.profiles p where p.id=a.updated_by;
create trigger preserve_attendance_actor_name
before insert or update on public.siap_attendance_current
for each row execute function public.preserve_attendance_actor_name('updated_by');

update public.siap_attendance_status_events a set actor_name=coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')
from public.profiles p where p.id=a.changed_by;
create trigger preserve_attendance_actor_name
before insert or update on public.siap_attendance_status_events
for each row execute function public.preserve_attendance_actor_name('changed_by');

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
      (coalesce(
        nullif(pg_catalog.btrim(p.full_name),''),
        nullif(pg_catalog.btrim(p.email),''),
        nullif(pg_catalog.btrim(a.actor_name),''),
        'Professor não identificado'
      ) || case when a.updated_by is null then ' (excluído do Carômetro)' else '' end)::text as row_teacher_name,
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


commit;
