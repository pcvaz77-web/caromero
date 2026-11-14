begin;

create table public.home_reminders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  reminder_date date,
  created_at timestamptz not null default now()
);

create index home_reminders_owner_date_idx
  on public.home_reminders (school_id, user_id, reminder_date, created_at);

alter table public.home_reminders enable row level security;

create policy home_reminders_select on public.home_reminders
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_school_member(school_id));

create policy home_reminders_insert on public.home_reminders
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_school_member(school_id));

create policy home_reminders_delete on public.home_reminders
  for delete to authenticated
  using (user_id = auth.uid() and public.is_active_school_member(school_id));

revoke all on public.home_reminders from public, anon, authenticated;
grant select, insert, delete on public.home_reminders to authenticated;

commit;
