-- Reaproveitamento e importação de provas do Meu CEPI.
-- Aplicar somente após autorização específica para esta migration.
begin;

create or replace function public.duplicate_cepi_test_as_draft(
  p_school_id uuid,
  p_test_id uuid,
  p_title text,
  p_class_ids uuid[],
  p_academic_year integer,
  p_bimester integer,
  p_scheduled_on date
)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $fn$
declare
  v_source public.cepi_tests%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null or not public.is_cepi_editor(p_school_id) then
    raise exception 'Sem permissão para reutilizar provas desta escola.';
  end if;
  select * into v_source from public.cepi_tests
    where school_id=p_school_id and id=p_test_id;
  if not found then raise exception 'Prova de origem não encontrada nesta escola.'; end if;
  if p_class_ids is null or cardinality(p_class_ids)=0 or
     cardinality(p_class_ids)<>(select count(distinct id) from unnest(p_class_ids) as x(id)) or
     exists(select 1 from unnest(p_class_ids) as x(id)
       where not exists(select 1 from public.classes c
         where c.id=x.id and c.school_id=p_school_id and c.archived_at is null)) then
    raise exception 'Escolha turmas ativas e sem repetição desta escola.';
  end if;

  insert into public.cepi_tests (
    school_id,title,kind,class_ids,block_number,subject_plan,academic_year,
    bimester,stage,scheduled_on,question_count,answer_format,subjects,status,notes,created_by
  ) values (
    p_school_id,p_title,v_source.kind,p_class_ids,v_source.block_number,
    v_source.subject_plan,p_academic_year,p_bimester,v_source.stage,
    p_scheduled_on,v_source.question_count,v_source.answer_format,
    v_source.subjects,'draft',v_source.notes,auth.uid()
  ) returning id into v_new_id;

  insert into public.cepi_test_questions (
    school_id,test_id,number,subject,statement,alternatives,
    correct_answer,bank_question_id,created_by
  )
  select p_school_id,v_new_id,q.number,q.subject,q.statement,q.alternatives,
    q.correct_answer,q.bank_question_id,auth.uid()
  from public.cepi_test_questions q
  where q.school_id=p_school_id and q.test_id=p_test_id
  order by q.number;

  return v_new_id;
end;
$fn$;

create or replace function public.import_cepi_exam_from_text(
  p_school_id uuid,
  p_title text,
  p_kind text,
  p_stage text,
  p_block_number integer,
  p_class_ids uuid[],
  p_academic_year integer,
  p_bimester integer,
  p_scheduled_on date,
  p_answer_format text,
  p_subjects text[],
  p_questions jsonb,
  p_save_to_bank boolean default false
)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $fn$
declare
  v_new_id uuid;
  v_bank_id uuid;
  v_question jsonb;
  v_number integer := 0;
  v_count integer;
  v_expected integer;
  v_subject text;
  v_statement text;
  v_answer text;
begin
  if auth.uid() is null or not public.is_cepi_editor(p_school_id) then
    raise exception 'Sem permissão para importar provas nesta escola.';
  end if;
  if p_class_ids is null or cardinality(p_class_ids)=0 or
     cardinality(p_class_ids)<>(select count(distinct id) from unnest(p_class_ids) as x(id)) or
     exists(select 1 from unnest(p_class_ids) as x(id)
       where not exists(select 1 from public.classes c
         where c.id=x.id and c.school_id=p_school_id and c.archived_at is null)) then
    raise exception 'Escolha turmas ativas e sem repetição desta escola.';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Informe a lista de questões revisadas.';
  end if;
  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 99 then
    raise exception 'A prova deve conter entre 1 e 99 questões.';
  end if;
  insert into public.cepi_tests (
    school_id,title,kind,class_ids,block_number,academic_year,bimester,
    stage,scheduled_on,question_count,answer_format,subjects,status,created_by
  ) values (
    p_school_id,p_title,p_kind,p_class_ids,
    case when p_kind='bloco' then p_block_number else null end,
    p_academic_year,p_bimester,p_stage,p_scheduled_on,v_count,
    p_answer_format,coalesce(p_subjects,'{}'::text[]),'draft',auth.uid()
  ) returning id, question_count into v_new_id, v_expected;

  if v_expected <> v_count then
    raise exception 'A quantidade de questões não corresponde ao bloco escolhido.';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) as x(value) loop
    v_number := v_number + 1;
    v_subject := btrim(v_question->>'subject');
    v_statement := btrim(v_question->>'statement');
    v_answer := upper(btrim(v_question->>'correct_answer'));
    v_bank_id := null;
    if coalesce(p_save_to_bank,false) then
      insert into public.cepi_question_bank (
        school_id,subject,stage,statement,answer_format,alternatives,
        correct_answer,created_by
      ) values (
        p_school_id,v_subject,p_stage,v_statement,p_answer_format,'{}'::jsonb,
        v_answer,auth.uid()
      ) returning id into v_bank_id;
    end if;
    insert into public.cepi_test_questions (
      school_id,test_id,number,subject,statement,alternatives,
      correct_answer,bank_question_id,created_by
    ) values (
      p_school_id,v_new_id,v_number,v_subject,v_statement,'{}'::jsonb,
      v_answer,v_bank_id,auth.uid()
    );
  end loop;

  return v_new_id;
end;
$fn$;

revoke all on function public.duplicate_cepi_test_as_draft(uuid,uuid,text,uuid[],integer,integer,date) from public,anon;
revoke all on function public.import_cepi_exam_from_text(uuid,text,text,text,integer,uuid[],integer,integer,date,text,text[],jsonb,boolean) from public,anon;
grant execute on function public.duplicate_cepi_test_as_draft(uuid,uuid,text,uuid[],integer,integer,date) to authenticated;
grant execute on function public.import_cepi_exam_from_text(uuid,text,text,text,integer,uuid[],integer,integer,date,text,text[],jsonb,boolean) to authenticated;

commit;
