-- CARÔMETRO COMERCIAL — preservação de históricos ao remover uma conta Auth.
-- Preparar e revisar antes de aplicar. Este arquivo não é executado sozinho.
--
-- Registros escolares e administrativos pertencem à escola. A remoção do
-- login não pode apagar esses registros nem ser bloqueada por uma FK antiga.
-- Os nomes já materializados (por exemplo, created_by_name) permanecem.

begin;

do $block$
declare
  v_target record;
  v_constraint record;
begin
  for v_target in
    select * from (values
      ('school_invitations', 'invited_by'),
      ('student_occurrences', 'created_by'),
      ('student_alerts', 'created_by'),
      ('student_alerts', 'resolved_by'),
      ('student_followups', 'created_by'),
      ('student_activity', 'actor_id')
    ) as targets(table_name, column_name)
  loop
    if to_regclass(format('public.%I', v_target.table_name)) is null
       or not exists (
         select 1
         from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = v_target.table_name
           and c.column_name = v_target.column_name
       ) then
      continue;
    end if;

    execute format(
      'alter table public.%I alter column %I drop not null',
      v_target.table_name,
      v_target.column_name
    );

    for v_constraint in
      select c.conname
      from pg_constraint c
      join pg_class source_table on source_table.oid = c.conrelid
      join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
      join pg_class target_table on target_table.oid = c.confrelid
      join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
      join pg_attribute source_column
        on source_column.attrelid = c.conrelid
       and source_column.attnum = c.conkey[1]
      where c.contype = 'f'
        and cardinality(c.conkey) = 1
        and source_schema.nspname = 'public'
        and source_table.relname = v_target.table_name
        and source_column.attname = v_target.column_name
        and target_schema.nspname = 'auth'
        and target_table.relname = 'users'
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_target.table_name,
        v_constraint.conname
      );
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
        v_target.table_name,
        v_constraint.conname,
        v_target.column_name
      );
    end loop;
  end loop;
end;
$block$;

commit;
