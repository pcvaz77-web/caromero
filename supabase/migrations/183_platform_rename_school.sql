-- Renomeia somente o nome visível da escola; o slug e os vínculos permanecem estáveis.
begin;

create or replace function public.platform_rename_school(
  p_school_id uuid,
  p_expected_name text,
  p_new_name text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_name text;
  v_new_name text := btrim(coalesce(p_new_name, ''));
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if char_length(v_new_name) < 3 or char_length(v_new_name) > 160 then
    raise exception 'Informe um nome de escola entre 3 e 160 caracteres.';
  end if;

  select name into v_previous_name
  from public.schools
  where id = p_school_id and status <> 'archived'
  for update;

  if not found then
    raise exception 'Escola não encontrada ou arquivada.';
  end if;

  if v_previous_name is distinct from p_expected_name then
    raise exception 'O nome da escola mudou desde que a lista foi carregada. Atualize o painel e tente novamente.';
  end if;

  if v_previous_name = v_new_name then
    return;
  end if;

  update public.schools
  set name = v_new_name, updated_at = now()
  where id = p_school_id;

  perform public.record_platform_audit(
    'school_name_changed',
    p_school_id,
    null,
    jsonb_build_object('school_name', v_previous_name),
    jsonb_build_object('school_name', v_new_name)
  );
end;
$function$;

revoke all on function public.platform_rename_school(uuid, text, text) from public;
revoke all on function public.platform_rename_school(uuid, text, text) from anon;
grant execute on function public.platform_rename_school(uuid, text, text) to authenticated;

commit;
