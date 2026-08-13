-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Permissões de Ocorrência: registrar, editar a própria e excluir a própria.

alter table public.user_permissions
  add column if not exists can_register_occurrences boolean not null default false,
  add column if not exists can_edit_occurrences boolean not null default false,
  add column if not exists can_delete_occurrences boolean not null default false;

alter table public.class_counselors
  add column if not exists can_register_occurrences boolean not null default false,
  add column if not exists can_edit_occurrences boolean not null default false,
  add column if not exists can_delete_occurrences boolean not null default false;

grant select, insert, update, delete on public.student_occurrences to authenticated;

-- Mesmo com uma chamada direta ao banco, aluno, turma e autor de uma
-- ocorrência não podem ser trocados durante a edição. Somente data e texto
-- são alteráveis depois do registro.
create or replace function public.lock_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.student_id is distinct from new.student_id
    or old.class_id is distinct from new.class_id
    or old.class_name is distinct from new.class_name
    or old.created_by is distinct from new.created_by then
    raise exception 'Não é permitido alterar o aluno, a turma ou o autor da ocorrência';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_occurrence_identity on public.student_occurrences;
create trigger lock_occurrence_identity
  before update on public.student_occurrences
  for each row execute function public.lock_occurrence_identity();

drop policy if exists "Authenticated users view occurrences" on public.student_occurrences;
create policy "Authenticated users view occurrences" on public.student_occurrences for select to authenticated
  using (true);

drop policy if exists "Authenticated users add occurrences" on public.student_occurrences;
create policy "Authenticated users add occurrences" on public.student_occurrences for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
      or (
        exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
        and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = student_occurrences.class_id and c.can_register_occurrences)
      )
      or (
        not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
        and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_register_occurrences)
      )
    )
  );

drop policy if exists "Authenticated users update occurrences" on public.student_occurrences;
create policy "Authenticated users update occurrences" on public.student_occurrences for update to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      created_by = auth.uid()
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = student_occurrences.class_id and c.can_edit_occurrences)
    )
    or (
      created_by = auth.uid()
      and not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_edit_occurrences)
    )
  )
  with check (
    created_by = auth.uid()
    or exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Authenticated users delete occurrences" on public.student_occurrences;
create policy "Authenticated users delete occurrences" on public.student_occurrences for delete to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin')
    or (
      created_by = auth.uid()
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = student_occurrences.class_id and c.can_delete_occurrences)
    )
    or (
      created_by = auth.uid()
      and not exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid())
      and exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.can_delete_occurrences)
    )
  );
