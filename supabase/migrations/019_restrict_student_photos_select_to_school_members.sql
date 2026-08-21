-- CARÔMETRO COMERCIAL
-- Migration 019: restringe a leitura do bucket student-photos aos membros
-- da escola do aluno correspondente.
--
-- A policy de SELECT de storage.objects para o bucket privado
-- student-photos era apenas "bucket_id = 'student-photos'" — qualquer
-- sessão authenticated, mesmo sem nenhum vínculo em school_members,
-- conseguia gerar um createSignedUrl() válido para qualquer foto, desde
-- que soubesse o caminho do objeto. Auditoria completa (somente leitura)
-- confirmou: os três pontos de leitura do frontend (index.html,
-- student-edit-improvements.js, reports.js) sempre usam createSignedUrl()
-- com um photo_path já obtido de uma linha de students filtrada pela RLS
-- da própria tabela (is_active_school_member(school_id)) — nunca de um
-- caminho arbitrário. Uma policy de SELECT que exija essa mesma condição
-- não amplia nem quebra nenhum acesso legítimo hoje: 826 objetos no bucket
-- correspondem 1:1 a 826 students.photo_path, sem órfãos, e todo aluno com
-- foto tem school_id válido.
--
-- Esta migration substitui exclusivamente a policy de SELECT. Não altera
-- INSERT, UPDATE, DELETE, o bucket, nenhuma foto/objeto/photo_path,
-- students, school_members, RPCs ou grants.
--
-- Já aplicada e validada em produção via mcp__supabase__apply_migration
-- (Supabase migration 20260821095134
-- restrict_student_photos_select_to_school_members). Este arquivo apenas
-- versiona localmente essa alteração — NÃO deve ser reaplicado.

begin;

drop policy if exists "Authenticated users view student photos"
on storage.objects;

create policy "school_members_can_view_own_school_student_photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-photos'
  and exists (
    select 1
    from public.students s
    where s.photo_path = storage.objects.name
      and s.school_id is not null
      and public.is_active_school_member(s.school_id)
  )
);

commit;
