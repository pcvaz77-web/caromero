-- MP4s dos avisos da plataforma. O bucket é privado: o dono envia, e
-- usuários autenticados assistem somente aos vídeos de avisos publicados.
begin;

alter table public.platform_in_app_announcements
  add column video_storage_path text;

alter table public.platform_in_app_announcements
  add constraint platform_announcement_video_source_check check (
    (video_url is null or video_storage_path is null)
    and (video_storage_path is null or video_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platform-announcement-videos', 'platform-announcement-videos', false, 47185920, array['video/mp4'])
on conflict (id) do nothing;

create policy "Owner uploads platform announcement videos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'platform-announcement-videos'
  and public.is_platform_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'
);

create policy "Published announcement videos are available to members"
on storage.objects for select to authenticated
using (
  bucket_id = 'platform-announcement-videos'
  and (
    (public.is_platform_owner() and owner_id = auth.uid()::text)
    or exists (
      select 1 from public.platform_in_app_announcements announcement
      where announcement.video_storage_path = storage.objects.name
        and announcement.status = 'published'
    )
  )
);

create policy "Owner removes unused platform announcement videos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'platform-announcement-videos'
  and public.is_platform_owner()
  and owner_id = auth.uid()::text
  and not exists (
    select 1 from public.platform_in_app_announcements announcement
    where announcement.video_storage_path = storage.objects.name
  )
);

commit;
