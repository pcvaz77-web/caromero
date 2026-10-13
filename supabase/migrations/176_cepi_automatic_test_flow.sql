-- Meu CEPI: libera impressao e correcao ao completar as questoes; avisos por escola.
-- Questões ficam bloqueadas após a prova ficar pronta. Provas e resultados existentes são preservados.
begin;

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
    if tg_table_name = 'cepi_tests' then
      if new.created_by is distinct from old.created_by or old.status in ('applied','archived') then
        raise exception 'Autor e provas aplicadas ou arquivadas não podem ser alterados.';
      end if;
    elsif tg_table_name = 'cepi_test_questions' then
      if new.test_id is distinct from old.test_id or new.created_by is distinct from old.created_by then
        raise exception 'Questão não pode mudar de prova ou autor.';
      end if;
    elsif tg_table_name = 'cepi_group_students' then
      if new.group_id is distinct from old.group_id or new.student_id is distinct from old.student_id or new.joined_at is distinct from old.joined_at then
        raise exception 'A participação histórica não pode ser transferida.';
      end if;
      if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
        raise exception 'Uma participação encerrada não pode ser reaberta ou alterada.';
      end if;
    elsif tg_table_name = 'cepi_question_bank' then
      if new.created_by is distinct from old.created_by then
        raise exception 'A autoria da questão não pode ser alterada.';
      end if;
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
      and t.status in ('ready','applied') and array_length(new.answers,1)=t.question_count
      and not exists(select 1 from unnest(new.answers) as x(answer) where answer is null or not (answer='-' or answer=any(
        case t.answer_format when 'VF' then array['V','F'] when 'ABCD' then array['A','B','C','D'] else array['A','B','C','D','E'] end
      )))) then raise exception 'Resultado incompatível com a prova com questões completas.'; end if;
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
  if auth.uid() is null or not public.is_cepi_coordinator(p_school_id) then
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
  if auth.uid() is null or not public.is_cepi_coordinator(p_school_id) then
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

create or replace function public.copy_applied_cepi_test_to_active_class(
  p_school_id uuid,
  p_test_id uuid,
  p_old_class_id uuid,
  p_new_class_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_test public.cepi_tests%rowtype;
  v_old_class public.classes%rowtype;
  v_new_class public.classes%rowtype;
  v_new_test_id uuid;
begin
  if auth.uid() is null or not public.is_cepi_coordinator(p_school_id) then
    raise exception 'Somente a coordenação pode copiar uma prova com questões completas.';
  end if;

  select * into v_test
  from public.cepi_tests
  where id = p_test_id and school_id = p_school_id and status in ('ready','applied');
  if not found or not (p_old_class_id = any(v_test.class_ids)) then
    raise exception 'Prova com questões completas ou turma de origem não encontrada nesta escola.';
  end if;

  select * into v_old_class
  from public.classes
  where id = p_old_class_id and school_id = p_school_id;
  select * into v_new_class
  from public.classes
  where id = p_new_class_id and school_id = p_school_id;
  if v_old_class.id is null or v_old_class.archived_at is null
    or v_new_class.id is null or v_new_class.archived_at is not null
    or v_new_class.name is distinct from v_old_class.name then
    raise exception 'Escolha a turma ativa de mesmo nome da turma arquivada.';
  end if;
  if not exists (
    select 1 from public.students
    where school_id = p_school_id and class_id = p_new_class_id and enrollment_status = 'active'
  ) then
    raise exception 'A nova turma não tem alunos ativos.';
  end if;
  if (select count(*) from public.cepi_test_questions
      where school_id = p_school_id and test_id = p_test_id) <> v_test.question_count then
    raise exception 'A prova de origem não está completa.';
  end if;

  insert into public.cepi_tests (
    school_id, title, kind, class_ids, block_number, subject_plan,
    academic_year, bimester, stage, scheduled_on, question_count,
    answer_format, subjects, status, notes, created_by
  ) values (
    p_school_id, v_test.title, v_test.kind, array[p_new_class_id],
    v_test.block_number, v_test.subject_plan, v_test.academic_year,
    v_test.bimester, v_test.stage, v_test.scheduled_on,
    v_test.question_count, v_test.answer_format, v_test.subjects,
    'draft', v_test.notes, auth.uid()
  ) returning id into v_new_test_id;

  insert into public.cepi_test_questions (
    school_id, test_id, number, subject, statement, alternatives,
    correct_answer, bank_question_id, created_by
  )
  select p_school_id, v_new_test_id, number, subject, statement,
    alternatives, correct_answer, bank_question_id, auth.uid()
  from public.cepi_test_questions
  where school_id = p_school_id and test_id = p_test_id
  order by number;

  update public.cepi_tests set status = 'ready'
  where id = v_new_test_id and school_id = p_school_id;

  return v_new_test_id;
end;
$fn$;

-- Serializa lancamentos concorrentes para que a ultima questao sempre conclua a prova.
create or replace function public.cepi_lock_test_for_question()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform 1 from public.cepi_tests t
  where t.id=new.test_id and t.school_id=new.school_id for update;
  return new;
end;
$fn$;
create trigger a_cepi_lock_test_question before insert on public.cepi_test_questions
for each row execute function public.cepi_lock_test_for_question();

create or replace function public.cepi_complete_test_after_question()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  update public.cepi_tests t set status='ready'
  where t.id=new.test_id and t.school_id=new.school_id
    and t.status='draft' and (
      select count(*) from public.cepi_test_questions q
      where q.school_id=t.school_id and q.test_id=t.id
    )=t.question_count;
  return new;
end;
$fn$;
create trigger cepi_complete_test_after_question after insert on public.cepi_test_questions
for each row execute function public.cepi_complete_test_after_question();

create or replace function public.cepi_notify_test_flow()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op='INSERT' then
    -- Importacoes e copias completas na mesma transacao nao precisam convocar professores.
    if not exists(select 1 from public.cepi_tests t
      where t.id=new.id and t.school_id=new.school_id and t.status='draft') then
      return new;
    end if;
    insert into public.user_notifications (recipient_id,school_id,title,body,target_type,target_id)
    select m.user_id,new.school_id,'Nova prova para lançar questões',
      new.title || ' foi cadastrada. Abra Meu CEPI para lançar as questões.',
      'cepi_test',new.id::text
    from public.school_members m
    where m.school_id=new.school_id and m.role='teacher' and m.status='active'
      and public.can_receive_school_notification(m.user_id,new.school_id);
  elsif old.status='draft' and new.status='ready' then
    insert into public.user_notifications (recipient_id,school_id,title,body,target_type,target_id)
    select m.user_id,new.school_id,'Questões completas · prova liberada',
      new.title || ': todas as questões foram lançadas. Prova, cartões-resposta e gabarito estão disponíveis para impressão; a correção também está liberada.',
      'cepi_test',new.id::text
    from public.school_members m
    where m.school_id=new.school_id and m.role in ('school_admin','coordinator') and m.status='active'
      and public.can_receive_school_notification(m.user_id,new.school_id);
  end if;
  return new;
end;
$fn$;
create constraint trigger cepi_notify_test_created after insert on public.cepi_tests
deferrable initially deferred
for each row execute function public.cepi_notify_test_flow();
create trigger cepi_notify_test_ready after update of status on public.cepi_tests
for each row execute function public.cepi_notify_test_flow();

-- Conclui provas antigas ja completas sem excluir questoes nem resultados.
update public.cepi_tests t set status='ready'
where t.status='draft' and (
  select count(*) from public.cepi_test_questions q
  where q.school_id=t.school_id and q.test_id=t.id
)=t.question_count;

revoke all on function public.cepi_lock_test_for_question(),
  public.cepi_complete_test_after_question(),public.cepi_notify_test_flow()
  from public,anon,authenticated;

commit;
