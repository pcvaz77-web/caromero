create table if not exists public.observation_options (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) between 1 and 80),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists observation_options_label_unique
on public.observation_options (lower(label));

alter table public.observation_options enable row level security;

drop policy if exists "Authenticated users view observation options" on public.observation_options;
create policy "Authenticated users view observation options"
on public.observation_options for select to authenticated using (true);

drop policy if exists "Admins manage observation options" on public.observation_options;
create policy "Admins manage observation options"
on public.observation_options for all to authenticated
using (exists (select 1 from public.user_permissions where user_id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.user_permissions where user_id = auth.uid() and role = 'admin'));

-- Permite que as observações adicionadas pelo administrador sejam salvas nos alunos.
alter table public.students
drop constraint if exists students_has_report_check;

alter table public.students
add constraint students_has_report_check
check (has_report is null or char_length(has_report) <= 80);
