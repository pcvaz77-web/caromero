begin;

create table public.platform_in_app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  message_body text not null check (char_length(btrim(message_body)) between 3 and 2000),
  video_url text check (video_url is null or (char_length(video_url) <= 500 and video_url ~ '^https://')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  constraint platform_in_app_announcement_dates check (
    (status = 'draft' and published_at is null and archived_at is null)
    or (status = 'published' and published_at is not null and archived_at is null)
    or (status = 'archived' and published_at is not null and archived_at is not null)
  )
);

create index platform_in_app_announcements_published_idx
  on public.platform_in_app_announcements(published_at desc) where status = 'published';

create table public.platform_in_app_announcement_dismissals (
  announcement_id uuid not null references public.platform_in_app_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.platform_in_app_announcements enable row level security;
alter table public.platform_in_app_announcement_dismissals enable row level security;

create policy "Authenticated people read published platform announcements"
  on public.platform_in_app_announcements for select to authenticated
  using (status = 'published' or public.is_platform_owner());
create policy "Owner creates draft platform announcements"
  on public.platform_in_app_announcements for insert to authenticated
  with check (public.is_platform_owner() and created_by = auth.uid() and status = 'draft');
create policy "Owner updates platform announcements"
  on public.platform_in_app_announcements for update to authenticated
  using (public.is_platform_owner()) with check (public.is_platform_owner());
create policy "Owner removes draft platform announcements"
  on public.platform_in_app_announcements for delete to authenticated
  using (public.is_platform_owner() and status = 'draft');

create policy "People read their own announcement dismissals"
  on public.platform_in_app_announcement_dismissals for select to authenticated
  using (user_id = auth.uid());
create policy "People dismiss published announcements for themselves"
  on public.platform_in_app_announcement_dismissals for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.platform_in_app_announcements announcement
      where announcement.id = announcement_id and announcement.status = 'published'
    )
  );

revoke all on public.platform_in_app_announcements from public, anon, authenticated;
grant select, insert, update, delete on public.platform_in_app_announcements to authenticated;
revoke all on public.platform_in_app_announcement_dismissals from public, anon, authenticated;
grant select, insert on public.platform_in_app_announcement_dismissals to authenticated;

-- Entrega novos avisos às sessões abertas; a consulta periódica do cliente
-- também recupera eventos perdidos e respeita as mesmas políticas RLS.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'platform_in_app_announcements'
  ) then
    alter publication supabase_realtime add table public.platform_in_app_announcements;
  end if;
end $$;

commit;
