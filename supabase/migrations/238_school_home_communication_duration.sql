begin;

alter table public.school_home_communications
  add column if not exists display_seconds smallint not null default 15
  check (display_seconds between 8 and 45);

commit;
