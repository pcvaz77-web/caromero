begin;

alter table public.platform_in_app_announcements
  add column communication_kind text not null default 'notice'
  check (communication_kind in ('notice', 'campaign'));

update public.platform_in_app_announcements
set communication_kind = 'campaign'
where theme_image_url is not null
   or theme_key not in ('classic', 'custom');

commit;
