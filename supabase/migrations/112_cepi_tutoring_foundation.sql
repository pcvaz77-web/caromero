-- CARÔMETRO COMERCIAL
-- CEPI / Tutoria: habilitação individual por escola, tutores internos ou
-- externos, distribuição de tutorandos e fundação dinâmica da ficha.
--
-- Esta migration apenas define a estrutura. Sua execução no Supabase exige
-- autorização separada. Todos os dados operacionais permanecem isolados por
-- school_id e o histórico é preservado por inativação, nunca por cascata.

begin;

create table public.school_cepi_settings (
  school_id uuid primary key references public.schools(id) on delete restrict,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create table public.cepi_tutors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  member_id uuid null references public.school_members(id) on delete set null,
  tutor_type text not null check (tutor_type in ('internal', 'external')),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 160),
  email text null check (email is null or char_length(email) <= 320),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Um tutor interno pode ficar sem member_id no futuro caso seu vínculo com
  -- a escola seja removido. O nome histórico permanece, mas o acesso cessa.
  check (tutor_type = 'internal' or (tutor_type = 'external' and member_id is null))
);

create unique index cepi_tutors_active_member_idx
on public.cepi_tutors (school_id, member_id)
where active = true and member_id is not null;

create index cepi_tutors_school_active_idx
on public.cepi_tutors (school_id, active, display_name);

create table public.cepi_tutor_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  tutor_id uuid not null references public.cepi_tutors(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid null references auth.users(id) on delete set null,
  ended_at timestamptz null,
  ended_by uuid null references auth.users(id) on delete set null,
  check ((active and ended_at is null) or (not active))
);

create unique index cepi_tutor_students_one_active_tutor_idx
on public.cepi_tutor_students (school_id, student_id)
where active = true;

create index cepi_tutor_students_tutor_idx
on public.cepi_tutor_students (school_id, tutor_id, active);

-- A ficha não recebe perguntas fictícias. form_schema guardará a fotografia
-- das perguntas vigentes e answers, as respostas, quando o conteúdo for
-- definido. Assim, mudanças futuras não alteram fichas históricas.
create table public.cepi_tutoring_forms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  assignment_id uuid not null references public.cepi_tutor_students(id) on delete restrict,
  tutor_id uuid not null references public.cepi_tutors(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  reference_date date not null default current_date,
  form_schema jsonb not null default '[]'::jsonb check (jsonb_typeof(form_schema) = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index cepi_tutoring_forms_student_idx
on public.cepi_tutoring_forms (school_id, student_id, reference_date desc);

create or replace function public.cepi_school_enabled(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.school_cepi_settings s
    where s.school_id = p_school_id and s.enabled = true
  );
$function$;

create or replace function public.is_cepi_manager(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.school_members sm
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and sm.role in ('school_admin', 'coordinator')
  );
$function$;

create or replace function public.validate_cepi_tutor_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.cepi_school_enabled(new.school_id) then
    raise exception 'A área CEPI não está habilitada para esta escola.';
  end if;
  if new.tutor_type = 'internal' and new.member_id is null and tg_op = 'INSERT' then
    raise exception 'Selecione um usuário ativo para o tutor interno.';
  end if;
  if new.tutor_type = 'internal' and new.member_id is not null and not exists (
    select 1 from public.school_members sm
    where sm.id = new.member_id and sm.school_id = new.school_id and sm.status = 'active'
  ) then
    raise exception 'O tutor interno não possui vínculo ativo com esta escola.';
  end if;
  new.display_name := btrim(new.display_name);
  new.email := nullif(btrim(new.email), '');
  new.updated_at := now();
  return new;
end;
$function$;

create trigger validate_cepi_tutor_scope
before insert or update on public.cepi_tutors
for each row execute function public.validate_cepi_tutor_scope();

create or replace function public.validate_cepi_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.cepi_school_enabled(new.school_id) then
    raise exception 'A área CEPI não está habilitada para esta escola.';
  end if;
  if not exists (
    select 1 from public.cepi_tutors t
    where t.id = new.tutor_id and t.school_id = new.school_id and t.active = true
  ) then
    raise exception 'Tutor inválido ou inativo para esta escola.';
  end if;
  if not exists (
    select 1 from public.students s
    where s.id = new.student_id and s.school_id = new.school_id
      and (tg_op = 'UPDATE' or s.enrollment_status = 'active')
  ) then
    raise exception 'Tutorando inválido, inativo ou pertencente a outra escola.';
  end if;
  if new.active then
    new.ended_at := null;
    new.ended_by := null;
  elsif tg_op = 'INSERT' then
    new.ended_at := coalesce(new.ended_at, now());
    new.ended_by := coalesce(new.ended_by, auth.uid());
  elsif old.active is distinct from false then
    new.ended_at := coalesce(new.ended_at, now());
    new.ended_by := coalesce(new.ended_by, auth.uid());
  end if;
  return new;
end;
$function$;

create trigger validate_cepi_assignment_scope
before insert or update on public.cepi_tutor_students
for each row execute function public.validate_cepi_assignment_scope();

create or replace function public.validate_cepi_form_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.cepi_tutor_students a
    where a.id = new.assignment_id and a.school_id = new.school_id
      and a.tutor_id = new.tutor_id and a.student_id = new.student_id
  ) then
    raise exception 'A ficha não corresponde ao vínculo de tutoria informado.';
  end if;
  new.updated_at := now();
  if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now());
  else new.completed_at := null;
  end if;
  return new;
end;
$function$;

create trigger validate_cepi_form_scope
before insert or update on public.cepi_tutoring_forms
for each row execute function public.validate_cepi_form_scope();

alter table public.school_cepi_settings enable row level security;
alter table public.cepi_tutors enable row level security;
alter table public.cepi_tutor_students enable row level security;
alter table public.cepi_tutoring_forms enable row level security;

create policy cepi_members_view_setting on public.school_cepi_settings
for select to authenticated using (public.is_active_school_member(school_id));

create policy cepi_members_view_tutors on public.cepi_tutors
for select to authenticated using (
  public.cepi_school_enabled(school_id) and (
    public.is_cepi_manager(school_id) or exists (
      select 1 from public.school_members sm
      where sm.id = member_id and sm.user_id = auth.uid() and sm.status = 'active'
    )
  )
);
create policy cepi_managers_insert_tutors on public.cepi_tutors
for insert to authenticated with check (public.is_cepi_manager(school_id));
create policy cepi_managers_update_tutors on public.cepi_tutors
for update to authenticated using (public.is_cepi_manager(school_id))
with check (public.is_cepi_manager(school_id));

create policy cepi_members_view_assignments on public.cepi_tutor_students
for select to authenticated using (
  public.cepi_school_enabled(school_id) and (
    public.is_cepi_manager(school_id) or exists (
      select 1 from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
      where t.id = tutor_id and sm.user_id = auth.uid() and sm.status = 'active'
    )
  )
);
create policy cepi_managers_insert_assignments on public.cepi_tutor_students
for insert to authenticated with check (public.is_cepi_manager(school_id));
create policy cepi_managers_update_assignments on public.cepi_tutor_students
for update to authenticated using (public.is_cepi_manager(school_id))
with check (public.is_cepi_manager(school_id));

create policy cepi_members_view_forms on public.cepi_tutoring_forms
for select to authenticated using (
  public.cepi_school_enabled(school_id) and (
    public.is_cepi_manager(school_id) or exists (
      select 1 from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
      where t.id = tutor_id and sm.user_id = auth.uid() and sm.status = 'active'
    )
  )
);
create policy cepi_tutors_insert_forms on public.cepi_tutoring_forms
for insert to authenticated with check (
  public.is_cepi_manager(school_id) or exists (
    select 1 from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
    where t.id = tutor_id and sm.user_id = auth.uid() and sm.status = 'active'
  )
);
create policy cepi_tutors_update_forms on public.cepi_tutoring_forms
for update to authenticated using (
  public.is_cepi_manager(school_id) or exists (
    select 1 from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
    where t.id = tutor_id and sm.user_id = auth.uid() and sm.status = 'active'
  )
) with check (
  public.is_cepi_manager(school_id) or exists (
    select 1 from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
    where t.id = tutor_id and sm.user_id = auth.uid() and sm.status = 'active'
  )
);

grant select on public.school_cepi_settings to authenticated;
grant select, insert, update on public.cepi_tutors to authenticated;
grant select, insert, update on public.cepi_tutor_students to authenticated;
grant select, insert, update on public.cepi_tutoring_forms to authenticated;

create or replace function public.get_cepi_access_context(p_school_id uuid)
returns table(enabled boolean, can_manage boolean, tutor_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_active_school_member(p_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;
  return query select
    public.cepi_school_enabled(p_school_id),
    public.is_cepi_manager(p_school_id),
    (select t.id from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
      where t.school_id = p_school_id and t.active = true and sm.user_id = auth.uid()
      order by t.created_at limit 1);
end;
$function$;

create or replace function public.can_access_cepi_student(p_school_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.cepi_school_enabled(p_school_id)
    and exists (select 1 from public.students s where s.id = p_student_id and s.school_id = p_school_id)
    and (
      public.is_cepi_manager(p_school_id)
      or exists (
        select 1
        from public.cepi_tutor_students a
        join public.cepi_tutors t on t.id = a.tutor_id and t.school_id = a.school_id
        join public.school_members sm on sm.id = t.member_id and sm.school_id = t.school_id
        where a.school_id = p_school_id and a.student_id = p_student_id and a.active = true
          and t.active = true and sm.status = 'active' and sm.user_id = auth.uid()
      )
    );
$function$;

-- Painel consolidado da Tutoria. O retorno não concede escrita nas fontes
-- originais e só inclui alunos efetivamente atribuídos ao tutor autenticado
-- (ou todos, para administrador/coordenador da escola).
create or replace function public.get_cepi_tutored_student_activity(p_school_id uuid, p_student_ids uuid[])
returns table(student_id uuid, occurrences jsonb, attendance jsonb, livro_revisa jsonb, counselors jsonb)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'date', o.occurred_on, 'text', o.occurrence_text,
      'responsible', o.created_by_name
    ) order by o.occurred_on desc, o.created_at desc)
      from public.student_occurrences o where o.school_id = p_school_id and o.student_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'academic_year', a.academic_year, 'term', a.term, 'subject', a.subject,
      'percentage', a.percentage, 'status', a.status, 'updated_at', a.updated_at
    ) order by a.updated_at desc)
      from public.siap_attendance_current a where a.school_id = p_school_id and a.student_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'school_year', l.school_year, 'bimester', l.bimester,
      'status', l.status, 'delivered_at', l.delivered_at
    ) order by l.school_year desc, l.bimester desc)
      from public.livro_revisa_deliveries l where l.school_id = p_school_id and l.student_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', cc.counselor_user_id,
      'name', coalesce(nullif(btrim(p.full_name), ''), p.email)
    ) order by coalesce(nullif(btrim(p.full_name), ''), p.email))
      from public.class_counselors cc join public.profiles p on p.id = cc.counselor_user_id
      where cc.school_id = p_school_id and cc.class_id = s.class_id), '[]'::jsonb)
  from public.students s
  where s.school_id = p_school_id and s.id = any(coalesce(p_student_ids, '{}'::uuid[]))
    and public.can_access_cepi_student(p_school_id, s.id);
$function$;

create or replace function public.list_cepi_tutor_candidates(p_school_id uuid)
returns table(member_id uuid, user_id uuid, full_name text, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_cepi_manager(p_school_id) or not public.cepi_school_enabled(p_school_id) then
    raise exception 'Sem permissão para gerenciar tutores desta escola.';
  end if;
  return query
  select sm.id, sm.user_id, coalesce(nullif(btrim(p.full_name), ''), p.email)::text, p.email::text, sm.role::text
  from public.school_members sm join public.profiles p on p.id = sm.user_id
  where sm.school_id = p_school_id and sm.status = 'active'
  order by coalesce(nullif(btrim(p.full_name), ''), p.email);
end;
$function$;

create or replace function public.platform_list_cepi_settings()
returns table(school_id uuid, school_name text, school_status text, cepi_enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then raise exception 'Acesso restrito ao proprietário da plataforma.'; end if;
  return query
  select s.id, s.name::text, s.status::text, coalesce(cs.enabled, false)
  from public.schools s left join public.school_cepi_settings cs on cs.school_id = s.id
  order by s.name;
end;
$function$;

create or replace function public.platform_set_cepi_enabled(p_school_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_previous boolean := false;
begin
  if not public.is_platform_owner() then raise exception 'Acesso restrito ao proprietário da plataforma.'; end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then raise exception 'Escola não encontrada.'; end if;
  select coalesce((select s.enabled from public.school_cepi_settings s where s.school_id = p_school_id), false)
  into v_previous;
  insert into public.school_cepi_settings (school_id, enabled, updated_by)
  values (p_school_id, coalesce(p_enabled, false), auth.uid())
  on conflict (school_id) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
  if v_previous is distinct from coalesce(p_enabled, false) then
    perform public.record_platform_audit(
      case when p_enabled then 'cepi_enabled' else 'cepi_disabled' end,
      p_school_id,
      null,
      jsonb_build_object('enabled', v_previous),
      jsonb_build_object('enabled', coalesce(p_enabled, false))
    );
  end if;
end;
$function$;

create or replace function public.notify_cepi_tutor_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_user_id uuid; v_student_name text;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active = true then return new; end if;
  select sm.user_id into v_user_id
  from public.cepi_tutors t join public.school_members sm on sm.id = t.member_id
  where t.id = new.tutor_id and t.school_id = new.school_id and sm.status = 'active';
  if v_user_id is null then return new; end if;
  select s.full_name into v_student_name from public.students s
  where s.id = new.student_id and s.school_id = new.school_id;
  insert into public.user_notifications (recipient_id, class_id, school_id, title, body, target_type, target_id)
  values (v_user_id, null, new.school_id, 'Novo tutorando',
    'Você foi definido como tutor(a) de ' || coalesce(v_student_name, 'um aluno') || '.',
    'cepi_tutoring', new.id::text);
  return new;
end;
$function$;

create trigger notify_cepi_tutor_assignment
after insert or update of active on public.cepi_tutor_students
for each row execute function public.notify_cepi_tutor_assignment();

revoke all on function public.cepi_school_enabled(uuid) from public, anon;
revoke all on function public.is_cepi_manager(uuid) from public, anon;
revoke all on function public.get_cepi_access_context(uuid) from public, anon;
revoke all on function public.can_access_cepi_student(uuid, uuid) from public, anon;
revoke all on function public.get_cepi_tutored_student_activity(uuid, uuid[]) from public, anon;
revoke all on function public.list_cepi_tutor_candidates(uuid) from public, anon;
revoke all on function public.platform_list_cepi_settings() from public, anon;
revoke all on function public.platform_set_cepi_enabled(uuid, boolean) from public, anon;
grant execute on function public.cepi_school_enabled(uuid) to authenticated;
grant execute on function public.is_cepi_manager(uuid) to authenticated;
grant execute on function public.get_cepi_access_context(uuid) to authenticated;
grant execute on function public.can_access_cepi_student(uuid, uuid) to authenticated;
grant execute on function public.get_cepi_tutored_student_activity(uuid, uuid[]) to authenticated;
grant execute on function public.list_cepi_tutor_candidates(uuid) to authenticated;
grant execute on function public.platform_list_cepi_settings() to authenticated;
grant execute on function public.platform_set_cepi_enabled(uuid, boolean) to authenticated;

commit;
