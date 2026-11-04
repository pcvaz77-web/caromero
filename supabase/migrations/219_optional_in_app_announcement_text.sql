begin;

alter table public.platform_in_app_announcements
  drop constraint platform_in_app_announcements_title_check,
  drop constraint platform_in_app_announcements_message_body_check;

alter table public.platform_in_app_announcements
  add constraint platform_in_app_announcements_title_check
    check (char_length(btrim(title)) = 0 or char_length(btrim(title)) between 3 and 120),
  add constraint platform_in_app_announcements_message_body_check
    check (char_length(btrim(message_body)) = 0 or char_length(btrim(message_body)) between 3 and 2000),
  add constraint platform_in_app_announcements_content_check
    check (char_length(btrim(title)) > 0 or char_length(btrim(message_body)) > 0
      or theme_image_url is not null or notice_image_url is not null
      or video_url is not null or video_storage_path is not null);

commit;
