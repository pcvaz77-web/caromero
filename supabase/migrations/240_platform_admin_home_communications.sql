begin;

alter policy school_home_communications_owner_read on public.school_home_communications
  using (public.is_platform_admin());

alter policy school_home_communications_owner_insert on public.school_home_communications
  with check (created_by = auth.uid() and public.is_platform_admin());

alter policy school_home_communications_owner_delete on public.school_home_communications
  using (public.is_platform_admin());

commit;
