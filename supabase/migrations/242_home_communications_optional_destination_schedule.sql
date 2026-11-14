begin;

alter table public.school_home_communications
  drop constraint if exists school_home_communications_destination_type_check;
alter table public.school_home_communications
  add constraint school_home_communications_destination_type_check
  check (destination_type in ('none', 'occurrences', 'students', 'external'));

alter table public.school_home_communications
  add column start_time time without time zone,
  add column end_time time without time zone;

alter table public.school_home_communications
  add constraint school_home_communications_schedule_check check (
    (end_time is null or ends_on is not null)
    and (ends_on is null or ends_on <> starts_on or end_time is null
      or end_time >= coalesce(start_time, time '00:00'))
  );

commit;
