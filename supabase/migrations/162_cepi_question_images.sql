-- CARÔMETRO COMERCIAL
-- Imagens privadas de questões do Meu CEPI.
-- Aplicar somente após autorização específica para produção.

begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'cepi-question-images',
  'cepi-question-images',
  false,
  2000000,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

create policy cepi_question_images_read
on storage.objects for select to authenticated
using (
  bucket_id='cepi-question-images'
  and exists (
    select 1 from public.schools school
    where school.id::text=(storage.foldername(name))[1]
      and public.is_cepi_staff(school.id)
  )
);

create policy cepi_question_images_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='cepi-question-images'
  and name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(png|jpg|webp)$'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists (
    select 1 from public.schools school
    where school.id::text=(storage.foldername(name))[1]
      and public.is_cepi_editor(school.id)
  )
);

create policy cepi_question_images_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='cepi-question-images'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists (
    select 1 from public.schools school
    where school.id::text=(storage.foldername(name))[1]
      and public.is_cepi_editor(school.id)
  )
  and not exists (
    select 1 from public.cepi_test_questions question
    where question.school_id::text=(storage.foldername(name))[1]
      and question.statement like ('%data-cepi-path="' || storage.objects.name || '"%')
  )
  and not exists (
    select 1 from public.cepi_question_bank question
    where question.school_id::text=(storage.foldername(name))[1]
      and question.statement like ('%data-cepi-path="' || storage.objects.name || '"%')
  )
);

commit;
