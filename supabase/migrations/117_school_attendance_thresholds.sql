begin;

create table public.school_siap_attendance_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  frequent_minimum smallint not null default 75 check (frequent_minimum between 2 and 100),
  absent_minimum smallint not null default 60 check (absent_minimum between 1 and 99),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (absent_minimum < frequent_minimum)
);

alter table public.school_siap_attendance_settings enable row level security;

create policy school_members_view_attendance_settings
on public.school_siap_attendance_settings
for select to authenticated
using (public.is_active_school_member(school_id));

create policy school_leaders_insert_attendance_settings
on public.school_siap_attendance_settings
for insert to authenticated
with check (
  updated_by = auth.uid()
  and (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
);

create policy school_leaders_update_attendance_settings
on public.school_siap_attendance_settings
for update to authenticated
using (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
with check (
  updated_by = auth.uid()
  and (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
);

create policy school_leaders_delete_attendance_settings
on public.school_siap_attendance_settings
for delete to authenticated
using (public.is_school_admin(school_id) or public.is_school_coordinator(school_id));

create or replace function public.set_school_siap_attendance_settings_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_school_siap_attendance_settings_audit
before insert or update on public.school_siap_attendance_settings
for each row execute function public.set_school_siap_attendance_settings_audit();

grant select, insert, update, delete on public.school_siap_attendance_settings to authenticated;

comment on table public.school_siap_attendance_settings is
  'Limites de classificação da Frequência Assistida por escola; ausência de linha usa o padrão 75/60.';

commit;
