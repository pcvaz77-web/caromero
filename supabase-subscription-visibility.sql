-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Controla se o botão de assinatura aparece na página de login.

create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  show_subscription boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, show_subscription)
values (true, true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "Anyone can view platform settings" on public.platform_settings;
create policy "Anyone can view platform settings"
on public.platform_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update platform settings" on public.platform_settings;
create policy "Admins can update platform settings"
on public.platform_settings for update
to authenticated
using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin'));
