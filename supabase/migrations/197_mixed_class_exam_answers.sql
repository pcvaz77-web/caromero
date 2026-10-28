-- Provas mensais e bimestrais podem misturar formatos de resposta por questão.
begin;

alter table public.class_exams drop constraint class_exams_answer_format_check;
alter table public.class_exams add constraint class_exams_answer_format_check
  check (answer_format in ('ABCD','ABCDE','VF','LIVRE','MISTA'));

create or replace function public.validate_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  q jsonb; v_plan jsonb; v_entry jsonb; v_target_count integer;
  v_position integer:=0; v_subject text; v_subject_limit integer;
  v_subject_count integer; v_subject_order bigint; v_previous_order bigint:=0;
  v_format text; v_answer text;
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
    v_format:=case when new.answer_format='MISTA' then q->>'answer_format' else new.answer_format end;
    if v_format is null or v_format not in ('ABCD','ABCDE','VF','LIVRE') then
      raise exception 'Escolha o tipo de resposta da questão %.',v_position;
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
    v_answer:=coalesce(q->>'correct_answer','');
    if v_format='LIVRE' then
      if v_answer<>'' or (new.answer_format='MISTA' and
        char_length(btrim(coalesce(q->>'model_answer',''))) not between 1 and 10000) then
        raise exception 'Informe a resposta escrita correta da questão %.',v_position;
      end if;
    elsif v_answer<>'' and v_answer<>all(
      case v_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
    ) then raise exception 'Gabarito incompatível com as alternativas da questão %.',v_position;
    end if;
    if new.finalized_at is not null and v_format<>'LIVRE' and v_answer='' then
      raise exception 'Escolha o gabarito de todas as questões antes de finalizar.';
    end if;
    if new.exam_type='enem' and (v_answer='' or
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

commit;
