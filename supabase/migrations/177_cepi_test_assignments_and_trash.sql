-- Meu CEPI: professores escolhidos por prova, lixeira recuperavel e trava na primeira impressao.
begin;

alter table public.cepi_tests
  add column assigned_teacher_ids uuid[] not null default '{}'::uuid[],
  add column print_opened_at timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete restrict;

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
      if new.created_by is distinct from old.created_by or (old.status in ('applied','archived') and (to_jsonb(new) - 'assigned_teacher_ids' - 'deleted_at' - 'deleted_by' - 'updated_at') is distinct from (to_jsonb(old) - 'assigned_teacher_ids' - 'deleted_at' - 'deleted_by' - 'updated_at')) then
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
      and (t.status = 'draft' or (tg_op = 'UPDATE' and t.status = 'ready' and t.print_opened_at is null))
      and t.deleted_at is null
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
      and t.status in ('ready','applied') and t.deleted_at is null and array_length(new.answers,1)=t.question_count
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

create or replace function public.cepi_validate_test_assignment()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if cardinality(new.assigned_teacher_ids) > 4
    or cardinality(new.assigned_teacher_ids) <> (
      select count(distinct id) from unnest(new.assigned_teacher_ids) as x(id)
    ) or exists (
      select 1 from unnest(new.assigned_teacher_ids) as x(id)
      where not exists (
        select 1 from public.school_members m
        where m.school_id = new.school_id and m.user_id = x.id
          and m.role = 'teacher' and m.status = 'active'
      )
    ) then
    raise exception 'Escolha ate quatro professores ativos desta escola, sem repeticao.';
  end if;
  if tg_op = 'UPDATE' and old.print_opened_at is not null
    and new.print_opened_at is distinct from old.print_opened_at then
    raise exception 'A abertura da impressao nao pode ser desfeita.';
  end if;
  if new.print_opened_at is not null and new.status not in ('ready','applied') then
    raise exception 'A impressao exige questoes completas.';
  end if;
  if tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at then
    new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$fn$;
create trigger a_cepi_validate_test_assignment before insert or update on public.cepi_tests
for each row execute function public.cepi_validate_test_assignment();

create or replace function public.is_cepi_test_assigned(p_school_id uuid,p_test_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.is_cepi_editor(p_school_id) and exists (
    select 1 from public.cepi_tests t
    where t.school_id=p_school_id and t.id=p_test_id
      and t.deleted_at is null and auth.uid()=any(t.assigned_teacher_ids)
  );
$fn$;

drop policy cepi_tests_read on public.cepi_tests;
create policy cepi_tests_read on public.cepi_tests for select to authenticated using (
  public.is_cepi_coordinator(school_id) or
  (deleted_at is null and public.is_cepi_editor(school_id)
    and auth.uid()=any(assigned_teacher_ids))
);
drop policy cepi_questions_read on public.cepi_test_questions;
create policy cepi_questions_read on public.cepi_test_questions for select to authenticated using (
  public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id)
);
drop policy cepi_questions_insert on public.cepi_test_questions;
create policy cepi_questions_insert on public.cepi_test_questions for insert to authenticated with check (
  created_by=auth.uid() and
  (public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id))
);
drop policy cepi_questions_update on public.cepi_test_questions;
create policy cepi_questions_update on public.cepi_test_questions for update to authenticated
using (public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id))
with check (public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id));
drop policy cepi_questions_delete on public.cepi_test_questions;
create policy cepi_questions_delete on public.cepi_test_questions for delete to authenticated using (
  (public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id))
  and exists (select 1 from public.cepi_tests t where t.id=test_id and t.school_id=school_id
    and t.status='draft' and t.deleted_at is null)
);
drop policy cepi_results_read on public.cepi_test_results;
create policy cepi_results_read on public.cepi_test_results for select to authenticated using (
  public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id)
);
drop policy cepi_results_insert on public.cepi_test_results;
create policy cepi_results_insert on public.cepi_test_results for insert to authenticated with check (
  reviewed_by=auth.uid() and
  (public.is_cepi_coordinator(school_id) or public.is_cepi_test_assigned(school_id,test_id))
);

create or replace function public.cepi_notify_test_flow()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_test public.cepi_tests%rowtype;
begin
  if tg_op = 'INSERT' then
    -- O disparo de insercao e adiado ate o commit para reconhecer importacoes completas.
    select * into v_test from public.cepi_tests where school_id=new.school_id and id=new.id;
    if v_test.id is null or v_test.deleted_at is not null then return new; end if;
    insert into public.user_notifications (recipient_id,school_id,title,body,target_type,target_id)
    select m.user_id,new.school_id,
      case when v_test.status='draft' then 'Nova prova para lançar questões' else 'Prova disponível para correção' end,
      case when v_test.status='draft' then v_test.title || ' foi cadastrada. Abra Meu CEPI para lançar as questões.'
        else v_test.title || ' está com as questões completas e disponível para correção.' end,
      'cepi_test',new.id::text
    from public.school_members m
    where m.school_id=new.school_id and m.user_id=any(v_test.assigned_teacher_ids)
      and m.role='teacher' and m.status='active'
      and public.can_receive_school_notification(m.user_id,new.school_id)
      and not exists (select 1 from public.user_notifications n
        where n.recipient_id=m.user_id and n.school_id=new.school_id
          and n.target_type='cepi_test' and n.target_id=new.id::text);
  else
    if new.assigned_teacher_ids is distinct from old.assigned_teacher_ids and new.deleted_at is null then
      insert into public.user_notifications (recipient_id,school_id,title,body,target_type,target_id)
      select m.user_id,new.school_id,
        case when new.status='draft' then 'Nova prova para lançar questões' else 'Prova disponível para correção' end,
        case when new.status='draft' then new.title || ' foi atribuída a você. Abra Meu CEPI para lançar as questões.'
          else new.title || ' foi atribuída a você e está disponível para correção.' end,
        'cepi_test',new.id::text
      from public.school_members m
      where m.school_id=new.school_id and m.user_id=any(new.assigned_teacher_ids)
        and not m.user_id=any(old.assigned_teacher_ids)
        and m.role='teacher' and m.status='active'
        and public.can_receive_school_notification(m.user_id,new.school_id);
    end if;
    if old.status='draft' and new.status='ready' and new.deleted_at is null then
      insert into public.user_notifications (recipient_id,school_id,title,body,target_type,target_id)
      select m.user_id,new.school_id,'Questões completas · prova liberada',
        new.title || ': todas as questões foram lançadas. Prova, cartões-resposta e gabarito estão disponíveis para impressão; a correção também está liberada.',
        'cepi_test',new.id::text
      from public.school_members m
      where m.school_id=new.school_id and m.role in ('school_admin','coordinator')
        and m.status='active' and public.can_receive_school_notification(m.user_id,new.school_id);
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger cepi_notify_test_ready on public.cepi_tests;
create trigger cepi_notify_test_ready after update of status,assigned_teacher_ids on public.cepi_tests
for each row execute function public.cepi_notify_test_flow();

revoke all on function public.cepi_validate_test_assignment(),
  public.is_cepi_test_assigned(uuid,uuid) from public,anon;
grant execute on function public.is_cepi_test_assigned(uuid,uuid) to authenticated;

commit;
