create or replace function public.notify_new_occurrence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student_name text;
  v_body text;
begin
  select s.full_name into v_student_name
  from public.students s
  where s.id = new.student_id;

  v_body := coalesce(v_student_name, 'Aluno') || ' — ' ||
    coalesce(new.class_name, 'Turma não informada') ||
    ': uma nova ocorrência foi registrada.';

  insert into public.user_notifications
    (recipient_id, class_id, school_id, title, body, target_type, target_id)
  select recipients.recipient_id, new.class_id, new.school_id,
    'Nova ocorrência', v_body, 'occurrence', new.id::text
  from (
    select sm.user_id as recipient_id
    from public.school_members sm
    left join public.school_member_permissions smp on smp.member_id = sm.id
    where sm.school_id = new.school_id
      and sm.status = 'active'
      and sm.user_id is distinct from new.created_by
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
              and f.class_id = new.class_id
              and f.notifications_enabled = true
          )
        )
      )
    union
    select sm2.user_id
    from public.class_counselors cc
    join public.school_members sm2
      on sm2.user_id = cc.counselor_user_id
     and sm2.school_id = new.school_id
     and sm2.status = 'active'
    left join public.school_member_permissions smp2 on smp2.member_id = sm2.id
    where cc.class_id = new.class_id
      and cc.school_id = new.school_id
      and sm2.user_id is distinct from new.created_by
      and (sm2.role = 'school_admin' or smp2.can_view_occurrences or smp2.can_edit_all)
  ) recipients;

  return new;
end;
$function$;

revoke all on function public.notify_new_occurrence() from public;

drop trigger if exists notify_occurrence_created on public.student_occurrences;
create trigger notify_occurrence_created
after insert on public.student_occurrences
for each row execute function public.notify_new_occurrence();
