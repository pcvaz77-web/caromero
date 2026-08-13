-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Atualiza automaticamente todas as contas abertas após mudanças no Carômetro.

alter table public.students replica identity full;
alter table public.classes replica identity full;
alter table public.observation_options replica identity full;
alter table public.class_counselors replica identity full;
alter table public.user_permissions replica identity full;
alter table public.student_occurrences replica identity full;
alter table public.profiles replica identity full;
alter table public.platform_settings replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['students', 'classes', 'observation_options', 'class_counselors', 'user_permissions', 'student_occurrences', 'profiles', 'platform_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
