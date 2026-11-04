begin;

alter table public.platform_in_app_announcements
  drop constraint platform_announcement_theme_valid;

alter table public.platform_in_app_announcements
  add constraint platform_announcement_theme_valid check (
    theme_key in ('classic','image_only','black_friday','teachers','public_servant','black_awareness','students','september_yellow','christmas','new_year','custom')
    and theme_color ~ '^#[0-9A-Fa-f]{6}$'
    and theme_text_color ~ '^#[0-9A-Fa-f]{6}$'
    and button_color ~ '^#[0-9A-Fa-f]{6}$'
    and (theme_image_url is null or (char_length(theme_image_url) <= 2048 and theme_image_url ~ '^https://[^[:space:]]+$'))
    and (theme_key <> 'image_only' or theme_image_url is not null)
    and (notice_image_url is null or (char_length(notice_image_url) <= 2048 and notice_image_url ~ '^https://[^[:space:]]+$'))
    and ((link_label is null) = (link_url is null))
    and (link_label is null or (char_length(btrim(link_label)) between 1 and 60
      and char_length(link_url) <= 2048 and link_url ~ '^https://[^[:space:]]+$'))
  );

commit;
