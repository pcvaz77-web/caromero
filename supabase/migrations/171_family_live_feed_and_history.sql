-- Portal da Família: atualização ao vivo de avisos já autorizados e
-- históricos somente de ocorrências/entradas publicados ao responsável.
-- A instalação não insere avisos nem altera registros existentes.
-- Novas comunicações já publicadas sinalizam o Portal sem expor ocorrências internas.

-- O sinal de uma comunicação nova deve existir mesmo quando a família não
-- autorizou notificações do aparelho. O envio push continua opcional.
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
      values(v_link.guardian_user_id,v_link.school_id,'Portal da Família',
        'A escola publicou uma nova comunicação para você. Abra o Portal da Família para ler.',
        'family_message',v_message.id::text);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_family_push_for_receipt() from public,anon,authenticated;

create or replace function public.family_can_read_push_notice(p_school_id uuid,p_target_id text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_target_id is null
     or p_target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_receive_family_notification(auth.uid(),p_school_id,p_target_id::uuid);
end;
$$;
revoke all on function public.family_can_read_push_notice(uuid,text) from public,anon;
grant execute on function public.family_can_read_push_notice(uuid,text) to authenticated;

create policy "Family notices for active guardian" on public.user_notifications
  for select to authenticated
  using (recipient_id=auth.uid() and target_type='family_message'
    and public.family_can_read_push_notice(school_id,target_id));

create or replace function public.family_history(
  p_link_id uuid,p_category text,p_date date default null,
  p_teacher text default null,p_limit integer default 50,p_offset integer default 0
)
returns table(
  message_id uuid,title text,body text,category text,event_at timestamptz,
  event_date date,professor_name text,published_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_category not in ('occurrence','entry') then
    raise exception 'Tipo de histórico inválido' using errcode='22023';
  end if;
  if length(coalesce(p_teacher,''))>100 then
    raise exception 'Filtro de professor muito longo' using errcode='22023';
  end if;
  return query
    select m.id,m.title,m.body,m.category,
      case when p_category='entry' then e.arrived_at else o.created_at end,
      case when p_category='entry' then (e.arrived_at at time zone 'America/Sao_Paulo')::date else o.occurred_on end,
      case when p_category='occurrence' then o.created_by_name else null::text end,
      m.published_at
    from public.family_my_students() allowed
    join public.family_links l on l.id=allowed.link_id
    join public.family_receipts r on r.link_id=l.id
    join public.family_messages m on m.id=r.message_id
      and m.school_id=l.school_id and m.student_id=l.student_id and m.status='published'
    left join public.student_occurrences o on o.id=m.occurrence_id
      and o.school_id=l.school_id and o.student_id=l.student_id
    left join public.family_student_entries e on e.id=m.entry_event_id
      and e.school_id=l.school_id and e.student_id=l.student_id and e.published_at is not null
    where allowed.link_id=p_link_id
      and ((p_category='occurrence' and m.category='occurrence' and o.id is not null)
        or (p_category='entry' and m.category='entry' and e.id is not null))
      and (p_date is null or p_date=case when p_category='entry'
        then (e.arrived_at at time zone 'America/Sao_Paulo')::date else o.occurred_on end)
      and (p_category='entry' or nullif(btrim(p_teacher),'') is null
        or position(lower(btrim(p_teacher)) in lower(coalesce(o.created_by_name,'')))>0)
    order by case when p_category='entry' then e.arrived_at else o.created_at end desc,m.id desc
    limit least(greatest(coalesce(p_limit,50),1),100)
    offset least(greatest(coalesce(p_offset,0),0),10000);
end;
$$;
revoke all on function public.family_history(uuid,text,date,text,integer,integer) from public,anon;
grant execute on function public.family_history(uuid,text,date,text,integer,integer) to authenticated;
