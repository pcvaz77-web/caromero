-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- As turmas já cadastradas recebem automaticamente o turno Matutino.
alter table public.classes
  add column if not exists shift text not null default 'Matutino'
  check (shift in ('Matutino', 'Vespertino', 'Noturno'));

update public.classes
set shift = 'Matutino'
where shift is null;
