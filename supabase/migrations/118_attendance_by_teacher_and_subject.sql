begin;

-- Mantém os registros existentes e permite uma situação atual independente
-- para cada professor que importar a mesma disciplina.
alter table public.siap_attendance_current
  drop constraint if exists siap_attendance_current_school_id_student_id_subject_academ_key;
alter table public.siap_attendance_current
  add constraint siap_attendance_current_school_student_subject_period_teacher_key
  unique (school_id, student_id, subject, academic_year, term, updated_by);

-- O mesmo levantamento (período/meses) também permanece independente por
-- professor no histórico. As linhas existentes conservam imported_by.
alter table public.siap_attendance_history
  drop constraint if exists siap_attendance_history_school_id_student_id_period_key_key;
alter table public.siap_attendance_history
  add constraint siap_attendance_history_school_student_period_teacher_key
  unique (school_id, student_id, period_key, imported_by);

create or replace function public.import_siap_attendance_results(p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare
  item jsonb; previous_status text; previous_percentage integer; changed_time timestamptz:=now(); imported_count integer:=0;
  item_school uuid; item_student uuid; item_class uuid; item_year integer; item_term text; item_subject text;
  item_months text[]; item_lessons integer; item_presences integer; item_absences integer; item_percentage integer;
  item_status text; item_period text; item_source_dates text[];
begin
  if jsonb_typeof(p_rows)<>'array' then raise exception 'p_rows deve ser uma lista'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    item_school:=(item->>'school_id')::uuid;item_student:=(item->>'student_id')::uuid;item_class:=(item->>'class_id')::uuid;
    item_year:=(item->>'academic_year')::integer;item_term:=item->>'term';item_subject:=item->>'subject';
    item_months:=array(select jsonb_array_elements_text(item->'months'));item_lessons:=(item->>'lesson_count')::integer;
    item_presences:=(item->>'presences')::integer;item_absences:=(item->>'absences')::integer;
    item_percentage:=(item->>'percentage')::integer;item_status:=item->>'status';item_period:=item->>'period_key';
    item_source_dates:=array(select jsonb_array_elements_text(item->'source_dates'));

    select status,percentage into previous_status,previous_percentage from public.siap_attendance_current
      where school_id=item_school and student_id=item_student and subject=item_subject
        and academic_year=item_year and term=item_term and updated_by=auth.uid();

    insert into public.siap_attendance_history
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,source_dates,imported_by,imported_at)
    values (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,item_source_dates,auth.uid(),changed_time)
    on conflict (school_id,student_id,period_key,imported_by) do update set class_id=excluded.class_id,months=excluded.months,lesson_count=excluded.lesson_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,status=excluded.status,source_dates=excluded.source_dates,
      imported_at=changed_time;

    insert into public.siap_attendance_current
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,updated_by,updated_at)
    values (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,auth.uid(),changed_time)
    on conflict (school_id,student_id,subject,academic_year,term,updated_by) do update set class_id=excluded.class_id,months=excluded.months,
      lesson_count=excluded.lesson_count,presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,status=excluded.status,
      period_key=excluded.period_key,updated_at=changed_time;

    if previous_status is distinct from item_status then
      insert into public.siap_attendance_status_events
        (school_id,student_id,class_id,academic_year,term,subject,months,from_status,to_status,previous_percentage,percentage,changed_by,changed_at)
      values (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,previous_status,item_status,previous_percentage,item_percentage,auth.uid(),changed_time);
    end if;
    imported_count:=imported_count+1;previous_status:=null;previous_percentage:=null;
  end loop;
  return imported_count;
end;
$$;

-- A coordenação e a administração recebem os dados atuais já acompanhados do
-- nome do importador, sem ampliar a leitura de perfis para outros usuários.
create or replace function public.report_siap_attendance_current(p_school_id uuid)
returns table (
  student_id uuid,
  academic_year integer,
  term text,
  subject text,
  months text[],
  lesson_count integer,
  presences integer,
  absences integer,
  percentage integer,
  status text,
  teacher_id uuid,
  teacher_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.school_members sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active'
      and sm.role in ('school_admin','coordinator')
  ) then
    raise exception 'Acesso restrito à administração e coordenação.';
  end if;

  return query
  select a.student_id,a.academic_year,a.term,a.subject,a.months,a.lesson_count,
    a.presences,a.absences,a.percentage,
    case when a.percentage>=coalesce(cfg.frequent_minimum,75) then 'frequent'
      when a.percentage>=coalesce(cfg.absent_minimum,60) then 'absent'
      else 'active_search' end::text,
    a.updated_by,
    coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')::text,
    a.updated_at
  from public.siap_attendance_current a
  left join public.profiles p on p.id=a.updated_by
  left join public.school_siap_attendance_settings cfg on cfg.school_id=a.school_id
  where a.school_id=p_school_id
  order by a.student_id,a.academic_year desc,a.term,a.subject,
    coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado');
end;
$$;

revoke all on function public.report_siap_attendance_current(uuid) from public;
grant execute on function public.report_siap_attendance_current(uuid) to authenticated;

comment on function public.report_siap_attendance_current(uuid) is
  'Situação atual da frequência por aluno, disciplina, período e professor; restrita a administradores e coordenadores da escola.';

create or replace function public.report_siap_attendance_events(p_school_id uuid)
returns table (
  student_id uuid,
  academic_year integer,
  term text,
  subject text,
  months text[],
  from_status text,
  to_status text,
  previous_percentage integer,
  percentage integer,
  teacher_id uuid,
  teacher_name text,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.school_members sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active'
      and sm.role in ('school_admin','coordinator')
  ) then
    raise exception 'Acesso restrito à administração e coordenação.';
  end if;

  return query
  select e.student_id,e.academic_year,e.term,e.subject,e.months,e.from_status,e.to_status,
    e.previous_percentage,e.percentage,e.changed_by,
    coalesce(nullif(pg_catalog.btrim(p.full_name),''),nullif(pg_catalog.btrim(p.email),''),'Professor não identificado')::text,
    e.changed_at
  from public.siap_attendance_status_events e
  left join public.profiles p on p.id=e.changed_by
  where e.school_id=p_school_id
  order by e.changed_at,e.id;
end;
$$;

revoke all on function public.report_siap_attendance_events(uuid) from public;
grant execute on function public.report_siap_attendance_events(uuid) to authenticated;

comment on function public.report_siap_attendance_events(uuid) is
  'Histórico de classificação da frequência com professor responsável; restrito a administradores e coordenadores da escola.';

commit;
