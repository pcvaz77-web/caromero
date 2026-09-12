begin;

create table if not exists public.siap_attendance_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year integer not null,
  term text not null,
  subject text not null,
  months text[] not null,
  lesson_count integer not null check (lesson_count >= 0),
  presences integer not null check (presences >= 0),
  absences integer not null check (absences >= 0),
  percentage integer not null check (percentage between 0 and 100),
  status text not null check (status in ('frequent','absent','active_search')),
  period_key text not null,
  source_dates text[] not null default '{}',
  imported_by uuid not null default auth.uid() references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (school_id, student_id, period_key)
);

create table if not exists public.siap_attendance_current (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year integer not null,
  term text not null,
  subject text not null,
  months text[] not null,
  lesson_count integer not null check (lesson_count >= 0),
  presences integer not null check (presences >= 0),
  absences integer not null check (absences >= 0),
  percentage integer not null check (percentage between 0 and 100),
  status text not null check (status in ('frequent','absent','active_search')),
  period_key text not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id, subject, academic_year, term)
);

alter table public.siap_attendance_history enable row level security;
alter table public.siap_attendance_current enable row level security;

create policy "members_view_attendance_history" on public.siap_attendance_history
for select to authenticated using (public.is_active_school_member(school_id));
create policy "members_view_current_attendance" on public.siap_attendance_current
for select to authenticated using (public.is_active_school_member(school_id));

create policy "authorized_import_attendance_history" on public.siap_attendance_history
for insert to authenticated with check (
  public.is_active_school_member(school_id)
  and imported_by = auth.uid()
  and exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id = sm.id
    where sm.school_id = siap_attendance_history.school_id and sm.user_id = auth.uid() and sm.status = 'active'
      and (sm.role in ('school_admin','coordinator') or coalesce(p.can_import_siap_attendance,false))
  )
);
create policy "authorized_update_attendance_history" on public.siap_attendance_history
for update to authenticated using (
  exists (select 1 from public.school_members sm left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=siap_attendance_history.school_id and sm.user_id=auth.uid() and sm.status='active'
      and (sm.role in ('school_admin','coordinator') or coalesce(p.can_import_siap_attendance,false)))
)
with check (public.is_active_school_member(school_id));

create policy "authorized_import_current_attendance" on public.siap_attendance_current
for insert to authenticated with check (
  public.is_active_school_member(school_id)
  and updated_by = auth.uid()
  and exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id = sm.id
    where sm.school_id = siap_attendance_current.school_id and sm.user_id = auth.uid() and sm.status = 'active'
      and (sm.role in ('school_admin','coordinator') or coalesce(p.can_import_siap_attendance,false))
  )
);
create policy "authorized_update_current_attendance" on public.siap_attendance_current
for update to authenticated using (
  exists (select 1 from public.school_members sm left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=siap_attendance_current.school_id and sm.user_id=auth.uid() and sm.status='active'
      and (sm.role in ('school_admin','coordinator') or coalesce(p.can_import_siap_attendance,false)))
)
with check (public.is_active_school_member(school_id));

create index if not exists siap_attendance_history_school_student_idx on public.siap_attendance_history(school_id,student_id,imported_at desc);
create index if not exists siap_attendance_current_school_status_idx on public.siap_attendance_current(school_id,status,updated_at desc);

grant select, insert, update on public.siap_attendance_history to authenticated;
grant select, insert, update on public.siap_attendance_current to authenticated;

commit;
