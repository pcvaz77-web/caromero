begin;

-- Portal da Família: dados próprios. O contato opcional em students não cria acesso.
-- Nenhuma ocorrência interna recebe uma policy de leitura para familiares.
create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  guardian_name text not null check (char_length(btrim(guardian_name)) between 2 and 160),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_opt_in_at timestamptz,
  guardian_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  invitation_token uuid unique default gen_random_uuid(),
  invitation_expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint family_link_active_account check (status <> 'active' or guardian_user_id is not null)
);
-- A exclusão de uma conta Auth deve preservar o histórico e revogar o acesso.
-- O FK ON DELETE SET NULL aciona este trigger antes de validar o CHECK acima.
create function public.family_revoke_deleted_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.guardian_user_id is not null and new.guardian_user_id is null and new.status='active' then
    new.status='revoked';
    new.revoked_at=now();
    new.invitation_token=null;
  end if;
  return new;
end;
$$;
revoke all on function public.family_revoke_deleted_account() from public, anon, authenticated;
create trigger family_links_revoke_deleted_account
  before update of guardian_user_id on public.family_links
  for each row execute function public.family_revoke_deleted_account();
create unique index family_links_one_current_student_phone
  on public.family_links(school_id, student_id, phone_e164)
  where status in ('pending','active') and student_id is not null;
create index family_links_user_idx on public.family_links(guardian_user_id, status);
create index family_links_school_idx on public.family_links(school_id, status);

create table public.family_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  occurrence_id uuid references public.student_occurrences(id) on delete set null,
  student_name text not null,
  category text not null default 'occurrence' check (category in ('occurrence','urgent','notice','positive','acknowledgement')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'published' check (status in ('published','withdrawn')),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index family_messages_student_idx on public.family_messages(school_id, student_id, published_at desc);
create unique index family_messages_one_published_occurrence
  on public.family_messages(occurrence_id) where status='published' and occurrence_id is not null;

create table public.family_receipts (
  message_id uuid not null references public.family_messages(id) on delete cascade,
  link_id uuid not null references public.family_links(id) on delete cascade,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  primary key (message_id, link_id)
);

create table public.family_audit (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid,
  action text not null,
  subject_id uuid,
  occurred_at timestamptz not null default now()
);
create index family_audit_school_idx on public.family_audit(school_id, occurred_at desc);

create table public.family_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invite','message')),
  link_id uuid not null references public.family_links(id) on delete cascade,
  message_id uuid references public.family_messages(id) on delete cascade,
  status text not null check (status in ('requested','accepted','failed','delivered','read')),
  provider_message_id text unique,
  updated_at timestamptz not null default now(),
  check ((kind='invite' and message_id is null) or (kind='message' and message_id is not null))
);
create unique index family_deliveries_invite_unique on public.family_deliveries(link_id) where kind='invite';
create unique index family_deliveries_message_unique on public.family_deliveries(link_id,message_id) where kind='message';

create function public.family_claim_delivery(p_kind text,p_link_id uuid,p_message_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_link public.family_links%rowtype; v_delivery public.family_deliveries%rowtype;
begin
  select * into v_link from public.family_links where id=p_link_id for update;
  if not found or v_link.whatsapp_opt_in_at is null
     or not exists(select 1 from public.schools where id=v_link.school_id and status='active') then return false; end if;
  if p_kind='invite' then
    if p_message_id is not null or v_link.status<>'pending' or v_link.invitation_token is null
       or v_link.invitation_expires_at<=now() then return false; end if;
  elsif p_kind='message' then
    if v_link.status<>'active' or not exists(
      select 1 from auth.users u where u.id=v_link.guardian_user_id
        and u.phone=v_link.phone_e164 and u.phone_confirmed_at is not null
    ) or not exists(
      select 1 from public.family_messages m join public.family_receipts r
      on r.message_id=m.id and r.link_id=v_link.id
      where m.id=p_message_id and m.school_id=v_link.school_id
        and m.student_id=v_link.student_id and m.status='published'
    ) then return false; end if;
  else return false; end if;
  select * into v_delivery from public.family_deliveries
    where kind=p_kind and link_id=p_link_id and message_id is not distinct from p_message_id for update;
  if found then
    if v_delivery.status in ('requested','accepted','delivered','read') then return false; end if;
    update public.family_deliveries set status='requested',provider_message_id=null,updated_at=now()
      where id=v_delivery.id;
  else
    insert into public.family_deliveries(kind,link_id,message_id,status)
      values(p_kind,p_link_id,p_message_id,'requested');
  end if;
  return true;
end;
$$;
revoke all on function public.family_claim_delivery(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.family_claim_delivery(text,uuid,uuid) to service_role;

-- API exclusivamente por funções com projeções mínimas. Sem grants diretos.
alter table public.family_links enable row level security;
alter table public.family_messages enable row level security;
alter table public.family_receipts enable row level security;
alter table public.family_audit enable row level security;
alter table public.family_deliveries enable row level security;
revoke all on public.family_links, public.family_messages, public.family_receipts, public.family_audit, public.family_deliveries from public, anon, authenticated;
grant all on public.family_links, public.family_messages, public.family_receipts, public.family_audit, public.family_deliveries to service_role;
grant usage, select on sequence public.family_audit_id_seq to service_role;

create function public.family_school_manager(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members m join public.schools s on s.id=m.school_id
    where m.school_id=p_school_id and m.user_id=auth.uid()
      and m.status='active' and m.role='school_admin' and s.status='active'
  );
$$;
revoke all on function public.family_school_manager(uuid) from public, anon;
grant execute on function public.family_school_manager(uuid) to authenticated;

create function public.family_create_invitation(p_school_id uuid, p_student_id uuid, p_name text, p_phone text, p_whatsapp_opt_in boolean)
returns table(link_id uuid, invitation_token uuid)
language plpgsql security definer set search_path = '' as $$
declare v_student public.students%rowtype; v_link public.family_links%rowtype;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão para vincular responsáveis'; end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Use telefone no formato internacional'; end if;
  if p_whatsapp_opt_in is distinct from true then raise exception 'Registre o consentimento para mensagens no WhatsApp'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 160 then raise exception 'Informe o nome do responsável'; end if;
  select * into v_student from public.students where id=p_student_id and school_id=p_school_id and enrollment_status='active';
  if not found then raise exception 'Aluno ativo não encontrado nesta escola'; end if;
  insert into public.family_links(school_id,student_id,student_name,guardian_name,phone_e164,whatsapp_opt_in_at,created_by)
  values(p_school_id,p_student_id,v_student.full_name,btrim(p_name),p_phone,now(),auth.uid())
  returning * into v_link;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
  values(p_school_id,auth.uid(),'invitation_created',v_link.id);
  return query select v_link.id,v_link.invitation_token;
end;
$$;
revoke all on function public.family_create_invitation(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.family_create_invitation(uuid,uuid,text,text,boolean) to authenticated;

create function public.family_accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_link public.family_links%rowtype; v_phone text; v_confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'Entre com o celular antes de aceitar o convite'; end if;
  select * into v_link from public.family_links
    where invitation_token=p_token and status='pending' and invitation_expires_at>now()
    for update;
  if not found then raise exception 'Convite inválido ou vencido'; end if;
  select phone,phone_confirmed_at into v_phone,v_confirmed from auth.users where id=auth.uid();
  if v_confirmed is null or v_phone is distinct from v_link.phone_e164 then
    raise exception 'Confirme o mesmo celular que recebeu o convite';
  end if;
  if not exists(select 1 from public.schools where id=v_link.school_id and status='active')
     or not exists(select 1 from public.students where id=v_link.student_id and school_id=v_link.school_id) then
    raise exception 'Vínculo indisponível';
  end if;
  update public.family_links set guardian_user_id=auth.uid(),status='active',
    invitation_token=null,accepted_at=now() where id=v_link.id;
  insert into public.family_receipts(message_id,link_id)
    select m.id,v_link.id from public.family_messages m
    where m.school_id=v_link.school_id and m.student_id=v_link.student_id and m.status='published'
    on conflict do nothing;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
  values(v_link.school_id,auth.uid(),'invitation_accepted',v_link.id);
  return v_link.id;
end;
$$;
revoke all on function public.family_accept_invitation(uuid) from public, anon;
grant execute on function public.family_accept_invitation(uuid) to authenticated;

create function public.family_my_students()
returns table(link_id uuid,school_id uuid,school_name text,student_id uuid,student_name text,class_name text)
language sql stable security definer set search_path = '' as $$
  select l.id,l.school_id,sc.name,st.id,st.full_name,st.class_name
  from public.family_links l join public.schools sc on sc.id=l.school_id
  join public.students st on st.id=l.student_id and st.school_id=l.school_id
  join auth.users u on u.id=auth.uid()
  where l.guardian_user_id=auth.uid() and l.status='active'
    and l.phone_e164=u.phone and u.phone_confirmed_at is not null
    and sc.status='active'
  order by sc.name,st.full_name;
$$;
revoke all on function public.family_my_students() from public, anon;
grant execute on function public.family_my_students() to authenticated;

create function public.family_publish_occurrence(p_school_id uuid,p_occurrence_id uuid,p_title text,p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_occ public.student_occurrences%rowtype; v_student public.students%rowtype; v_message uuid;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Somente a administração da escola pode publicar'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 160
     or char_length(btrim(coalesce(p_body,''))) not between 1 and 2000 then
    raise exception 'Título ou mensagem inválidos';
  end if;
  select * into v_occ from public.student_occurrences where id=p_occurrence_id and school_id=p_school_id;
  if not found then raise exception 'Ocorrência não encontrada nesta escola'; end if;
  select * into v_student from public.students where id=v_occ.student_id and school_id=p_school_id;
  if not found then raise exception 'Aluno não encontrado nesta escola'; end if;
  insert into public.family_messages(school_id,student_id,occurrence_id,student_name,title,body,published_by)
    values(p_school_id,v_student.id,v_occ.id,v_student.full_name,btrim(p_title),btrim(p_body),auth.uid())
    returning id into v_message;
  insert into public.family_receipts(message_id,link_id)
    select v_message,l.id from public.family_links l
    where l.school_id=p_school_id and l.student_id=v_student.id and l.status='active';
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'message_published',v_message);
  return v_message;
end;
$$;
revoke all on function public.family_publish_occurrence(uuid,uuid,text,text) from public, anon;
grant execute on function public.family_publish_occurrence(uuid,uuid,text,text) to authenticated;

create function public.family_feed(p_link_id uuid)
returns table(message_id uuid,title text,body text,category text,published_at timestamptz,viewed_at timestamptz,acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,m.title,m.body,m.category,m.published_at,r.viewed_at,r.acknowledged_at
  from public.family_links l join public.family_receipts r on r.link_id=l.id
  join public.family_messages m on m.id=r.message_id and m.school_id=l.school_id and m.student_id=l.student_id
  join public.schools sc on sc.id=l.school_id
  join auth.users u on u.id=auth.uid()
  where l.id=p_link_id and l.status='active' and l.guardian_user_id=auth.uid()
    and l.phone_e164=u.phone and u.phone_confirmed_at is not null
    and sc.status='active' and m.status='published'
  order by m.published_at desc,m.id desc;
$$;
revoke all on function public.family_feed(uuid) from public, anon;
grant execute on function public.family_feed(uuid) to authenticated;

create function public.family_record_receipt(p_link_id uuid,p_message_id uuid,p_acknowledge boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_viewed_at timestamptz; v_acknowledged_at timestamptz;
begin
  select l.school_id,r.viewed_at,r.acknowledged_at into v_school,v_viewed_at,v_acknowledged_at from public.family_links l
    join public.family_messages m on m.id=p_message_id and m.school_id=l.school_id and m.student_id=l.student_id and m.status='published'
    join public.family_receipts r on r.message_id=m.id and r.link_id=l.id
    join public.schools sc on sc.id=l.school_id and sc.status='active'
    join auth.users u on u.id=auth.uid() and u.phone=l.phone_e164 and u.phone_confirmed_at is not null
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
revoke all on function public.family_record_receipt(uuid,uuid,boolean) from public, anon;
grant execute on function public.family_record_receipt(uuid,uuid,boolean) to authenticated;

create function public.family_school_overview(p_school_id uuid)
returns table(link_id uuid,student_id uuid,student_name text,guardian_name text,phone_e164 text,link_status text,message_id uuid,message_title text,published_at timestamptz,viewed_at timestamptz,acknowledged_at timestamptz,delivery_status text,invite_delivery_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão'; end if;
  return query select l.id,l.student_id,l.student_name,l.guardian_name,l.phone_e164,l.status,
    m.id,m.title,m.published_at,r.viewed_at,r.acknowledged_at,d.status,di.status
    from public.family_links l left join public.family_receipts r on r.link_id=l.id
    left join public.family_messages m on m.id=r.message_id and m.status='published'
    left join public.family_deliveries d on d.kind='message' and d.link_id=l.id and d.message_id=m.id
    left join public.family_deliveries di on di.kind='invite' and di.link_id=l.id
    where l.school_id=p_school_id order by l.created_at desc,m.published_at desc;
end;
$$;
revoke all on function public.family_school_overview(uuid) from public, anon;
grant execute on function public.family_school_overview(uuid) to authenticated;

create function public.family_revoke_link(p_school_id uuid,p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão'; end if;
  update public.family_links set status='revoked',invitation_token=null,revoked_at=now()
    where id=p_link_id and school_id=p_school_id and status in ('pending','active');
  if not found then raise exception 'Vínculo não encontrado'; end if;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'link_revoked',p_link_id);
end;
$$;
revoke all on function public.family_revoke_link(uuid,uuid) from public, anon;
grant execute on function public.family_revoke_link(uuid,uuid) to authenticated;

create function public.family_withdraw_message(p_school_id uuid,p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão'; end if;
  update public.family_messages set status='withdrawn',withdrawn_at=now()
    where id=p_message_id and school_id=p_school_id and status='published';
  if not found then raise exception 'Comunicação não encontrada'; end if;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'message_withdrawn',p_message_id);
end;
$$;
revoke all on function public.family_withdraw_message(uuid,uuid) from public, anon;
grant execute on function public.family_withdraw_message(uuid,uuid) to authenticated;

commit;
