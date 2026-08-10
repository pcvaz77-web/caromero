-- Execute uma vez no Supabase: SQL Editor > New query > Run.
alter table public.profiles
  add column if not exists full_name text;

create or replace function public.capture_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when coalesce(public.profiles.full_name, '') = '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;

drop trigger if exists capture_profile_name on auth.users;
create trigger capture_profile_name
after insert on auth.users
for each row execute function public.capture_profile_name();
