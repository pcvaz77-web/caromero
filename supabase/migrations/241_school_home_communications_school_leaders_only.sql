begin;

drop policy if exists school_home_communications_owner_read on public.school_home_communications;
drop policy if exists school_home_communications_owner_insert on public.school_home_communications;
drop policy if exists school_home_communications_owner_delete on public.school_home_communications;

alter policy school_home_communications_insert on public.school_home_communications
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.school_members member
      where member.school_id = school_home_communications.school_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('school_admin', 'coordinator')
    )
  );

alter policy school_home_communications_delete on public.school_home_communications
  using (
    exists (
      select 1 from public.school_members member
      where member.school_id = school_home_communications.school_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('school_admin', 'coordinator')
        and (member.role = 'school_admin' or created_by = auth.uid())
    )
  );

commit;
