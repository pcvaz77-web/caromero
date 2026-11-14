begin;

alter table public.school_home_summary_settings
  add column system_seconds integer not null default 15,
  add column notice_default_seconds integer not null default 15,
  add constraint school_home_summary_system_seconds_check check (system_seconds between 8 and 45),
  add constraint school_home_summary_notice_seconds_check check (notice_default_seconds between 8 and 45);

create policy school_home_communications_update on public.school_home_communications
  for update to authenticated
  using (exists (
    select 1 from public.school_members member
    where member.school_id = school_home_communications.school_id
      and member.user_id = auth.uid() and member.status = 'active'
      and member.role in ('school_admin', 'coordinator')
  ))
  with check (exists (
    select 1 from public.school_members member
    where member.school_id = school_home_communications.school_id
      and member.user_id = auth.uid() and member.status = 'active'
      and member.role in ('school_admin', 'coordinator')
  ));

grant update (title, destination_type, destination_url, starts_on, start_time,
  ends_on, end_time, display_seconds) on public.school_home_communications to authenticated;

commit;
