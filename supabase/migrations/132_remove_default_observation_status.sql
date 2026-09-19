-- CARÔMETRO COMERCIAL
-- Remove o conceito de observações obrigatórias/padrão.
-- As opções já existentes são preservadas e passam a ser gerenciáveis.

begin;

drop trigger if exists seed_default_observation_options_after_school_insert
on public.schools;

drop function if exists public.seed_default_observation_options_for_new_school();
drop function if exists public.seed_default_observation_options(uuid);

drop trigger if exists protect_default_observation_options_before_change
on public.observation_options;

drop function if exists public.protect_default_observation_options();

commit;
