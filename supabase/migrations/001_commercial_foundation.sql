-- CARÔMETRO COMERCIAL
-- Fundação multi-escola
-- Este arquivo pertence exclusivamente à versão comercial.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schools_name_check
    check (char_length(trim(name)) >= 3),

  constraint schools_slug_check
    check (
      slug = lower(slug)
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),

  constraint schools_status_check
    check (status in ('active', 'suspended'))
);

alter table public.schools enable row level security;

-- Vínculo entre usuários e escolas.
-- Cada registro representa a participação de um usuário em uma escola.

create table if not exists public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_members_school_fkey
    foreign key (school_id)
    references public.schools(id)
    on delete cascade,

  constraint school_members_user_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete cascade,

  constraint school_members_school_user_unique
    unique (school_id, user_id),

  constraint school_members_role_check
    check (role in ('school_admin', 'coordinator', 'teacher')),

  constraint school_members_status_check
    check (status in ('active', 'suspended'))
);

alter table public.school_members enable row level security;

-- Convites para entrada de usuários em uma escola.
-- A senha nunca é criada pelo administrador/coordenador.
-- O usuário convidado cria a própria senha no processo de aceite.

create table if not exists public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  school_id uuid not null,
  email text not null check (email = lower(trim(email))),
  role text not null,
  invited_by uuid not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint school_invitations_school_fkey
    foreign key (school_id)
    references public.schools(id)
    on delete cascade,

  constraint school_invitations_invited_by_fkey
    foreign key (invited_by)
    references auth.users(id)
    on delete restrict,

  constraint school_invitations_role_check
    check (role in ('coordinator', 'teacher')),

  constraint school_invitations_status_check
    check (status in ('pending', 'accepted', 'cancelled', 'expired'))
);

create index if not exists school_invitations_school_email_idx
  on public.school_invitations (school_id, lower(email));

-- Convites vencidos deixam de ocupar a chave de convite pendente. Em seguida,
-- a restrição parcial impede duplicidade inclusive sob duas chamadas
-- concorrentes de criação para o mesmo e-mail e escola.
update public.school_invitations
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

do $$
begin
  if exists (
    select 1
    from public.school_invitations i
    where i.status = 'pending'
    group by i.school_id, lower(trim(i.email))
    having count(*) > 1
  ) then
    raise exception 'Existem convites pendentes duplicados. Resolva-os antes de aplicar a fundação comercial.';
  end if;
end $$;

create unique index if not exists school_invitations_one_pending_per_email
  on public.school_invitations (school_id, lower(email))
  where status = 'pending';

alter table public.school_invitations enable row level security;

-- Permissões do usuário dentro de uma escola.
-- As permissões pertencem ao vínculo school_members,
-- e não ao usuário globalmente.

create table if not exists public.school_member_permissions (
  member_id uuid primary key,

  can_add_students boolean not null default false,
  can_edit_students boolean not null default false,
  can_delete_students boolean not null default false,

  can_edit_all boolean not null default false,
  can_edit_photo boolean not null default false,
  can_edit_name boolean not null default false,
  can_edit_class boolean not null default false,
  can_edit_report boolean not null default false,

  can_manage_observation_options boolean not null default false,
  can_invite_teachers boolean not null default false,
  can_manage_member_permissions boolean not null default false,

  can_view_uniform boolean not null default false,
  can_edit_uniform boolean not null default false,
  can_mark_all_uniform_received boolean not null default false,

  can_view_occurrences boolean not null default false,
  can_register_occurrences boolean not null default false,
  can_edit_occurrences boolean not null default false,
  can_delete_occurrences boolean not null default false,

  can_manage_counselors boolean not null default false,

  can_view_dashboard boolean not null default false,
  can_view_history boolean not null default false,
  can_manage_alerts boolean not null default false,
  can_record_followups boolean not null default false,
  can_export_reports boolean not null default false,
  can_use_bulk_actions boolean not null default false,
  can_view_audit boolean not null default false,
  can_view_class_summary boolean not null default false,

  updated_at timestamptz not null default now(),

  constraint school_member_permissions_member_fkey
    foreign key (member_id)
    references public.school_members(id)
    on delete cascade
);

alter table public.school_member_permissions enable row level security;

-- Aceita um convite exclusivo para uma escola.
-- O usuário precisa estar autenticado e usar o mesmo e-mail do convite.

create or replace function public.accept_school_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.school_invitations%rowtype;
  v_user_id uuid;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_member_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select lower(trim(email)), email_confirmed_at
    into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    raise exception 'E-mail do usuário não encontrado.';
  end if;

  if v_email_confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de aceitar o convite.';
  end if;

  select *
    into v_invitation
  from public.school_invitations
  where token = invitation_token
  for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Este convite não está mais disponível.';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Este convite expirou.';
  end if;

  if lower(trim(v_invitation.email)) <> v_user_email then
    raise exception 'Este convite pertence a outro usuário.';
  end if;

  insert into public.school_members (
    school_id,
    user_id,
    role,
    status
  )
  values (
    v_invitation.school_id,
    v_user_id,
    v_invitation.role,
    'active'
  )
  on conflict (school_id, user_id)
  do nothing
  returning id into v_member_id;

    if v_member_id is null then
    raise exception 'Este usuário já pertence a esta escola.';
  end if;

  -- Cria a linha inicial de permissões do novo vínculo.
  -- Todas começam como false e depois são concedidas conforme a hierarquia.
  insert into public.school_member_permissions (member_id)
  values (v_member_id)
  on conflict (member_id) do nothing;

  update public.school_invitations
  set
    status = 'accepted',
    accepted_at = now()
  where id = v_invitation.id;

  return v_member_id;
end;
$$;

-- Segurança da função de aceite de convite.
-- Somente usuários autenticados podem executá-la.

revoke all on function public.accept_school_invitation(uuid) from public;
revoke all on function public.accept_school_invitation(uuid) from anon;

grant execute on function public.accept_school_invitation(uuid) to authenticated;

-- Verifica se o usuário autenticado possui vínculo ativo com uma escola.
-- SECURITY DEFINER evita recursão das policies de school_members.

create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  );
$$;

revoke all on function public.is_active_school_member(uuid) from public;
revoke all on function public.is_active_school_member(uuid) from anon;
grant execute on function public.is_active_school_member(uuid) to authenticated;

-- Verifica se o usuário autenticado é administrador ativo da escola.

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.role = 'school_admin'
      and sm.status = 'active'
  );
$$;

revoke all on function public.is_school_admin(uuid) from public;
revoke all on function public.is_school_admin(uuid) from anon;
grant execute on function public.is_school_admin(uuid) to authenticated;

-- Verifica se o usuário autenticado é coordenador ativo da escola.

create or replace function public.is_school_coordinator(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.role = 'coordinator'
      and sm.status = 'active'
  );
$$;

revoke all on function public.is_school_coordinator(uuid) from public;
revoke all on function public.is_school_coordinator(uuid) from anon;
grant execute on function public.is_school_coordinator(uuid) to authenticated;

-- RLS: escolas.
-- Um usuário só pode visualizar escolas das quais é membro ativo.

create policy "school_members_can_view_their_school"
on public.schools
for select
to authenticated
using (
  public.is_active_school_member(id)
);

-- RLS: membros da escola.
-- Usuários ativos podem visualizar os membros das escolas às quais pertencem.

create policy "active_members_can_view_school_members"
on public.school_members
for select
to authenticated
using (
  public.is_active_school_member(school_id)
);

-- Cria um convite exclusivo para entrada em uma escola.
-- Administradores podem convidar coordenadores e professores.
-- Coordenadores autorizados podem convidar somente professores.

create or replace function public.create_school_invitation(
  target_school_id uuid,
  target_email text,
  target_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_inviter_member_id uuid;
  v_inviter_role text;
  v_can_invite_teachers boolean := false;
  v_invitation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_email := lower(trim(target_email));

  if v_email = ''
     or length(v_email) > 320
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  if target_role not in ('coordinator', 'teacher') then
    raise exception 'Função de convite inválida.';
  end if;

  select sm.id, sm.role
    into v_inviter_member_id, v_inviter_role
  from public.school_members sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_inviter_member_id is null then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_inviter_role = 'school_admin' then
    null;

  elsif v_inviter_role = 'coordinator' then
    if target_role <> 'teacher' then
      raise exception 'Coordenadores só podem convidar professores.';
    end if;

    select coalesce(p.can_invite_teachers, false)
      into v_can_invite_teachers
    from public.school_member_permissions p
    where p.member_id = v_inviter_member_id;

    if not v_can_invite_teachers then
      raise exception 'Você não possui permissão para convidar professores.';
    end if;

  else
    raise exception 'Você não possui permissão para enviar convites.';
  end if;

  if exists (
    select 1
    from public.school_members sm
    join auth.users u on u.id = sm.user_id
    where sm.school_id = target_school_id
      and lower(trim(u.email)) = v_email
  ) then
    raise exception 'Este usuário já pertence a esta escola.';
  end if;

  -- Libera a chave parcial de um convite antigo que já venceu, sem alterar
  -- convites válidos nem registros aceitos/cancelados.
  update public.school_invitations i
  set status = 'expired'
  where i.school_id = target_school_id
    and lower(trim(i.email)) = v_email
    and i.status = 'pending'
    and i.expires_at <= now();

  if exists (
    select 1
    from public.school_invitations i
    where i.school_id = target_school_id
      and lower(trim(i.email)) = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.';
  end if;

  begin
    insert into public.school_invitations (
      school_id,
      email,
      role,
      invited_by
    )
    values (
      target_school_id,
      v_email,
      target_role,
      auth.uid()
    )
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Já existe um convite válido pendente para este e-mail nesta escola.';
  end;

  return v_invitation_id;
end;
$$;

revoke all on function public.create_school_invitation(uuid, text, text) from public;
revoke all on function public.create_school_invitation(uuid, text, text) from anon;
grant execute on function public.create_school_invitation(uuid, text, text) to authenticated;

-- RLS: visualização dos convites da escola.
-- Administradores podem visualizar os convites da própria escola.
-- Coordenadores só podem visualizar convites se tiverem permissão
-- para convidar professores, e somente convites destinados a professores.

create policy "authorized_members_can_view_school_invitations"
on public.school_invitations
for select
to authenticated
using (
  public.is_school_admin(school_id)

  or

  (
    role = 'teacher'
    and exists (
      select 1
      from public.school_members sm
      join public.school_member_permissions p
        on p.member_id = sm.id
      where sm.school_id = school_invitations.school_id
        and sm.user_id = auth.uid()
        and sm.role = 'coordinator'
        and sm.status = 'active'
        and p.can_invite_teachers = true
    )
  )
);

-- Cancela com segurança um convite pendente.
-- Administradores podem cancelar convites da própria escola.
-- Coordenadores autorizados podem cancelar somente convites de professores.

create or replace function public.cancel_school_invitation(
  invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.school_invitations%rowtype;
  v_member_id uuid;
  v_member_role text;
  v_can_invite_teachers boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_invitation
  from public.school_invitations
  where id = invitation_id
  for update;

  if not found then
    raise exception 'Convite não encontrado.';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Este convite não pode mais ser cancelado.';
  end if;

  select sm.id, sm.role
    into v_member_id, v_member_role
  from public.school_members sm
  where sm.school_id = v_invitation.school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_member_id is null then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_member_role = 'school_admin' then
    null;

  elsif v_member_role = 'coordinator' then
    if v_invitation.role <> 'teacher' then
      raise exception 'Coordenadores não podem cancelar este convite.';
    end if;

    select coalesce(p.can_invite_teachers, false)
      into v_can_invite_teachers
    from public.school_member_permissions p
    where p.member_id = v_member_id;

    if not v_can_invite_teachers then
      raise exception 'Você não possui permissão para cancelar convites.';
    end if;

  else
    raise exception 'Você não possui permissão para cancelar convites.';
  end if;

  update public.school_invitations
  set status = 'cancelled'
  where id = v_invitation.id;
end;
$$;

revoke all on function public.cancel_school_invitation(uuid) from public;
revoke all on function public.cancel_school_invitation(uuid) from anon;
grant execute on function public.cancel_school_invitation(uuid) to authenticated;

-- Verifica se o coordenador autenticado pode gerenciar
-- permissões de professores dentro desta escola.

create or replace function public.can_manage_school_member_permissions(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_members sm
    join public.school_member_permissions p
      on p.member_id = sm.id
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.role = 'coordinator'
      and sm.status = 'active'
      and p.can_manage_member_permissions = true
  );
$$;

revoke all on function public.can_manage_school_member_permissions(uuid) from public;
revoke all on function public.can_manage_school_member_permissions(uuid) from anon;
grant execute on function public.can_manage_school_member_permissions(uuid) to authenticated;

-- Altera uma permissão específica de um membro da escola.
-- A validação de autoridade é feita no banco.

create or replace function public.set_school_member_permission(
  target_member_id uuid,
  permission_name text,
  permission_value boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.school_members%rowtype;
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  select *
    into v_actor
  from public.school_members
  where school_id = v_target.school_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_actor.id = v_target.id then
    raise exception 'Você não pode alterar suas próprias permissões.';
  end if;  -- Administrador pode alterar permissões de coordenadores e professores
  -- da própria escola, mas nunca de outro administrador.

  if v_actor.role = 'school_admin' then
    if v_target.role = 'school_admin' then
      raise exception 'Não é permitido alterar permissões de outro administrador.';
    end if;

  -- Coordenador precisa de autorização específica e só pode
  -- administrar permissões de professores.
  elsif v_actor.role = 'coordinator' then

    if v_target.role <> 'teacher' then
      raise exception 'Coordenadores só podem alterar permissões de professores.';
    end if;

    if not public.can_manage_school_member_permissions(v_target.school_id) then
      raise exception 'Você não possui permissão para gerenciar permissões de professores.';
    end if;

  else
    raise exception 'Você não possui permissão para gerenciar permissões.';
  end if;  -- Apenas permissões conhecidas podem ser alteradas.

  if permission_name not in (
    'can_add_students',
    'can_edit_students',
    'can_delete_students',
    'can_edit_all',
    'can_edit_photo',
    'can_edit_name',
    'can_edit_class',
    'can_edit_report',
    'can_manage_observation_options',
    'can_invite_teachers',
    'can_manage_member_permissions',
    'can_view_uniform',
    'can_edit_uniform',
    'can_mark_all_uniform_received',
    'can_view_occurrences',
    'can_register_occurrences',
    'can_edit_occurrences',
    'can_delete_occurrences',
    'can_manage_counselors',
    'can_view_dashboard',
    'can_view_history',
    'can_manage_alerts',
    'can_record_followups',
    'can_export_reports',
    'can_use_bulk_actions',
    'can_view_audit',
    'can_view_class_summary'
  ) then
    raise exception 'Permissão inválida.';
  end if;

  -- Estas permissões administrativas pertencem somente a coordenadores.
  if permission_value = true
     and permission_name in (
       'can_manage_observation_options',
       'can_invite_teachers',
       'can_manage_member_permissions',
       'can_manage_counselors'
     )
     and v_target.role <> 'coordinator'
  then
    raise exception 'Esta permissão só pode ser concedida a coordenadores.';
  end if;

  -- Coordenador nunca pode conceder uma permissão que ele próprio não possui.
  if v_actor.role = 'coordinator' and permission_value = true then
    if not exists (
      select 1
      from public.school_member_permissions p
      where p.member_id = v_actor.id
        and (
          case permission_name
            when 'can_add_students' then p.can_add_students
            when 'can_edit_students' then p.can_edit_students
            when 'can_delete_students' then p.can_delete_students
            when 'can_edit_all' then p.can_edit_all
            when 'can_edit_photo' then p.can_edit_photo
            when 'can_edit_name' then p.can_edit_name
            when 'can_edit_class' then p.can_edit_class
            when 'can_edit_report' then p.can_edit_report
            when 'can_manage_observation_options' then p.can_manage_observation_options
            when 'can_invite_teachers' then p.can_invite_teachers
            when 'can_manage_member_permissions' then p.can_manage_member_permissions
            when 'can_view_uniform' then p.can_view_uniform
            when 'can_edit_uniform' then p.can_edit_uniform
            when 'can_mark_all_uniform_received' then p.can_mark_all_uniform_received
            when 'can_view_occurrences' then p.can_view_occurrences
            when 'can_register_occurrences' then p.can_register_occurrences
            when 'can_edit_occurrences' then p.can_edit_occurrences
            when 'can_delete_occurrences' then p.can_delete_occurrences
            when 'can_manage_counselors' then p.can_manage_counselors
            when 'can_view_dashboard' then p.can_view_dashboard
            when 'can_view_history' then p.can_view_history
            when 'can_manage_alerts' then p.can_manage_alerts
            when 'can_record_followups' then p.can_record_followups
            when 'can_export_reports' then p.can_export_reports
            when 'can_use_bulk_actions' then p.can_use_bulk_actions
            when 'can_view_audit' then p.can_view_audit
            when 'can_view_class_summary' then p.can_view_class_summary
            else false
          end
        ) = true
    ) then
      raise exception 'Você não pode conceder uma permissão que não possui.';
    end if;
  end if;

  -- Garante que o membro tenha uma linha de permissões.
  insert into public.school_member_permissions (member_id)
  values (v_target.id)
  on conflict (member_id) do nothing;

  -- Altera somente a permissão solicitada.
  case permission_name
    when 'can_add_students' then
      update public.school_member_permissions
      set can_add_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_students' then
      update public.school_member_permissions
      set can_edit_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_delete_students' then
      update public.school_member_permissions
      set can_delete_students = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_all' then
      update public.school_member_permissions
      set can_edit_all = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_photo' then
      update public.school_member_permissions
      set can_edit_photo = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_name' then
      update public.school_member_permissions
      set can_edit_name = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_class' then
      update public.school_member_permissions
      set can_edit_class = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_report' then
      update public.school_member_permissions
      set can_edit_report = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_observation_options' then
      update public.school_member_permissions
      set can_manage_observation_options = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_invite_teachers' then
      update public.school_member_permissions
      set can_invite_teachers = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_member_permissions' then
      update public.school_member_permissions
      set can_manage_member_permissions = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_view_uniform' then
      update public.school_member_permissions
      set can_view_uniform = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_uniform' then
      update public.school_member_permissions
      set can_edit_uniform = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_mark_all_uniform_received' then
      update public.school_member_permissions
      set can_mark_all_uniform_received = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_view_occurrences' then
      update public.school_member_permissions
      set can_view_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_register_occurrences' then
      update public.school_member_permissions
      set can_register_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_edit_occurrences' then
      update public.school_member_permissions
      set can_edit_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_delete_occurrences' then
      update public.school_member_permissions
      set can_delete_occurrences = permission_value, updated_at = now()
      where member_id = v_target.id;

    when 'can_manage_counselors' then
  update public.school_member_permissions
  set can_manage_counselors = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_dashboard' then
  update public.school_member_permissions
  set can_view_dashboard = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_history' then
  update public.school_member_permissions
  set can_view_history = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_manage_alerts' then
  update public.school_member_permissions
  set can_manage_alerts = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_record_followups' then
  update public.school_member_permissions
  set can_record_followups = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_export_reports' then
  update public.school_member_permissions
  set can_export_reports = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_use_bulk_actions' then
  update public.school_member_permissions
  set can_use_bulk_actions = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_audit' then
  update public.school_member_permissions
  set can_view_audit = permission_value, updated_at = now()
  where member_id = v_target.id;

when 'can_view_class_summary' then
  update public.school_member_permissions
  set can_view_class_summary = permission_value, updated_at = now()
  where member_id = v_target.id;
  end case;

end;
$$;

revoke all on function public.set_school_member_permission(uuid, text, boolean) from public;
revoke all on function public.set_school_member_permission(uuid, text, boolean) from anon;
grant execute on function public.set_school_member_permission(uuid, text, boolean) to authenticated;

-- RLS: permissões dos membros da escola.
-- Membros ativos podem visualizar as permissões dos membros
-- pertencentes às escolas às quais possuem acesso ativo.
-- Alterações não são liberadas diretamente pela tabela.

create policy "active_members_can_view_school_member_permissions"
on public.school_member_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.school_members target_member
    where target_member.id = school_member_permissions.member_id
      and public.is_active_school_member(target_member.school_id)
  )
);

-- Verifica se um membro pertence a uma escola
-- administrada pelo usuário autenticado.

create or replace function public.is_member_of_administered_school(
  target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_members target
    join public.school_members admin_member
      on admin_member.school_id = target.school_id
    where target.id = target_member_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'school_admin'
      and admin_member.status = 'active'
  );
$$;

revoke all on function public.is_member_of_administered_school(uuid) from public;
revoke all on function public.is_member_of_administered_school(uuid) from anon;
grant execute on function public.is_member_of_administered_school(uuid) to authenticated;

-- Suspende ou reativa um membro da escola.
-- Somente o administrador ativo da própria escola pode executar.
-- Administradores não podem ser alterados por esta função.

create or replace function public.set_school_member_status(
  target_member_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if new_status not in ('active', 'suspended') then
    raise exception 'Status inválido.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  if not public.is_member_of_administered_school(v_target.id) then
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio status.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'O status de administradores não pode ser alterado por esta função.';
  end if;

  update public.school_members
  set
    status = new_status,
    updated_at = now()
  where id = v_target.id;
end;
$$;

revoke all on function public.set_school_member_status(uuid, text) from public;
revoke all on function public.set_school_member_status(uuid, text) from anon;
grant execute on function public.set_school_member_status(uuid, text) to authenticated;

-- Altera com segurança a função de um membro da escola.
-- Somente administradores ativos podem alternar entre
-- professor e coordenador.
-- Esta função nunca cria ou altera administradores.

create or replace function public.set_school_member_role(
  target_member_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if new_role not in ('coordinator', 'teacher') then
    raise exception 'Função inválida.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  if not public.is_member_of_administered_school(v_target.id) then
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'Você não pode alterar sua própria função.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'A função de administradores não pode ser alterada.';
  end if;

  update public.school_members
  set
    role = new_role,
    updated_at = now()
  where id = v_target.id;

  -- Ao deixar de ser coordenador, remove automaticamente
  -- permissões administrativas exclusivas de coordenadores.
  if new_role = 'teacher' then
    update public.school_member_permissions
    set
      can_manage_observation_options = false,
      can_invite_teachers = false,
      can_manage_member_permissions = false,
      can_manage_counselors = false,
      updated_at = now()
    where member_id = v_target.id;
  end if;
end;
$$;

revoke all on function public.set_school_member_role(uuid, text) from public;
revoke all on function public.set_school_member_role(uuid, text) from anon;
grant execute on function public.set_school_member_role(uuid, text) to authenticated;

-- Proteção direta da tabela school_members.
-- Usuários da aplicação podem consultar conforme as policies RLS,
-- mas não podem criar, alterar ou excluir vínculos diretamente.
-- Essas operações devem passar exclusivamente pelas funções controladas.

revoke insert, update, delete
on table public.school_members
from authenticated;

revoke insert, update, delete
on table public.school_members
from anon;

-- Marca como expirados os convites pendentes cujo prazo já terminou.
-- Uso interno de manutenção: clientes autenticados não executam esta rotina
-- global. A criação de um novo convite expira apenas o anterior do mesmo
-- e-mail e escola.

create or replace function public.expire_school_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  update public.school_invitations
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke all on function public.expire_school_invitations()
from public, anon, authenticated;

-- Provisionamento inicial de uma escola.
-- Esta função cria a escola e o primeiro administrador.
-- Não é disponibilizada para usuários comuns da aplicação.

create or replace function public.provision_school(
  school_name text,
  school_slug text,
  admin_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_school_id uuid;
  v_member_id uuid;
begin
  if admin_user_id is null then
    raise exception 'Administrador não informado.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = admin_user_id
  ) then
    raise exception 'Usuário administrador não encontrado.';
  end if;

  insert into public.schools (
    name,
    slug,
    status
  )
  values (
    trim(school_name),
    lower(trim(school_slug)),
    'active'
  )
  returning id into v_school_id;

  insert into public.school_members (
    school_id,
    user_id,
    role,
    status
  )
  values (
    v_school_id,
    admin_user_id,
    'school_admin',
    'active'
  )
  returning id into v_member_id;

  insert into public.school_member_permissions (member_id)
  values (v_member_id);

  return v_school_id;
end;
$$;

revoke all on function public.provision_school(text, text, uuid) from public;
revoke all on function public.provision_school(text, text, uuid) from anon;
revoke all on function public.provision_school(text, text, uuid) from authenticated;

-- Proteção direta das tabelas de controle multi-escola.
-- Escritas devem ocorrer apenas pelos fluxos e funções controladas.

revoke insert, update, delete
on table public.school_member_permissions
from authenticated;

revoke insert, update, delete
on table public.school_member_permissions
from anon;

revoke insert, update, delete
on table public.school_invitations
from authenticated;

revoke insert, update, delete
on table public.school_invitations
from anon;

revoke insert, update, delete
on table public.schools
from authenticated;

revoke insert, update, delete
on table public.schools
from anon;
