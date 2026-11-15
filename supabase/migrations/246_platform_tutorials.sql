-- Links de tutoriais configurados pelo proprietário; leitura pelos usuários autenticados.
create table if not exists public.platform_tutorials (
  function_key text primary key,
  youtube_url text,
  button_label text not null default 'Ver tutorial',
  button_color text not null default '#4169d6',
  updated_at timestamptz not null default now(),
  constraint platform_tutorials_key_check check (function_key ~ '^[A-Za-z][A-Za-z0-9]*$'),
  constraint platform_tutorials_url_check check (
    youtube_url is null or youtube_url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/[^[:space:]]+$'
  ),
  constraint platform_tutorials_label_check check (char_length(button_label) between 1 and 40),
  constraint platform_tutorials_color_check check (button_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.platform_tutorials enable row level security;
create policy platform_tutorials_read on public.platform_tutorials
  for select to authenticated using (true);
create policy platform_tutorials_owner_insert on public.platform_tutorials
  for insert to authenticated with check (public.is_platform_owner());
create policy platform_tutorials_owner_update on public.platform_tutorials
  for update to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());
create policy platform_tutorials_owner_delete on public.platform_tutorials
  for delete to authenticated using (public.is_platform_owner());
grant select, insert, update, delete on public.platform_tutorials to authenticated;
