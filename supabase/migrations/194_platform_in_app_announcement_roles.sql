-- Destinatários das mensagens diretas no Carômetro. Avisos antigos seguem para todos.
begin;

alter table public.platform_in_app_announcements
  add column target_roles text[];

alter table public.platform_in_app_announcements
  add constraint platform_in_app_announcement_target_roles_check check (
    target_roles is null or (
      cardinality(target_roles) between 1 and 4
      and array_position(target_roles, null) is null
      and target_roles <@ array['teacher', 'coordinator', 'secretary', 'school_admin']::text[]
    )
  );

create function public.can_view_platform_announcement(p_target_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select p_target_roles is null or exists (
    select 1
    from public.school_members member
    join public.schools school on school.id = member.school_id
    where member.user_id = auth.uid()
      and member.status = 'active'
      and school.status = 'active'
      and member.role = any(p_target_roles)
  );
$function$;

revoke all on function public.can_view_platform_announcement(text[]) from public, anon;
grant execute on function public.can_view_platform_announcement(text[]) to authenticated;

drop policy "Authenticated people read published platform announcements"
  on public.platform_in_app_announcements;
create policy "Authenticated people read published platform announcements"
  on public.platform_in_app_announcements for select to authenticated
  using (
    public.is_platform_owner()
    or (status = 'published' and public.can_view_platform_announcement(target_roles))
  );

drop policy "People dismiss published announcements for themselves"
  on public.platform_in_app_announcement_dismissals;
create policy "People dismiss published announcements for themselves"
  on public.platform_in_app_announcement_dismissals for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.platform_in_app_announcements announcement
      where announcement.id = announcement_id
        and announcement.status = 'published'
        and (public.is_platform_owner() or public.can_view_platform_announcement(announcement.target_roles))
    )
  );

drop policy "Published announcement videos are available to members"
  on storage.objects;
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
          and (public.is_platform_owner() or public.can_view_platform_announcement(announcement.target_roles))
      )
    )
  );

commit;
