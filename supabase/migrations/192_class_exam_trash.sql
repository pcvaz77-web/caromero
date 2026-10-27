-- Exclusão reversível das provas da turma, preservando questões e correções.
-- Revisar SQL e obter autorização específica antes de aplicar em produção.
begin;

alter table public.class_exams
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete restrict;
alter table public.class_exams add constraint class_exam_deleted_pair
  check ((deleted_at is null) = (deleted_by is null));
create or replace function public.validate_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare q jsonb; v_plan jsonb; v_entry jsonb; v_target_count integer; v_position integer:=0; v_subject text; v_last integer;
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id
    or new.class_id is distinct from old.class_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola, turma e autoria da prova não podem ser transferidas.';
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
create or replace function public.set_class_exam_deleted(
  p_school_id uuid, p_class_id uuid, p_exam_id uuid, p_restore boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $fn$
declare v_exam public.class_exams%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if p_restore is null then raise exception 'Operação inválida.'; end if;
  select * into v_exam from public.class_exams
    where id=p_exam_id and school_id=p_school_id and class_id=p_class_id for update;
  if not found then raise exception 'Prova não encontrada nesta turma.'; end if;
  if not exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and (m.role in ('school_admin','coordinator') or
           (m.role='teacher' and v_exam.created_by=auth.uid()))
  ) then raise exception 'Sem permissão para excluir ou restaurar esta prova.'; end if;
  if p_restore and v_exam.deleted_at is null then return false; end if;
  if not p_restore and v_exam.deleted_at is not null then return false; end if;
  update public.class_exams
    set deleted_at=case when p_restore then null else now() end,
        deleted_by=case when p_restore then null else auth.uid() end
    where id=v_exam.id;
  return true;
end;
$fn$;
revoke all on function public.set_class_exam_deleted(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.set_class_exam_deleted(uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.reject_deleted_class_exam_result()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if not exists (
    select 1 from public.class_exams e
    where e.id=new.exam_id and e.school_id=new.school_id and e.deleted_at is null
    for share
  ) then raise exception 'Prova excluída ou inexistente.'; end if;
  return new;
end;
$fn$;
create trigger a_class_exam_result_deleted_guard before insert on public.class_exam_results
  for each row execute function public.reject_deleted_class_exam_result();
revoke all on function public.reject_deleted_class_exam_result() from public,anon,authenticated;

commit;
