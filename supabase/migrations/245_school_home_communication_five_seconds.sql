begin;

alter table public.school_home_communications
  drop constraint if exists school_home_communications_display_seconds_check,
  add constraint school_home_communications_display_seconds_check
    check (display_seconds between 5 and 45);

alter table public.school_home_summary_settings
  drop constraint if exists school_home_summary_system_seconds_check,
  drop constraint if exists school_home_summary_notice_seconds_check,
  add constraint school_home_summary_system_seconds_check
    check (system_seconds between 5 and 45),
  add constraint school_home_summary_notice_seconds_check
    check (notice_default_seconds between 5 and 45);

commit;
