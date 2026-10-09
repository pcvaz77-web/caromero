-- Portal da Família: convite presencial por QR, carteirinhas e registro de entrada.
-- Depende da fundação 151. Não cria vínculos, cartões ou entradas ao ser instalada.
begin;

create or replace function public.family_school_manager(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members m
    join public.schools s on s.id=m.school_id
    where m.school_id=p_school_id and m.user_id=auth.uid()
      and m.status='active' and m.role in ('school_admin','coordinator')
      and s.status='active'
  );
$$;
revoke all on function public.family_school_manager(uuid) from public, anon;
grant execute on function public.family_school_manager(uuid) to authenticated;

alter table public.family_links add column if not exists invitation_batch_id uuid;
create index if not exists family_links_invitation_batch_idx
  on public.family_links(invitation_batch_id) where invitation_batch_id is not null;

create or replace function public.family_create_invitation_bundle(
  p_school_id uuid, p_student_ids uuid[], p_name text, p_phone text
)
returns table(link_id uuid, invitation_token uuid, student_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_ids uuid[];
  v_student public.students%rowtype;
  v_link_id uuid;
  v_first_id uuid;
  v_count integer := 0;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão para convidar responsáveis' using errcode='42501';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Informe o celular com DDI';
  end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 160 then
    raise exception 'Informe o nome do responsável';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) not between 1 and 10
     or array_position(p_student_ids,null) is not null then
    raise exception 'Selecione de 1 a 10 alunos';
  end if;
  select array_agg(distinct id) into v_ids from unnest(p_student_ids) as id;
  if cardinality(v_ids) <> cardinality(p_student_ids) then
    raise exception 'Seleção de alunos duplicada';
  end if;
  if exists(select 1 from public.family_links l
    where l.school_id=p_school_id and l.student_id=any(v_ids)
      and l.phone_e164=p_phone and l.status='active') then
    raise exception 'Este responsável já está vinculado a um dos alunos selecionados';
  end if;
  -- Um convite vencido não pode impedir novo atendimento presencial.
  update public.family_links set status='revoked',revoked_at=now(),invitation_token=null
    where school_id=p_school_id and student_id=any(v_ids) and phone_e164=p_phone
      and status='pending' and invitation_expires_at<=now();
  for v_student in
    select * from public.students
    where school_id=p_school_id and id=any(v_ids) and enrollment_status='active'
    order by id
  loop
    v_count := v_count+1;
    insert into public.family_links(
      school_id,student_id,student_name,guardian_name,phone_e164,
      invitation_batch_id,invitation_token,invitation_expires_at,created_by
    ) values (
      p_school_id,v_student.id,v_student.full_name,btrim(p_name),p_phone,
      v_batch,case when v_first_id is null then v_token else null end,
      now()+interval '15 minutes',auth.uid()
    ) returning id into v_link_id;
    if v_first_id is null then v_first_id := v_link_id; end if;
    insert into public.family_audit(school_id,actor_id,action,subject_id)
      values(p_school_id,auth.uid(),'invitation_created',v_link_id);
  end loop;
  if v_count <> cardinality(v_ids) then
    raise exception 'Seleção contém aluno inativo ou de outra escola';
  end if;
  return query select v_first_id,v_token,v_count;
end;
$$;
revoke all on function public.family_create_invitation_bundle(uuid,uuid[],text,text) from public,anon;
grant execute on function public.family_create_invitation_bundle(uuid,uuid[],text,text) to authenticated;

create or replace function public.family_accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_link public.family_links%rowtype; v_email text; v_confirmed timestamptz; v_family boolean;
begin
  if auth.uid() is null then raise exception 'Entre com o celular antes de aceitar o convite'; end if;
  select * into v_link from public.family_links
    where invitation_token=p_token and status='pending' and invitation_expires_at>now()
    for update;
  if not found then raise exception 'Convite inválido ou vencido'; end if;
  select email,email_confirmed_at,coalesce(raw_app_meta_data->>'family_portal','false')='true'
    into v_email,v_confirmed,v_family from auth.users where id=auth.uid();
  if v_confirmed is null or not coalesce(v_family,false)
     or v_email is distinct from ('familia-' || substring(v_link.phone_e164 from 2) || '@sistemacarometro.com.br') then
    raise exception 'Use o acesso autorizado pela escola';
  end if;
  if not exists(select 1 from public.schools where id=v_link.school_id and status='active') then
    raise exception 'Escola indisponível';
  end if;
  if exists (
    select 1 from public.family_links l
    where l.invitation_batch_id=v_link.invitation_batch_id
      and v_link.invitation_batch_id is not null
      and (l.school_id<>v_link.school_id or l.phone_e164<>v_link.phone_e164
        or l.status<>'pending' or l.invitation_expires_at<=now()
        or not exists(select 1 from public.students s where s.id=l.student_id
          and s.school_id=l.school_id and s.enrollment_status='active'))
  ) then raise exception 'Um dos vínculos do convite está indisponível'; end if;
  if not exists(select 1 from public.students s where s.id=v_link.student_id
    and s.school_id=v_link.school_id and s.enrollment_status='active') then
    raise exception 'Aluno indisponível';
  end if;
  update public.family_links set guardian_user_id=auth.uid(),status='active',
    invitation_token=null,accepted_at=now()
    where (id=v_link.id or (v_link.invitation_batch_id is not null
      and invitation_batch_id=v_link.invitation_batch_id))
      and school_id=v_link.school_id and phone_e164=v_link.phone_e164 and status='pending';
  insert into public.family_receipts(message_id,link_id)
    select m.id,l.id from public.family_links l
    join public.family_messages m on m.school_id=l.school_id
      and m.student_id=l.student_id and m.status='published'
    where (l.id=v_link.id or (v_link.invitation_batch_id is not null
      and l.invitation_batch_id=v_link.invitation_batch_id))
      and l.guardian_user_id=auth.uid() and l.status='active'
    on conflict do nothing;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(v_link.school_id,auth.uid(),'invitation_accepted',v_link.id);
  return v_link.id;
end;
$$;
revoke all on function public.family_accept_invitation(uuid) from public,anon;
grant execute on function public.family_accept_invitation(uuid) to authenticated;

create or replace function public.family_my_students()
returns table(link_id uuid,school_id uuid,school_name text,student_id uuid,student_name text,class_name text)
language sql stable security definer set search_path = '' as $$
  select l.id,l.school_id,sc.name,st.id,st.full_name,coalesce(c.name,st.class_name)
  from public.family_links l
  join public.schools sc on sc.id=l.school_id
  join public.students st on st.id=l.student_id and st.school_id=l.school_id
  left join public.classes c on c.id=st.class_id and c.school_id=st.school_id
  join auth.users u on u.id=auth.uid()
  where l.guardian_user_id=auth.uid() and l.status='active'
    and u.email=('familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
    and u.email_confirmed_at is not null
    and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    and sc.status='active' and st.enrollment_status='active'
  order by sc.name,st.full_name;
$$;
revoke all on function public.family_my_students() from public,anon;
grant execute on function public.family_my_students() to authenticated;

create or replace function public.family_feed(p_link_id uuid)
returns table(message_id uuid,title text,body text,category text,published_at timestamptz,viewed_at timestamptz,acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,m.title,m.body,m.category,m.published_at,r.viewed_at,r.acknowledged_at
  from public.family_links l join public.family_receipts r on r.link_id=l.id
  join public.family_messages m on m.id=r.message_id and m.school_id=l.school_id and m.student_id=l.student_id
  join public.schools sc on sc.id=l.school_id
  join auth.users u on u.id=auth.uid()
  where l.id=p_link_id and l.status='active' and l.guardian_user_id=auth.uid()
    and u.email=('familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
    and u.email_confirmed_at is not null
    and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    and sc.status='active' and m.status='published'
  order by m.published_at desc,m.id desc;
$$;
revoke all on function public.family_feed(uuid) from public,anon;
grant execute on function public.family_feed(uuid) to authenticated;

create or replace function public.family_record_receipt(p_link_id uuid,p_message_id uuid,p_acknowledge boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_viewed_at timestamptz; v_acknowledged_at timestamptz;
begin
  select l.school_id,r.viewed_at,r.acknowledged_at into v_school,v_viewed_at,v_acknowledged_at
    from public.family_links l
    join public.family_messages m on m.id=p_message_id and m.school_id=l.school_id
      and m.student_id=l.student_id and m.status='published'
    join public.family_receipts r on r.message_id=m.id and r.link_id=l.id
    join public.schools sc on sc.id=l.school_id and sc.status='active'
    join auth.users u on u.id=auth.uid()
      and u.email=('familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    where l.id=p_link_id and l.guardian_user_id=auth.uid() and l.status='active'
    for update of r;
  if v_school is null then raise exception 'Comunicação indisponível'; end if;
  if (p_acknowledge and v_acknowledged_at is not null)
     or (not p_acknowledge and v_viewed_at is not null) then return; end if;
  update public.family_receipts set viewed_at=coalesce(viewed_at,now()),
    acknowledged_at=case when p_acknowledge then coalesce(acknowledged_at,now()) else acknowledged_at end
    where message_id=p_message_id and link_id=p_link_id;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(v_school,auth.uid(),case when p_acknowledge then 'acknowledged' else 'viewed' end,p_message_id);
end;
$$;
revoke all on function public.family_record_receipt(uuid,uuid,boolean) from public,anon;
grant execute on function public.family_record_receipt(uuid,uuid,boolean) to authenticated;

create table public.family_student_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  qr_token uuid not null unique default gen_random_uuid(),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index family_student_cards_one_active
  on public.family_student_cards(school_id,student_id) where revoked_at is null;
create index family_student_cards_school_idx on public.family_student_cards(school_id,student_id);
alter table public.family_student_cards enable row level security;
revoke all on public.family_student_cards from public,anon,authenticated;
grant all on public.family_student_cards to service_role;

create table public.family_student_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  card_id uuid references public.family_student_cards(id) on delete set null,
  scanned_by uuid references auth.users(id) on delete set null,
  arrived_at timestamptz not null default now(),
  family_message_id uuid references public.family_messages(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz
);
create index family_student_entries_school_idx
  on public.family_student_entries(school_id,arrived_at desc);
create index family_student_entries_student_idx
  on public.family_student_entries(school_id,student_id,arrived_at desc);
alter table public.family_student_entries enable row level security;
revoke all on public.family_student_entries from public,anon,authenticated;
grant all on public.family_student_entries to service_role;

alter table public.family_messages drop constraint if exists family_messages_category_check;
alter table public.family_messages add constraint family_messages_category_check
  check (category in ('occurrence','urgent','notice','positive','acknowledgement','entry'));
alter table public.family_messages add column if not exists entry_event_id uuid
  references public.family_student_entries(id) on delete set null;
create unique index family_messages_one_entry on public.family_messages(entry_event_id)
  where entry_event_id is not null;

create function public.family_issue_cards(p_school_id uuid,p_class_id uuid)
returns table(card_id uuid,qr_token uuid,student_id uuid,student_name text,
  class_name text,photo_path text,guardian_name text,guardian_phone text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not exists(select 1 from public.classes c where c.id=p_class_id
      and c.school_id=p_school_id and c.archived_at is null) then
    raise exception 'Turma ativa não encontrada nesta escola';
  end if;
  insert into public.family_student_cards(school_id,student_id,issued_by)
    select p_school_id,s.id,auth.uid() from public.students s
    where s.school_id=p_school_id and s.class_id=p_class_id and s.enrollment_status='active'
      and not exists(select 1 from public.family_student_cards x
        where x.school_id=p_school_id and x.student_id=s.id and x.revoked_at is null)
    on conflict do nothing;
  return query select card.id,card.qr_token,s.id,s.full_name,c.name,s.photo_path,
    coalesce(s.guardian_name,contact.guardian_name),
    coalesce(s.guardian_phone,contact.phone_e164)
    from public.family_student_cards card
    join public.students s on s.id=card.student_id and s.school_id=card.school_id
    join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    left join lateral (
      select l.guardian_name,l.phone_e164 from public.family_links l
      where l.school_id=s.school_id and l.student_id=s.id and l.status in ('active','pending')
      order by case when l.status='active' then 0 else 1 end,l.created_at desc limit 1
    ) contact on true
    where card.school_id=p_school_id and s.class_id=p_class_id
      and card.revoked_at is null and s.enrollment_status='active'
    order by s.full_name,s.id;
end;
$$;
revoke all on function public.family_issue_cards(uuid,uuid) from public,anon;
grant execute on function public.family_issue_cards(uuid,uuid) to authenticated;

-- Carteirinha perdida: o QR antigo para de funcionar antes da nova impressão.
create function public.family_reissue_card(p_school_id uuid,p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not exists(select 1 from public.students s join public.classes c
    on c.id=s.class_id and c.school_id=s.school_id
    where s.id=p_student_id and s.school_id=p_school_id
      and s.enrollment_status='active' and c.archived_at is null) then
    raise exception 'Aluno ativo não encontrado nesta escola';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_school_id::text || p_student_id::text));
  update public.family_student_cards set revoked_at=now()
    where school_id=p_school_id and student_id=p_student_id and revoked_at is null;
  insert into public.family_student_cards(school_id,student_id,issued_by)
    values(p_school_id,p_student_id,auth.uid()) returning qr_token into v_token;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'card_reissued',p_student_id);
  return v_token;
end;
$$;
revoke all on function public.family_reissue_card(uuid,uuid) from public,anon;
grant execute on function public.family_reissue_card(uuid,uuid) to authenticated;

create function public.family_lookup_card(p_school_id uuid,p_qr_token uuid)
returns table(card_id uuid,student_id uuid,student_name text,class_name text,photo_path text,
  guardian_name text,guardian_phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  return query select card.id,s.id,s.full_name,c.name,s.photo_path,s.guardian_name,s.guardian_phone
    from public.family_student_cards card
    join public.students s on s.id=card.student_id and s.school_id=card.school_id
    join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    where card.school_id=p_school_id and card.qr_token=p_qr_token and card.revoked_at is null
      and s.enrollment_status='active' and c.archived_at is null;
end;
$$;
revoke all on function public.family_lookup_card(uuid,uuid) from public,anon;
grant execute on function public.family_lookup_card(uuid,uuid) to authenticated;

create function public.family_record_entry(p_school_id uuid,p_qr_token uuid)
returns table(entry_id uuid,student_id uuid,student_name text,arrived_at timestamptz,duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare v_card public.family_student_cards%rowtype; v_student public.students%rowtype;
  v_entry public.family_student_entries%rowtype;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  select * into v_card from public.family_student_cards
    where school_id=p_school_id and qr_token=p_qr_token and revoked_at is null;
  if not found then raise exception 'Carteirinha inválida ou substituída'; end if;
  select * into v_student from public.students
    where id=v_card.student_id and school_id=p_school_id and enrollment_status='active';
  if not found then raise exception 'Aluno ativo não encontrado nesta escola'; end if;
  -- Evita uma segunda entrada por leitura repetida na catraca.
  perform pg_advisory_xact_lock(hashtext(p_school_id::text || v_student.id::text));
  select * into v_entry from public.family_student_entries e
    where e.school_id=p_school_id and e.student_id=v_student.id
      and e.arrived_at>now()-interval '5 minutes'
    order by e.arrived_at desc limit 1;
  if found then
    return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,true;
    return;
  end if;
  insert into public.family_student_entries(school_id,student_id,student_name,card_id,scanned_by)
    values(p_school_id,v_student.id,v_student.full_name,v_card.id,auth.uid())
    returning * into v_entry;
  return query select v_entry.id,v_student.id,v_student.full_name,v_entry.arrived_at,false;
end;
$$;
revoke all on function public.family_record_entry(uuid,uuid) from public,anon;
grant execute on function public.family_record_entry(uuid,uuid) to authenticated;

create function public.family_publish_entry(p_school_id uuid,p_entry_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_entry public.family_student_entries%rowtype; v_message uuid;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  select * into v_entry from public.family_student_entries
    where id=p_entry_id and school_id=p_school_id for update;
  if not found then raise exception 'Entrada não encontrada nesta escola'; end if;
  if v_entry.family_message_id is not null then return v_entry.family_message_id; end if;
  insert into public.family_messages(
    school_id,student_id,student_name,category,title,body,entry_event_id,published_by
  ) values (
    p_school_id,v_entry.student_id,v_entry.student_name,'entry','Entrada na escola',
    'Entrada registrada em ' || to_char(v_entry.arrived_at at time zone 'America/Sao_Paulo','DD/MM/YYYY às HH24:MI') || '.',
    v_entry.id,auth.uid()
  ) returning id into v_message;
  insert into public.family_receipts(message_id,link_id)
    select v_message,l.id from public.family_links l
    where l.school_id=p_school_id and l.student_id=v_entry.student_id and l.status='active'
    on conflict do nothing;
  update public.family_student_entries set family_message_id=v_message,
    published_by=auth.uid(),published_at=now() where id=v_entry.id;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'entry_published',v_entry.id);
  return v_message;
end;
$$;
revoke all on function public.family_publish_entry(uuid,uuid) from public,anon;
grant execute on function public.family_publish_entry(uuid,uuid) to authenticated;

create function public.family_recent_entries(p_school_id uuid,p_limit integer default 50)
returns table(entry_id uuid,student_name text,arrived_at timestamptz,published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  return query select e.id,e.student_name,e.arrived_at,e.published_at
    from public.family_student_entries e where e.school_id=p_school_id
    order by e.arrived_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.family_recent_entries(uuid,integer) from public,anon;
grant execute on function public.family_recent_entries(uuid,integer) to authenticated;

commit;
