-- O simulado ENEM é compartilhado entre as turmas de 3ª série da escola.
-- Professores podem arquivar, restaurar e excluir definitivamente esses simulados.
-- Provas mensais e bimestrais de outros autores permanecem protegidas.
begin;

alter table public.class_exam_purge_media
  add column if not exists shared_enem boolean not null default false;

create policy class_exam_enem_shared_trash_read on public.class_exams
  for select to authenticated using (
    exam_type='enem' and deleted_at is not null
    and public.can_create_class_exam(school_id)
    and not public.cepi_school_enabled(school_id)
    and exists (select 1 from public.classes c where c.id=class_exams.class_id
      and c.school_id=class_exams.school_id and c.archived_at is null
      and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)')
  );

create or replace function public.can_manage_class_exam_deletion(p_school_id uuid,p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.class_exams e
    join public.school_members m on m.school_id=e.school_id and m.user_id=auth.uid()
    where e.id=p_exam_id and e.school_id=p_school_id and m.status='active'
      and (m.role in ('school_admin','coordinator') or
           (m.role='teacher' and (e.created_by=auth.uid() or
             (e.exam_type='enem' and not public.cepi_school_enabled(e.school_id)
               and exists (select 1 from public.classes c
                 where c.id=e.class_id and c.school_id=e.school_id
                   and c.archived_at is null
                   and upper(c.name) ~ '^(ENSINO M[ÉE]DIO[[:space:]]+)?3([^0-9]|$)')))))
  );
$fn$;
revoke all on function public.can_manage_class_exam_deletion(uuid,uuid) from public,anon;
grant execute on function public.can_manage_class_exam_deletion(uuid,uuid) to authenticated;

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
  if not public.can_manage_class_exam_deletion(p_school_id,p_exam_id) then
    raise exception 'Sem permissão para excluir ou restaurar esta prova.';
  end if;
  if p_restore and v_exam.deleted_at is null then return false; end if;
  if not p_restore and v_exam.deleted_at is not null then return false; end if;
  update public.class_exams
    set deleted_at=case when p_restore then null else now() end,
        deleted_by=case when p_restore then null else auth.uid() end
    where id=v_exam.id;
  return true;
end;
$fn$;

create or replace function public.purge_class_exam(
  p_school_id uuid, p_class_id uuid, p_exam_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_exam public.class_exams%rowtype;
  v_question jsonb;
  v_matches text[];
  v_path text;
  v_results integer;
  v_images integer := 0;
begin
  select * into v_exam from public.class_exams
    where id=p_exam_id and school_id=p_school_id and class_id=p_class_id for update;
  if not found or v_exam.deleted_at is null then
    raise exception 'A prova precisa estar na lista de excluídas desta turma.';
  end if;
  if not public.can_manage_class_exam_deletion(p_school_id,p_exam_id) then
    raise exception 'Sem permissão para excluir definitivamente esta prova.';
  end if;
  for v_question in select value from jsonb_array_elements(v_exam.questions) loop
    for v_matches in select regexp_matches(coalesce(v_question->>'statement',''), 'data-cepi-path="([^"]+)"', 'g') loop
      v_path := v_matches[1];
      if v_path like p_school_id::text || '/%' and
        v_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(png|jpg|webp)$' then
        insert into public.class_exam_purge_media(object_path,school_id,shared_enem)
          values (v_path,p_school_id,v_exam.exam_type='enem')
          on conflict (object_path) do update
            set shared_enem=public.class_exam_purge_media.shared_enem or excluded.shared_enem;
        v_images := v_images + 1;
      end if;
    end loop;
  end loop;
  delete from public.class_exam_results
    where exam_id=v_exam.id and school_id=p_school_id;
  get diagnostics v_results = row_count;
  delete from public.class_exams where id=v_exam.id and school_id=p_school_id;
  return jsonb_build_object('results_deleted',v_results,'images_queued',v_images);
end;
$fn$;

create or replace function public.class_exam_purge_media_pending(p_school_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_paths text[];
  v_role text;
begin
  select m.role into v_role from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator','teacher') limit 1;
  if v_role is null then
    raise exception 'Sem permissão para consultar a limpeza de imagens.';
  end if;
  select coalesce(array_agg(p.object_path order by p.object_path),'{}'::text[])
    into v_paths from public.class_exam_purge_media p
    where p.school_id=p_school_id
      and (v_role in ('school_admin','coordinator') or p.shared_enem or
           split_part(p.object_path,'/',2)=auth.uid()::text)
      and not exists (select 1 from public.class_exams e
        where e.school_id=p.school_id and e.questions::text like '%' || p.object_path || '%')
      and not exists (select 1 from public.class_exam_question_bank q
        where q.school_id=p.school_id and q.statement like '%' || p.object_path || '%');
  return v_paths;
end;
$fn$;

create or replace function public.class_exam_purge_media_ack(p_school_id uuid,p_paths text[])
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  v_count integer;
  v_role text;
begin
  select m.role into v_role from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('school_admin','coordinator','teacher') limit 1;
  if v_role is null or coalesce(cardinality(p_paths),0)>100 then
    raise exception 'Sem permissão ou lote de imagens inválido.';
  end if;
  delete from public.class_exam_purge_media p
    where p.school_id=p_school_id and p.object_path=any(p_paths)
      and (v_role in ('school_admin','coordinator') or p.shared_enem or
           split_part(p.object_path,'/',2)=auth.uid()::text)
      and not exists (select 1 from storage.objects o
        where o.bucket_id='class-exam-images' and o.name=p.object_path);
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

create or replace function public.can_delete_shared_enem_image(p_school_id uuid,p_path text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    join public.class_exam_purge_media p on p.school_id=m.school_id
    where m.school_id=p_school_id and m.user_id=auth.uid()
      and m.status='active' and m.role='teacher'
      and p.object_path=p_path and p.shared_enem
  );
$fn$;
revoke all on function public.can_delete_shared_enem_image(uuid,text) from public,anon;
grant execute on function public.can_delete_shared_enem_image(uuid,text) to authenticated;

create policy class_exam_images_delete_shared_enem on storage.objects for delete to authenticated
  using (bucket_id='class-exam-images'
    and public.can_delete_shared_enem_image(((storage.foldername(name))[1])::uuid,name)
    and not exists (select 1 from public.class_exams e
      where e.school_id::text=(storage.foldername(name))[1]
        and e.questions::text like '%' || storage.objects.name || '%')
    and not exists (select 1 from public.class_exam_question_bank q
      where q.school_id::text=(storage.foldername(name))[1]
        and q.statement like '%' || storage.objects.name || '%'));

commit;
