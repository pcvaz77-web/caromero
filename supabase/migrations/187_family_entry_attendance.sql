-- A leitura da carteirinha e uma fonte de entradas registradas, separada da
-- frequencia oficial do SIAP. Resultados enviados aos cards sao fotografias
-- de um periodo; leituras posteriores exigem novo envio.
begin;

alter table public.school_member_permissions
  add column can_publish_family_entry_attendance boolean not null default false;
comment on column public.school_member_permissions.can_publish_family_entry_attendance is
  'Autoriza professor a enviar resultados de entrada da carteirinha aos cards; nao altera a frequencia SIAP.';

create table public.family_entry_attendance_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null,
  class_name text not null,
  student_id uuid not null,
  student_name text not null,
  period_start date not null,
  period_end date not null,
  entry_days integer not null check (entry_days >= 0),
  observed_days integer not null check (observed_days > 0),
  percentage numeric(5,2) not null check (percentage between 0 and 100),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint family_entry_attendance_period_valid check (period_start <= period_end),
  constraint family_entry_attendance_days_valid check (entry_days <= observed_days),
  constraint family_entry_attendance_unique unique (school_id,class_id,student_id,period_start,period_end)
);
create index family_entry_attendance_latest_idx
  on public.family_entry_attendance_results(school_id,student_id,published_at desc);
alter table public.family_entry_attendance_results enable row level security;
revoke all on public.family_entry_attendance_results from public,anon,authenticated;
grant all on public.family_entry_attendance_results to service_role;

create function public.family_entry_attendance_preview(
  p_school_id uuid,p_class_id uuid,p_from date,p_to date
)
returns table(
  student_id uuid,student_name text,entry_days integer,observed_days integer,
  percentage numeric,published_entry_days integer,published_observed_days integer,
  published_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to > (now() at time zone 'America/Sao_Paulo')::date
     or p_to-p_from > 366 then raise exception 'Periodo invalido'; end if;
  if not exists (
    select 1 from public.classes c
    join public.school_members m on m.school_id=c.school_id and m.user_id=auth.uid() and m.status='active'
    where c.id=p_class_id and c.school_id=p_school_id
      and (m.role in ('school_admin','coordinator','teacher')
        or public.has_school_permission(p_school_id,'can_view_class_summary'))
  ) then raise exception 'Sem permissao para consultar a turma' using errcode='42501'; end if;

  return query
  with class_days as (
    select count(distinct (e.arrived_at at time zone 'America/Sao_Paulo')::date)::integer as days
    from public.family_student_entries e
    where e.school_id=p_school_id and e.class_id=p_class_id
      and e.arrived_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and e.arrived_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo')
  ), student_days as (
    select e.student_id,
      count(distinct (e.arrived_at at time zone 'America/Sao_Paulo')::date)::integer as days
    from public.family_student_entries e
    where e.school_id=p_school_id and e.class_id=p_class_id
      and e.arrived_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and e.arrived_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo')
    group by e.student_id
  )
  select s.id,s.full_name,coalesce(sd.days,0),cd.days,
    case when cd.days=0 then null else round(100.0*coalesce(sd.days,0)/cd.days,2) end,
    r.entry_days,r.observed_days,r.published_at
  from public.students s
  cross join class_days cd
  left join student_days sd on sd.student_id=s.id
  left join public.family_entry_attendance_results r on r.school_id=p_school_id
    and r.class_id=p_class_id and r.student_id=s.id
    and r.period_start=p_from and r.period_end=p_to
  where s.school_id=p_school_id and s.class_id=p_class_id and s.enrollment_status='active'
  order by s.full_name,s.id;
end;
$$;
revoke all on function public.family_entry_attendance_preview(uuid,uuid,date,date) from public,anon;
grant execute on function public.family_entry_attendance_preview(uuid,uuid,date,date) to authenticated;

create function public.family_entry_attendance_publish(
  p_school_id uuid,p_class_id uuid,p_from date,p_to date
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_role text; v_class_name text; v_days integer; v_count integer;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to > (now() at time zone 'America/Sao_Paulo')::date
     or p_to-p_from > 366 then raise exception 'Periodo invalido'; end if;
  select m.role into v_role from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active';
  if v_role is null or not (
    v_role in ('school_admin','coordinator')
    or (v_role='teacher' and exists (
      select 1 from public.school_members m
      join public.school_member_permissions p on p.member_id=m.id
      where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
        and p.can_publish_family_entry_attendance
    ))
  ) then raise exception 'Sem permissao para enviar resultados aos cards' using errcode='42501'; end if;
  select c.name into v_class_name from public.classes c
    where c.id=p_class_id and c.school_id=p_school_id and c.archived_at is null;
  if v_class_name is null then raise exception 'Turma ativa nao encontrada'; end if;

  -- Serializa o calculo com inclusoes/exclusoes de leituras.
  lock table public.family_student_entries in share mode;
  perform pg_advisory_xact_lock(hashtext(p_school_id::text || p_class_id::text || p_from::text || p_to::text));
  select count(distinct (e.arrived_at at time zone 'America/Sao_Paulo')::date)::integer into v_days
    from public.family_student_entries e
    where e.school_id=p_school_id and e.class_id=p_class_id
      and e.arrived_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and e.arrived_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo');
  if v_days=0 then raise exception 'Nao ha entradas registradas neste periodo'; end if;

  insert into public.family_entry_attendance_results (
    school_id,class_id,class_name,student_id,student_name,period_start,period_end,
    entry_days,observed_days,percentage,published_by,published_at
  )
  select p_school_id,p_class_id,v_class_name,s.id,s.full_name,p_from,p_to,
    coalesce(sd.days,0),v_days,round(100.0*coalesce(sd.days,0)/v_days,2),auth.uid(),now()
  from public.students s
  left join (
    select e.student_id,
      count(distinct (e.arrived_at at time zone 'America/Sao_Paulo')::date)::integer as days
    from public.family_student_entries e
    where e.school_id=p_school_id and e.class_id=p_class_id
      and e.arrived_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and e.arrived_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo')
    group by e.student_id
  ) sd on sd.student_id=s.id
  where s.school_id=p_school_id and s.class_id=p_class_id and s.enrollment_status='active'
  on conflict (school_id,class_id,student_id,period_start,period_end) do update
    set class_name=excluded.class_name,student_name=excluded.student_name,
      entry_days=excluded.entry_days,observed_days=excluded.observed_days,
      percentage=excluded.percentage,published_by=excluded.published_by,
      published_at=excluded.published_at;
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'Turma sem alunos ativos'; end if;
  return v_count;
end;
$$;
revoke all on function public.family_entry_attendance_publish(uuid,uuid,date,date) from public,anon;
grant execute on function public.family_entry_attendance_publish(uuid,uuid,date,date) to authenticated;

create function public.family_entry_attendance_cards(p_school_id uuid)
returns table(student_id uuid,entry_days integer,observed_days integer,percentage numeric,
  period_start date,period_end date,published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_school_member(p_school_id) then
    raise exception 'Sem permissao para consultar os cards' using errcode='42501'; end if;
  return query
    select distinct on (r.student_id) r.student_id,r.entry_days,r.observed_days,r.percentage,
      r.period_start,r.period_end,r.published_at
    from public.family_entry_attendance_results r
    join public.students s on s.id=r.student_id and s.school_id=r.school_id and s.class_id=r.class_id
      and s.enrollment_status='active'
    where r.school_id=p_school_id
    order by r.student_id,r.published_at desc,r.id desc;
end;
$$;
revoke all on function public.family_entry_attendance_cards(uuid) from public,anon;
grant execute on function public.family_entry_attendance_cards(uuid) to authenticated;

create function public.set_family_entry_attendance_permission(target_member_id uuid,permitted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_school_id uuid;
begin
  select target.school_id into v_school_id
    from public.school_members target
    join public.school_members actor on actor.school_id=target.school_id
      and actor.user_id=auth.uid() and actor.status='active' and actor.role='school_admin'
    where target.id=target_member_id and target.status='active' and target.role='teacher';
  if v_school_id is null then raise exception 'Somente o administrador pode autorizar um professor ativo desta escola' using errcode='42501'; end if;
  insert into public.school_member_permissions(member_id,can_publish_family_entry_attendance)
    values(target_member_id,permitted)
    on conflict(member_id) do update set
      can_publish_family_entry_attendance=excluded.can_publish_family_entry_attendance,
      updated_at=now();
end;
$$;
revoke all on function public.set_family_entry_attendance_permission(uuid,boolean) from public,anon;
grant execute on function public.set_family_entry_attendance_permission(uuid,boolean) to authenticated;

-- A exclusao individual nao pode alterar um resultado ja enviado aos cards.
-- Nao ha trigger de DELETE, para preservar a exclusao definitiva da escola.
create or replace function public.family_delete_entry(p_school_id uuid,p_entry_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_entry public.family_student_entries%rowtype;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissao para excluir entradas' using errcode='42501'; end if;
  lock table public.family_student_entries in row exclusive mode;
  select * into v_entry from public.family_student_entries
    where id=p_entry_id and school_id=p_school_id for update;
  if not found then raise exception 'Entrada nao encontrada nesta escola'; end if;
  if v_entry.family_message_id is not null or v_entry.published_at is not null then
    raise exception 'Entradas publicadas nao podem ser excluidas'; end if;
  if exists (
    select 1 from public.family_entry_attendance_results r
    where r.school_id=v_entry.school_id and r.class_id=v_entry.class_id and r.student_id=v_entry.student_id
      and (v_entry.arrived_at at time zone 'America/Sao_Paulo')::date between r.period_start and r.period_end
  ) then raise exception 'Entrada utilizada em resultado de frequencia publicado'; end if;
  delete from public.family_student_entries
    where id=v_entry.id and school_id=p_school_id
      and family_message_id is null and published_at is null;
  if not found then raise exception 'A entrada foi alterada; atualize a lista e tente novamente'; end if;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'entry_deleted',v_entry.id);
  return true;
end;
$$;
revoke all on function public.family_delete_entry(uuid,uuid) from public,anon;
grant execute on function public.family_delete_entry(uuid,uuid) to authenticated;

commit;
