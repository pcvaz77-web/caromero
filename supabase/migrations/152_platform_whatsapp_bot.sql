-- Menu de atendimento do WhatsApp. Desativado por padrão até a API do número público estar pronta.
begin;

create table public.platform_whatsapp_bot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  greeting text not null default 'Olá! Como podemos ajudar você com o Carômetro?',
  link1_label text not null default 'Conhecer planos',
  link1_url text not null default 'https://sistemacarometro.com.br/planos',
  link2_label text not null default 'Conhecer sistema',
  link2_url text not null default 'https://sistemacarometro.com.br/',
  attendant_label text not null default 'Falar com atendente',
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_bot_greeting_length check (char_length(greeting) between 10 and 900),
  constraint platform_whatsapp_bot_labels_length check (
    char_length(link1_label) between 1 and 20 and
    char_length(link2_label) between 1 and 20 and
    char_length(attendant_label) between 1 and 20),
  constraint platform_whatsapp_bot_links_https check (
    link1_url ~ '^https://[^[:space:]]+$' and
    link2_url ~ '^https://[^[:space:]]+$' and
    char_length(link1_url) <= 500 and char_length(link2_url) <= 500)
);
insert into public.platform_whatsapp_bot_settings (id) values (true);
alter table public.platform_whatsapp_bot_settings enable row level security;
create policy "Owner reads WhatsApp bot settings"
on public.platform_whatsapp_bot_settings for select to authenticated
using (public.is_platform_owner());
create policy "Owner updates WhatsApp bot settings"
on public.platform_whatsapp_bot_settings for update to authenticated
using (public.is_platform_owner()) with check (public.is_platform_owner());
revoke all on table public.platform_whatsapp_bot_settings from public, anon, authenticated;
grant select, update on table public.platform_whatsapp_bot_settings to authenticated;
grant select, insert, update, delete on table public.platform_whatsapp_bot_settings to service_role;

-- Apenas metadados necessários para evitar menus repetidos e registrar tentativas.
create table public.platform_whatsapp_bot_contacts (
  sender_e164 text primary key check (sender_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  last_menu_at timestamptz,
  handoff_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.platform_whatsapp_bot_contacts enable row level security;
revoke all on table public.platform_whatsapp_bot_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_whatsapp_bot_contacts to service_role;

create table public.platform_whatsapp_bot_events (
  message_id text primary key,
  sender_e164 text not null check (sender_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  action text not null check (action in ('menu','link1','link2','attendant','optout','ignored')),
  status text not null default 'processing' check (status in ('processing','sent','failed','skipped')),
  provider_response_id text,
  error_code text,
  created_at timestamptz not null default now()
);
create index platform_whatsapp_bot_events_sender_created_idx
on public.platform_whatsapp_bot_events (sender_e164,created_at desc);
alter table public.platform_whatsapp_bot_events enable row level security;
create policy "Owner reads WhatsApp bot events"
on public.platform_whatsapp_bot_events for select to authenticated
using (public.is_platform_owner());
revoke all on table public.platform_whatsapp_bot_events from public, anon, authenticated;
grant select on table public.platform_whatsapp_bot_events to authenticated;
grant select, insert, update, delete on table public.platform_whatsapp_bot_events to service_role;

commit;
