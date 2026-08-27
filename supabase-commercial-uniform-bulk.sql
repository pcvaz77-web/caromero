-- CARÔMETRO COMERCIAL
-- Ação coletiva de uniforme limitada obrigatoriamente à escola ativa.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

do $legacy$
begin
  if to_regprocedure('public.mark_all_uniform_received(uuid)') is not null then
    execute 'revoke all on function public.mark_all_uniform_received(uuid) from public, anon, authenticated';
  end if;
end;
$legacy$;

create or replace function public.mark_all_uniform_received(
  target_school_id uuid,
  target_class_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_affected integer;
begin
  if auth.uid() is null
     or target_school_id is null
     or not public.is_active_school_member(target_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if not public.has_school_permission(target_school_id, 'can_mark_all_uniform_received')
     and not public.has_school_permission(target_school_id, 'can_edit_all') then
    raise exception 'Sem permissão para marcar todos como receberam.';
  end if;

  if target_class_id is not null and not exists (
    select 1 from public.classes c
    where c.id = target_class_id
      and c.school_id = target_school_id
  ) then
    raise exception 'A turma não pertence à escola ativa.';
  end if;

  perform set_config('app.uniform_bulk_update', 'true', true);

  update public.students s
  set uniform_pending = null,
      uniform_received = true,
      shoes_received = true,
      material_received = true
  where s.school_id = target_school_id
    and (target_class_id is null or s.class_id = target_class_id);

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$function$;

revoke all on function public.mark_all_uniform_received(uuid, uuid) from public, anon;
grant execute on function public.mark_all_uniform_received(uuid, uuid) to authenticated;

commit;
