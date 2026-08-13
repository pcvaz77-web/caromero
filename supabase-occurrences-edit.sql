-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Libera a edição e a exclusão de ocorrências por usuários autenticados.

grant update, delete on public.student_occurrences to authenticated;

drop policy if exists "Authenticated users update occurrences" on public.student_occurrences;
create policy "Authenticated users update occurrences" on public.student_occurrences for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users delete occurrences" on public.student_occurrences;
create policy "Authenticated users delete occurrences" on public.student_occurrences for delete to authenticated
  using (true);
