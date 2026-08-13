-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Guarda, no próprio registro, o nome de cadastro de quem criou a ocorrência.

alter table public.student_occurrences
  add column if not exists created_by_name text;

-- Preenche ocorrências anteriores com o nome atualmente cadastrado.
update public.student_occurrences as occurrence
set created_by_name = coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.email), ''), 'Não informado')
from public.profiles as profile
where profile.id = occurrence.created_by
  and (occurrence.created_by_name is null or trim(occurrence.created_by_name) = '');

update public.student_occurrences
set created_by_name = 'Não informado'
where created_by_name is null or trim(created_by_name) = '';

alter table public.student_occurrences
  alter column created_by_name set not null,
  alter column created_by_name set default 'Não informado';

create or replace function public.set_occurrence_responsible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- O responsável é histórico e não pode ser trocado ao editar o texto.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    return new;
  end if;

  new.created_by := auth.uid();
  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Não informado')
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
