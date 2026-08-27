-- CARÔMETRO COMERCIAL
-- Alterações atômicas de papel e permissões dentro da escola.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

-- Todo vínculo precisa de sua linha de permissões, inclusive quando for criado
-- por um fluxo novo no futuro. O backfill é idempotente e não modifica nenhuma
-- permissão já configurada.
insert into public.school_member_permissions (member_id)
select sm.id
from public.school_members sm
left join public.school_member_permissions smp on smp.member_id = sm.id
where smp.member_id is null
on conflict (member_id) do nothing;

create or replace function public.ensure_school_member_permissions()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.school_member_permissions (member_id)
  values (new.id)
  on conflict (member_id) do nothing;
  return new;
end;
$function$;

revoke all on function public.ensure_school_member_permissions()
from public, anon, authenticated;

drop trigger if exists ensure_school_member_permissions on public.school_members;
create trigger ensure_school_member_permissions
after insert on public.school_members
for each row execute function public.ensure_school_member_permissions();

create or replace function public.set_school_member_permissions_batch(
  target_member_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_item record;
  v_allowed_keys constant text[] := array[
    'can_add_students', 'can_edit_students', 'can_delete_students',
    'can_edit_all', 'can_edit_photo', 'can_edit_name', 'can_edit_class',
    'can_edit_report', 'can_manage_observation_options',
    'can_invite_teachers', 'can_manage_member_permissions',
    'can_view_uniform', 'can_edit_uniform', 'can_mark_all_uniform_received',
    'can_view_occurrences', 'can_register_occurrences',
    'can_edit_occurrences', 'can_delete_occurrences',
    'can_manage_counselors', 'can_view_dashboard', 'can_view_history',
    'can_manage_alerts', 'can_record_followups', 'can_export_reports',
    'can_use_bulk_actions', 'can_view_audit', 'can_view_class_summary'
  ];
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if target_member_id is null
     or p_permissions is null
     or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Conjunto de permissões inválido.';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_permissions)) > cardinality(v_allowed_keys) then
    raise exception 'Conjunto de permissões inválido.';
  end if;

  for v_item in
    select item.key, item.value
    from jsonb_each(p_permissions) item
    order by item.key
  loop
    if not (v_item.key = any(v_allowed_keys))
       or jsonb_typeof(v_item.value) <> 'boolean' then
      raise exception 'Permissão inválida: %.', v_item.key;
    end if;
    perform public.set_school_member_permission(
      target_member_id,
      v_item.key,
      (v_item.value #>> '{}')::boolean
    );
  end loop;
end;
$function$;

revoke all on function public.set_school_member_permissions_batch(uuid, jsonb)
from public, anon;
grant execute on function public.set_school_member_permissions_batch(uuid, jsonb)
to authenticated;

create or replace function public.configure_school_member_role(
  target_member_id uuid,
  new_role text,
  p_permissions jsonb
)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if new_role not in ('coordinator', 'teacher') then
    raise exception 'Função inválida.';
  end if;
  if p_permissions is null
     or jsonb_typeof(p_permissions) <> 'object'
     or not (p_permissions ?& array[
       'can_add_students', 'can_edit_students', 'can_delete_students',
       'can_edit_all', 'can_edit_photo', 'can_edit_name', 'can_edit_class',
       'can_edit_report', 'can_manage_observation_options',
       'can_invite_teachers', 'can_manage_member_permissions',
       'can_view_uniform', 'can_edit_uniform', 'can_mark_all_uniform_received',
       'can_view_occurrences', 'can_register_occurrences',
       'can_edit_occurrences', 'can_delete_occurrences',
       'can_manage_counselors', 'can_view_dashboard', 'can_view_history',
       'can_manage_alerts', 'can_record_followups', 'can_export_reports',
       'can_use_bulk_actions', 'can_view_audit', 'can_view_class_summary'
     ]::text[]) then
    raise exception 'Configuração completa de permissões é obrigatória.';
  end if;

  -- As duas operações pertencem à mesma chamada/transação. Qualquer falha
  -- nas permissões desfaz também a alteração de papel.
  perform public.set_school_member_role(target_member_id, new_role);
  perform public.set_school_member_permissions_batch(target_member_id, p_permissions);
end;
$function$;

revoke all on function public.configure_school_member_role(uuid, text, jsonb)
from public, anon;
grant execute on function public.configure_school_member_role(uuid, text, jsonb)
to authenticated;

commit;
