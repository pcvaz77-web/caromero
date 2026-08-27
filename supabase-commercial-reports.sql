-- CARÔMETRO COMERCIAL — relatórios restritos à escola ativa.
-- Preparar e revisar antes de aplicar. Este arquivo não é executado automaticamente.
begin;

-- Remove as assinaturas legadas, quando existirem, sem exigir que o script
-- antigo tenha sido aplicado previamente. Revogar não basta: funções
-- SECURITY DEFINER obsoletas não devem permanecer como superfície latente.
do $legacy$
begin
  if to_regprocedure('public.report_students(text,uuid,uuid)') is not null then
    execute 'drop function public.report_students(text,uuid,uuid)';
  end if;
  if to_regprocedure('public.report_occurrences(uuid[],date,date)') is not null then
    execute 'drop function public.report_occurrences(uuid[],date,date)';
  end if;
  if to_regprocedure('public.log_report_generation(text,uuid,text,jsonb,date,date,integer)') is not null then
    execute 'drop function public.log_report_generation(text,uuid,text,jsonb,date,date,integer)';
  end if;
  if to_regprocedure('public.log_report_generation(text,uuid,text,jsonb,date,date,integer,uuid)') is not null then
    execute 'drop function public.log_report_generation(text,uuid,text,jsonb,date,date,integer,uuid)';
  end if;
end;
$legacy$;

create or replace function public.is_school_report_manager(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    target_school_id is not null
    and public.is_active_school_member(target_school_id)
    and exists (
    select 1
    from public.school_members sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and sm.role in ('school_admin', 'coordinator')
    );
$function$;

revoke all on function public.is_school_report_manager(uuid) from public, anon, authenticated;

create or replace function public.report_students(
  p_school_id uuid,
  p_shift text default null,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns table (
  student_id uuid,
  full_name text,
  class_id uuid,
  class_name text,
  shift text,
  has_report text,
  photo_path text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  return query
  select s.id, s.full_name, s.class_id,
         coalesce(c.name, s.class_name, ''),
         coalesce(c.shift, 'Matutino'), s.has_report, s.photo_path
  from public.students s
  left join public.classes c
    on c.id = s.class_id
   and c.school_id = s.school_id
  where s.school_id = p_school_id
    and (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name, s.id;
end;
$function$;

revoke all on function public.report_students(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.report_students(uuid, text, uuid, uuid) to authenticated;

create or replace function public.report_occurrences(
  p_school_id uuid,
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table (
  student_id uuid,
  occurred_on date,
  created_by_name text,
  occurrence_text text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;
  if p_student_ids is null or array_length(p_student_ids, 1) is null then return; end if;

  return query
  select o.student_id, o.occurred_on, o.created_by_name, o.occurrence_text::text
  from public.student_occurrences o
  join public.students s
    on s.id = o.student_id
   and s.school_id = o.school_id
  where o.school_id = p_school_id
    and o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on, o.id;
end;
$function$;

revoke all on function public.report_occurrences(uuid, uuid[], date, date) from public, anon;
grant execute on function public.report_occurrences(uuid, uuid[], date, date) to authenticated;

create table if not exists public.report_generation_log (
  id uuid primary key default gen_random_uuid(),
  generated_by uuid references auth.users(id) on delete set null,
  generated_by_name text not null default 'Não informado',
  generated_at timestamptz not null default now(),
  scope_type text not null check (scope_type in ('student', 'class', 'shift')),
  scope_id uuid,
  scope_label text not null default '',
  contents jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  student_count integer not null default 0
);

alter table public.report_generation_log enable row level security;

alter table public.report_generation_log
  add column if not exists school_id uuid null;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.report_generation_log'::regclass
      and conname = 'report_generation_log_school_fkey'
  ) then
    alter table public.report_generation_log
      add constraint report_generation_log_school_fkey
      foreign key (school_id) references public.schools(id) on delete set null;
  end if;
end;
$block$;

create index if not exists report_generation_log_school_generated_idx
  on public.report_generation_log (school_id, generated_at desc);

drop policy if exists "Report generators read own or admin reads all" on public.report_generation_log;
drop policy if exists "Report generators read school audit" on public.report_generation_log;
create policy "Report generators read school audit"
on public.report_generation_log
for select
to authenticated
using (
  generated_by = auth.uid()
  or (school_id is not null and public.is_school_admin(school_id))
  or public.is_platform_owner()
);

create or replace function public.log_report_generation(
  p_school_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_scope_label text,
  p_contents jsonb,
  p_period_start date,
  p_period_end date,
  p_student_count integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_name text;
  v_new_id uuid;
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;
  if p_scope_type not in ('student', 'class', 'shift') then
    raise exception 'Escopo de relatório inválido.';
  end if;
  if p_scope_type = 'student' and not exists (
    select 1 from public.students s where s.id = p_scope_id and s.school_id = p_school_id
  ) then raise exception 'Aluno fora da escola ativa.';
  end if;
  if p_scope_type = 'class' and not exists (
    select 1 from public.classes c where c.id = p_scope_id and c.school_id = p_school_id
  ) then raise exception 'Turma fora da escola ativa.';
  end if;
  if p_scope_type = 'shift' and p_scope_id is not null then
    raise exception 'Escopo de turno não aceita identificador.';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Não informado')
    into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.report_generation_log (
    school_id, generated_by, generated_by_name, scope_type, scope_id,
    scope_label, contents, period_start, period_end, student_count
  ) values (
    p_school_id, auth.uid(), coalesce(v_actor_name, 'Não informado'),
    p_scope_type, p_scope_id, left(coalesce(p_scope_label, ''), 200),
    coalesce(p_contents, '{}'::jsonb), p_period_start, p_period_end,
    greatest(coalesce(p_student_count, 0), 0)
  ) returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.log_report_generation(uuid, text, uuid, text, jsonb, date, date, integer) from public, anon;
grant execute on function public.log_report_generation(uuid, text, uuid, text, jsonb, date, date, integer) to authenticated;

commit;
