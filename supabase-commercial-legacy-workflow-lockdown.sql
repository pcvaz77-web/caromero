-- CARÔMETRO COMERCIAL
-- Bloqueio preventivo das tabelas de workflow herdadas da escola única.
-- Os dados e gatilhos internos são preservados. O acesso por cliente somente
-- poderá voltar após essas tabelas receberem school_id e RLS escolar.

begin;

alter table public.student_alerts enable row level security;
alter table public.student_followups enable row level security;
alter table public.student_activity enable row level security;

do $block$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('student_alerts', 'student_followups', 'student_activity')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      item.policyname,
      item.schemaname,
      item.tablename
    );
  end loop;
end;
$block$;

revoke select, insert, update, delete
on public.student_alerts, public.student_followups, public.student_activity
from anon, authenticated;

commit;
