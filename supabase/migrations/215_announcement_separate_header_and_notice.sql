begin;

alter table public.siap_assistant_announcement
  add column notice_color text not null default '#e8f8ed',
  add column notice_text_color text not null default '#14532d',
  add column notice_button_color text not null default '#168553';

alter table public.platform_in_app_announcements
  add column notice_image_url text,
  add column button_color text not null default '#ffffff';

update public.siap_assistant_announcement
set notice_color = '#080e1b', notice_text_color = '#fff5d4', notice_button_color = '#d7b65f'
where id = true and active = true and theme_key = 'black_friday';

alter table public.siap_assistant_announcement drop constraint siap_announcement_theme_valid;
alter table public.platform_in_app_announcements drop constraint platform_announcement_theme_valid;

alter table public.siap_assistant_announcement add constraint siap_announcement_theme_valid check (
  theme_key in ('classic','black_friday','teachers','public_servant','black_awareness','students','september_yellow','christmas','new_year','custom')
  and theme_color ~ '^#[0-9A-Fa-f]{6}$'
  and theme_text_color ~ '^#[0-9A-Fa-f]{6}$'
  and notice_color ~ '^#[0-9A-Fa-f]{6}$'
  and notice_text_color ~ '^#[0-9A-Fa-f]{6}$'
  and notice_button_color ~ '^#[0-9A-Fa-f]{6}$'
  and (theme_image_url is null or (char_length(theme_image_url) <= 2048 and theme_image_url ~ '^https://[^[:space:]]+$'))
);
alter table public.platform_in_app_announcements add constraint platform_announcement_theme_valid check (
  theme_key in ('classic','black_friday','teachers','public_servant','black_awareness','students','september_yellow','christmas','new_year','custom')
  and theme_color ~ '^#[0-9A-Fa-f]{6}$'
  and theme_text_color ~ '^#[0-9A-Fa-f]{6}$'
  and button_color ~ '^#[0-9A-Fa-f]{6}$'
  and (theme_image_url is null or (char_length(theme_image_url) <= 2048 and theme_image_url ~ '^https://[^[:space:]]+$'))
  and (notice_image_url is null or (char_length(notice_image_url) <= 2048 and notice_image_url ~ '^https://[^[:space:]]+$'))
  and ((link_label is null) = (link_url is null))
  and (link_label is null or (char_length(btrim(link_label)) between 1 and 60
    and char_length(link_url) <= 2048 and link_url ~ '^https://[^[:space:]]+$'))
);

create or replace function public.platform_set_siap_assistant_announcement_v4(
  p_title text, p_message_body text, p_media_type text, p_media_url text,
  p_link_label text, p_link_url text, p_active boolean,
  p_theme_key text, p_theme_color text, p_theme_text_color text, p_theme_image_url text,
  p_notice_color text, p_notice_text_color text, p_notice_button_color text
)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if p_theme_key not in ('classic','black_friday','teachers','public_servant','black_awareness','students','september_yellow','christmas','new_year','custom')
    or p_notice_color !~ '^#[0-9A-Fa-f]{6}$'
    or p_notice_text_color !~ '^#[0-9A-Fa-f]{6}$'
    or p_notice_button_color !~ '^#[0-9A-Fa-f]{6}$'
  then raise exception 'Cores ou tema inválidos.'; end if;
  -- A função anterior mantém a validação de texto, mídia, botão e permissão.
  -- Os novos temas são aceitos após a migração de sua própria validação.
  perform public.platform_set_siap_assistant_announcement_v3(
    p_title,p_message_body,p_media_type,p_media_url,p_link_label,p_link_url,p_active,
    case when p_theme_key in ('public_servant','students','september_yellow','christmas','new_year') then 'custom' else p_theme_key end,
    p_theme_color,p_theme_text_color,p_theme_image_url
  );
  update public.siap_assistant_announcement
  set theme_key = p_theme_key, notice_color = p_notice_color,
      notice_text_color = p_notice_text_color, notice_button_color = p_notice_button_color
  where id = true;
end;
$function$;
revoke all on function public.platform_set_siap_assistant_announcement_v4(text,text,text,text,text,text,boolean,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.platform_set_siap_assistant_announcement_v4(text,text,text,text,text,text,boolean,text,text,text,text,text,text,text) to authenticated;

commit;
