begin;

-- NULL means the default for this role: all five areas are available to a secretary.
-- An explicit FALSE revokes one area without changing any other school permission.
alter table public.school_member_permissions
  add column if not exists can_family_invite boolean default null,
  add column if not exists can_family_add_child boolean default null,
  add column if not exists can_family_occurrences boolean default null,
  add column if not exists can_family_entries boolean default null,
  add column if not exists can_family_cards boolean default null;

create or replace function public.family_can_school_action(p_school_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members m
    join public.schools s on s.id=m.school_id and s.status='active'
    left join public.school_member_permissions p on p.member_id=m.id
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active'
      and (m.role='school_admin'
        or (m.role='coordinator' and coalesce(p.can_manage_family_portal,true))
        or (m.role='secretary' and case p_action
          when 'invite' then coalesce(p.can_family_invite,true)
          when 'add_child' then coalesce(p.can_family_add_child,true)
          when 'occurrences' then coalesce(p.can_family_occurrences,true)
          when 'entries' then coalesce(p.can_family_entries,true)
          when 'cards' then coalesce(p.can_family_cards,true)
          when 'portal' then coalesce(p.can_family_invite,true) or coalesce(p.can_family_add_child,true)
            or coalesce(p.can_family_occurrences,true) or coalesce(p.can_family_entries,true)
            or coalesce(p.can_family_cards,true)
          when 'overview' then coalesce(p.can_family_invite,true) or coalesce(p.can_family_occurrences,true)
          else false end))
  );
$$;
revoke all on function public.family_can_school_action(uuid,text) from public,anon;
grant execute on function public.family_can_school_action(uuid,text) to authenticated;

-- Sharing an occurrence requires reading its text and remarks in the picker.
create policy family_secretary_can_select_occurrences
on public.student_occurrences for select to authenticated
using (public.family_can_school_action(school_id,'occurrences'));

create or replace function public.family_can_add_existing_child(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.family_can_school_action(p_school_id,'add_child');
$$;

create or replace function public.set_family_secretary_permission(
  target_member_id uuid, permission_name text, permitted boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.school_members%rowtype;
begin
  if auth.uid() is null or target_member_id is null or permitted is null or
     permission_name <> all(array['can_family_invite','can_family_add_child',
       'can_family_occurrences','can_family_entries','can_family_cards']) then
    raise exception 'Permissão inválida.' using errcode='22023';
  end if;
  select * into v_target from public.school_members
    where id=target_member_id and role='secretary' and status='active';
  if not found or not exists (
    select 1 from public.school_members actor join public.schools s on s.id=actor.school_id
    where actor.school_id=v_target.school_id and actor.user_id=auth.uid()
      and actor.role='school_admin' and actor.status='active' and s.status='active'
  ) then raise exception 'Somente o administrador desta escola pode alterar a permissão da Secretaria.' using errcode='42501'; end if;
  insert into public.school_member_permissions(member_id) values(v_target.id) on conflict do nothing;
  execute pg_catalog.format(
    'update public.school_member_permissions set %I=$1,updated_at=now() where member_id=$2',
    permission_name) using permitted,v_target.id;
end;
$$;
revoke all on function public.set_family_secretary_permission(uuid,text,boolean) from public,anon;
grant execute on function public.set_family_secretary_permission(uuid,text,boolean) to authenticated;

-- Existing RPCs retain their validation and data projections. Only their
-- authorization predicate changes, with one capability per portal area.
do $migration$
declare v_item record; v_oid oid; v_definition text; v_rewritten text; v_changed integer;
begin
  for v_item in select * from (values
    ('family_create_invitation','invite'),
    ('family_create_invitation_bundle','invite'),
    ('family_cpf_register','invite'),
    ('family_cpf_register_bundle','invite'),
    ('family_cpf_register_bundle_contact','invite'),
    ('family_cpf_create_individual_invite','invite'),
    ('family_set_student_registrations','invite'),
    ('family_cpf_school_roster','invite'),
    ('family_cpf_find_guardian','invite'),
    ('family_cpf_remove_child','invite'),
    ('family_cpf_remove_guardian','invite'),
    ('family_school_overview','overview'),
    ('family_revoke_link','invite'),
    ('family_remove_school_guardian','invite'),
    ('family_publish_occurrence','occurrences'),
    ('family_withdraw_message','occurrences'),
    ('family_issue_cards','cards'),
    ('family_issue_card','cards'),
    ('family_reissue_card','cards'),
    ('family_digital_card_setting','cards'),
    ('family_lookup_card','entries'),
    ('family_record_entry','entries'),
    ('family_publish_entry','entries'),
    ('family_recent_entries','entries'),
    ('family_entry_history','entries'),
    ('family_entry_name_suggestions','entries'),
    ('family_delete_entry','entries')
  ) as mapped(name,action) loop
    v_changed := 0;
    for v_oid in select p.oid from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_item.name loop
      v_definition := pg_catalog.pg_get_functiondef(v_oid);
      v_rewritten := replace(v_definition,'public.family_school_manager(p_school_id)',
        pg_catalog.format('public.family_can_school_action(p_school_id,%L)',v_item.action));
      if v_rewritten<>v_definition then
        execute v_rewritten;
        v_changed := v_changed+1;
      end if;
    end loop;
    if v_changed=0 then raise exception 'Guarda de permissão ausente: %',v_item.name; end if;
  end loop;
end;
$migration$;

-- The class attendance publish RPC had a separate role check.
do $migration$
declare v_definition text; v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef('public.family_entry_attendance_publish(uuid,uuid,date,date)'::regprocedure)
    into v_definition;
  v_rewritten := replace(v_definition,
    $old$v_role in ('school_admin','coordinator')$old$,
    $new$v_role in ('school_admin','coordinator') or (v_role='secretary' and public.family_can_school_action(p_school_id,'entries'))$new$);
  if v_rewritten=v_definition then raise exception 'Guarda de publicação da frequência não encontrada'; end if;
  execute v_rewritten;
end;
$migration$;

commit;
