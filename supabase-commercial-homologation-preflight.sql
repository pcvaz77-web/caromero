-- CARÔMETRO COMERCIAL — PRÉ-VALIDAÇÃO SOMENTE LEITURA
--
-- Este arquivo não cria nem altera objetos. Ele deve ser executado somente no
-- futuro projeto de homologação, antes de qualquer SQL comercial. A execução
-- falha com uma lista clara quando o schema-base do Carômetro ainda não foi
-- restaurado nesse projeto separado.

do $preflight$
declare
  required_table text;
  missing_tables text[] := '{}';
  required_tables constant text[] := array[
    'profiles',
    'user_permissions',
    'classes',
    'students',
    'student_occurrences',
    'class_counselors',
    'observation_options',
    'user_favorite_classes',
    'user_notification_shifts',
    'user_notifications',
    'report_generation_log',
    'push_subscriptions',
    'student_alerts',
    'student_followups',
    'student_activity'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass('public.' || required_table) is null then
      missing_tables := array_append(missing_tables, required_table);
    end if;
  end loop;

  if cardinality(missing_tables) > 0 then
    raise exception
      'Schema-base incompleto. Tabelas ausentes: %. Restaure primeiro uma cópia estrutural validada em homologação.',
      array_to_string(missing_tables, ', ');
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'O schema gerenciado auth.users não está disponível neste projeto.';
  end if;

  raise notice 'Pré-validação estrutural concluída: schema-base disponível.';
end;
$preflight$;

select
  current_database() as database_name,
  count(*) filter (where table_schema = 'public') as public_table_count
from information_schema.tables;
