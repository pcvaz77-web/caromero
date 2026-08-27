-- CARÔMETRO COMERCIAL
-- Mantém o perfil público mínimo sincronizado com a identidade do Supabase.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

alter table public.profiles
  add column if not exists full_name text;

create or replace function public.sync_commercial_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when coalesce(public.profiles.full_name, '') = ''
            then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$function$;

revoke all on function public.sync_commercial_profile_from_auth()
from public, anon, authenticated;

drop trigger if exists capture_profile_name on auth.users;
drop trigger if exists sync_commercial_profile_from_auth on auth.users;
create trigger sync_commercial_profile_from_auth
after insert or update of email on auth.users
for each row execute function public.sync_commercial_profile_from_auth();

commit;
