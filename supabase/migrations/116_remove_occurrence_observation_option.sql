-- CARÔMETRO COMERCIAL
-- Ocorrência é um estado calculado a partir dos registros de ocorrência,
-- não uma opção configurável do gerenciador de observações.

begin;

create or replace function public.seed_default_observation_options(p_school_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.observation_options (school_id, label, display_order, is_pinned)
  select p_school_id, defaults.label, defaults.display_order, false
  from (values
    ('Laudo (DI)'::text, 0),
    ('Laudo (TEA)'::text, 1),
    ('Não alfabetizado'::text, 2)
  ) as defaults(label, display_order)
  where not exists (
    select 1
    from public.observation_options existing
    where existing.school_id = p_school_id
      and lower(btrim(existing.label)) = lower(btrim(defaults.label))
  );
$$;

create or replace function public.protect_default_observation_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.label = any (array['Laudo (DI)', 'Laudo (TEA)', 'Não alfabetizado']) then
    if tg_op = 'DELETE' then
      raise exception 'Esta é uma observação padrão e não pode ser excluída.';
    end if;
    if new.label is distinct from old.label or new.school_id is distinct from old.school_id then
      raise exception 'O nome e a escola de uma observação padrão não podem ser alterados.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

delete from public.observation_options
where lower(btrim(label)) = lower('Ocorrência');

create or replace function public.reject_occurrence_observation_option()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(btrim(new.label)) = lower('Ocorrência') then
    raise exception 'Ocorrência não pode ser cadastrada como observação.';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_occurrence_observation_option() from public, anon, authenticated;

drop trigger if exists reject_occurrence_observation_option_before_write on public.observation_options;
create trigger reject_occurrence_observation_option_before_write
before insert or update on public.observation_options
for each row execute function public.reject_occurrence_observation_option();

commit;
