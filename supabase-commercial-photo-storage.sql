-- CARÔMETRO COMERCIAL — políticas multi-escola para fotos de alunos.
-- Preparar e revisar antes de aplicar. Este arquivo não é executado automaticamente.
--
-- Novos caminhos: <school_id>/<uploader_user_id>/<arquivo>
-- Caminhos antigos permanecem legíveis quando ainda estão referenciados por
-- um aluno acessível. Nenhum objeto existente é movido ou excluído.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880, array['image/jpeg']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Novas associações sempre usam um caminho pertencente à própria escola.
-- O gatilho só examina inclusões ou trocas de foto: caminhos históricos já
-- gravados continuam válidos quando outros dados do aluno forem alterados.
create or replace function public.enforce_student_photo_school_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_parts text[];
begin
  if new.photo_path is null
     or (tg_op = 'UPDATE' and old.photo_path is not distinct from new.photo_path) then
    return new;
  end if;

  v_parts := string_to_array(new.photo_path, '/');

  if coalesce(array_length(v_parts, 1), 0) <> 3
     or v_parts[1] <> new.school_id::text
     or (
       (coalesce(auth.role(), '') = 'service_role' and v_parts[2] <> 'system')
       or (coalesce(auth.role(), '') <> 'service_role' and v_parts[2] <> auth.uid()::text)
     )
     or coalesce(v_parts[3], '') = '' then
    raise exception 'O caminho da foto não pertence à escola e ao usuário autenticado.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_student_photo_school_path()
from public, anon, authenticated;

drop trigger if exists enforce_student_photo_school_path on public.students;
create trigger enforce_student_photo_school_path
before insert or update of photo_path on public.students
for each row execute function public.enforce_student_photo_school_path();

-- Remove somente políticas históricas deste bucket. Não percorre nem apaga
-- políticas de outros buckets que também usam storage.objects.
drop policy if exists "Authenticated users view student photos" on storage.objects;
drop policy if exists "Authorized users upload student photos" on storage.objects;
drop policy if exists "Authorized users update student photos" on storage.objects;
drop policy if exists "Authorized users delete student photos" on storage.objects;
drop policy if exists "Allowed users upload student photos" on storage.objects;
drop policy if exists "Allowed users update student photos" on storage.objects;
drop policy if exists "Allowed users delete student photos" on storage.objects;
drop policy if exists "Coordinators upload student photos" on storage.objects;
drop policy if exists "Coordinators update student photos" on storage.objects;
drop policy if exists "Coordinators delete student photos" on storage.objects;
drop policy if exists "School members view student photos" on storage.objects;
drop policy if exists "School members upload student photos" on storage.objects;
drop policy if exists "School members update student photos" on storage.objects;
drop policy if exists "School members delete student photos" on storage.objects;

-- Leitura normal: o nome do objeto precisa continuar associado a um aluno de
-- uma escola em que a conta possua vínculo ativo. Para caminhos novos, uma
-- segunda condição, restrita à escola do primeiro segmento e às permissões de
-- edição/exclusão, permite que o Storage localize um objeto recém-desassociado
-- durante a limpeza posterior à gravação confirmada no banco. A API de remoção
-- do Storage exige SELECT + DELETE; sem esta condição, toda foto substituída ou
-- removida virava órfã assim que students.photo_path deixava de referenciá-la.
-- Caminhos históricos (<user_id>/<arquivo>) continuam exclusivamente
-- dependentes de referência e não recebem essa exceção de limpeza.
create policy "School members view student photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-photos'
  and (
    exists (
      select 1
      from public.students s
      where s.photo_path = storage.objects.name
        and public.is_active_school_member(s.school_id)
    )
    or
    case
      when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_active_school_member(((storage.foldername(name))[1])::uuid)
        and (
          public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_students')
          or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_photo')
          or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_delete_students')
          or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
        )
      else false
    end
  )
);

-- Converte o primeiro segmento somente quando ele tem formato UUID. CASE é
-- usado para que caminhos antigos ou inválidos não provoquem erro de cast.
create policy "School members upload student photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and case
    when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_active_school_member(((storage.foldername(name))[1])::uuid)
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_add_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_photo')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    else false
  end
);

create policy "School members update student photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-photos'
  and case
    when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_active_school_member(((storage.foldername(name))[1])::uuid)
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_photo')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    else false
  end
)
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and case
    when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_active_school_member(((storage.foldername(name))[1])::uuid)
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_photo')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    else false
  end
);

-- Exclusão de objetos novos é limitada à escola indicada no caminho. As
-- permissões cobrem tanto troca de foto quanto exclusão do aluno.
create policy "School members delete student photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-photos'
  and case
    when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_active_school_member(((storage.foldername(name))[1])::uuid)
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_photo')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_delete_students')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    else false
  end
);

commit;
