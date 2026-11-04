begin;

alter table public.platform_in_app_announcements
  add column ticker_text text,
  add column ticker_text_color text not null default '#ffffff',
  add column ticker_background_color text not null default '#071a36',
  add constraint platform_in_app_announcements_ticker_text_check
    check (ticker_text is null or (
      char_length(btrim(ticker_text)) between 1 and 180
      and ticker_text !~ '[\r\n]'
    )),
  add constraint platform_in_app_announcements_ticker_color_check
    check (ticker_text_color ~ '^#[0-9A-Fa-f]{6}$'
      and ticker_background_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.platform_in_app_announcements
  drop constraint platform_in_app_announcements_content_check;

alter table public.platform_in_app_announcements
  add constraint platform_in_app_announcements_content_check
    check (char_length(btrim(title)) > 0 or char_length(btrim(message_body)) > 0
      or ticker_text is not null
      or theme_image_url is not null or notice_image_url is not null
      or video_url is not null or video_storage_path is not null);

commit;
