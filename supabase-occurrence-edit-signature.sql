-- CARÔMETRO
-- Assinatura de edição de ocorrências: preserva o responsável original
-- (created_by/created_by_name/created_at) e passa a registrar quem fez a
-- última edição (updated_by/updated_by_name/updated_at).
--
-- Escopo: só student_occurrences + os dois triggers já existentes que
-- protegem/normalizam a identidade da ocorrência. Não toca RLS, não toca
-- notificações, não toca nenhuma migration 001-015, não é a Migration 016.

alter table public.student_occurrences
  add column if not exists updated_by uuid null references auth.users(id),
  add column if not exists updated_by_name text null,
  add column if not exists updated_at timestamptz null;

-- set_occurrence_responsible: já é BEFORE INSERT OR UPDATE e já faz o
-- lookup do nome em profiles para created_by_name. Estende o ramo UPDATE
-- para também gravar a assinatura de edição, mantendo created_by/
-- created_by_name intocados (comportamento já existente, preservado).
create or replace function public.set_occurrence_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- O responsável é histórico e não pode ser trocado ao editar o texto.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;

    -- Assinatura da última edição. Se o próprio responsável original
    -- editar, updated_by/updated_by_name naturalmente ficam iguais a
    -- created_by/created_by_name, já que auth.uid() é o mesmo.
    new.updated_by := auth.uid();
    select coalesce(nullif(pg_catalog.trim(full_name), ''), nullif(pg_catalog.trim(email), ''), 'Não informado')
      into new.updated_by_name
    from public.profiles
    where id = auth.uid();
    new.updated_by_name := coalesce(new.updated_by_name, 'Não informado');
    new.updated_at := now();
    return new;
  end if;

  new.created_by := auth.uid();
  select coalesce(nullif(pg_catalog.trim(full_name), ''), nullif(pg_catalog.trim(email), ''), 'Não informado')
    into new.created_by_name
  from public.profiles
  where id = auth.uid();
  new.created_by_name := coalesce(new.created_by_name, 'Não informado');
  return new;
end;
$$;

drop trigger if exists set_occurrence_responsible on public.student_occurrences;
create trigger set_occurrence_responsible
before insert or update on public.student_occurrences
for each row execute function public.set_occurrence_responsible();

-- lock_occurrence_identity: acrescenta created_at à lista de colunas
-- imutáveis, como camada extra de defesa além da normalização acima.
-- updated_by/updated_by_name/updated_at ficam de fora desta lista de
-- propósito — são exatamente as colunas que devem mudar a cada edição.
create or replace function public.lock_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.student_id is distinct from new.student_id
    or old.class_id is distinct from new.class_id
    or old.class_name is distinct from new.class_name
    or old.created_by is distinct from new.created_by
    or old.created_by_name is distinct from new.created_by_name
    or old.created_at is distinct from new.created_at then
    raise exception 'Aluno, turma, responsavel e data de criacao da ocorrencia nao podem ser alterados';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_occurrence_identity on public.student_occurrences;
create trigger lock_occurrence_identity
before update on public.student_occurrences
for each row execute function public.lock_occurrence_identity();
