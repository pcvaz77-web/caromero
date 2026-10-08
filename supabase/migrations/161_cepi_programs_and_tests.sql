-- Meu CEPI: banco de questões, provas, cabeçalho e agrupamentos. Aplicação requer aprovação separada.
-- Não remove nem altera registros existentes.
begin;

create or replace function public.is_cepi_staff(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.cepi_school_enabled(p_school_id) and exists (
    select 1 from public.school_members m
    where m.school_id = p_school_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('school_admin','coordinator','teacher')
  );
$fn$;

create or replace function public.is_cepi_editor(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.cepi_school_enabled(p_school_id) and exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator','teacher')
  );
$fn$;

create or replace function public.is_cepi_coordinator(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.cepi_school_enabled(p_school_id) and exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator')
  );
$fn$;

create or replace function public.cepi_block_plan(p_stage text, p_block smallint)
returns jsonb language sql immutable set search_path = '' as $fn$
  select case
    when p_stage='fundamental_ii' and p_block=1 then '[{"subject":"Língua Portuguesa","count":15}]'::jsonb
    when p_stage='fundamental_ii' and p_block=2 then '[{"subject":"Ciências","count":15}]'::jsonb
    when p_stage='fundamental_ii' and p_block=3 then '[{"subject":"Matemática","count":15}]'::jsonb
    when p_stage='fundamental_ii' and p_block=4 then '[{"subject":"Língua Inglesa","count":5},{"subject":"Arte","count":5},{"subject":"Educação Física","count":5}]'::jsonb
    when p_stage='fundamental_ii' and p_block=5 then '[{"subject":"História","count":15}]'::jsonb
    when p_stage='fundamental_ii' and p_block=6 then '[{"subject":"Geografia","count":15}]'::jsonb
    when p_stage='medio' and p_block=1 then '[{"subject":"Língua Portuguesa","count":20}]'::jsonb
    when p_stage='medio' and p_block=2 then '[{"subject":"Geografia","count":15},{"subject":"História","count":15}]'::jsonb
    when p_stage='medio' and p_block=3 then '[{"subject":"Matemática","count":20}]'::jsonb
    when p_stage='medio' and p_block=4 then '[{"subject":"Língua Inglesa","count":10},{"subject":"Arte","count":10},{"subject":"Educação Física","count":10}]'::jsonb
    when p_stage='medio' and p_block=5 then '[{"subject":"Física","count":15},{"subject":"Química","count":15}]'::jsonb
    when p_stage='medio' and p_block=6 then '[{"subject":"Biologia","count":15},{"subject":"Sociologia","count":8},{"subject":"Filosofia","count":7}]'::jsonb
  end;
$fn$;

create table public.cepi_tests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  kind text not null check (kind in ('bloco','bimestral','simulado')),
  class_ids uuid[] not null,
  block_number smallint check (block_number between 1 and 6),
  subject_plan jsonb not null default '[]'::jsonb,
  academic_year integer not null check (academic_year between 2000 and 2100),
  bimester smallint not null check (bimester between 1 and 4),
  stage text not null check (stage in ('fundamental_ii','medio')),
  scheduled_on date,
  question_count smallint not null check (question_count between 1 and 99),
  answer_format text not null check (answer_format in ('ABCD','ABCDE','VF')),
  subjects text[] not null default '{}'::text[],
  status text not null default 'draft' check (status in ('draft','ready','applied','archived')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,id)
);
create index cepi_tests_school_period_idx on public.cepi_tests(school_id,academic_year,bimester,kind);

create table public.cepi_question_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) between 2 and 100),
  stage text not null check (stage in ('fundamental_ii','medio')),
  statement text not null check (char_length(btrim(statement)) between 3 and 30000),
  alternatives jsonb not null default '{}'::jsonb check (jsonb_typeof(alternatives) = 'object'),
  answer_format text not null check (answer_format in ('ABCD','ABCDE','VF')),
  correct_answer text not null check (correct_answer in ('A','B','C','D','E','V','F')),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,id)
);
create index cepi_question_bank_school_subject_idx on public.cepi_question_bank(school_id,stage,subject,active);

create table public.cepi_test_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  test_id uuid not null,
  number smallint not null check (number between 1 and 99),
  subject text not null check (char_length(btrim(subject)) between 2 and 100),
  statement text not null check (char_length(btrim(statement)) between 3 and 30000),
  alternatives jsonb not null default '{}'::jsonb check (jsonb_typeof(alternatives) = 'object'),
  correct_answer text not null check (correct_answer in ('A','B','C','D','E','V','F')),
  bank_question_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id,test_id) references public.cepi_tests(school_id,id) on delete restrict,
  foreign key (school_id,bank_question_id) references public.cepi_question_bank(school_id,id) on delete restrict,
  unique (test_id,number)
);
create index cepi_test_questions_test_idx on public.cepi_test_questions(school_id,test_id,number);

create table public.cepi_exam_headers (
  school_id uuid primary key references public.schools(id) on delete restrict,
  state_name text not null default '',
  department_name text not null default '',
  school_name text not null default '',
  subtitle text not null default '',
  school_logo_data text,
  state_logo_data text,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (char_length(state_name) <= 160 and char_length(department_name) <= 160 and char_length(school_name) <= 160 and char_length(subtitle) <= 240),
  check (school_logo_data is null or (school_logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and octet_length(school_logo_data) <= 420000)),
  check (state_logo_data is null or (state_logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and octet_length(state_logo_data) <= 420000))
);

create table public.cepi_test_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  test_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  call_number smallint not null check (call_number in (1,2)),
  answers text[] not null,
  source text not null check (source in ('manual','extension')),
  capture_ref uuid unique,
  reviewed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  foreign key (school_id,test_id) references public.cepi_tests(school_id,id) on delete restrict
);
create index cepi_test_results_period_idx on public.cepi_test_results(school_id,test_id,student_id,call_number,reviewed_at desc);

create table public.cepi_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  kind text not null check (kind in ('eletiva','clube','oficina')),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  academic_year integer not null check (academic_year between 2000 and 2100),
  semester smallint check (semester between 1 and 2),
  profile text,
  proposal text,
  practices text,
  culmination text,
  seats smallint check (seats between 1 and 999),
  subjects text[] not null default '{}'::text[],
  leader_student_id uuid references public.students(id) on delete restrict,
  coleader_student_id uuid references public.students(id) on delete restrict,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,id),
  check (leader_student_id is distinct from coleader_student_id)
);
create index cepi_groups_school_idx on public.cepi_groups(school_id,academic_year,kind,active);

create table public.cepi_group_classes (
  school_id uuid not null,
  group_id uuid not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  primary key (group_id,class_id),
  foreign key (school_id,group_id) references public.cepi_groups(school_id,id) on delete restrict
);

create table public.cepi_group_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  group_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (school_id,group_id) references public.cepi_groups(school_id,id) on delete restrict
);
create unique index cepi_group_students_active_idx on public.cepi_group_students(group_id,student_id) where ended_at is null;

create or replace function public.validate_cepi_scope()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cepi_school_enabled(new.school_id) then
    raise exception 'Meu CEPI não está habilitado nesta escola.';
  end if;
  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception 'A escola do registro CEPI não pode mudar.';
    end if;
    if tg_table_name = 'cepi_tests' and (new.created_by is distinct from old.created_by or old.status in ('applied','archived')) then
      raise exception 'Autor e provas aplicadas ou arquivadas não podem ser alterados.';
    end if;
    if tg_table_name = 'cepi_test_questions' and (new.test_id is distinct from old.test_id or new.created_by is distinct from old.created_by) then
      raise exception 'Questão não pode mudar de prova ou autor.';
    end if;
    if tg_table_name = 'cepi_group_students' and (new.group_id is distinct from old.group_id or new.student_id is distinct from old.student_id or new.joined_at is distinct from old.joined_at) then
      raise exception 'A participação histórica não pode ser transferida.';
    end if;
    if tg_table_name = 'cepi_group_students' and old.ended_at is not null and new.ended_at is distinct from old.ended_at then
      raise exception 'Uma participação encerrada não pode ser reaberta ou alterada.';
    end if;
    if tg_table_name = 'cepi_question_bank' and new.created_by is distinct from old.created_by then
      raise exception 'A autoria da questão não pode ser alterada.';
    end if;
  end if;
  if tg_table_name = 'cepi_tests' then
    if cardinality(new.class_ids)=0 or exists(select 1 from unnest(new.class_ids) as x(class_id)
      where not exists(select 1 from public.classes c where c.id=x.class_id and c.school_id=new.school_id))
      or cardinality(new.class_ids)<>(select count(distinct class_id) from unnest(new.class_ids) as x(class_id)) then
      raise exception 'Selecione turmas válidas e sem repetição desta escola.';
    end if;
    if new.kind = 'bloco' then
      if public.cepi_block_plan(new.stage,new.block_number) is null then
        raise exception 'Selecione um bloco válido para esta etapa.';
      end if;
      if tg_op = 'UPDATE' and (new.stage is distinct from old.stage or new.block_number is distinct from old.block_number)
        and exists(select 1 from public.cepi_test_questions q where q.test_id=old.id) then
        raise exception 'Retire as questões antes de trocar a etapa ou o bloco.';
      end if;
      new.subject_plan := public.cepi_block_plan(new.stage,new.block_number);
      new.question_count := (select sum((value->>'count')::integer) from jsonb_array_elements(new.subject_plan) as x(value));
      new.subjects := array(select value->>'subject' from jsonb_array_elements(new.subject_plan) as x(value));
    else
      new.block_number := null;
      new.subject_plan := '[]'::jsonb;
    end if;
    if tg_op = 'INSERT' and new.status <> 'draft' then
      raise exception 'Uma prova nova deve começar em produção.';
    end if;
    if new.status <> 'draft' and (
      select count(*) from public.cepi_test_questions q where q.test_id = new.id
    ) <> new.question_count then
      raise exception 'Complete as questões antes de mudar a situação da prova.';
    end if;
    new.title := btrim(new.title);
    new.updated_at := now();
  elsif tg_table_name = 'cepi_question_bank' then
    if not (new.correct_answer = any(case new.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end)) then
      raise exception 'Gabarito incompatível com as alternativas.';
    end if;
    new.updated_at := now();
  elsif tg_table_name = 'cepi_test_questions' then
    if not exists (select 1 from public.cepi_tests t where t.id=new.test_id and t.school_id=new.school_id
      and t.status = 'draft'
      and new.number <= t.question_count and new.correct_answer = any(
        case t.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
      )) then raise exception 'Questão, prova ou gabarito incompatível.'; end if;
    if exists(select 1 from public.cepi_tests t where t.id=new.test_id and t.kind='bloco'
      and not exists(select 1 from jsonb_array_elements(t.subject_plan) as x(value) where value->>'subject'=new.subject
        and (select count(*) from public.cepi_test_questions q where q.test_id=new.test_id and q.subject=new.subject and q.id<>new.id)<(value->>'count')::integer)) then
      raise exception 'Componente curricular ou quantidade incompatível com este bloco.';
    end if;
    new.updated_at := now();
  elsif tg_table_name = 'cepi_groups' then
    if new.seats is not null and new.seats < (select count(*) from public.cepi_group_students m where m.group_id = new.id and m.ended_at is null) then
      raise exception 'O número de vagas não pode ser menor que o de participantes ativos.';
    end if;
    if new.leader_student_id is not null and not exists(select 1 from public.students s where s.id=new.leader_student_id and s.school_id=new.school_id) then
      raise exception 'Líder de outra escola.';
    end if;
    if new.coleader_student_id is not null and not exists(select 1 from public.students s where s.id=new.coleader_student_id and s.school_id=new.school_id) then
      raise exception 'Co-líder de outra escola.';
    end if;
    new.title := btrim(new.title);
    new.updated_at := now();
  elsif tg_table_name = 'cepi_group_classes' then
    if not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then
      raise exception 'Turma de outra escola.';
    end if;
  elsif tg_table_name = 'cepi_group_students' then
    if tg_op = 'INSERT' then
      perform 1 from public.cepi_groups g where g.id = new.group_id and g.school_id = new.school_id for update;
    end if;
    if not exists(select 1 from public.students s where s.id=new.student_id and s.school_id=new.school_id) then
      raise exception 'Estudante de outra escola.';
    end if;
    if tg_op = 'INSERT' and not exists (
      select 1 from public.cepi_groups g
      where g.id=new.group_id and g.school_id=new.school_id and g.active=true
        and (not exists(select 1 from public.cepi_group_classes gc where gc.group_id=g.id)
          or exists(select 1 from public.cepi_group_classes gc join public.students s on s.class_id=gc.class_id
            where gc.group_id=g.id and s.id=new.student_id))
        and (g.seats is null or (select count(*) from public.cepi_group_students m where m.group_id=g.id and m.ended_at is null) < g.seats)
    ) then raise exception 'Estudante fora do público alvo, grupo inativo ou sem vaga.'; end if;
  elsif tg_table_name = 'cepi_exam_headers' then
    new.updated_by := auth.uid();
    new.updated_at := now();
  elsif tg_table_name = 'cepi_test_results' then
    if not exists(select 1 from public.cepi_tests t where t.id=new.test_id and t.school_id=new.school_id
      and t.status='applied' and array_length(new.answers,1)=t.question_count
      and not exists(select 1 from unnest(new.answers) as x(answer) where answer is null or not (answer='-' or answer=any(
        case t.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
      )))) then raise exception 'Resultado incompatível com a prova aplicada.'; end if;
    if not exists(select 1 from public.students s join public.cepi_tests t on t.id=new.test_id and t.school_id=new.school_id
      where s.id=new.student_id and s.school_id=new.school_id and s.class_id=any(t.class_ids)) then
      raise exception 'Estudante fora das turmas desta prova.';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$fn$;

create trigger cepi_tests_scope before insert or update on public.cepi_tests for each row execute function public.validate_cepi_scope();
create trigger cepi_question_bank_scope before insert or update on public.cepi_question_bank for each row execute function public.validate_cepi_scope();
create trigger cepi_test_questions_scope before insert or update on public.cepi_test_questions for each row execute function public.validate_cepi_scope();
create trigger cepi_exam_headers_scope before insert or update on public.cepi_exam_headers for each row execute function public.validate_cepi_scope();
create trigger cepi_test_results_scope before insert on public.cepi_test_results for each row execute function public.validate_cepi_scope();
create trigger cepi_groups_scope before insert or update on public.cepi_groups for each row execute function public.validate_cepi_scope();
create trigger cepi_group_classes_scope before insert or update on public.cepi_group_classes for each row execute function public.validate_cepi_scope();
create trigger cepi_group_students_scope before insert or update on public.cepi_group_students for each row execute function public.validate_cepi_scope();

alter table public.cepi_tests enable row level security;
alter table public.cepi_question_bank enable row level security;
alter table public.cepi_test_questions enable row level security;
alter table public.cepi_exam_headers enable row level security;
alter table public.cepi_test_results enable row level security;
alter table public.cepi_groups enable row level security;
alter table public.cepi_group_classes enable row level security;
alter table public.cepi_group_students enable row level security;

create policy cepi_tests_read on public.cepi_tests for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_tests_insert on public.cepi_tests for insert to authenticated with check (public.is_cepi_editor(school_id) and created_by=auth.uid());
create policy cepi_tests_update on public.cepi_tests for update to authenticated using (public.is_cepi_editor(school_id) and (public.is_cepi_coordinator(school_id) or created_by=auth.uid())) with check (public.is_cepi_editor(school_id) and (public.is_cepi_coordinator(school_id) or created_by=auth.uid()));
create policy cepi_bank_read on public.cepi_question_bank for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_bank_insert on public.cepi_question_bank for insert to authenticated with check (public.is_cepi_editor(school_id) and created_by=auth.uid());
create policy cepi_bank_update on public.cepi_question_bank for update to authenticated using (public.is_cepi_editor(school_id)) with check (public.is_cepi_editor(school_id));
create policy cepi_questions_read on public.cepi_test_questions for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_questions_insert on public.cepi_test_questions for insert to authenticated with check (public.is_cepi_editor(school_id) and created_by=auth.uid());
create policy cepi_questions_update on public.cepi_test_questions for update to authenticated using (public.is_cepi_editor(school_id)) with check (public.is_cepi_editor(school_id));
create policy cepi_questions_delete on public.cepi_test_questions for delete to authenticated using (public.is_cepi_editor(school_id) and exists(select 1 from public.cepi_tests t where t.id=test_id and t.school_id=school_id and t.status='draft'));
create policy cepi_headers_read on public.cepi_exam_headers for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_headers_insert on public.cepi_exam_headers for insert to authenticated with check (public.is_cepi_coordinator(school_id));
create policy cepi_headers_update on public.cepi_exam_headers for update to authenticated using (public.is_cepi_coordinator(school_id)) with check (public.is_cepi_coordinator(school_id));
create policy cepi_results_read on public.cepi_test_results for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_results_insert on public.cepi_test_results for insert to authenticated with check (public.is_cepi_editor(school_id) and reviewed_by=auth.uid());
create policy cepi_groups_manager on public.cepi_groups for all to authenticated using (public.is_cepi_coordinator(school_id)) with check (public.is_cepi_coordinator(school_id));
create policy cepi_groups_staff_read on public.cepi_groups for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_group_classes_manager on public.cepi_group_classes for all to authenticated using (public.is_cepi_coordinator(school_id)) with check (public.is_cepi_coordinator(school_id));
create policy cepi_group_classes_staff_read on public.cepi_group_classes for select to authenticated using (public.is_cepi_staff(school_id));
create policy cepi_group_students_manager on public.cepi_group_students for all to authenticated using (public.is_cepi_coordinator(school_id)) with check (public.is_cepi_coordinator(school_id));
create policy cepi_group_students_staff_read on public.cepi_group_students for select to authenticated using (public.is_cepi_staff(school_id));
grant select,insert,update on public.cepi_tests,public.cepi_question_bank,public.cepi_test_questions,public.cepi_exam_headers,public.cepi_groups,public.cepi_group_classes,public.cepi_group_students to authenticated;
grant select,insert on public.cepi_test_results to authenticated;
grant delete on public.cepi_test_questions to authenticated;
revoke all on function public.is_cepi_staff(uuid),public.is_cepi_editor(uuid),public.is_cepi_coordinator(uuid),public.cepi_block_plan(text,smallint),public.validate_cepi_scope() from public,anon;
grant execute on function public.is_cepi_staff(uuid),public.is_cepi_editor(uuid),public.is_cepi_coordinator(uuid) to authenticated;
commit;
