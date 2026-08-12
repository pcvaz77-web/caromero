-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Permite registrar conselheiros sem conta no Carômetro.

alter table public.class_counselors
  alter column counselor_user_id drop not null,
  add column if not exists counselor_name text;

alter table public.class_counselors
  drop constraint if exists class_counselors_counselor_required;

alter table public.class_counselors
  add constraint class_counselors_counselor_required
  check (
    counselor_user_id is not null
    or (counselor_name is not null and length(trim(counselor_name)) >= 3)
  );

create unique index if not exists class_counselors_external_name_class_unique
  on public.class_counselors (lower(trim(counselor_name)), class_id)
  where counselor_user_id is null;
