-- Uma leitura válida registra a entrada e publica o aviso na mesma transação.
-- O painel da turma continua lendo family_student_entries como fonte da taxa de entradas.
begin;

create or replace function public.family_record_entry(p_school_id uuid,p_qr_token uuid)
returns table(entry_id uuid,student_id uuid,student_name text,arrived_at timestamptz,duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_card public.family_student_cards%rowtype;
  v_student public.students%rowtype;
  v_class_name text;
  v_entry public.family_student_entries%rowtype;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  select * into v_card from public.family_student_cards
    where school_id=p_school_id and qr_token=p_qr_token and revoked_at is null;
  if not found then raise exception 'Carteirinha inválida ou substituída'; end if;
  select * into v_student from public.students
    where id=v_card.student_id and school_id=p_school_id and enrollment_status='active';
  if not found then raise exception 'Aluno ativo não encontrado nesta escola'; end if;
  select c.name into v_class_name from public.classes c
    where c.id=v_student.class_id and c.school_id=p_school_id and c.archived_at is null;
  if v_class_name is null then raise exception 'Turma ativa não encontrada nesta escola'; end if;

  perform pg_advisory_xact_lock(hashtext(p_school_id::text || v_student.id::text));
  select * into v_entry from public.family_student_entries e
    where e.school_id=p_school_id and e.student_id=v_student.id
      and e.arrived_at>now()-interval '5 minutes'
    order by e.arrived_at desc limit 1;
  if found then
    if v_entry.family_message_id is null then
      perform public.family_publish_entry(p_school_id,v_entry.id);
    end if;
    return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,true;
    return;
  end if;

  insert into public.family_student_entries(
    school_id,student_id,student_name,card_id,scanned_by,class_id,class_name
  ) values (
    p_school_id,v_student.id,v_student.full_name,v_card.id,auth.uid(),v_student.class_id,v_class_name
  ) returning * into v_entry;
  perform public.family_publish_entry(p_school_id,v_entry.id);
  return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,false;
end;
$$;
revoke all on function public.family_record_entry(uuid,uuid) from public,anon;
grant execute on function public.family_record_entry(uuid,uuid) to authenticated;

-- O aviso do aparelho identifica o aluno e a data/hora da entrada.
-- Outras comunicações mantêm o texto discreto que já utilizam.
create or replace function public.queue_family_push_for_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_message public.family_messages%rowtype; v_link public.family_links%rowtype;
begin
  select * into v_message from public.family_messages where id=new.message_id;
  select * into v_link from public.family_links where id=new.link_id;
  if v_message.status='published' and v_link.status='active'
     and v_link.accepted_at is not null and v_link.accepted_at<=v_message.published_at
     and v_link.school_id=v_message.school_id and v_link.student_id=v_message.student_id
     and public.can_receive_family_notification(v_link.guardian_user_id,v_link.school_id,v_message.id) then
    insert into public.user_notifications(recipient_id,school_id,title,body,target_type,target_id)
      values(v_link.guardian_user_id,v_link.school_id,
        case when v_message.category='entry' then 'Entrada na escola' else 'Portal da Família' end,
        case when v_message.category='entry'
          then v_message.student_name || ': ' || v_message.body
          else 'A escola publicou uma nova comunicação para você. Abra o Portal da Família para ler.' end,
        'family_message',v_message.id::text);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_family_push_for_receipt() from public,anon,authenticated;

commit;
