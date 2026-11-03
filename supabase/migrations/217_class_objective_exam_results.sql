-- Permite corrigir cartões das provas mensais e bimestrais objetivas da turma.
begin;

create or replace function public.validate_class_exam_result()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_exam public.class_exams%rowtype;
  v_student public.students%rowtype;
  v_total integer;
  v_correct integer := 0;
  v_index integer;
  v_alphabet text;
begin
  select * into v_exam from public.class_exams where id=new.exam_id and school_id=new.school_id;
  if not found or v_exam.finalized_at is null or v_exam.deleted_at is not null
    or new.reviewed_by is distinct from auth.uid() then
    raise exception 'A correção exige prova finalizada e identificação do professor.';
  end if;
  if v_exam.exam_type not in ('enem','mensal','bimestral')
    or v_exam.answer_format not in ('ABCD','ABCDE','VF') then
    raise exception 'A leitura por cartão exige prova objetiva.';
  end if;
  v_alphabet := v_exam.answer_format;
  select * into v_student from public.students where id=new.student_id and school_id=new.school_id;
  if not found or v_student.enrollment_status<>'active' or not exists (
    select 1 from public.classes c where c.id=v_student.class_id and c.school_id=new.school_id
      and c.archived_at is null and (
        c.id=v_exam.class_id or (
          v_exam.exam_type='enem' and not public.cepi_school_enabled(v_exam.school_id)
          and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)'
        )
      )
  ) then raise exception 'O aluno não está ativo em uma turma vinculada a esta prova.'; end if;
  v_total := jsonb_array_length(v_exam.questions);
  if v_total=0 or cardinality(new.answers)<>v_total
    or exists(select 1 from unnest(new.answers) as response(value)
      where response.value is null or char_length(response.value)<>1
        or (response.value<>'-' and position(response.value in v_alphabet)=0)) then
    raise exception 'As respostas não correspondem ao cartão desta prova.';
  end if;
  for v_index in 1..v_total loop
    if v_exam.questions->(v_index-1)->>'correct_answer' is null
      or char_length(v_exam.questions->(v_index-1)->>'correct_answer')<>1
      or position(v_exam.questions->(v_index-1)->>'correct_answer' in v_alphabet)=0 then
      raise exception 'O gabarito da questão % não é objetivo.',v_index;
    end if;
    if new.answers[v_index]=v_exam.questions->(v_index-1)->>'correct_answer' then
      v_correct := v_correct+1;
    end if;
  end loop;
  new.correct_count := v_correct;
  new.reviewed_at := now();
  return new;
end;
$fn$;

commit;
