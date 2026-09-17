-- CARÔMETRO COMERCIAL
-- Anexo privado opcional (uma imagem ou PDF) por ocorrência.
-- Esta migration cria somente estrutura e policies. Não altera ocorrências
-- existentes e não deve ser aplicada sem autorização separada.

begin;

alter table public.student_occurrences
  add column if not exists attachment_path text null,
  add column if not exists attachment_name text null,
  add column if not exists attachment_type text null,
  add column if not exists attachment_size bigint null;

alter table public.student_occurrences
  drop constraint if exists student_occurrences_attachment_complete_check,
  add constraint student_occurrences_attachment_complete_check check (
    (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
    or
    (
      attachment_path is not null
      and attachment_name is not null
      and attachment_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and attachment_size between 1 and 10485760
      and attachment_path like school_id::text || '/' || created_by::text || '/' || id::text || '/%'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occurrence-attachments',
  'occurrence-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school_members_can_view_occurrence_attachments" on storage.objects;
create policy "school_members_can_view_occurrence_attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'occurrence-attachments'
  and exists (
    select 1
    from public.student_occurrences occurrence
    where occurrence.attachment_path = storage.objects.name
      and public.is_active_school_member(occurrence.school_id)
      and (
        public.has_school_permission(occurrence.school_id, 'can_view_occurrences')
        or public.has_school_permission(occurrence.school_id, 'can_edit_all')
      )
  )
);

drop policy if exists "authorized_members_can_upload_occurrence_attachments" on storage.objects;
create policy "authorized_members_can_upload_occurrence_attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'occurrence-attachments'
  and (storage.foldername(name))[1] is not null
  and public.is_active_school_member(((storage.foldername(name))[1])::uuid)
  and (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_register_occurrences')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    )
    or exists (
      select 1
      from public.student_occurrences occurrence
      where occurrence.id::text = (storage.foldername(name))[3]
        and occurrence.school_id::text = (storage.foldername(name))[1]
        and occurrence.created_by::text = (storage.foldername(name))[2]
        and (
          occurrence.created_by = auth.uid()
          or public.has_school_permission(occurrence.school_id, 'can_edit_occurrences')
          or public.has_school_permission(occurrence.school_id, 'can_edit_all')
        )
    )
  )
);

drop policy if exists "authorized_members_can_delete_occurrence_attachments" on storage.objects;
create policy "authorized_members_can_delete_occurrence_attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'occurrence-attachments'
  and (storage.foldername(name))[1] is not null
  and public.is_active_school_member(((storage.foldername(name))[1])::uuid)
  and (
    exists (
      select 1
      from public.student_occurrences occurrence
      where occurrence.id::text = (storage.foldername(name))[3]
        and occurrence.school_id::text = (storage.foldername(name))[1]
        and occurrence.created_by::text = (storage.foldername(name))[2]
        and (
          occurrence.created_by = auth.uid()
          or public.has_school_permission(occurrence.school_id, 'can_edit_occurrences')
          or public.has_school_permission(occurrence.school_id, 'can_delete_occurrences')
          or public.has_school_permission(occurrence.school_id, 'can_edit_all')
        )
    )
    or (
      not exists (
        select 1
        from public.student_occurrences occurrence
        where occurrence.id::text = (storage.foldername(name))[3]
          and occurrence.school_id::text = (storage.foldername(name))[1]
      )
      and (
        (storage.foldername(name))[2] = auth.uid()::text
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_delete_occurrences')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    )
  )
);

commit;
