-- Um comunicado direto publicado por vez. A publicação remove, na mesma
-- transação, o comunicado publicado anterior e suas dispensas. Registros
-- arquivados antes desta mudança são preservados, mas não aparecem na interface.
begin;

create unique index platform_in_app_announcements_one_published_idx
  on public.platform_in_app_announcements (status)
  where status = 'published';

drop policy "Owner updates platform announcements"
  on public.platform_in_app_announcements;
create policy "Owner edits draft platform announcements"
  on public.platform_in_app_announcements for update to authenticated
  using (public.is_platform_owner() and status = 'draft')
  with check (public.is_platform_owner() and status = 'draft');

drop policy "Owner removes draft platform announcements"
  on public.platform_in_app_announcements;
create policy "Owner removes platform announcements"
  on public.platform_in_app_announcements for delete to authenticated
  using (public.is_platform_owner());

create function public.platform_publish_in_app_announcement(p_announcement_id uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $function$
declare
  replaced_video_paths text[];
begin
  if not public.is_platform_owner() then
    raise exception 'Apenas o proprietário pode publicar comunicados.';
  end if;

  perform pg_advisory_xact_lock(195, 1);
  perform 1 from public.platform_in_app_announcements
    where id = p_announcement_id and status = 'draft' for update;
  if not found then
    raise exception 'Rascunho não encontrado ou já publicado.';
  end if;

  select coalesce(array_agg(distinct video_storage_path), array[]::text[])
    into replaced_video_paths
  from public.platform_in_app_announcements
  where id <> p_announcement_id
    and status = 'published'
    and video_storage_path is not null;

  delete from public.platform_in_app_announcements
  where id <> p_announcement_id and status = 'published';

  update public.platform_in_app_announcements
    set status = 'published', published_at = now()
    where id = p_announcement_id and status = 'draft';

  return replaced_video_paths;
end;
$function$;

revoke all on function public.platform_publish_in_app_announcement(uuid) from public, anon;
grant execute on function public.platform_publish_in_app_announcement(uuid) to authenticated;

-- Depois da remoção do registro, o MP4 sem referência pode pertencer a outro
-- proprietário da plataforma que publicou o comunicado anterior.
drop policy "Published announcement videos are available to members" on storage.objects;
create policy "Published announcement videos are available to members"
on storage.objects for select to authenticated
using (
  bucket_id = 'platform-announcement-videos'
  and (
    (
      public.is_platform_owner()
      and (
        owner_id = auth.uid()::text
        or not exists (
          select 1 from public.platform_in_app_announcements announcement
          where announcement.video_storage_path = storage.objects.name
        )
      )
    )
    or exists (
      select 1 from public.platform_in_app_announcements announcement
      where announcement.video_storage_path = storage.objects.name
        and announcement.status = 'published'
        and (public.is_platform_owner() or public.can_view_platform_announcement(announcement.target_roles))
    )
  )
);

drop policy "Owner removes unused platform announcement videos" on storage.objects;
create policy "Owner removes unused platform announcement videos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'platform-announcement-videos'
  and public.is_platform_owner()
  and not exists (
    select 1 from public.platform_in_app_announcements announcement
    where announcement.video_storage_path = storage.objects.name
  )
);

commit;
