-- Base das comunicações do Carômetro. Não envia mensagens.
-- Nenhuma preferência antiga é presumida: todos os aceites começam desligados.
begin;

create table public.platform_communication_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp_e164 text,
  email_updates boolean not null default false,
  whatsapp_updates boolean not null default false,
  email_consented_at timestamptz,
  whatsapp_consented_at timestamptz,
  email_opted_out_at timestamptz,
  whatsapp_opted_out_at timestamptz,
  consent_version text,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_communication_phone_format check (
    whatsapp_e164 is null or whatsapp_e164 ~ '^[+][1-9][0-9]{7,14}$'
  ),
  constraint platform_communication_whatsapp_requires_phone check (
    not whatsapp_updates or whatsapp_e164 is not null
  )
);

create function public.platform_stamp_communication_preferences()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.unsubscribe_token := gen_random_uuid();
    new.created_at := now();
    new.email_opted_out_at := null;
    new.whatsapp_opted_out_at := null;
    new.email_consented_at := case when new.email_updates then now() else null end;
    new.whatsapp_consented_at := case when new.whatsapp_updates then now() else null end;
  else
    new.user_id := old.user_id;
    new.unsubscribe_token := old.unsubscribe_token;
    new.created_at := old.created_at;
    new.email_consented_at := old.email_consented_at;
    new.whatsapp_consented_at := old.whatsapp_consented_at;
    new.email_opted_out_at := old.email_opted_out_at;
    new.whatsapp_opted_out_at := old.whatsapp_opted_out_at;
    if new.email_updates is distinct from old.email_updates then
      if new.email_updates then
        new.email_consented_at := now();
        new.email_opted_out_at := null;
      else
        new.email_opted_out_at := now();
      end if;
    end if;
    if new.whatsapp_updates is distinct from old.whatsapp_updates
       or (new.whatsapp_updates and new.whatsapp_e164 is distinct from old.whatsapp_e164) then
      if new.whatsapp_updates then
        new.whatsapp_consented_at := now();
        new.whatsapp_opted_out_at := null;
      else
        new.whatsapp_opted_out_at := now();
      end if;
    end if;
  end if;
  new.consent_version := 'carometro-updates-2026-09';
  return new;
end;
$function$;

create trigger platform_stamp_communication_preferences
before insert or update on public.platform_communication_preferences
for each row execute function public.platform_stamp_communication_preferences();

alter table public.platform_communication_preferences enable row level security;
create policy "Read own communication preferences"
on public.platform_communication_preferences for select to authenticated
using (user_id = auth.uid() or public.is_platform_owner());
create policy "Insert own communication preferences"
on public.platform_communication_preferences for insert to authenticated
with check (user_id = auth.uid());
create policy "Update own communication preferences"
on public.platform_communication_preferences for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.platform_communication_preferences from public, anon, authenticated;
grant select, insert, update on table public.platform_communication_preferences to authenticated;
grant select, insert, update, delete on table public.platform_communication_preferences to service_role;

create table public.platform_communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  email_subject text not null check (char_length(btrim(email_subject)) between 3 and 180),
  message_body text not null check (char_length(btrim(message_body)) between 10 and 3000),
  video_url text,
  cover_url text,
  target_roles text[] not null default array['school_admin','coordinator','teacher','secretary']::text[],
  target_school_id uuid references public.schools(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sending','submitted','failed')),
  created_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  provider_campaign_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_campaign_roles_valid check (
    target_roles <@ array['school_admin','coordinator','teacher','secretary']::text[]
    and cardinality(target_roles) > 0
  ),
  constraint platform_campaign_video_url check (
    video_url is null or video_url ~ '^https://'
  ),
  constraint platform_campaign_cover_url check (
    cover_url is null or cover_url ~ '^https://'
  )
);

create index platform_communication_campaigns_created_at_idx
on public.platform_communication_campaigns(created_at desc);

alter table public.platform_communication_campaigns enable row level security;
create policy "Owner reads communication campaigns"
on public.platform_communication_campaigns for select to authenticated
using (public.is_platform_owner());
create policy "Owner creates communication campaigns"
on public.platform_communication_campaigns for insert to authenticated
with check (public.is_platform_owner() and created_by = auth.uid() and status = 'draft');
create policy "Owner edits draft communication campaigns"
on public.platform_communication_campaigns for update to authenticated
using (public.is_platform_owner() and status = 'draft')
with check (public.is_platform_owner() and status = 'draft');

revoke all on table public.platform_communication_campaigns from public, anon, authenticated;
grant select, insert, update on table public.platform_communication_campaigns to authenticated;
grant select, insert, update, delete on table public.platform_communication_campaigns to service_role;

create table public.platform_communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.platform_communication_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp')),
  status text not null check (status in ('queued','submitted','delivered','failed','skipped')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, user_id, channel)
);

create index platform_communication_deliveries_campaign_idx
on public.platform_communication_deliveries(campaign_id, channel, status);

alter table public.platform_communication_deliveries enable row level security;
create policy "Owner reads communication deliveries"
on public.platform_communication_deliveries for select to authenticated
using (public.is_platform_owner());

revoke all on table public.platform_communication_deliveries from public, anon, authenticated;
grant select on table public.platform_communication_deliveries to authenticated;
grant select, insert, update, delete on table public.platform_communication_deliveries to service_role;

commit;
