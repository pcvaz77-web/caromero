-- Permite excluir uma conta do Auth sem apagar registros escolares históricos.
-- A autoria textual já fica preservada nas colunas de nome; os UUIDs passam a
-- NULL quando a conta correspondente deixa de existir.

begin;

alter table public.livro_revisa_deliveries
  alter column recorded_by drop not null;

alter table public.livro_revisa_deliveries
  drop constraint if exists livro_revisa_deliveries_recorded_by_fkey,
  add constraint livro_revisa_deliveries_recorded_by_fkey
    foreign key (recorded_by) references auth.users(id) on delete set null;

alter table public.livro_revisa_deliveries
  drop constraint if exists livro_revisa_deliveries_corrected_by_fkey,
  add constraint livro_revisa_deliveries_corrected_by_fkey
    foreign key (corrected_by) references auth.users(id) on delete set null;

alter table public.student_occurrences
  drop constraint if exists student_occurrences_updated_by_fkey,
  add constraint student_occurrences_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

-- O GoTrue executa as ações SET NULL como supabase_auth_admin, sem JWT. As
-- duas funções abaixo devem aceitar apenas essa manutenção referencial
-- interna; as travas normais continuam iguais para usuários da aplicação.
create or replace function public.lock_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null and session_user = 'supabase_auth_admin' then
    return new;
  end if;

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
$function$;

create or replace function public.set_occurrence_responsible()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null and session_user = 'supabase_auth_admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;

    new.updated_by := auth.uid();
    select coalesce(nullif(pg_catalog.btrim(full_name), ''), nullif(pg_catalog.btrim(email), ''), 'Não informado')
      into new.updated_by_name
    from public.profiles
    where id = auth.uid();
    new.updated_by_name := coalesce(new.updated_by_name, 'Não informado');
    new.updated_at := now();
    return new;
  end if;

  new.created_by := auth.uid();
  select coalesce(nullif(pg_catalog.btrim(full_name), ''), nullif(pg_catalog.btrim(email), ''), 'Não informado')
    into new.created_by_name
  from public.profiles
  where id = auth.uid();
  new.created_by_name := coalesce(new.created_by_name, 'Não informado');
  return new;
end;
$function$;

revoke all on function public.lock_occurrence_identity() from public;
revoke all on function public.set_occurrence_responsible() from public;

commit;
