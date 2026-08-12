-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Faz as permissões gerais e de conselheiro chegarem imediatamente
-- aos dispositivos que já estão com o Carômetro aberto.

alter table public.user_permissions replica identity full;
alter table public.class_counselors replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_permissions'
  ) then
    alter publication supabase_realtime add table public.user_permissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_counselors'
  ) then
    alter publication supabase_realtime add table public.class_counselors;
  end if;
end $$;
