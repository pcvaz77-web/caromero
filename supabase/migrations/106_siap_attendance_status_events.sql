begin;

create table if not exists public.siap_attendance_status_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year integer not null,
  term text not null,
  subject text not null,
  months text[] not null default '{}',
  from_status text check (from_status is null or from_status in ('frequent','absent','active_search')),
  to_status text not null check (to_status in ('frequent','absent','active_search')),
  previous_percentage integer check (previous_percentage is null or previous_percentage between 0 and 100),
  percentage integer not null check (percentage between 0 and 100),
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.siap_attendance_status_events enable row level security;

create policy "members_view_attendance_status_events" on public.siap_attendance_status_events
for select to authenticated using (public.is_active_school_member(school_id));

create policy "authorized_insert_attendance_status_events" on public.siap_attendance_status_events
for insert to authenticated with check (
  public.is_active_school_member(school_id)
  and changed_by = auth.uid()
  and exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=siap_attendance_status_events.school_id
      and sm.user_id=auth.uid() and sm.status='active'
      and (sm.role in ('school_admin','coordinator') or coalesce(p.can_import_siap_attendance,false))
  )
);

create index if not exists siap_attendance_status_events_student_idx
on public.siap_attendance_status_events(school_id,student_id,changed_at desc);

grant select,insert on public.siap_attendance_status_events to authenticated;

insert into public.siap_attendance_status_events
  (school_id,student_id,class_id,academic_year,term,subject,months,from_status,to_status,previous_percentage,percentage,changed_by,changed_at)
select school_id,student_id,class_id,academic_year,term,subject,months,null,status,null,percentage,updated_by,updated_at
from public.siap_attendance_current current_row
where not exists (
  select 1 from public.siap_attendance_status_events event_row
  where event_row.school_id=current_row.school_id and event_row.student_id=current_row.student_id
    and event_row.subject=current_row.subject and event_row.academic_year=current_row.academic_year and event_row.term=current_row.term
);

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
      where school_id=item_school and student_id=item_student and subject=item_subject and academic_year=item_year and term=item_term;

    insert into public.siap_attendance_history
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,source_dates,imported_by,imported_at)
    values (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,item_source_dates,auth.uid(),changed_time)
    on conflict (school_id,student_id,period_key) do update set class_id=excluded.class_id,months=excluded.months,lesson_count=excluded.lesson_count,
      presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,status=excluded.status,source_dates=excluded.source_dates,
      imported_by=auth.uid(),imported_at=changed_time;

    insert into public.siap_attendance_current
      (school_id,student_id,class_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,updated_by,updated_at)
    values (item_school,item_student,item_class,item_year,item_term,item_subject,item_months,item_lessons,item_presences,item_absences,item_percentage,item_status,item_period,auth.uid(),changed_time)
    on conflict (school_id,student_id,subject,academic_year,term) do update set class_id=excluded.class_id,months=excluded.months,
      lesson_count=excluded.lesson_count,presences=excluded.presences,absences=excluded.absences,percentage=excluded.percentage,status=excluded.status,
      period_key=excluded.period_key,updated_by=auth.uid(),updated_at=changed_time;

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

grant execute on function public.import_siap_attendance_results(jsonb) to authenticated;

commit;
