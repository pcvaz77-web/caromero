-- CARÔMETRO COMERCIAL
-- Trilha imutável das decisões administrativas globais da plataforma.

begin;

create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (char_length(event_type) between 3 and 80),
  school_id uuid references public.schools(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx
on public.platform_audit_log (created_at desc);

alter table public.platform_audit_log enable row level security;

drop policy if exists "Platform owner reads audit log" on public.platform_audit_log;
create policy "Platform owner reads audit log"
on public.platform_audit_log for select to authenticated
using (public.is_platform_owner());

revoke insert, update, delete on public.platform_audit_log from anon, authenticated;

create or replace function public.record_platform_audit(
  p_event_type text,
  p_school_id uuid default null,
  p_target_user_id uuid default null,
  p_previous_state jsonb default '{}'::jsonb,
  p_new_state jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;
  if nullif(btrim(p_event_type), '') is null or length(p_event_type) > 80 then
    raise exception 'Evento administrativo inválido.';
  end if;
  insert into public.platform_audit_log (
    actor_user_id, event_type, school_id, target_user_id,
    previous_state, new_state
  ) values (
    auth.uid(), p_event_type, p_school_id, p_target_user_id,
    coalesce(p_previous_state, '{}'::jsonb), coalesce(p_new_state, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.record_platform_audit(text, uuid, uuid, jsonb, jsonb)
from public, anon, authenticated;

create or replace function public.platform_list_audit(p_limit integer default 50)
returns table (
  id bigint,
  event_type text,
  school_name text,
  target_email text,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;
  return query
  select l.id, l.event_type, s.name::text,
         coalesce(
           u.email::text,
           l.new_state ->> 'target_email',
           l.previous_state ->> 'target_email'
         ),
         l.previous_state, l.new_state, l.created_at
  from public.platform_audit_log l
  left join public.schools s on s.id = l.school_id
  left join auth.users u on u.id = l.target_user_id
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$function$;

revoke all on function public.platform_list_audit(integer) from public, anon;
grant execute on function public.platform_list_audit(integer) to authenticated;

commit;
