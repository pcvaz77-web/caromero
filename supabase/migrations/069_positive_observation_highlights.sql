alter table public.observation_options
  add column if not exists is_positive_highlight boolean not null default false;

update public.observation_options as observation
set is_positive_highlight = true
from public.schools as school
where school.id = observation.school_id
  and lower(btrim(school.name)) = lower(btrim('Colégio Estadual Paulo Freire'))
  and lower(btrim(observation.label)) like lower('Excelente Aluno%');
