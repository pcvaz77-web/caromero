-- Garante que todas as tabelas que o frontend Comercial assina realmente
-- emitam eventos pelo Supabase Realtime. A publicação é global, mas a entrega
-- continua limitada pelos filtros school_id/member_id do cliente e pela RLS.
--
-- Mantém a identidade de réplica atual: os fluxos do frontend dependem do
-- estado novo de INSERT/UPDATE. Evita AccessExclusiveLock desnecessário em
-- tabelas de vínculo que podem estar em uso durante a aplicação da migration.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'students',
    'classes',
    'observation_options',
    'class_counselors',
    'student_occurrences',
    'school_member_permissions',
    'school_members',
    'profiles',
    'platform_settings'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          table_name
        );
      end if;
    end if;
  end loop;
end
$$;
