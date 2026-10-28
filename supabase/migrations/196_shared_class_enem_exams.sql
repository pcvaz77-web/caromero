-- Simulado ENEM único por registro, compartilhado entre as turmas de 3ª série
-- da mesma escola sem Meu CEPI. Provas mensais e bimestrais continuam privadas.
begin;

create policy class_exam_enem_shared_read on public.class_exams
  for select to authenticated using (
    exam_type = 'enem' and deleted_at is null
    and public.can_create_class_exam(school_id)
    and not public.cepi_school_enabled(school_id)
    and exists (select 1 from public.classes c where c.id=class_exams.class_id
      and c.school_id=class_exams.school_id and c.archived_at is null
      and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)')
  );

-- Mantém todas as travas anteriores e valida cada disciplina pelo plano, mesmo
-- quando ela é preenchida antes das disciplinas que vêm antes no caderno.
create or replace function public.validate_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  q jsonb; v_plan jsonb; v_entry jsonb; v_target_count integer;
  v_position integer:=0; v_subject text; v_subject_limit integer;
  v_subject_count integer; v_subject_order bigint; v_previous_order bigint:=0;
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id
    or new.class_id is distinct from old.class_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola, turma e autoria da prova não podem ser transferidas.';
  end if;
  if tg_op='UPDATE' and old.exam_type='enem' and jsonb_array_length(old.questions)>0
    and new.enem_model is distinct from old.enem_model then
    raise exception 'O caderno ENEM não pode mudar após o início das questões.';
  end if;
  if tg_op='UPDATE' and (new.deleted_at is distinct from old.deleted_at or
    new.deleted_by is distinct from old.deleted_by) and
    ((new.deleted_at is null and new.deleted_by is not null) or
     (new.deleted_at is not null and new.deleted_by is distinct from auth.uid())) then
    raise exception 'A exclusão deve identificar o usuário responsável.';
  end if;
  if tg_op='UPDATE' and (old.finalized_at is not null or old.deleted_at is not null) and
    (to_jsonb(new)-'deleted_at'-'deleted_by'-'updated_at') is distinct from
    (to_jsonb(old)-'deleted_at'-'deleted_by'-'updated_at') then
    raise exception 'A prova finalizada ou excluída não pode ser alterada.';
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
      v_subject:=q->>'subject';
      select (entry.value->>'count')::integer, entry.ordinality
        into v_subject_limit, v_subject_order
      from jsonb_array_elements(v_plan) with ordinality entry(value,ordinality)
      where entry.value->>'subject'=v_subject;
      if v_subject_limit is null or v_subject_order<v_previous_order then
        raise exception 'A disciplina da questão % não corresponde ao caderno ENEM.',v_position;
      end if;
      v_previous_order:=v_subject_order;
      select count(*) into v_subject_count from jsonb_array_elements(new.questions) item
        where item->>'subject'=v_subject;
      if v_subject_count>v_subject_limit then
        raise exception 'A disciplina % já atingiu o limite de % questões.',v_subject,v_subject_limit;
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

create function public.class_exam_add_enem_questions(
  p_school_id uuid, p_exam_id uuid, p_subject text, p_questions jsonb
)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  v_exam public.class_exams%rowtype; v_plan jsonb; v_limit integer;
  v_existing integer; v_added integer; v_questions jsonb; v_sorted jsonb;
  v_question jsonb; v_name text; v_role text;
begin
  if auth.uid() is null or not public.can_create_class_exam(p_school_id)
     or public.cepi_school_enabled(p_school_id) then
    raise exception 'Sem permissão para colaborar neste simulado.';
  end if;
  select * into v_exam from public.class_exams
    where id=p_exam_id and school_id=p_school_id for update;
  if not found or v_exam.exam_type<>'enem' or v_exam.finalized_at is not null
     or v_exam.deleted_at is not null then
    raise exception 'O simulado não está disponível para receber questões.';
  end if;
  if not exists (select 1 from public.classes c where c.id=v_exam.class_id
    and c.school_id=p_school_id and c.archived_at is null
    and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)') then
    raise exception 'A turma de origem do simulado não é uma 3ª série ativa.';
  end if;
  v_plan:=public.class_enem_plan(v_exam.enem_model);
  select (item->>'count')::integer into v_limit from jsonb_array_elements(v_plan) item
    where item->>'subject'=p_subject;
  if v_limit is null then raise exception 'Escolha uma disciplina do caderno ENEM.'; end if;
  if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)=0 then
    raise exception 'Informe ao menos uma questão da disciplina.';
  end if;
  v_added:=jsonb_array_length(p_questions);
  select count(*) into v_existing from jsonb_array_elements(v_exam.questions) item
    where item->>'subject'=p_subject;
  if v_existing+v_added>v_limit then
    raise exception 'A disciplina % aceita apenas mais % questão(ões).',p_subject,v_limit-v_existing;
  end if;
  v_questions:=v_exam.questions;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question)<>'object' then raise exception 'Questão inválida.'; end if;
    v_questions:=v_questions || jsonb_build_array(jsonb_build_object(
      'statement',v_question->>'statement',
      'alternatives',coalesce(v_question->'alternatives','{}'::jsonb),
      'correct_answer',v_question->>'correct_answer',
      'subject',p_subject,'created_by',auth.uid()
    ));
  end loop;
  select jsonb_agg(question.value order by planned.ordinality,question.ordinality)
    into v_sorted
  from jsonb_array_elements(v_questions) with ordinality question(value,ordinality)
  join jsonb_array_elements(v_plan) with ordinality planned(value,ordinality)
    on planned.value->>'subject'=question.value->>'subject';
  update public.class_exams set questions=v_sorted where id=v_exam.id;

  if v_exam.created_by<>auth.uid() and public.can_receive_school_notification(v_exam.created_by,p_school_id) then
    select coalesce(nullif(btrim(p.full_name),''),u.email,'Usuário'),m.role
      into v_name,v_role
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.school_members m on m.user_id=u.id and m.school_id=p_school_id
    where u.id=auth.uid();
    insert into public.user_notifications(recipient_id,school_id,class_id,title,body,target_type,target_id)
    values (v_exam.created_by,p_school_id,v_exam.class_id,'Questões incluídas no Simulado do ENEM',
      format('%s %s acaba de inserir %s %s de %s no simulado %s.',
        case v_role when 'teacher' then 'Professor(a)' when 'coordinator' then 'Coordenador(a)'
          when 'school_admin' then 'Administrador(a)' else 'Usuário(a)' end,
        coalesce(v_name,'Usuário'),v_added,
        case when v_added=1 then 'questão' else 'questões' end,p_subject,v_exam.title),
      'class_exam',v_exam.id::text);
  end if;
  return v_added;
end;
$fn$;
revoke all on function public.class_exam_add_enem_questions(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.class_exam_add_enem_questions(uuid,uuid,text,jsonb) to authenticated;

-- A correção do mesmo simulado aceita alunos ativos de outras turmas de 3ª
-- série da escola; o vínculo do resultado com o aluno permanece inalterado.
create or replace function public.validate_class_exam_result()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_exam public.class_exams%rowtype; v_student public.students%rowtype; v_total integer; v_correct integer:=0; v_index integer;
begin
  select * into v_exam from public.class_exams where id=new.exam_id and school_id=new.school_id;
  if not found or v_exam.exam_type<>'enem' or v_exam.finalized_at is null or new.reviewed_by is distinct from auth.uid() then
    raise exception 'A correção exige simulado finalizado e identificação do professor.';
  end if;
  select * into v_student from public.students where id=new.student_id and school_id=new.school_id;
  if not found or v_student.enrollment_status<>'active' or not exists (
    select 1 from public.classes c where c.id=v_student.class_id and c.school_id=new.school_id
      and c.archived_at is null and (
        c.id=v_exam.class_id or (
          not public.cepi_school_enabled(v_exam.school_id)
          and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)'
        )
      )
  ) then raise exception 'O aluno não está ativo em uma turma de 3ª série desta escola.'; end if;
  v_total:=jsonb_array_length(v_exam.questions);
  if cardinality(new.answers)<>v_total or exists(select 1 from unnest(new.answers) as response(value) where response.value is null or response.value not in ('A','B','C','D','E','-')) then
    raise exception 'As respostas não correspondem ao cartão desta prova.';
  end if;
  for v_index in 1..v_total loop
    if new.answers[v_index]=v_exam.questions->(v_index-1)->>'correct_answer' then v_correct:=v_correct+1; end if;
  end loop;
  new.correct_count:=v_correct; new.reviewed_at:=now();
  return new;
end;
$fn$;

commit;
