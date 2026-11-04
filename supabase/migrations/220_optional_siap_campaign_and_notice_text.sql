begin;

alter table public.siap_assistant_announcement
  drop constraint siap_assistant_announcement_title_check,
  drop constraint siap_assistant_announcement_message_body_check;
alter table public.siap_assistant_announcement
  add constraint siap_assistant_announcement_title_check
    check (char_length(btrim(title)) = 0 or char_length(btrim(title)) between 3 and 120),
  add constraint siap_assistant_announcement_message_body_check
    check (char_length(btrim(message_body)) = 0 or char_length(btrim(message_body)) between 10 and 3000),
  add constraint siap_assistant_announcement_content_check
    check (char_length(btrim(title)) > 0 or char_length(btrim(message_body)) > 0
      or theme_image_url is not null or media_url is not null);

alter table public.siap_assistant_header_campaign drop constraint siap_header_campaign_valid;
alter table public.siap_assistant_header_campaign add constraint siap_header_campaign_valid check (
  char_length(btrim(eyebrow)) between 0 and 30
  and char_length(btrim(headline)) between 0 and 60
  and (char_length(btrim(eyebrow)) > 0 or char_length(btrim(headline)) > 0 or background_image_url is not null)
  and background_color ~ '^#[0-9A-Fa-f]{6}$'
  and text_color ~ '^#[0-9A-Fa-f]{6}$'
  and (background_image_url is null or (char_length(background_image_url) <= 2048 and background_image_url ~ '^https://[^[:space:]]+$'))
  and jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 3
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
  if p_active is null
     or char_length(btrim(coalesce(p_title, ''))) not between 0 and 120
     or (char_length(btrim(coalesce(p_title, ''))) between 1 and 2)
     or char_length(btrim(coalesce(p_message_body, ''))) not between 0 and 3000
     or (char_length(btrim(coalesce(p_message_body, ''))) between 1 and 9)
     or (btrim(coalesce(p_title,'')) = '' and btrim(coalesce(p_message_body,'')) = ''
       and v_theme_image_url is null and p_media_url is null)
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

create or replace function public.platform_set_siap_header_campaign(
  p_active boolean, p_eyebrow text, p_headline text,
  p_background_color text, p_text_color text, p_background_image_url text,
  p_buttons jsonb
)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_button jsonb; v_plan text; v_seen text[] := '{}'; v_clean jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if char_length(btrim(coalesce(p_eyebrow,''))) > 30
     or char_length(btrim(coalesce(p_headline,''))) > 60
     or (btrim(coalesce(p_eyebrow,'')) = '' and btrim(coalesce(p_headline,'')) = '' and p_background_image_url is null)
     or coalesce(p_background_color,'') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(p_text_color,'') !~ '^#[0-9A-Fa-f]{6}$'
     or (p_background_image_url is not null and (char_length(p_background_image_url)>2048 or p_background_image_url !~ '^https://[^[:space:]]+$'))
     or jsonb_typeof(p_buttons) is distinct from 'array'
  then raise exception 'Dados da campanha inválidos.'; end if;
  if jsonb_array_length(p_buttons)>3 then raise exception 'Use no máximo três botões.'; end if;
  for v_button in select value from jsonb_array_elements(p_buttons) loop
    v_plan := v_button->>'plan_key';
    if v_plan not in ('monthly','quarterly','semiannual','annual') or v_plan = any(v_seen)
       or char_length(btrim(coalesce(v_button->>'label',''))) not between 1 and 30
       or coalesce(v_button->>'color','') !~ '^#[0-9A-Fa-f]{6}$'
       or coalesce(v_button->>'text_color','') !~ '^#[0-9A-Fa-f]{6}$'
    then raise exception 'Botão de campanha inválido.'; end if;
    if not exists (select 1 from public.siap_assistant_plans p where p.plan_key=v_plan and p.active=true)
       or not exists (select 1 from public.hotmart_product_mappings h where h.target='assistant' and h.plan_key=v_plan and h.active=true and h.checkout_url ~ '^https://pay[.]hotmart[.]com/')
    then raise exception 'Plano sem checkout ativo.'; end if;
    v_seen := array_append(v_seen,v_plan);
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'plan_key',v_plan,'label',btrim(v_button->>'label'),
      'color',v_button->>'color','text_color',v_button->>'text_color'
    ));
  end loop;
  if coalesce(p_active,false) and jsonb_array_length(v_clean)=0 then raise exception 'Escolha pelo menos um botão para ativar a campanha.'; end if;
  update public.siap_assistant_header_campaign set
    active=coalesce(p_active,false), eyebrow=btrim(p_eyebrow), headline=btrim(p_headline),
    background_color=p_background_color, text_color=p_text_color,
    background_image_url=p_background_image_url, buttons=v_clean, updated_at=now()
  where id=true;
end;
$function$;

commit;
