create or replace function public.notify_counselor_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_class_name text;
begin
  if tg_op = 'INSERT' then
    if new.counselor_user_id is distinct from v_actor
       and exists (
         select 1 from public.school_members sm
         where sm.user_id = new.counselor_user_id
           and sm.school_id = new.school_id
           and sm.status = 'active'
       ) then
      select c.name into v_class_name
      from public.classes c
      where c.id = new.class_id and c.school_id = new.school_id;

      insert into public.user_notifications
        (recipient_id, class_id, school_id, title, body, target_type, target_id)
      values (
        new.counselor_user_id, new.class_id, new.school_id,
        'Conselheiro de turma',
        'Você foi definido como conselheiro da turma ' || coalesce(v_class_name, 'não informada') || '.',
        'class_counselor', null
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.counselor_user_id is distinct from v_actor
       and exists (
         select 1 from public.classes c
         where c.id = old.class_id and c.school_id = old.school_id
       )
       and exists (
         select 1 from public.school_members sm
         where sm.user_id = old.counselor_user_id
           and sm.school_id = old.school_id
           and sm.status = 'active'
       ) then
      select c.name into v_class_name
      from public.classes c
      where c.id = old.class_id and c.school_id = old.school_id;

      insert into public.user_notifications
        (recipient_id, class_id, school_id, title, body, target_type, target_id)
      values (
        old.counselor_user_id, old.class_id, old.school_id,
        'Conselheiro de turma',
        'Você não é mais conselheiro da turma ' || coalesce(v_class_name, 'não informada') || '.',
        'class_counselor', null
      );
    end if;
    return old;
  end if;

  if old.counselor_user_id is distinct from new.counselor_user_id
     or old.class_id is distinct from new.class_id then
    if old.counselor_user_id is distinct from v_actor
       and exists (
         select 1 from public.school_members sm
         where sm.user_id = old.counselor_user_id
           and sm.school_id = old.school_id
           and sm.status = 'active'
       ) then
      select c.name into v_class_name
      from public.classes c
      where c.id = old.class_id and c.school_id = old.school_id;

      insert into public.user_notifications
        (recipient_id, class_id, school_id, title, body, target_type, target_id)
      values (
        old.counselor_user_id, old.class_id, old.school_id,
        'Conselheiro de turma',
        'Você não é mais conselheiro da turma ' || coalesce(v_class_name, 'não informada') || '.',
        'class_counselor', null
      );
    end if;

    if new.counselor_user_id is distinct from v_actor
       and exists (
         select 1 from public.school_members sm
         where sm.user_id = new.counselor_user_id
           and sm.school_id = new.school_id
           and sm.status = 'active'
       ) then
      select c.name into v_class_name
      from public.classes c
      where c.id = new.class_id and c.school_id = new.school_id;

      insert into public.user_notifications
        (recipient_id, class_id, school_id, title, body, target_type, target_id)
      values (
        new.counselor_user_id, new.class_id, new.school_id,
        'Conselheiro de turma',
        'Você foi definido como conselheiro da turma ' || coalesce(v_class_name, 'não informada') || '.',
        'class_counselor', null
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_counselor_change() from public;

drop trigger if exists notify_counselor_change on public.class_counselors;
create trigger notify_counselor_change
after insert or update or delete on public.class_counselors
for each row execute function public.notify_counselor_change();
