-- Exclusão definitiva de provas previamente excluídas, com fila de limpeza de imagens.
begin;

create table public.class_exam_purge_media (
  object_path text primary key,
  school_id uuid not null references public.schools(id) on delete restrict,
  queued_at timestamptz not null default now(),
  check (object_path like school_id::text || '/%')
);
alter table public.class_exam_purge_media enable row level security;
revoke all on public.class_exam_purge_media from public,anon,authenticated;

create or replace function public.can_purge_class_exam(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id=p_school_id and m.user_id=auth.uid()
      and m.status='active' and m.role='school_admin'
  );
$fn$;
revoke all on function public.can_purge_class_exam(uuid) from public,anon;
grant execute on function public.can_purge_class_exam(uuid) to authenticated;

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
  if not public.can_purge_class_exam(p_school_id) then
    raise exception 'Somente a administração da escola pode excluir definitivamente esta prova.';
  end if;
  select * into v_exam from public.class_exams
    where id=p_exam_id and school_id=p_school_id and class_id=p_class_id for update;
  if not found or v_exam.deleted_at is null then
    raise exception 'A prova precisa estar na lista de excluídas desta turma.';
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
revoke all on function public.purge_class_exam(uuid,uuid,uuid) from public,anon;
grant execute on function public.purge_class_exam(uuid,uuid,uuid) to authenticated;

create or replace function public.class_exam_purge_media_pending(p_school_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $fn$
declare v_paths text[];
begin
  if not public.can_purge_class_exam(p_school_id) then
    raise exception 'Sem permissão para consultar a limpeza de imagens.';
  end if;
  select coalesce(array_agg(p.object_path order by p.object_path),'{}'::text[])
    into v_paths from public.class_exam_purge_media p
    where p.school_id=p_school_id and not exists (
      select 1 from public.class_exams e
      where e.school_id=p.school_id and e.questions::text like '%' || p.object_path || '%'
    );
  return v_paths;
end;
$fn$;
revoke all on function public.class_exam_purge_media_pending(uuid) from public,anon;
grant execute on function public.class_exam_purge_media_pending(uuid) to authenticated;

create or replace function public.class_exam_purge_media_ack(p_school_id uuid,p_paths text[])
returns integer language plpgsql security definer set search_path = '' as $fn$
declare v_count integer;
begin
  if not public.can_purge_class_exam(p_school_id) or
    coalesce(cardinality(p_paths),0)>100 then
    raise exception 'Sem permissão ou lote de imagens inválido.';
  end if;
  delete from public.class_exam_purge_media p
    where p.school_id=p_school_id and p.object_path=any(p_paths)
      and not exists (
        select 1 from storage.objects o
        where o.bucket_id='class-exam-images' and o.name=p.object_path
      );
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;
revoke all on function public.class_exam_purge_media_ack(uuid,text[]) from public,anon;
grant execute on function public.class_exam_purge_media_ack(uuid,text[]) to authenticated;

create policy class_exam_images_delete_admin on storage.objects for delete to authenticated
  using (bucket_id='class-exam-images'
    and public.can_purge_class_exam(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.class_exams e
      where e.school_id::text=(storage.foldername(name))[1]
        and e.questions::text like '%' || storage.objects.name || '%'
    ));

commit;
