begin;

-- Dados opcionais do responsável. A marcação controla somente a exibição
-- da etiqueta no card; os dados continuam vinculados ao aluno e à escola.
alter table public.students
  add column if not exists guardian_name text null,
  add column if not exists guardian_phone text null,
  add column if not exists show_guardian_on_card boolean not null default false;

alter table public.students
  drop constraint if exists students_guardian_name_length,
  add constraint students_guardian_name_length check (
    guardian_name is null or (
      guardian_name = btrim(guardian_name)
      and char_length(guardian_name) between 1 and 160
    )
  ),
  drop constraint if exists students_guardian_phone_length,
  add constraint students_guardian_phone_length check (
    guardian_phone is null or (
      guardian_phone = btrim(guardian_phone)
      and char_length(guardian_phone) between 1 and 40
    )
  );

comment on column public.students.guardian_name is
  'Nome opcional do responsável pelo aluno.';
comment on column public.students.guardian_phone is
  'Número de contato opcional do responsável pelo aluno.';
comment on column public.students.show_guardian_on_card is
  'Quando verdadeiro, exibe nome e/ou número do responsável como etiqueta no card do aluno.';

alter table public.school_member_permissions
  add column if not exists can_edit_guardian_contact boolean not null default false;

comment on column public.school_member_permissions.can_edit_guardian_contact is
  'Permite editar nome, número e exibição no card dos dados do responsável pelo aluno.';

-- Quem já possuía "Editar tudo" mantém o mesmo alcance funcional depois da
-- inclusão da nova coluna. Os demais perfis começam com a opção desmarcada.
update public.school_member_permissions
set can_edit_guardian_contact=true, updated_at=now()
where can_edit_all=true;

-- Permissão específica, sempre limitada ao vínculo ativo da escola.
create or replace function public.can_edit_student_guardian_contact(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=target_school_id
      and sm.user_id=auth.uid()
      and sm.status='active'
      and (
        sm.role='school_admin'
        or coalesce(p.can_edit_all,false)
        or coalesce(p.can_edit_guardian_contact,false)
      )
  );
$function$;

revoke all on function public.can_edit_student_guardian_contact(uuid) from public, anon;
grant execute on function public.can_edit_student_guardian_contact(uuid) to authenticated;

-- A RLS precisa admitir a atualização quando esta for a única permissão do
-- membro. O trigger abaixo restringe a escrita exclusivamente às três colunas.
drop policy if exists "authorized_school_members_can_edit_students" on public.students;
create policy "authorized_school_members_can_edit_students"
on public.students
for update
to authenticated
using (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_all')
    or public.has_school_permission(school_id, 'can_edit_photo')
    or public.has_school_permission(school_id, 'can_edit_name')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_report')
    or public.has_school_permission(school_id, 'can_edit_uniform')
    or public.can_edit_student_guardian_contact(school_id)
  )
)
with check (
  school_id is not null
  and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_edit_students')
    or public.has_school_permission(school_id, 'can_edit_all')
    or public.has_school_permission(school_id, 'can_edit_photo')
    or public.has_school_permission(school_id, 'can_edit_name')
    or public.has_school_permission(school_id, 'can_edit_class')
    or public.has_school_permission(school_id, 'can_edit_report')
    or public.has_school_permission(school_id, 'can_edit_uniform')
    or public.can_edit_student_guardian_contact(school_id)
  )
);

create or replace function public.enforce_student_guardian_contact_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_guardian_data boolean;
  v_guardian_changed boolean;
begin
  v_has_guardian_data := new.guardian_name is not null
    or new.guardian_phone is not null
    or new.show_guardian_on_card;

  v_guardian_changed := tg_op='INSERT' and v_has_guardian_data;
  if tg_op='UPDATE' then
    v_guardian_changed := old.guardian_name is distinct from new.guardian_name
      or old.guardian_phone is distinct from new.guardian_phone
      or old.show_guardian_on_card is distinct from new.show_guardian_on_card;
  end if;

  if v_guardian_changed
     and not public.can_edit_student_guardian_contact(new.school_id) then
    raise exception 'Sem permissao para editar os dados do responsavel pelo aluno';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_student_guardian_contact_permission()
from public, anon, authenticated;

drop trigger if exists enforce_student_guardian_contact_permission on public.students;
create trigger enforce_student_guardian_contact_permission
before insert or update on public.students
for each row execute function public.enforce_student_guardian_contact_permission();

-- Inclui a nova chave nas RPCs de delegação, preservando as mesmas regras de
-- hierarquia e antiescalada usadas pelas demais permissões.
create or replace function public.set_school_member_permission(
  target_member_id uuid,
  permission_name text,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.school_members%rowtype;
  v_target public.school_members%rowtype;
  v_actor_has_permission boolean := false;
  v_allowed_keys constant text[] := array[
    'can_add_students','can_edit_students','can_delete_students','can_edit_all',
    'can_edit_photo','can_edit_name','can_edit_class','can_edit_report',
    'can_edit_guardian_contact','can_manage_observation_options',
    'can_invite_teachers','can_manage_member_permissions',
    'can_view_uniform','can_edit_uniform','can_mark_all_uniform_received',
    'can_view_occurrences','can_register_occurrences','can_edit_occurrences',
    'can_delete_occurrences','can_manage_counselors','can_view_dashboard',
    'can_view_history','can_manage_alerts','can_record_followups',
    'can_export_reports','can_use_bulk_actions','can_view_audit',
    'can_view_class_summary','can_import_school_daily_attendance',
    'can_receive_notifications'
  ];
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  if not (permission_name=any(v_allowed_keys)) then raise exception 'Permissao invalida.'; end if;

  select * into v_target from public.school_members where id=target_member_id;
  if not found then raise exception 'Membro nao encontrado.'; end if;
  select * into v_actor from public.school_members
  where school_id=v_target.school_id and user_id=auth.uid() and status='active' limit 1;
  if not found then raise exception 'Voce nao possui acesso ativo a esta escola.'; end if;
  if v_actor.id=v_target.id then raise exception 'Voce nao pode alterar suas proprias permissoes.'; end if;
  if v_target.role='school_admin' then raise exception 'As permissoes do administrador sao determinadas pelo papel.'; end if;

  if v_actor.role='school_admin' then
    null;
  elsif v_actor.role in ('coordinator','secretary')
        and v_target.role='teacher'
        and public.can_manage_school_member_permissions(v_target.school_id) then
    if permission_value then
      execute pg_catalog.format(
        'select coalesce(%I,false) from public.school_member_permissions where member_id=$1',
        permission_name
      ) into v_actor_has_permission using v_actor.id;
      if not coalesce(v_actor_has_permission,false) then
        raise exception 'Voce nao pode conceder uma permissao que nao possui.';
      end if;
    end if;
  else
    raise exception 'Voce nao possui permissao para gerenciar este membro.';
  end if;

  if permission_value and v_target.role='teacher' and permission_name in (
    'can_manage_observation_options','can_invite_teachers',
    'can_manage_member_permissions','can_manage_counselors',
    'can_import_school_daily_attendance','can_receive_notifications'
  ) then
    raise exception 'Esta permissao nao pode ser concedida a professores.';
  end if;

  if permission_value and v_target.role='coordinator'
     and permission_name in ('can_import_school_daily_attendance','can_receive_notifications') then
    raise exception 'Esta permissao pertence ao perfil Secretaria.';
  end if;

  if permission_value and v_target.role='secretary'
     and permission_name='can_manage_counselors' then
    raise exception 'Secretaria nao pode gerenciar nem ser conselheiro de turma.';
  end if;

  insert into public.school_member_permissions(member_id) values(v_target.id)
  on conflict(member_id) do nothing;
  execute pg_catalog.format(
    'update public.school_member_permissions set %I=$1, updated_at=now() where member_id=$2',
    permission_name
  ) using coalesce(permission_value,false),v_target.id;
end;
$function$;

revoke all on function public.set_school_member_permission(uuid,text,boolean) from public, anon;
grant execute on function public.set_school_member_permission(uuid,text,boolean) to authenticated;

create or replace function public.set_school_member_permissions_batch(
  target_member_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item record;
  v_allowed_keys constant text[] := array[
    'can_add_students','can_edit_students','can_delete_students','can_edit_all',
    'can_edit_photo','can_edit_name','can_edit_class','can_edit_report',
    'can_edit_guardian_contact','can_manage_observation_options',
    'can_invite_teachers','can_manage_member_permissions',
    'can_view_uniform','can_edit_uniform','can_mark_all_uniform_received',
    'can_view_occurrences','can_register_occurrences','can_edit_occurrences',
    'can_delete_occurrences','can_manage_counselors','can_view_dashboard',
    'can_view_history','can_manage_alerts','can_record_followups',
    'can_export_reports','can_use_bulk_actions','can_view_audit',
    'can_view_class_summary','can_import_school_daily_attendance',
    'can_receive_notifications'
  ];
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  if target_member_id is null or p_permissions is null
     or jsonb_typeof(p_permissions)<>'object' then
    raise exception 'Conjunto de permissoes invalido.';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_permissions))>cardinality(v_allowed_keys) then
    raise exception 'Conjunto de permissoes invalido.';
  end if;
  for v_item in select item.key,item.value from jsonb_each(p_permissions) item order by item.key loop
    if not(v_item.key=any(v_allowed_keys)) or jsonb_typeof(v_item.value)<>'boolean' then
      raise exception 'Permissao invalida: %.',v_item.key;
    end if;
    perform public.set_school_member_permission(
      target_member_id,v_item.key,(v_item.value#>>'{}')::boolean
    );
  end loop;
end;
$function$;

revoke all on function public.set_school_member_permissions_batch(uuid,jsonb) from public, anon;
grant execute on function public.set_school_member_permissions_batch(uuid,jsonb) to authenticated;

-- O papel Secretaria continua nascendo somente com a frequência própria.
create or replace function public.reset_secretary_permissions(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.school_member_permissions (member_id)
  values (p_member_id)
  on conflict (member_id) do nothing;

  update public.school_member_permissions set
    can_add_students=false, can_edit_students=false, can_delete_students=false,
    can_edit_all=false, can_edit_photo=false, can_edit_name=false,
    can_edit_class=false, can_edit_report=false,
    can_edit_guardian_contact=false,
    can_manage_observation_options=false, can_invite_teachers=false,
    can_manage_member_permissions=false, can_view_uniform=false,
    can_edit_uniform=false, can_mark_all_uniform_received=false,
    can_view_occurrences=false, can_register_occurrences=false,
    can_edit_occurrences=false, can_delete_occurrences=false,
    can_manage_counselors=false, can_view_dashboard=false,
    can_view_history=false, can_manage_alerts=false,
    can_record_followups=false, can_export_reports=false,
    can_use_bulk_actions=false, can_view_audit=false,
    can_view_class_summary=false, can_use_siap_assistant=false,
    can_import_siap_attendance=false,
    can_import_school_daily_attendance=true,
    can_receive_notifications=false, can_prepare_school_year=false,
    updated_at=now()
  where member_id=p_member_id;
end;
$function$;

revoke all on function public.reset_secretary_permissions(uuid)
from public, anon, authenticated;

commit;
