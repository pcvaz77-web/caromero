-- CARÔMETRO: base das melhorias de fluxo 1 a 12.
-- Execute uma vez no Supabase SQL Editor antes de publicar workflow-improvements.js.

create extension if not exists pgcrypto;

alter table public.user_permissions
  add column if not exists can_view_dashboard boolean not null default false,
  add column if not exists can_view_history boolean not null default false,
  add column if not exists can_manage_alerts boolean not null default false,
  add column if not exists can_record_followups boolean not null default false,
  add column if not exists can_export_reports boolean not null default false,
  add column if not exists can_use_bulk_actions boolean not null default false,
  add column if not exists can_view_audit boolean not null default false,
  add column if not exists can_view_class_summary boolean not null default false;

create table if not exists public.student_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  details text,
  priority text not null default 'normal' check (priority in ('normal','alta','urgente')),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);

create table if not exists public.student_followups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null default 'acompanhamento',
  notes text not null check (char_length(trim(notes)) between 3 and 2000),
  status text not null default 'pendente' check (status in ('pendente','concluido')),
  next_action_at date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.student_activity (
  id bigint generated always as identity primary key,
  student_id uuid references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  action text not null,
  summary text not null,
  actor_id uuid default auth.uid() references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_favorite_classes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id,class_id)
);

create table if not exists public.user_notification_shifts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shift text not null check (shift in ('Matutino','Vespertino','Noturno')),
  created_at timestamptz not null default now(),
  primary key (user_id,shift)
);

create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  title text not null,
  body text not null,
  target_type text,
  target_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists student_alerts_student_idx on public.student_alerts(student_id,active);
create index if not exists student_followups_student_idx on public.student_followups(student_id,status);
create index if not exists student_activity_student_idx on public.student_activity(student_id,created_at desc);
create index if not exists student_activity_class_idx on public.student_activity(class_id,created_at desc);
create index if not exists user_notifications_recipient_idx on public.user_notifications(recipient_id,created_at desc);

alter table public.student_alerts enable row level security;
alter table public.student_followups enable row level security;
alter table public.student_activity enable row level security;
alter table public.user_favorite_classes enable row level security;
alter table public.user_notification_shifts enable row level security;
alter table public.user_notifications enable row level security;

create or replace function public.has_workflow_permission(permission_name text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.user_permissions p where p.user_id=auth.uid() and (
      p.role='admin' or coalesce(p.can_edit_all,false) or
      case permission_name
        when 'dashboard' then coalesce(p.can_view_dashboard,false)
        when 'history' then coalesce(p.can_view_history,false)
        when 'alerts' then coalesce(p.can_manage_alerts,false)
        when 'followups' then coalesce(p.can_record_followups,false)
        when 'reports' then coalesce(p.can_export_reports,false)
        when 'bulk' then coalesce(p.can_use_bulk_actions,false)
        when 'audit' then coalesce(p.can_view_audit,false)
        when 'summary' then coalesce(p.can_view_class_summary,false)
        else false end
    )
  );
$$;

drop policy if exists "Workflow alerts view" on public.student_alerts;
drop policy if exists "Workflow alerts manage" on public.student_alerts;
create policy "Workflow alerts view" on public.student_alerts for select to authenticated
  using (public.has_workflow_permission('dashboard') or public.has_workflow_permission('history') or public.has_workflow_permission('alerts'));
create policy "Workflow alerts manage" on public.student_alerts for all to authenticated
  using (public.has_workflow_permission('alerts')) with check (public.has_workflow_permission('alerts') and created_by=auth.uid());

drop policy if exists "Workflow followups view" on public.student_followups;
drop policy if exists "Workflow followups create" on public.student_followups;
drop policy if exists "Workflow followups update" on public.student_followups;
create policy "Workflow followups view" on public.student_followups for select to authenticated
  using (public.has_workflow_permission('dashboard') or public.has_workflow_permission('history') or public.has_workflow_permission('followups'));
create policy "Workflow followups create" on public.student_followups for insert to authenticated
  with check (public.has_workflow_permission('followups') and created_by=auth.uid());
create policy "Workflow followups update" on public.student_followups for update to authenticated
  using (public.has_workflow_permission('followups')) with check (public.has_workflow_permission('followups'));

drop policy if exists "Workflow activity view" on public.student_activity;
create policy "Workflow activity view" on public.student_activity for select to authenticated
  using (public.has_workflow_permission('history') or public.has_workflow_permission('audit'));

drop policy if exists "Own favorite classes" on public.user_favorite_classes;
create policy "Own favorite classes" on public.user_favorite_classes for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Own notification shifts" on public.user_notification_shifts;
create policy "Own notification shifts" on public.user_notification_shifts for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Own notifications" on public.user_notifications;
create policy "Own notifications" on public.user_notifications for select to authenticated using (recipient_id=auth.uid());
create policy "Update own notifications" on public.user_notifications for update to authenticated
  using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

create or replace function public.log_student_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid; cid uuid; label text;
begin
  sid := coalesce(new.id,old.id); cid := coalesce(new.class_id,old.class_id);
  label := case when tg_op='INSERT' then 'Aluno cadastrado' when tg_op='DELETE' then 'Aluno excluído' else 'Dados do aluno atualizados' end;
  insert into public.student_activity(student_id,class_id,action,summary,actor_id,metadata)
  values (case when tg_op='DELETE' then null else sid end,cid,lower(tg_op),label,auth.uid(),jsonb_build_object('student_id',sid));
  return coalesce(new,old);
end; $$;

drop trigger if exists student_activity_log on public.students;
create trigger student_activity_log after insert or update or delete on public.students
for each row execute function public.log_student_change();

create or replace function public.log_workflow_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid; cid uuid; student_name text; label text;
begin
  sid := coalesce(new.student_id,old.student_id);
  select s.class_id,s.full_name into cid,student_name from public.students s where s.id=sid;
  label := case when tg_table_name='student_alerts' then 'Alerta do aluno atualizado' else 'Acompanhamento do aluno atualizado' end;
  insert into public.student_activity(student_id,class_id,action,summary,actor_id,metadata)
  values (sid,cid,tg_table_name,label,auth.uid(),jsonb_build_object('operation',tg_op));
  return coalesce(new,old);
end; $$;

drop trigger if exists alert_activity_log on public.student_alerts;
create trigger alert_activity_log after insert or update or delete on public.student_alerts
for each row execute function public.log_workflow_change();
drop trigger if exists followup_activity_log on public.student_followups;
create trigger followup_activity_log after insert or update or delete on public.student_followups
for each row execute function public.log_workflow_change();

create or replace function public.notify_class_subscribers()
returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid; student_name text; notification_title text;
begin
  select s.class_id,s.full_name into cid,student_name from public.students s where s.id=new.student_id;
  notification_title := case when tg_table_name='student_alerts' then 'Novo alerta' else 'Novo acompanhamento' end;
  insert into public.user_notifications(recipient_id,class_id,title,body,target_type,target_id)
  select distinct recipient,cid,notification_title,student_name,tg_table_name,new.id::text from (
    select f.user_id recipient from public.user_favorite_classes f where f.class_id=cid and f.notifications_enabled
    union
    select ns.user_id from public.user_notification_shifts ns join public.classes c on c.id=cid and c.shift=ns.shift
  ) subscribers where recipient is distinct from auth.uid();
  return new;
end; $$;

drop trigger if exists alert_notify_subscribers on public.student_alerts;
create trigger alert_notify_subscribers after insert on public.student_alerts
for each row execute function public.notify_class_subscribers();
drop trigger if exists followup_notify_subscribers on public.student_followups;
create trigger followup_notify_subscribers after insert on public.student_followups
for each row execute function public.notify_class_subscribers();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='student_alerts') then
    alter publication supabase_realtime add table public.student_alerts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='student_followups') then
    alter publication supabase_realtime add table public.student_followups;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end $$;
