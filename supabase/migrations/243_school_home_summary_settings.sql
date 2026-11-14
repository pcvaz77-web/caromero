begin;

create table public.school_home_summary_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  metric_keys text[] not null default array[
    'student_occurrences', 'class_occurrences', 'praise_student',
    'siap_student_absences', 'school_data'
  ]::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint school_home_summary_metric_keys_check check (
    metric_keys <@ array[
      'student_occurrences', 'class_occurrences', 'praise_student',
      'siap_student_absences', 'school_data', 'new_students',
      'classes_without_occurrences', 'class_fewest_occurrences',
      'siap_class_low_absences', 'siap_class_high_absences'
    ]::text[]
  )
);

alter table public.school_home_summary_settings enable row level security;

create policy school_home_summary_settings_read on public.school_home_summary_settings
  for select to authenticated using (public.is_active_school_member(school_id));

create policy school_home_summary_settings_insert on public.school_home_summary_settings
  for insert to authenticated with check (
    updated_by = auth.uid()
    and exists (select 1 from public.school_members member
      where member.school_id = school_home_summary_settings.school_id
        and member.user_id = auth.uid() and member.status = 'active'
        and member.role in ('school_admin', 'coordinator'))
  );

create policy school_home_summary_settings_update on public.school_home_summary_settings
  for update to authenticated
  using (exists (select 1 from public.school_members member
    where member.school_id = school_home_summary_settings.school_id
      and member.user_id = auth.uid() and member.status = 'active'
      and member.role in ('school_admin', 'coordinator')))
  with check (updated_by = auth.uid() and exists (
    select 1 from public.school_members member
    where member.school_id = school_home_summary_settings.school_id
      and member.user_id = auth.uid() and member.status = 'active'
      and member.role in ('school_admin', 'coordinator')));

revoke all on public.school_home_summary_settings from public, anon, authenticated;
grant select, insert, update on public.school_home_summary_settings to authenticated;

commit;
