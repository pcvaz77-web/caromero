-- Pré-cadastro escolar para o QR geral. Não ativa contas nem publica dados ao aplicar.
begin;

-- Os convites antigos mantêm telefone obrigatório no próprio fluxo; vínculos
-- criados por CPF não têm número e não podem disparar mensagens WhatsApp.
alter table public.family_links alter column phone_e164 drop not null;
create unique index family_links_one_current_cpf_account_student
  on public.family_links(guardian_user_id,school_id,student_id)
  where status='active' and phone_e164 is null and guardian_user_id is not null;

create table public.family_cpf_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_name text not null check (char_length(btrim(guardian_name)) between 2 and 160),
  cpf char(11) not null check (cpf ~ '^[0-9]{11}$'),
  guardian_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (school_id, cpf)
);
create index family_cpf_guardians_cpf_idx on public.family_cpf_guardians(cpf);

create table public.family_cpf_children (
  guardian_id uuid not null references public.family_cpf_guardians(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (guardian_id, student_id)
);
create index family_cpf_children_student_idx on public.family_cpf_children(school_id, student_id, status);

create table public.family_cpf_attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  occurred_at timestamptz not null default now()
);
create index family_cpf_attempts_window_idx on public.family_cpf_attempts(fingerprint, occurred_at desc);
create index family_cpf_attempts_expiry_idx on public.family_cpf_attempts(occurred_at);

alter table public.family_cpf_guardians enable row level security;
alter table public.family_cpf_children enable row level security;
alter table public.family_cpf_attempts enable row level security;
revoke all on public.family_cpf_guardians, public.family_cpf_children, public.family_cpf_attempts from public, anon, authenticated;
grant all on public.family_cpf_guardians, public.family_cpf_children, public.family_cpf_attempts to service_role;
grant usage, select on sequence public.family_cpf_attempts_id_seq to service_role;

create function public.family_cpf_valid(p_cpf text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_sum integer; v_digit integer;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^([0-9])\1{10}$' then return false; end if;
  for v_digit in 10..11 loop
    v_sum := 0;
    for i in 1..(v_digit - 1) loop
      v_sum := v_sum + substring(p_cpf from i for 1)::integer * (v_digit + 1 - i);
    end loop;
    if ((v_sum * 10) % 11) % 10 <> substring(p_cpf from v_digit for 1)::integer then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.family_cpf_valid(text) from public, anon, authenticated;
grant execute on function public.family_cpf_valid(text) to service_role;

create function public.family_cpf_name_key(p_name text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(btrim(coalesce(p_name,''))),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'), '[[:space:]]+', ' ', 'g');
$$;
revoke all on function public.family_cpf_name_key(text) from public, anon, authenticated;
grant execute on function public.family_cpf_name_key(text) to service_role;

create function public.family_cpf_register(p_school_id uuid, p_student_id uuid, p_name text, p_cpf text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_guardian public.family_cpf_guardians%rowtype; v_existing_user uuid; v_existing_count integer;
  v_global_user uuid; v_global_count integer;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not public.family_cpf_valid(p_cpf) or char_length(btrim(coalesce(p_name,''))) not between 2 and 160 then
    raise exception 'Confira o nome completo e o CPF do responsável';
  end if;
  if not exists(select 1 from public.students where id=p_student_id and school_id=p_school_id and enrollment_status='active') then
    raise exception 'Aluno ativo não encontrado nesta escola';
  end if;
  insert into public.family_cpf_guardians(school_id,guardian_name,cpf,created_by)
    values(p_school_id,btrim(p_name),p_cpf,auth.uid())
    on conflict (school_id,cpf) do update set removed_at=null;
  select * into v_guardian from public.family_cpf_guardians
    where school_id=p_school_id and cpf=p_cpf for update;
  if public.family_cpf_name_key(v_guardian.guardian_name) <> public.family_cpf_name_key(p_name) then
    raise exception 'Este CPF já tem outro nome nesta escola. Confira o cadastro.';
  end if;
  select count(distinct l.guardian_user_id),min(l.guardian_user_id::text)::uuid into v_existing_count,v_existing_user
    from public.family_links l where l.school_id=p_school_id and l.student_id=p_student_id
      and l.status='active' and l.guardian_user_id is not null
      and public.family_cpf_name_key(l.guardian_name)=public.family_cpf_name_key(p_name);
  if v_existing_count>1 or (v_existing_user is not null
    and v_guardian.guardian_user_id is not null and v_guardian.guardian_user_id<>v_existing_user) then
    raise exception 'Há acessos diferentes para este nome e aluno. Confira na escola.';
  end if;
  if v_existing_user is not null and v_guardian.guardian_user_id is null then
    update public.family_cpf_guardians set guardian_user_id=v_existing_user where id=v_guardian.id;
    v_guardian.guardian_user_id := v_existing_user;
  end if;
  select count(distinct g.guardian_user_id),min(g.guardian_user_id::text)::uuid
    into v_global_count,v_global_user from public.family_cpf_guardians g
    where g.cpf=p_cpf and g.guardian_user_id is not null;
  if v_global_count>1 or (v_global_user is not null and v_guardian.guardian_user_id is not null
    and v_global_user<>v_guardian.guardian_user_id) then
    raise exception 'Este CPF já está associado a outra conta. Confira na escola.';
  end if;
  if v_global_user is not null and exists(
    select 1 from public.family_cpf_guardians g
    where g.cpf=p_cpf and g.guardian_user_id=v_global_user
      and public.family_cpf_name_key(g.guardian_name)<>public.family_cpf_name_key(p_name)
  ) then
    raise exception 'Este CPF já tem outro nome em uma escola. Confira o cadastro.';
  end if;
  if v_global_user is not null and v_guardian.guardian_user_id is null then
    update public.family_cpf_guardians set guardian_user_id=v_global_user where id=v_guardian.id;
  end if;
  insert into public.family_cpf_children(guardian_id,school_id,student_id)
    values(v_guardian.id,p_school_id,p_student_id)
    on conflict (guardian_id,student_id) do update set status='active',revoked_at=null;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'cpf_guardian_registered',v_guardian.id);
  return v_guardian.id;
end;
$$;
revoke all on function public.family_cpf_register(uuid,uuid,text,text) from public,anon;
grant execute on function public.family_cpf_register(uuid,uuid,text,text) to authenticated;

create function public.family_cpf_register_bundle(p_school_id uuid,p_student_ids uuid[],p_name text,p_cpf text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_guardian_id uuid;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if p_student_ids is null or cardinality(p_student_ids) not between 1 and 10
    or array_position(p_student_ids,null) is not null
    or (select count(distinct u.id) from unnest(p_student_ids) as u(id))<>cardinality(p_student_ids) then
    raise exception 'Selecione de 1 a 10 alunos sem repetição';
  end if;
  for v_id in select unnest(p_student_ids) loop
    v_guardian_id := public.family_cpf_register(p_school_id,v_id,p_name,p_cpf);
  end loop;
  return v_guardian_id;
end;
$$;
revoke all on function public.family_cpf_register_bundle(uuid,uuid[],text,text) from public,anon;
grant execute on function public.family_cpf_register_bundle(uuid,uuid[],text,text) to authenticated;

create function public.family_cpf_school_roster(p_school_id uuid,p_class_id uuid)
returns table(guardian_id uuid,guardian_name text,cpf_last4 text,student_id uuid,student_name text,account_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  return query select g.id,g.guardian_name,right(g.cpf,4),s.id,s.full_name,g.guardian_user_id is not null
    from public.family_cpf_guardians g
    join public.family_cpf_children c on c.guardian_id=g.id and c.school_id=g.school_id and c.status='active'
    join public.students s on s.id=c.student_id and s.school_id=p_school_id and s.enrollment_status='active'
    where g.school_id=p_school_id and g.removed_at is null and s.class_id=p_class_id
    order by s.full_name,g.guardian_name;
end;
$$;
revoke all on function public.family_cpf_school_roster(uuid,uuid) from public,anon;
grant execute on function public.family_cpf_school_roster(uuid,uuid) to authenticated;

create function public.family_cpf_find_guardian(p_school_id uuid,p_cpf text)
returns table(guardian_id uuid,guardian_name text,cpf_last4 text,student_id uuid,
  student_name text,account_active boolean,link_status text,enrollment_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not public.family_cpf_valid(p_cpf) then raise exception 'CPF inválido'; end if;
  return query select g.id,g.guardian_name,right(g.cpf,4),s.id,s.full_name,
    g.guardian_user_id is not null,c.status,s.enrollment_status
    from public.family_cpf_guardians g
    join public.family_cpf_children c on c.guardian_id=g.id and c.school_id=g.school_id
    join public.students s on s.id=c.student_id and s.school_id=c.school_id
    where g.school_id=p_school_id and g.cpf=p_cpf and g.removed_at is null
    order by s.full_name;
end;
$$;
revoke all on function public.family_cpf_find_guardian(uuid,text) from public,anon;
grant execute on function public.family_cpf_find_guardian(uuid,text) to authenticated;

create function public.family_cpf_remove_child(p_school_id uuid,p_guardian_id uuid,p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_guardian public.family_cpf_guardians%rowtype;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  select * into v_guardian from public.family_cpf_guardians where id=p_guardian_id and school_id=p_school_id for update;
  if not found then raise exception 'Responsável não encontrado'; end if;
  update public.family_cpf_children set status='revoked',revoked_at=now()
    where guardian_id=p_guardian_id and school_id=p_school_id and student_id=p_student_id and status='active';
  if not found then raise exception 'Vínculo não encontrado'; end if;
  update public.family_links set status='revoked',invitation_token=null,revoked_at=now()
    where school_id=p_school_id and student_id=p_student_id and guardian_user_id=v_guardian.guardian_user_id and status='active';
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'cpf_guardian_child_removed',p_student_id);
end;
$$;
revoke all on function public.family_cpf_remove_child(uuid,uuid,uuid) from public,anon;
grant execute on function public.family_cpf_remove_child(uuid,uuid,uuid) to authenticated;

create function public.family_cpf_remove_guardian(p_school_id uuid,p_guardian_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_guardian public.family_cpf_guardians%rowtype; v_count integer;
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  select * into v_guardian from public.family_cpf_guardians where id=p_guardian_id and school_id=p_school_id for update;
  if not found then raise exception 'Responsável não encontrado nesta escola'; end if;
  select count(*) into v_count from public.family_cpf_children
    where guardian_id=p_guardian_id and school_id=p_school_id and status='active';
  update public.family_links l set status='revoked',invitation_token=null,revoked_at=now()
    where l.school_id=p_school_id and l.guardian_user_id=v_guardian.guardian_user_id and l.status='active'
      and exists(select 1 from public.family_cpf_children c
        where c.guardian_id=p_guardian_id and c.school_id=p_school_id and c.student_id=l.student_id);
  update public.family_cpf_children set status='revoked',revoked_at=now()
    where guardian_id=p_guardian_id and school_id=p_school_id and status='active';
  update public.family_cpf_guardians set removed_at=now()
    where id=p_guardian_id and school_id=p_school_id;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'cpf_guardian_removed',p_guardian_id);
  return v_count;
end;
$$;
revoke all on function public.family_cpf_remove_guardian(uuid,uuid) from public,anon;
grant execute on function public.family_cpf_remove_guardian(uuid,uuid) to authenticated;

-- A Edge Function chama esta função somente depois de validar nome, CPF e sessão Auth.
create function public.family_cpf_claim(p_guardian_id uuid,p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_guardian public.family_cpf_guardians%rowtype; v_student public.students%rowtype; v_link_id uuid; v_count integer := 0;
begin
  select * into v_guardian from public.family_cpf_guardians where id=p_guardian_id for update;
  if found then perform pg_advisory_xact_lock(hashtext(v_guardian.cpf)); end if;
  if not found or v_guardian.removed_at is not null
    or (v_guardian.guardian_user_id is not null and v_guardian.guardian_user_id<>p_user_id)
    or not exists(select 1 from public.schools where id=v_guardian.school_id and status='active')
    or not exists(select 1 from auth.users u where u.id=p_user_id
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'family_portal','false')='true') then
    raise exception 'Cadastro indisponível';
  end if;
  if exists(select 1 from public.family_cpf_guardians g
    where g.cpf=v_guardian.cpf and g.guardian_user_id is not null and g.guardian_user_id<>p_user_id) then
    raise exception 'CPF já associado a outra conta';
  end if;
  if not exists(select 1 from public.family_cpf_children c
    join public.students s on s.id=c.student_id and s.school_id=c.school_id
    where c.guardian_id=p_guardian_id and c.status='active' and s.enrollment_status='active') then
    raise exception 'Nenhum aluno ativo vinculado';
  end if;
  update public.family_cpf_guardians set guardian_user_id=p_user_id where id=p_guardian_id;
  for v_student in select s.* from public.family_cpf_children c
    join public.students s on s.id=c.student_id and s.school_id=c.school_id
    where c.guardian_id=p_guardian_id and c.status='active' and s.enrollment_status='active'
  loop
    if exists(select 1 from public.family_links l where l.school_id=v_guardian.school_id
      and l.student_id=v_student.id and l.status='active' and l.guardian_user_id=p_user_id) then
      continue;
    end if;
    insert into public.family_links(school_id,student_id,student_name,guardian_name,phone_e164,
      guardian_user_id,status,invitation_token,accepted_at,invitation_expires_at)
      values(v_guardian.school_id,v_student.id,v_student.full_name,v_guardian.guardian_name,null,
        p_user_id,'active',null,now(),now())
      returning id into v_link_id;
    insert into public.family_receipts(message_id,link_id)
      select m.id,v_link_id from public.family_messages m
      where m.school_id=v_guardian.school_id and m.student_id=v_student.id and m.status='published'
      on conflict do nothing;
    insert into public.family_audit(school_id,actor_id,action,subject_id)
      values(v_guardian.school_id,p_user_id,'cpf_guardian_activated',v_link_id);
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.family_cpf_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.family_cpf_claim(uuid,uuid) to service_role;

create function public.family_cpf_limit(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.family_cpf_attempts where id in (
    select id from public.family_cpf_attempts
    where occurred_at<now()-interval '1 day' order by occurred_at limit 1000
  );
  perform pg_advisory_xact_lock(hashtext(p_fingerprint));
  select count(*) into v_count from public.family_cpf_attempts
    where fingerprint=p_fingerprint and occurred_at>now()-interval '15 minutes';
  if v_count>=8 then return false; end if;
  insert into public.family_cpf_attempts(fingerprint) values(p_fingerprint);
  return true;
end;
$$;
revoke all on function public.family_cpf_limit(text) from public,anon,authenticated;
grant execute on function public.family_cpf_limit(text) to service_role;

-- Mantém a checagem antiga por celular para convites individuais e usa o
-- pré-cadastro da escola para contas novas sem celular.
create function public.family_link_account_allowed(p_link_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists(
    select 1 from public.family_links l
    join public.schools sc on sc.id=l.school_id and sc.status='active'
    join public.students st on st.id=l.student_id and st.school_id=l.school_id
      and st.enrollment_status='active'
    join auth.users u on u.id=p_user_id and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    where l.id=p_link_id and l.guardian_user_id=p_user_id and l.status='active'
      and (
        (l.phone_e164 is not null and u.email=
          'familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
        or (l.phone_e164 is null and exists(
          select 1 from public.family_cpf_guardians g
          join public.family_cpf_children c on c.guardian_id=g.id
            and c.school_id=g.school_id and c.status='active'
          where g.school_id=l.school_id and g.guardian_user_id=p_user_id and g.removed_at is null
            and c.student_id=l.student_id))
      )
  );
$$;
revoke all on function public.family_link_account_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.family_link_account_allowed(uuid,uuid) to service_role;

create or replace function public.family_my_students()
returns table(link_id uuid,school_id uuid,school_name text,student_id uuid,student_name text,class_name text)
language sql stable security definer set search_path = '' as $$
  select l.id,l.school_id,sc.name,st.id,st.full_name,coalesce(c.name,st.class_name)
  from public.family_links l
  join public.schools sc on sc.id=l.school_id
  join public.students st on st.id=l.student_id and st.school_id=l.school_id
  left join public.classes c on c.id=st.class_id and c.school_id=st.school_id
  where public.family_link_account_allowed(l.id,auth.uid())
  order by sc.name,st.full_name;
$$;
revoke all on function public.family_my_students() from public,anon;
grant execute on function public.family_my_students() to authenticated;

create or replace function public.family_feed(p_link_id uuid)
returns table(message_id uuid,title text,body text,category text,published_at timestamptz,viewed_at timestamptz,acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,m.title,m.body,m.category,m.published_at,r.viewed_at,r.acknowledged_at
  from public.family_links l
  join public.family_receipts r on r.link_id=l.id
  join public.family_messages m on m.id=r.message_id and m.school_id=l.school_id
    and m.student_id=l.student_id
  where l.id=p_link_id and m.status='published'
    and public.family_link_account_allowed(l.id,auth.uid())
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
    where l.id=p_link_id and public.family_link_account_allowed(l.id,auth.uid())
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

create or replace function public.can_receive_family_notification(target_user_id uuid,target_school_id uuid,target_message_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select target_user_id is not null and target_school_id is not null and target_message_id is not null
    and exists(select 1 from public.family_receipts r
      join public.family_messages m on m.id=r.message_id
      join public.family_links l on l.id=r.link_id and l.school_id=m.school_id and l.student_id=m.student_id
      where m.id=target_message_id and m.school_id=target_school_id and m.status='published'
        and public.family_link_account_allowed(l.id,target_user_id));
$$;
revoke all on function public.can_receive_family_notification(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_receive_family_notification(uuid,uuid,uuid) to service_role;

create or replace function public.claim_push_subscription(p_endpoint text,p_p256dh text,p_auth_key text,p_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_platform_owner()
     and not exists(select 1 from public.school_members sm
       where sm.user_id=auth.uid() and public.can_use_school(sm.school_id))
     and not exists(select 1 from public.family_my_students()) then
    raise exception 'Conta sem acesso ativo a uma escola.';
  end if;
  if nullif(btrim(p_endpoint),'') is null or nullif(btrim(p_p256dh),'') is null
     or nullif(btrim(p_auth_key),'') is null then raise exception 'Assinatura Push incompleta.'; end if;
  if length(p_endpoint)>4096 or length(p_p256dh)>512 or length(p_auth_key)>512
     or length(coalesce(p_user_agent,''))>1024 then raise exception 'Assinatura Push inválida.'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,user_agent,enabled,last_seen_at)
  values(auth.uid(),p_endpoint,p_p256dh,p_auth_key,p_user_agent,true,now())
  on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,
    auth_key=excluded.auth_key,user_agent=excluded.user_agent,enabled=true,last_seen_at=now();
end;
$$;
revoke all on function public.claim_push_subscription(text,text,text,text) from public,anon;
grant execute on function public.claim_push_subscription(text,text,text,text) to authenticated;

create or replace function public.family_remove_school_guardian(p_school_id uuid,p_link_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_user uuid; v_count integer;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão para excluir responsáveis desta escola' using errcode='42501';
  end if;
  select l.phone_e164,l.guardian_user_id into v_phone,v_user
    from public.family_links l
    where l.id=p_link_id and l.school_id=p_school_id and l.removed_at is null for update;
  if not found then raise exception 'Responsável não encontrado nesta escola'; end if;
  with removed as (
    update public.family_links l
      set status='revoked',invitation_token=null,revoked_at=coalesce(l.revoked_at,now()),removed_at=now()
      where l.school_id=p_school_id and l.removed_at is null
        and ((v_user is not null and l.guardian_user_id=v_user)
          or (v_user is null and v_phone is not null and l.phone_e164=v_phone))
      returning l.id
  )
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    select p_school_id,auth.uid(),'guardian_removed_from_school',id from removed;
  get diagnostics v_count=row_count;
  if v_user is not null then
    update public.family_cpf_children c set status='revoked',revoked_at=now()
      from public.family_cpf_guardians g
      where c.guardian_id=g.id and g.school_id=p_school_id and g.guardian_user_id=v_user
        and c.status='active';
    update public.family_cpf_guardians set removed_at=now()
      where school_id=p_school_id and guardian_user_id=v_user;
  end if;
  return v_count;
end;
$$;
revoke all on function public.family_remove_school_guardian(uuid,uuid) from public,anon;
grant execute on function public.family_remove_school_guardian(uuid,uuid) to authenticated;

-- Cortar acesso quando a matrícula deixa de estar ativa, preservando recibos e auditoria.
create function public.family_revoke_inactive_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.enrollment_status='active' and new.enrollment_status<>'active' then
    update public.family_links set status='revoked',invitation_token=null,revoked_at=now()
      where school_id=new.school_id and student_id=new.id and status in ('active','pending');
    update public.family_cpf_children set status='revoked',revoked_at=now()
      where school_id=new.school_id and student_id=new.id and status='active';
  end if;
  return new;
end;
$$;
revoke all on function public.family_revoke_inactive_student() from public,anon,authenticated;
create trigger family_student_inactive_revoke after update of enrollment_status on public.students
  for each row execute function public.family_revoke_inactive_student();

-- Uma revogação pelo fluxo individual também precisa impedir reativação pelo CPF.
create function public.family_cpf_follow_link_revocation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='active' and new.status='revoked' and old.student_id is not null and old.guardian_user_id is not null then
    update public.family_cpf_children c set status='revoked',revoked_at=now()
      from public.family_cpf_guardians g
      where c.guardian_id=g.id and c.school_id=old.school_id and c.student_id=old.student_id
        and c.status='active' and g.guardian_user_id=old.guardian_user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.family_cpf_follow_link_revocation() from public,anon,authenticated;
create trigger family_cpf_link_revoked after update of status on public.family_links
  for each row execute function public.family_cpf_follow_link_revocation();

commit;
