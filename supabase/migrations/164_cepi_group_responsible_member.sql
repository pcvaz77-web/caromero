begin;

alter table public.cepi_groups
  add column responsible_user_id uuid references auth.users(id) on delete set null;

create or replace function public.validate_cepi_group_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.responsible_user_id is not null and not exists (
    select 1 from public.school_members sm
    where sm.school_id = new.school_id
      and sm.user_id = new.responsible_user_id
      and sm.status = 'active'
  ) then
    raise exception 'Selecione um usuário ativo desta escola.';
  end if;
  return new;
end;
$function$;

create trigger cepi_groups_responsible_member
before insert or update of responsible_user_id, school_id
on public.cepi_groups
for each row execute function public.validate_cepi_group_responsible();

revoke all on function public.validate_cepi_group_responsible() from public, anon;

commit;
