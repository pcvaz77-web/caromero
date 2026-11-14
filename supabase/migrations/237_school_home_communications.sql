begin;

create table public.school_home_communications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  destination_type text not null check (destination_type in ('occurrences', 'students', 'external')),
  destination_url text check (destination_url is null or length(destination_url) <= 2048),
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint school_home_communications_destination_check check (
    (destination_type = 'external' and destination_url is not null and destination_url ~* '^https://[^[:space:]]+$')
    or (destination_type <> 'external' and destination_url is null)
  ),
  constraint school_home_communications_dates_check check (ends_on is null or ends_on >= starts_on)
);

create index school_home_communications_visible_idx
  on public.school_home_communications (school_id, starts_on, ends_on, created_at desc);

alter table public.school_home_communications enable row level security;

create policy school_home_communications_read on public.school_home_communications
  for select to authenticated
  using (public.is_active_school_member(school_id));

create policy school_home_communications_insert on public.school_home_communications
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.school_members member
      where member.school_id = school_home_communications.school_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('school_admin', 'coordinator', 'secretary')
    )
  );

create policy school_home_communications_delete on public.school_home_communications
  for delete to authenticated
  using (
    exists (
      select 1 from public.school_members member
      where member.school_id = school_home_communications.school_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('school_admin', 'coordinator', 'secretary')
        and (member.role = 'school_admin' or created_by = auth.uid())
    )
  );

revoke all on public.school_home_communications from public, anon, authenticated;
grant select, insert, delete on public.school_home_communications to authenticated;

commit;
