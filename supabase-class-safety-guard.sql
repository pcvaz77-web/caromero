-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Não remove alunos, turmas, fotos ou ocorrências.
-- Impede novas turmas duplicadas no mesmo turno, inclusive se duas pessoas
-- clicarem em cadastrar ao mesmo tempo.

begin;

create or replace function public.prevent_duplicate_class_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.classes c
    where c.id is distinct from new.id
      and lower(trim(c.name)) = lower(trim(new.name))
      and coalesce(c.shift, 'Matutino') = coalesce(new.shift, 'Matutino')
  ) then
    raise exception 'Esta turma já está cadastrada neste turno.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_class_name on public.classes;
create trigger prevent_duplicate_class_name
before insert or update of name, shift on public.classes
for each row execute function public.prevent_duplicate_class_name();

commit;
