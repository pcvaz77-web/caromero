begin;

create policy school_home_communications_owner_read on public.school_home_communications
  for select to authenticated
  using (public.is_platform_owner());

create policy school_home_communications_owner_insert on public.school_home_communications
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_platform_owner());

create policy school_home_communications_owner_delete on public.school_home_communications
  for delete to authenticated
  using (public.is_platform_owner());

commit;
