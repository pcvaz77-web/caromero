-- Origem da questão no banco, seleção do caderno ENEM e exclusão definitiva.
begin;

alter table public.class_exam_question_bank
  add column class_id uuid references public.classes(id) on delete set null,
  add column exam_kind text not null default 'regular'
    check (exam_kind in ('regular','enem')),
  add column enem_model text
    check (enem_model in ('caderno_1','caderno_2')),
  add constraint class_exam_question_bank_enem_shape check (
    (exam_kind='regular' and enem_model is null) or
    (exam_kind='enem' and stage='medio' and answer_format='ABCDE' and enem_model is not null)
  );

create index class_exam_question_bank_school_class_idx
  on public.class_exam_question_bank(school_id,class_id,exam_kind,subject);

create or replace function public.guard_class_exam_question_bank()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.created_by is distinct from auth.uid() then
    raise exception 'A autoria da questão deve corresponder ao usuário atual.';
  end if;
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola e autoria da questão não podem ser alteradas.';
  end if;
  new.subject := upper(btrim(new.subject));
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id
      and (tg_op='UPDATE' or c.archived_at is null)
  ) then
    raise exception 'A turma da questão deve pertencer à escola ativa.';
  end if;
  if new.exam_kind='enem' and not exists (
    select 1 from jsonb_array_elements(public.class_enem_plan(new.enem_model)) entry
    where upper(entry->>'subject')=new.subject
  ) then
    raise exception 'A disciplina não pertence ao caderno ENEM selecionado.';
  end if;
  return new;
end;
$fn$;

create policy class_exam_question_bank_delete on public.class_exam_question_bank
  for delete to authenticated using (
    public.can_create_class_exam(school_id) and
    (created_by=auth.uid() or public.can_purge_class_exam(school_id))
  );
grant delete on public.class_exam_question_bank to authenticated;

commit;
