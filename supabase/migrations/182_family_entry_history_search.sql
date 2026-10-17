-- Mantem a lista recente em sete dias e permite consultar entradas antigas sem apaga-las.
begin;

alter table public.family_student_entries
  add column class_id uuid references public.classes(id) on delete set null,
  add column class_name text;

update public.family_student_entries e
  set class_id=s.class_id, class_name=c.name
  from public.students s
  left join public.classes c on c.id=s.class_id and c.school_id=s.school_id
  where e.student_id=s.id and e.school_id=s.school_id
    and e.class_name is null;

create index family_student_entries_class_history_idx
  on public.family_student_entries(school_id,class_id,arrived_at desc);

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
    where c.id=v_student.class_id and c.school_id=p_school_id;

  perform pg_advisory_xact_lock(hashtext(p_school_id::text || v_student.id::text));
  select * into v_entry from public.family_student_entries e
    where e.school_id=p_school_id and e.student_id=v_student.id
      and e.arrived_at>now()-interval '5 minutes'
    order by e.arrived_at desc limit 1;
  if found then
    return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,true;
    return;
  end if;

  insert into public.family_student_entries(
    school_id,student_id,student_name,card_id,scanned_by,class_id,class_name
  ) values (
    p_school_id,v_student.id,v_student.full_name,v_card.id,auth.uid(),v_student.class_id,v_class_name
  ) returning * into v_entry;
  return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,false;
end;
$$;
revoke all on function public.family_record_entry(uuid,uuid) from public,anon;
grant execute on function public.family_record_entry(uuid,uuid) to authenticated;

create or replace function public.family_recent_entries(p_school_id uuid,p_limit integer default 50)
returns table(entry_id uuid,student_name text,arrived_at timestamptz,published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  return query select e.id,e.student_name,e.arrived_at,e.published_at
    from public.family_student_entries e
    where e.school_id=p_school_id and e.arrived_at>=now()-interval '7 days'
    order by e.arrived_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.family_recent_entries(uuid,integer) from public,anon;
grant execute on function public.family_recent_entries(uuid,integer) to authenticated;

create function public.family_entry_history(
  p_school_id uuid,
  p_class_id uuid default null,
  p_student_name text default null,
  p_from date default null,
  p_to date default null,
  p_status text default 'all',
  p_limit integer default 100
)
returns table(
  entry_id uuid,
  student_id uuid,
  student_name text,
  class_id uuid,
  class_name text,
  school_name text,
  arrived_at timestamptz,
  published_at timestamptz,
  family_message_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão para consultar o histórico' using errcode='42501';
  end if;
  if p_from is not null and p_to is not null and p_from>p_to then
    raise exception 'A data inicial não pode ser posterior à data final';
  end if;
  if coalesce(p_status,'all') not in ('all','published','pending') then
    raise exception 'Situação inválida';
  end if;

  return query
    select e.id,e.student_id,e.student_name,e.class_id,e.class_name,s.name,
      e.arrived_at,e.published_at,e.family_message_id
    from public.family_student_entries e
    join public.schools s on s.id=e.school_id
    where e.school_id=p_school_id
      and (p_class_id is null or e.class_id=p_class_id)
      and (nullif(btrim(coalesce(p_student_name,'')),'') is null
        or e.student_name ilike '%' || btrim(p_student_name) || '%')
      and (p_from is null or e.arrived_at >= (p_from::timestamp at time zone 'America/Sao_Paulo'))
      and (p_to is null or e.arrived_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo'))
      and (coalesce(p_status,'all')='all'
        or (p_status='published' and (e.published_at is not null or e.family_message_id is not null))
        or (p_status='pending' and e.published_at is null and e.family_message_id is null))
    order by e.arrived_at desc
    limit least(greatest(coalesce(p_limit,100),1),200);
end;
$$;
revoke all on function public.family_entry_history(uuid,uuid,text,date,date,text,integer) from public,anon;
grant execute on function public.family_entry_history(uuid,uuid,text,date,date,text,integer) to authenticated;

create function public.family_entry_name_suggestions(
  p_school_id uuid,p_class_id uuid default null,p_query text default null
)
returns table(student_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão para consultar o histórico' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_query,'')))<2 then return; end if;

  return query select distinct e.student_name
    from public.family_student_entries e
    where e.school_id=p_school_id
      and (p_class_id is null or e.class_id=p_class_id)
      and e.student_name ilike '%' || btrim(p_query) || '%'
    order by e.student_name
    limit 20;
end;
$$;
revoke all on function public.family_entry_name_suggestions(uuid,uuid,text) from public,anon;
grant execute on function public.family_entry_name_suggestions(uuid,uuid,text) to authenticated;

commit;
