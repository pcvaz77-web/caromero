-- Provas particulares do professor, vinculadas a uma turma do Carômetro.
-- Não altera nem transfere provas do Meu CEPI. Aplicação exige revisão e autorização próprias.
begin;

create table public.class_exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  exam_type text not null check (exam_type in ('bimestral','enem')),
  enem_model text check (enem_model in ('caderno_1','caderno_2','simuladao')),
  subject text not null check (char_length(btrim(subject)) between 2 and 100),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  academic_year integer not null check (academic_year between 2000 and 2100),
  bimester smallint not null check (bimester between 1 and 4),
  scheduled_on date,
  answer_format text not null check (answer_format in ('ABCD','ABCDE','VF','LIVRE')),
  header_school_name text not null default '' check (char_length(header_school_name) <= 160),
  header_subtitle text not null default '' check (char_length(header_subtitle) <= 240),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index class_exams_owner_idx on public.class_exams(school_id,class_id,created_by,academic_year desc,bimester desc);

create or replace function public.class_enem_plan(p_model text)
returns jsonb language sql immutable security definer set search_path = '' as $fn$
  select case p_model
    when 'caderno_1' then '[{"subject":"Química","count":8},{"subject":"Física","count":7},{"subject":"Biologia","count":8},{"subject":"História","count":6},{"subject":"Geografia","count":6},{"subject":"Filosofia","count":5},{"subject":"Sociologia","count":5}]'::jsonb
    when 'caderno_2' then '[{"subject":"Inglês","count":10},{"subject":"Língua Portuguesa","count":5},{"subject":"Arte","count":4},{"subject":"Educação Física","count":4},{"subject":"Matemática","count":22}]'::jsonb
    when 'simuladao' then '[{"subject":"Língua Portuguesa","count":15},{"subject":"Matemática","count":15},{"subject":"Arte","count":3},{"subject":"Educação Física","count":2},{"subject":"Sociologia","count":4},{"subject":"Filosofia","count":4},{"subject":"Inglês","count":2},{"subject":"Espanhol","count":1},{"subject":"Biologia","count":8},{"subject":"Física","count":8},{"subject":"Química","count":8},{"subject":"História","count":10},{"subject":"Geografia","count":10}]'::jsonb
    else null end;
$fn$;

create or replace function public.can_create_class_exam(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator','teacher')
  );
$fn$;

create or replace function public.can_view_class_exam(p_school_id uuid,p_author_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator','teacher')
      and (m.user_id=p_author_id or m.role in ('school_admin','coordinator'))
  );
$fn$;

create or replace function public.validate_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare q jsonb; v_plan jsonb; v_entry jsonb; v_target_count integer; v_position integer:=0; v_subject text; v_last integer;
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id
    or new.class_id is distinct from old.class_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola, turma e autoria da prova não podem ser transferidas.';
  end if;
  if not exists (
    select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id
      and (tg_op='UPDATE' or c.archived_at is null)
  ) then raise exception 'Selecione uma turma ativa desta escola.'; end if;
  if new.exam_type='enem' then
    v_plan:=public.class_enem_plan(new.enem_model);
    if v_plan is null or new.answer_format<>'ABCDE' or new.subject<>'Simulado do ENEM' then
      raise exception 'Escolha um caderno ENEM válido.';
    end if;
    if new.title is distinct from (case new.enem_model
      when 'caderno_1' then format('SIMULA - ENEM - CADERNO 1 - %sº BIM',new.bimester)
      when 'caderno_2' then format('SIMULA - ENEM - CADERNO 2 - %sº BIM',new.bimester)
      else format('SIMULADÃO ENEM %s',new.academic_year) end) then
      raise exception 'O título não corresponde ao caderno ENEM.';
    end if;
    select sum((value->>'count')::integer) into v_target_count from jsonb_array_elements(v_plan);
  elsif new.enem_model is not null then
    raise exception 'Prova bimestral não usa caderno ENEM.';
  else v_target_count:=99;
  end if;
  if jsonb_typeof(new.questions) <> 'array' or jsonb_array_length(new.questions) > v_target_count then
    raise exception 'Informe até 99 questões.';
  end if;
  for q in select value from jsonb_array_elements(new.questions) loop
    v_position:=v_position+1;
    if jsonb_typeof(q) <> 'object' or char_length(btrim(coalesce(q->>'statement',''))) not between 3 and 30000 then
      raise exception 'Cada questão precisa de um enunciado válido.';
    end if;
    if new.exam_type='enem' then
      v_last:=0; v_subject:=null;
      for v_entry in select value from jsonb_array_elements(v_plan) loop
        v_last:=v_last+(v_entry->>'count')::integer;
        if v_position<=v_last then v_subject:=v_entry->>'subject'; exit; end if;
      end loop;
      if q->>'subject' is distinct from v_subject then
        raise exception 'A disciplina da questão % não corresponde ao caderno ENEM.',v_position;
      end if;
    end if;
    if new.answer_format='LIVRE' then
      if coalesce(q->>'correct_answer','') <> '' then raise exception 'Questão discursiva não tem gabarito de alternativa.'; end if;
    elsif coalesce(q->>'correct_answer','') <> '' and coalesce(q->>'correct_answer','') <> all(
      case new.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
    ) then raise exception 'Gabarito incompatível com as alternativas.';
    end if;
    if new.exam_type='enem' and (coalesce(q->>'correct_answer','') = '' or
      jsonb_typeof(q->'alternatives') is distinct from 'object' or exists (
        select 1 from unnest(array['A','B','C','D','E']) a
        where char_length(btrim(coalesce(q->'alternatives'->>a,''))) < 1
      )) then raise exception 'Complete as cinco alternativas e o gabarito da questão ENEM %.',v_position; end if;
  end loop;
  new.subject:=btrim(new.subject);
  new.title:=btrim(new.title);
  new.updated_at:=now();
  return new;
end;
$fn$;
create trigger class_exam_scope before insert or update on public.class_exams
  for each row execute function public.validate_class_exam();

alter table public.class_exams enable row level security;
create policy class_exam_read on public.class_exams for select to authenticated
  using (public.can_view_class_exam(school_id,created_by));
create policy class_exam_insert on public.class_exams for insert to authenticated
  with check (public.can_create_class_exam(school_id) and created_by=auth.uid());
create policy class_exam_update on public.class_exams for update to authenticated
  using (public.can_create_class_exam(school_id) and created_by=auth.uid())
  with check (public.can_create_class_exam(school_id) and created_by=auth.uid());

revoke all on public.class_exams from public,anon;
grant select,insert,update on public.class_exams to authenticated;
revoke all on function public.class_enem_plan(text) from public,anon;
revoke all on function public.can_create_class_exam(uuid) from public,anon;
revoke all on function public.can_view_class_exam(uuid,uuid) from public,anon;
grant execute on function public.can_create_class_exam(uuid) to authenticated;
grant execute on function public.can_view_class_exam(uuid,uuid) to authenticated;
commit;
