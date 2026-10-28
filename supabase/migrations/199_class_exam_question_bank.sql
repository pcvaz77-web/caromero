-- Banco de questões das provas regulares e dos simulados ENEM, restrito à escola.
-- Aplicar somente após a revisão e autorização da migração em produção.
begin;

create table public.class_exam_question_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 2 and 100),
  stage text not null check (stage in ('fundamental_i','fundamental_ii','medio')),
  answer_format text not null check (answer_format in ('ABCD','ABCDE','VF','LIVRE')),
  statement text not null check (char_length(btrim(statement)) between 3 and 30000),
  correct_answer text not null default '',
  model_answer text not null default '' check (char_length(model_answer)<=10000),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (answer_format='LIVRE' and correct_answer='' and char_length(btrim(model_answer))>0)
    or (answer_format='VF' and correct_answer in ('V','F') and model_answer='')
    or (answer_format='ABCD' and correct_answer in ('A','B','C','D') and model_answer='')
    or (answer_format='ABCDE' and correct_answer in ('A','B','C','D','E') and model_answer='')
  )
);
create index class_exam_question_bank_school_subject_idx
  on public.class_exam_question_bank(school_id,stage,subject,active);
create or replace function public.guard_class_exam_question_bank()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.created_by is distinct from auth.uid() then
    raise exception 'A autoria da questão deve corresponder ao usuário atual.';
  end if;
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then
    raise exception 'Escola e autoria da questão não podem ser alteradas.';
  end if;
  return new;
end;
$fn$;
create trigger class_exam_question_bank_guard before insert or update on public.class_exam_question_bank
  for each row execute function public.guard_class_exam_question_bank();
alter table public.class_exam_question_bank enable row level security;
create policy class_exam_question_bank_read on public.class_exam_question_bank
  for select to authenticated using (public.can_create_class_exam(school_id));
create policy class_exam_question_bank_insert on public.class_exam_question_bank
  for insert to authenticated with check (public.can_create_class_exam(school_id) and created_by=auth.uid());
create policy class_exam_question_bank_update on public.class_exam_question_bank
  for update to authenticated using (public.can_create_class_exam(school_id) and created_by=auth.uid())
  with check (public.can_create_class_exam(school_id) and created_by=auth.uid());
revoke all on public.class_exam_question_bank from public,anon;
grant select,insert,update on public.class_exam_question_bank to authenticated;

-- Imagens copiadas para o banco continuam disponíveis após a exclusão da prova.
create or replace function public.class_exam_purge_media_pending(p_school_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $fn$
declare v_paths text[];
begin
  if not public.can_purge_class_exam(p_school_id) then
    raise exception 'Sem permissão para consultar a limpeza de imagens.';
  end if;
  select coalesce(array_agg(p.object_path order by p.object_path),'{}'::text[])
    into v_paths from public.class_exam_purge_media p
    where p.school_id=p_school_id
      and not exists (select 1 from public.class_exams e
        where e.school_id=p.school_id and e.questions::text like '%' || p.object_path || '%')
      and not exists (select 1 from public.class_exam_question_bank q
        where q.school_id=p.school_id and q.statement like '%' || p.object_path || '%');
  return v_paths;
end;
$fn$;

drop policy if exists class_exam_images_delete_own on storage.objects;
create policy class_exam_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id='class-exam-images' and (storage.foldername(name))[2]=auth.uid()::text
    and public.can_create_class_exam(((storage.foldername(name))[1])::uuid)
    and not exists (select 1 from public.class_exams e
      where e.school_id::text=(storage.foldername(name))[1] and e.questions::text like '%' || storage.objects.name || '%')
    and not exists (select 1 from public.class_exam_question_bank q
      where q.school_id::text=(storage.foldername(name))[1] and q.statement like '%' || storage.objects.name || '%'));
drop policy if exists class_exam_images_delete_admin on storage.objects;
create policy class_exam_images_delete_admin on storage.objects for delete to authenticated
  using (bucket_id='class-exam-images' and public.can_purge_class_exam(((storage.foldername(name))[1])::uuid)
    and not exists (select 1 from public.class_exams e
      where e.school_id::text=(storage.foldername(name))[1] and e.questions::text like '%' || storage.objects.name || '%')
    and not exists (select 1 from public.class_exam_question_bank q
      where q.school_id::text=(storage.foldername(name))[1] and q.statement like '%' || storage.objects.name || '%'));

commit;
