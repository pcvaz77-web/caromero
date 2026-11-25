-- Remove eletivas e clubes junto com seus vínculos, em uma única transação.
begin;

create or replace function public.delete_cepi_group(p_school_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text;
begin
  if not public.is_cepi_coordinator(p_school_id) then
    raise exception 'Sem permissão para excluir registros do Meu CEPI nesta escola.';
  end if;

  select g.kind
    into v_kind
    from public.cepi_groups g
   where g.school_id = p_school_id
     and g.id = p_group_id
   for update;

  if not found then
    return;
  end if;

  if v_kind not in ('eletiva', 'clube') then
    raise exception 'Esta operação permite excluir apenas eletivas e clubes.';
  end if;

  delete from public.cepi_group_students
   where school_id = p_school_id and group_id = p_group_id;

  delete from public.cepi_group_classes
   where school_id = p_school_id and group_id = p_group_id;

  delete from public.cepi_groups
   where school_id = p_school_id and id = p_group_id;
end;
$function$;

revoke all on function public.delete_cepi_group(uuid, uuid) from public, anon;
grant execute on function public.delete_cepi_group(uuid, uuid) to authenticated;

commit;
