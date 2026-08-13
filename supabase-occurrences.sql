-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Histórico de ocorrências por aluno, com texto de até 500 caracteres e data.

create table if not exists public.student_occurrences (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null default '',
  occurred_on date not null default current_date,
  occurrence_text varchar(500) not null check (char_length(trim(occurrence_text)) between 1 and 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists student_occurrences_student_date_idx
  on public.student_occurrences (student_id, occurred_on desc, created_at desc);
create index if not exists student_occurrences_class_date_idx
  on public.student_occurrences (class_id, occurred_on desc, created_at desc);

alter table public.student_occurrences enable row level security;
grant select, insert on public.student_occurrences to authenticated;

drop policy if exists "Authenticated users view occurrences" on public.student_occurrences;
create policy "Authenticated users view occurrences" on public.student_occurrences for select to authenticated
  using (true);

drop policy if exists "Authenticated users add occurrences" on public.student_occurrences;
create policy "Authenticated users add occurrences" on public.student_occurrences for insert to authenticated
  with check (created_by = auth.uid());

-- O registro é histórico: não há edição ou exclusão por usuários comuns.
-- Isso preserva a informação e a data originalmente registradas.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_occurrences'
  ) then
    alter publication supabase_realtime add table public.student_occurrences;
  end if;
end $$;
