create or replace function public.notify_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_class_id uuid;
  v_student_id uuid;
  v_occurrence_id uuid;
  v_class_name text;
  v_student_name text;
  v_title text;
  v_body text;
  v_target_type text;
begin
  if tg_op = 'DELETE' then
    v_school_id := old.school_id;
    v_class_id := old.class_id;
    v_student_id := old.student_id;
    v_occurrence_id := old.id;
    v_class_name := old.class_name;
    v_title := 'Ocorrência excluída';
    v_target_type := 'occurrence_deleted';
  elsif tg_op = 'UPDATE' then
    v_school_id := new.school_id;
    v_class_id := new.class_id;
    v_student_id := new.student_id;
    v_occurrence_id := new.id;
    v_class_name := new.class_name;
    v_title := 'Ocorrência atualizada';
    v_target_type := 'occurrence';
  else
    v_school_id := new.school_id;
    v_class_id := new.class_id;
    v_student_id := new.student_id;
    v_occurrence_id := new.id;
    v_class_name := new.class_name;
    v_title := 'Nova ocorrência';
    v_target_type := 'occurrence';
  end if;

  select s.full_name into v_student_name
  from public.students s
  where s.id = v_student_id
    and s.school_id = v_school_id;

  v_body := coalesce(v_student_name, 'Aluno') || ' — ' ||
    coalesce(v_class_name, 'Turma não informada') ||
    case tg_op
      when 'DELETE' then ': uma ocorrência foi excluída.'
      when 'UPDATE' then ': uma ocorrência foi atualizada.'
      else ': uma nova ocorrência foi registrada.'
    end;

  insert into public.user_notifications
    (recipient_id, class_id, school_id, title, body, target_type, target_id)
  select recipients.recipient_id, v_class_id, v_school_id,
    v_title, v_body, v_target_type, v_occurrence_id::text
  from (
    select sm.user_id as recipient_id
    from public.school_members sm
    left join public.school_member_permissions smp on smp.member_id = sm.id
    where sm.school_id = v_school_id
      and sm.status = 'active'
      and sm.user_id is distinct from v_actor
      and (
        sm.role = 'school_admin'
        or (sm.role = 'coordinator' and (smp.can_view_occurrences or smp.can_edit_all))
        or (
          sm.role = 'teacher'
          and (smp.can_view_occurrences or smp.can_edit_all)
          and exists (
            select 1
            from public.user_favorite_classes f
            where f.user_id = sm.user_id
              and f.class_id = v_class_id
              and f.notifications_enabled = true
          )
        )
      )
    union
    select sm2.user_id
    from public.class_counselors cc
    join public.school_members sm2
      on sm2.user_id = cc.counselor_user_id
     and sm2.school_id = v_school_id
     and sm2.status = 'active'
    left join public.school_member_permissions smp2 on smp2.member_id = sm2.id
    where cc.class_id = v_class_id
      and cc.school_id = v_school_id
      and sm2.user_id is distinct from v_actor
      and (sm2.role = 'school_admin' or smp2.can_view_occurrences or smp2.can_edit_all)
  ) recipients;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.notify_occurrence_change() from public;

drop trigger if exists notify_occurrence_created on public.student_occurrences;
drop trigger if exists notify_occurrence_changed on public.student_occurrences;

create trigger notify_occurrence_changed
after insert or update or delete on public.student_occurrences
for each row execute function public.notify_occurrence_change();

drop function if exists public.notify_new_occurrence();
