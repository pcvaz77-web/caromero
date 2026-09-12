-- CARÔMETRO COMERCIAL
-- Quatro observações padrão para escolas existentes e futuras.

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
    ('Não alfabetizado'::text, 2),
    ('Ocorrência'::text, 3)
  ) as defaults(label, display_order)
  where not exists (
    select 1
    from public.observation_options existing
    where existing.school_id = p_school_id
      and lower(btrim(existing.label)) = lower(btrim(defaults.label))
  );
$$;

revoke all on function public.seed_default_observation_options(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_observation_options(uuid) to service_role;

select public.seed_default_observation_options(id)
from public.schools;

create or replace function public.seed_default_observation_options_for_new_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_observation_options(new.id);
  return new;
end;
$$;

revoke all on function public.seed_default_observation_options_for_new_school() from public, anon, authenticated;

drop trigger if exists seed_default_observation_options_after_school_insert on public.schools;
create trigger seed_default_observation_options_after_school_insert
after insert on public.schools
for each row execute function public.seed_default_observation_options_for_new_school();

create or replace function public.protect_default_observation_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.label = any (array['Laudo (DI)', 'Laudo (TEA)', 'Não alfabetizado', 'Ocorrência']) then
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

revoke all on function public.protect_default_observation_options() from public, anon, authenticated;

drop trigger if exists protect_default_observation_options_before_change on public.observation_options;
create trigger protect_default_observation_options_before_change
before update or delete on public.observation_options
for each row execute function public.protect_default_observation_options();

commit;
