begin;

create table public.siap_assistant_header_campaign (
  id boolean primary key default true check (id),
  active boolean not null default false,
  eyebrow text not null default 'PROMOÇÃO',
  headline text not null default 'BLACK FRIDAY',
  background_color text not null default '#080e1b',
  text_color text not null default '#fff5d4',
  background_image_url text,
  buttons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint siap_header_campaign_valid check (
    char_length(btrim(eyebrow)) between 1 and 30
    and char_length(btrim(headline)) between 1 and 60
    and background_color ~ '^#[0-9A-Fa-f]{6}$'
    and text_color ~ '^#[0-9A-Fa-f]{6}$'
    and (background_image_url is null or (char_length(background_image_url) <= 2048 and background_image_url ~ '^https://[^[:space:]]+$'))
    and jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 3
  )
);
alter table public.siap_assistant_header_campaign enable row level security;
revoke all on public.siap_assistant_header_campaign from public, anon, authenticated;

insert into public.siap_assistant_header_campaign
  (id, active, eyebrow, headline, background_color, text_color, background_image_url, buttons)
values (
  true, true, 'PROMOÇÃO', 'BLACK FRIDAY', '#080e1b', '#fff5d4',
  'https://sistemacarometro.com.br/marketing/seasonal/assistente-black-friday-fundo-2026.png',
  '[{"plan_key":"semiannual","label":"SEMESTRAL","color":"#e7c46f","text_color":"#0b1930"},{"plan_key":"annual","label":"ANUAL","color":"#e7c46f","text_color":"#0b1930"}]'::jsonb
);

create function public.platform_get_siap_header_campaign()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_row public.siap_assistant_header_campaign%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  select * into v_row from public.siap_assistant_header_campaign where id = true;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.platform_get_siap_header_campaign() from public, anon;
grant execute on function public.platform_get_siap_header_campaign() to authenticated;

create function public.platform_set_siap_header_campaign(
  p_active boolean, p_eyebrow text, p_headline text,
  p_background_color text, p_text_color text, p_background_image_url text,
  p_buttons jsonb
)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_button jsonb; v_plan text; v_seen text[] := '{}'; v_clean jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if char_length(btrim(coalesce(p_eyebrow,''))) not between 1 and 30
     or char_length(btrim(coalesce(p_headline,''))) not between 1 and 60
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
revoke all on function public.platform_set_siap_header_campaign(boolean,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.platform_set_siap_header_campaign(boolean,text,text,text,text,text,jsonb) to authenticated;

create function public.get_siap_header_campaign()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_row public.siap_assistant_header_campaign%rowtype; v_buttons jsonb;
begin
  select * into v_row from public.siap_assistant_header_campaign where id=true;
  if not coalesce(v_row.active,false) then return jsonb_build_object('active',false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'plan_key',b.value->>'plan_key','label',b.value->>'label',
    'color',b.value->>'color','text_color',b.value->>'text_color',
    'amount',p.amount,'checkout_url',h.checkout_url
  ) order by b.ordinality),'[]'::jsonb) into v_buttons
  from jsonb_array_elements(v_row.buttons) with ordinality as b(value,ordinality)
  join public.siap_assistant_plans p on p.plan_key=b.value->>'plan_key' and p.active=true
  join public.hotmart_product_mappings h on h.target='assistant' and h.plan_key=p.plan_key and h.active=true
  where h.checkout_url ~ '^https://pay[.]hotmart[.]com/';
  return jsonb_build_object(
    'active',true,'eyebrow',v_row.eyebrow,'headline',v_row.headline,
    'background_color',v_row.background_color,'text_color',v_row.text_color,
    'background_image_url',v_row.background_image_url,'buttons',v_buttons,'updated_at',v_row.updated_at
  );
end;
$function$;
revoke all on function public.get_siap_header_campaign() from public;
grant execute on function public.get_siap_header_campaign() to anon, authenticated;

commit;
