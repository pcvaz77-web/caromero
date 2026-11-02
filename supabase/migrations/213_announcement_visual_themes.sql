begin;

alter table public.siap_assistant_announcement
  add column theme_key text not null default 'classic',
  add column theme_color text not null default '#17345d',
  add column theme_text_color text not null default '#ffffff',
  add column theme_image_url text;

alter table public.platform_in_app_announcements
  add column theme_key text not null default 'classic',
  add column theme_color text not null default '#138052',
  add column theme_text_color text not null default '#ffffff',
  add column theme_image_url text,
  add column link_label text,
  add column link_url text;

alter table public.siap_assistant_announcement add constraint siap_announcement_theme_valid check (
  theme_key in ('classic','black_friday','teachers','black_awareness','custom')
  and theme_color ~ '^#[0-9A-Fa-f]{6}$'
  and theme_text_color ~ '^#[0-9A-Fa-f]{6}$'
  and (theme_image_url is null or (char_length(theme_image_url) <= 2048 and theme_image_url ~ '^https://[^[:space:]]+$'))
  and ((link_label is null) = (link_url is null))
  and (link_label is null or
    (char_length(btrim(link_label)) between 1 and 60 and char_length(link_url) <= 2048 and link_url ~ '^https://[^[:space:]]+$'))
);
alter table public.platform_in_app_announcements add constraint platform_announcement_theme_valid check (
  theme_key in ('classic','black_friday','teachers','black_awareness','custom')
  and theme_color ~ '^#[0-9A-Fa-f]{6}$'
  and theme_text_color ~ '^#[0-9A-Fa-f]{6}$'
  and (theme_image_url is null or (char_length(theme_image_url) <= 2048 and theme_image_url ~ '^https://[^[:space:]]+$'))
);

create or replace function public.platform_set_siap_assistant_announcement_v3(
  p_title text, p_message_body text, p_media_type text, p_media_url text,
  p_link_label text, p_link_url text, p_active boolean,
  p_theme_key text, p_theme_color text, p_theme_text_color text, p_theme_image_url text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_previous jsonb;
  v_link_label text := nullif(btrim(p_link_label), '');
  v_link_url text := nullif(btrim(p_link_url), '');
  v_theme_image_url text := nullif(btrim(p_theme_image_url), '');
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if p_active is null or char_length(btrim(coalesce(p_title, ''))) not between 3 and 120
     or char_length(btrim(coalesce(p_message_body, ''))) not between 10 and 3000
     or (p_media_type is null) <> (p_media_url is null)
     or (p_media_type is not null and p_media_type not in ('image', 'video'))
     or (p_media_url is not null and p_media_url !~ '^https://')
     or (v_link_label is null) <> (v_link_url is null)
     or (v_link_label is not null and char_length(v_link_label) > 60)
     or (v_link_url is not null and (char_length(v_link_url) > 2048 or v_link_url !~ '^https://[^[:space:]]+$'))
     or p_theme_key not in ('classic','black_friday','teachers','black_awareness','custom')
     or p_theme_color !~ '^#[0-9A-Fa-f]{6}$'
     or p_theme_text_color !~ '^#[0-9A-Fa-f]{6}$'
     or (v_theme_image_url is not null and (char_length(v_theme_image_url) > 2048 or v_theme_image_url !~ '^https://[^[:space:]]+$'))
  then raise exception 'Dados do comunicado inválidos.'; end if;
  select to_jsonb(a) - 'updated_by' into v_previous from public.siap_assistant_announcement a where id = true for update;
  insert into public.siap_assistant_announcement
    (id,title,message_body,media_type,media_url,link_label,link_url,active,theme_key,theme_color,theme_text_color,theme_image_url,updated_at,updated_by)
  values (true,btrim(p_title),btrim(p_message_body),p_media_type,p_media_url,v_link_label,v_link_url,p_active,
    p_theme_key,p_theme_color,p_theme_text_color,v_theme_image_url,now(),auth.uid())
  on conflict (id) do update set
    title=excluded.title,message_body=excluded.message_body,media_type=excluded.media_type,media_url=excluded.media_url,
    link_label=excluded.link_label,link_url=excluded.link_url,active=excluded.active,
    theme_key=excluded.theme_key,theme_color=excluded.theme_color,theme_text_color=excluded.theme_text_color,
    theme_image_url=excluded.theme_image_url,updated_at=now(),updated_by=auth.uid();
  perform public.record_platform_audit('siap_assistant_announcement_changed',null,null,v_previous,
    jsonb_build_object('title',btrim(p_title),'active',p_active,'theme_key',p_theme_key));
end;
$function$;
revoke all on function public.platform_set_siap_assistant_announcement_v3(text,text,text,text,text,text,boolean,text,text,text,text) from public, anon;
grant execute on function public.platform_set_siap_assistant_announcement_v3(text,text,text,text,text,text,boolean,text,text,text,text) to authenticated;

create policy "Owner uploads announcement theme images" on storage.objects for insert to authenticated
  with check (bucket_id = 'siap-announcement-media' and public.is_platform_owner()
    and name ~ '^themes/[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy "Owner removes announcement theme images" on storage.objects for delete to authenticated
  using (bucket_id = 'siap-announcement-media' and public.is_platform_owner()
    and name ~ '^themes/[0-9a-f-]{36}\.(jpg|png|webp)$');

commit;
