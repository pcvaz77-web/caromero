-- Reserva uma campanha WhatsApp uma única vez antes de chamar a Meta.
-- A migration cria somente estrutura; não altera preferências nem envia mensagens.
begin;

create table public.platform_communication_whatsapp_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.platform_communication_campaigns(id) on delete cascade,
  template_name text not null,
  template_language text not null,
  template_category text not null,
  template_components jsonb not null,
  audience_count integer not null check (audience_count between 1 and 100),
  status text not null default 'sending' check (status in ('sending','submitted','failed')),
  submitted_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.platform_communication_whatsapp_runs enable row level security;
create policy "Owner reads WhatsApp campaign runs"
on public.platform_communication_whatsapp_runs for select to authenticated
using (public.is_platform_owner());

revoke all on table public.platform_communication_whatsapp_runs from public, anon, authenticated;
grant select on table public.platform_communication_whatsapp_runs to authenticated;
grant select, insert, update, delete on table public.platform_communication_whatsapp_runs to service_role;

-- Capas são material público de campanha; nunca usar para fotos ou dados de alunos.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('communication-covers','communication-covers',true,5242880,
  array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

create policy "Platform owner uploads communication covers"
on storage.objects for insert to authenticated
with check (bucket_id='communication-covers' and public.is_platform_owner());

create policy "Platform owner removes communication covers"
on storage.objects for delete to authenticated
using (bucket_id='communication-covers' and public.is_platform_owner());

commit;
