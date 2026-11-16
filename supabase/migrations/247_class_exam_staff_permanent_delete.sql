-- Coordenadores podem excluir provas da escola; professores, somente as próprias.
-- A fila de imagens mostra ao professor apenas arquivos enviados por ele.
begin;

create or replace function public.can_purge_class_exam(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid()
      and m.status='active' and m.role in ('school_admin','coordinator')
  );
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
  if not exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and (m.role in ('school_admin','coordinator') or
           (m.role='teacher' and v_exam.created_by=auth.uid()))
  ) then
    raise exception 'Sem permissão para excluir definitivamente esta prova.';
  end if;
  for v_question in select value from jsonb_array_elements(v_exam.questions) loop
    for v_matches in select regexp_matches(coalesce(v_question->>'statement',''), 'data-cepi-path="([^"]+)"', 'g') loop
      v_path := v_matches[1];
      if v_path like p_school_id::text || '/%' and
        v_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(png|jpg|webp)$' then
        insert into public.class_exam_purge_media(object_path,school_id)
          values (v_path,p_school_id) on conflict (object_path) do nothing;
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
      and (v_role in ('school_admin','coordinator') or
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
      and (v_role in ('school_admin','coordinator') or
           split_part(p.object_path,'/',2)=auth.uid()::text)
      and not exists (select 1 from storage.objects o
        where o.bucket_id='class-exam-images' and o.name=p.object_path);
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

commit;
