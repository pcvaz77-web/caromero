-- Resultados dos simulados do ENEM criados pelo professor no Painel da Turma.
-- Aplicar somente após auditoria e autorização específica de produção.
begin;

create table public.class_exam_results (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete restrict,
  exam_id uuid not null references public.class_exams(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  call_number smallint not null check (call_number in (1,2)),
  answers text[] not null,
  correct_count smallint not null,
  capture_ref uuid not null unique,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);
create index class_exam_results_exam_idx on public.class_exam_results(school_id,exam_id,student_id,reviewed_at desc);

create or replace function public.validate_class_exam_result()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_exam public.class_exams%rowtype; v_student public.students%rowtype; v_total integer; v_correct integer:=0; v_index integer;
begin
  select * into v_exam from public.class_exams where id=new.exam_id and school_id=new.school_id;
  if not found or v_exam.exam_type<>'enem' or v_exam.finalized_at is null or new.reviewed_by is distinct from auth.uid() then
    raise exception 'A correção exige simulado finalizado e identificação do professor.';
  end if;
  select * into v_student from public.students where id=new.student_id and school_id=new.school_id and class_id=v_exam.class_id;
  if not found or v_student.enrollment_status<>'active' then
    raise exception 'O aluno não está ativo na turma desta prova.';
  end if;
  v_total:=jsonb_array_length(v_exam.questions);
  if cardinality(new.answers)<>v_total or exists(select 1 from unnest(new.answers) as response(value) where response.value is null or response.value not in ('A','B','C','D','E','-')) then
    raise exception 'As respostas não correspondem ao cartão desta prova.';
  end if;
  for v_index in 1..v_total loop
    if new.answers[v_index]=v_exam.questions->(v_index-1)->>'correct_answer' then v_correct:=v_correct+1; end if;
  end loop;
  new.correct_count:=v_correct;
  new.reviewed_at:=now();
  return new;
end;
$fn$;
create trigger class_exam_result_guard before insert on public.class_exam_results
  for each row execute function public.validate_class_exam_result();

alter table public.class_exam_results enable row level security;
create policy class_exam_result_read on public.class_exam_results for select to authenticated
  using (exists (
    select 1 from public.class_exams e
    where e.id=class_exam_results.exam_id and e.school_id=class_exam_results.school_id
      and public.can_view_class_exam(e.school_id,e.created_by)
  ));
create policy class_exam_result_insert on public.class_exam_results for insert to authenticated
  with check (reviewed_by=auth.uid() and exists (
    select 1 from public.class_exams e
    where e.id=class_exam_results.exam_id and e.school_id=class_exam_results.school_id and e.created_by=auth.uid()
      and public.can_create_class_exam(e.school_id)
  ));
revoke all on public.class_exam_results from public,anon;
grant select,insert on public.class_exam_results to authenticated;

commit;
