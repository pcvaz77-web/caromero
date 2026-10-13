-- Meu CEPI: responsaveis sem limite fixo, incluindo coordenadores e administradores da escola.
-- Mantem o vinculo estritamente dentro da escola e nao altera provas existentes.
begin;

create or replace function public.cepi_validate_test_assignment()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if cardinality(new.assigned_teacher_ids) <> (
      select count(distinct id) from unnest(new.assigned_teacher_ids) as x(id)
    ) or exists (
      select 1 from unnest(new.assigned_teacher_ids) as x(id)
      where not exists (
        select 1 from public.school_members m
        where m.school_id = new.school_id and m.user_id = x.id
          and m.role in ('teacher','coordinator','school_admin') and m.status = 'active'
      )
    ) then
    raise exception 'Escolha pessoas ativas desta escola, sem repeticao.';
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

drop policy cepi_questions_insert on public.cepi_test_questions;
create policy cepi_questions_insert on public.cepi_test_questions for insert to authenticated with check (
  created_by=auth.uid() and public.is_cepi_test_assigned(school_id,test_id)
);
drop policy cepi_questions_update on public.cepi_test_questions;
create policy cepi_questions_update on public.cepi_test_questions for update to authenticated
using (public.is_cepi_test_assigned(school_id,test_id))
with check (public.is_cepi_test_assigned(school_id,test_id));
drop policy cepi_questions_delete on public.cepi_test_questions;
create policy cepi_questions_delete on public.cepi_test_questions for delete to authenticated using (
  public.is_cepi_test_assigned(school_id,test_id)
  and exists (select 1 from public.cepi_tests t where t.id=test_id and t.school_id=school_id
    and t.status='draft' and t.deleted_at is null)
);
drop policy cepi_results_insert on public.cepi_test_results;
create policy cepi_results_insert on public.cepi_test_results for insert to authenticated with check (
  reviewed_by=auth.uid() and public.is_cepi_test_assigned(school_id,test_id)
);

create or replace function public.cepi_notify_test_flow()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_test public.cepi_tests%rowtype;
begin
  if tg_op = 'INSERT' then
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
      and m.role in ('teacher','coordinator','school_admin') and m.status='active'
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
        and m.role in ('teacher','coordinator','school_admin') and m.status='active'
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

commit;
