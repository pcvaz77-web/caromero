create or replace function public.emit_school_realtime_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_school_id uuid;
begin
  target_school_id := case when tg_op = 'DELETE' then old.school_id else new.school_id end;

  if target_school_id is null or not exists (
    select 1 from public.schools school where school.id = target_school_id
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  delete from public.school_realtime_events
  where created_at < now() - interval '24 hours';

  insert into public.school_realtime_events (school_id, entity_type)
  values (target_school_id, tg_table_name);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.emit_school_realtime_event() from public;

drop trigger if exists emit_student_delete_realtime_event on public.students;
drop trigger if exists emit_student_change_realtime_event on public.students;
create trigger emit_student_change_realtime_event
after insert or update or delete on public.students
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_class_delete_realtime_event on public.classes;
drop trigger if exists emit_class_change_realtime_event on public.classes;
create trigger emit_class_change_realtime_event
after insert or update or delete on public.classes
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_observation_option_delete_realtime_event on public.observation_options;
drop trigger if exists emit_observation_option_change_realtime_event on public.observation_options;
create trigger emit_observation_option_change_realtime_event
after insert or update or delete on public.observation_options
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_class_counselor_delete_realtime_event on public.class_counselors;
drop trigger if exists emit_class_counselor_change_realtime_event on public.class_counselors;
create trigger emit_class_counselor_change_realtime_event
after insert or update or delete on public.class_counselors
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_occurrence_delete_realtime_event on public.student_occurrences;
drop trigger if exists emit_occurrence_change_realtime_event on public.student_occurrences;
create trigger emit_occurrence_change_realtime_event
after insert or update or delete on public.student_occurrences
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_school_term_change_realtime_event on public.school_terms;
create trigger emit_school_term_change_realtime_event
after insert or update or delete on public.school_terms
for each row execute function public.emit_school_realtime_event();

drop trigger if exists emit_livro_revisa_change_realtime_event on public.livro_revisa_deliveries;
create trigger emit_livro_revisa_change_realtime_event
after insert or update or delete on public.livro_revisa_deliveries
for each row execute function public.emit_school_realtime_event();
