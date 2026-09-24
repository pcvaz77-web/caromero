-- Um único controle do proprietário para exibir o link de atividades no
-- Carômetro e no Assistente SIAP. Começa desligado até a liberação explícita.
begin;

alter table public.platform_settings
  add column if not exists show_activity_site boolean not null default false;

create or replace function public.platform_set_activity_site_visibility(p_show_activity_site boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous_visibility boolean;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;
  if p_show_activity_site is null then
    raise exception 'Visibilidade inválida.';
  end if;

  select show_activity_site into v_previous_visibility
  from public.platform_settings where id = true for update;
  if not found then
    raise exception 'Configuração da plataforma não encontrada.';
  end if;

  update public.platform_settings
  set show_activity_site = p_show_activity_site, updated_at = now()
  where id = true;

  perform public.record_platform_audit(
    'activity_site_visibility_changed', null, null,
    jsonb_build_object('show_activity_site', v_previous_visibility),
    jsonb_build_object('show_activity_site', p_show_activity_site)
  );
end;
$function$;

revoke all on function public.platform_set_activity_site_visibility(boolean) from public, anon;
grant execute on function public.platform_set_activity_site_visibility(boolean) to authenticated;

commit;
