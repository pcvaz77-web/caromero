-- Editor rico, provas mensais, cabeçalho compartilhado e finalização de provas da turma.
-- Revisar SQL e obter autorização específica antes de aplicar em produção.
begin;

alter table public.class_exams drop constraint class_exams_exam_type_check;
alter table public.class_exams add constraint class_exams_exam_type_check
  check (exam_type in ('mensal','bimestral','enem'));
alter table public.class_exams add column finalized_at timestamptz;

create or replace function public.can_manage_class_exam_header(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator')
  );
$fn$;

create table public.class_exam_headers (
  school_id uuid primary key references public.schools(id) on delete restrict,
  state_name text not null default '' check (char_length(state_name)<=100),
  department_name text not null default '' check (char_length(department_name)<=160),
  school_name text not null check (char_length(btrim(school_name)) between 2 and 160),
  subtitle text not null default '' check (char_length(subtitle)<=240),
  instructions text not null default '' check (char_length(instructions)<=1000),
  state_logo_data text check (state_logo_data is null or
    (char_length(state_logo_data)<=400100 and state_logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  school_logo_data text check (school_logo_data is null or
    (char_length(school_logo_data)<=400100 and school_logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create or replace function public.validate_class_exam_header()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op='UPDATE' and new.school_id is distinct from old.school_id then
    raise exception 'O cabeçalho não pode ser transferido para outra escola.';
  end if;
  if new.updated_by is distinct from auth.uid() then
    raise exception 'O cabeçalho deve identificar o usuário que o alterou.';
  end if;
  new.updated_at:=now();
  return new;
end;
$fn$;
create trigger class_exam_header_guard before insert or update on public.class_exam_headers
  for each row execute function public.validate_class_exam_header();
alter table public.class_exam_headers enable row level security;
create policy class_exam_header_read on public.class_exam_headers for select to authenticated
  using (public.can_create_class_exam(school_id));
create policy class_exam_header_insert on public.class_exam_headers for insert to authenticated
  with check (public.can_manage_class_exam_header(school_id) and updated_by=auth.uid());
create policy class_exam_header_update on public.class_exam_headers for update to authenticated
  using (public.can_manage_class_exam_header(school_id))
  with check (public.can_manage_class_exam_header(school_id) and updated_by=auth.uid());
revoke all on public.class_exam_headers from public,anon;
grant select,insert,update on public.class_exam_headers to authenticated;
revoke all on function public.can_manage_class_exam_header(uuid) from public,anon;
grant execute on function public.can_manage_class_exam_header(uuid) to authenticated;

create or replace function public.validate_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare q jsonb; v_plan jsonb; v_entry jsonb; v_target_count integer; v_position integer:=0; v_subject text; v_last integer;
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id
    or new.class_id is distinct from old.class_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola, turma e autoria da prova não podem ser transferidas.';
  end if;
  if tg_op='UPDATE' and old.finalized_at is not null then
    raise exception 'A prova finalizada não pode ser alterada.';
  end if;
  if tg_op='UPDATE' and new.finalized_at is not null and old.finalized_at is null and
    (new.exam_type is distinct from old.exam_type or new.enem_model is distinct from old.enem_model or
     new.subject is distinct from old.subject or new.title is distinct from old.title or
     new.academic_year is distinct from old.academic_year or new.bimester is distinct from old.bimester or
     new.answer_format is distinct from old.answer_format or new.questions is distinct from old.questions) then
    raise exception 'Salve as alterações antes de finalizar a prova.';
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
    raise exception 'Prova mensal ou bimestral não usa caderno ENEM.';
  end if;
  if jsonb_typeof(new.questions) <> 'array' or
    (new.exam_type='enem' and jsonb_array_length(new.questions)>v_target_count) then
    raise exception 'Quantidade de questões inválida para esta prova.';
  end if;
  if new.finalized_at is not null and
    (jsonb_array_length(new.questions)=0 or
     (new.exam_type='enem' and jsonb_array_length(new.questions)<>v_target_count)) then
    raise exception 'Complete as questões antes de finalizar a prova.';
  end if;
  for q in select value from jsonb_array_elements(new.questions) loop
    v_position:=v_position+1;
    if jsonb_typeof(q)<>'object' or char_length(btrim(coalesce(q->>'statement',''))) not between 3 and 30000 then
      raise exception 'Cada questão precisa de um enunciado válido.';
    end if;
    if new.exam_type='enem' then
      v_last:=0;v_subject:=null;
      for v_entry in select value from jsonb_array_elements(v_plan) loop
        v_last:=v_last+(v_entry->>'count')::integer;
        if v_position<=v_last then v_subject:=v_entry->>'subject';exit;end if;
      end loop;
      if q->>'subject' is distinct from v_subject then
        raise exception 'A disciplina da questão % não corresponde ao caderno ENEM.',v_position;
      end if;
    end if;
    if new.answer_format='LIVRE' then
      if coalesce(q->>'correct_answer','')<>'' then raise exception 'Questão discursiva não tem gabarito de alternativa.';end if;
    elsif coalesce(q->>'correct_answer','')<>'' and coalesce(q->>'correct_answer','')<>all(
      case new.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
    ) then raise exception 'Gabarito incompatível com as alternativas.';
    end if;
    if new.finalized_at is not null and new.answer_format<>'LIVRE' and coalesce(q->>'correct_answer','')='' then
      raise exception 'Escolha o gabarito de todas as questões antes de finalizar.';
    end if;
    if new.exam_type='enem' and (coalesce(q->>'correct_answer','')='' or
      (left(q->>'statement',19)<>'<!--cepi-rich-v1-->' and
       (jsonb_typeof(q->'alternatives') is distinct from 'object' or exists (
          select 1 from unnest(array['A','B','C','D','E']) a
          where char_length(btrim(coalesce(q->'alternatives'->>a,'')))<1
       )))) then raise exception 'Complete as alternativas e o gabarito da questão ENEM %.',v_position;end if;
  end loop;
  new.subject:=btrim(new.subject);new.title:=btrim(new.title);new.updated_at:=now();
  return new;
end;
$fn$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('class-exam-images','class-exam-images',false,2000000,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy class_exam_images_read on storage.objects for select to authenticated
  using (bucket_id='class-exam-images' and public.can_create_class_exam(((storage.foldername(name))[1])::uuid));
create policy class_exam_images_insert on storage.objects for insert to authenticated
  with check (bucket_id='class-exam-images'
    and name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(png|jpg|webp)$'
    and (storage.foldername(name))[2]=auth.uid()::text
    and public.can_create_class_exam(((storage.foldername(name))[1])::uuid));
create policy class_exam_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id='class-exam-images' and (storage.foldername(name))[2]=auth.uid()::text
    and public.can_create_class_exam(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.class_exams exam
      where exam.school_id::text=(storage.foldername(name))[1]
        and exam.questions::text like ('%'||storage.objects.name||'%')
    ));

commit;
