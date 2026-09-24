begin;

-- Editar e excluir são permissões independentes. Professor só altera o
-- próprio registro; coordenador autorizado altera registros da escola.
create or replace function public.can_change_school_occurrence(
  p_school_id uuid, p_author_id uuid, p_action text
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_action in ('edit', 'delete') and exists (
    select 1 from public.school_members member
    join public.school_member_permissions rights on rights.member_id = member.id
    where member.school_id = p_school_id
      and member.user_id = auth.uid() and member.status = 'active'
      and (
        member.role = 'school_admin'
        or (
          member.role in ('coordinator', 'teacher')
          and (member.role = 'coordinator' or member.user_id = p_author_id)
          and case p_action
            when 'edit' then rights.can_edit_occurrences
            when 'delete' then rights.can_delete_occurrences
            else false end
        )
      )
  ) or (p_action in ('edit','delete') and public.is_school_admin(p_school_id));
$$;
revoke all on function public.can_change_school_occurrence(uuid,uuid,text) from public, anon;
grant execute on function public.can_change_school_occurrence(uuid,uuid,text) to authenticated;

drop policy if exists "school_members_can_view_occurrences" on public.student_occurrences;
create policy "school_members_can_view_occurrences"
on public.student_occurrences for select to authenticated
using (
  school_id is not null and public.is_active_school_member(school_id)
  and (
    public.has_school_permission(school_id, 'can_view_occurrences')
    or public.has_school_permission(school_id, 'can_edit_all')
    or public.can_change_school_occurrence(school_id, created_by, 'edit')
    or public.can_change_school_occurrence(school_id, created_by, 'delete')
  )
);

drop policy if exists "authorized_school_members_can_edit_occurrences" on public.student_occurrences;
create policy "authorized_school_members_can_edit_occurrences"
on public.student_occurrences for update to authenticated
using (school_id is not null and public.can_change_school_occurrence(school_id, created_by, 'edit'))
with check (school_id is not null and public.can_change_school_occurrence(school_id, created_by, 'edit'));

drop policy if exists "authorized_school_members_can_delete_occurrences" on public.student_occurrences;
create policy "authorized_school_members_can_delete_occurrences"
on public.student_occurrences for delete to authenticated
using (school_id is not null and public.can_change_school_occurrence(school_id, created_by, 'delete'));

-- Restringe as RPCs de permissão existentes: Secretaria nunca concede
-- edição/exclusão de ocorrências; coordenador não concede acima do que tem.
create or replace function public.guard_occurrence_permission_delegation()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor public.school_members%rowtype;
  v_target public.school_members%rowtype;
  v_actor_rights public.school_member_permissions%rowtype;
begin
  if old.can_edit_occurrences is not distinct from new.can_edit_occurrences
     and old.can_delete_occurrences is not distinct from new.can_delete_occurrences then
    return new;
  end if;
  -- Migrations/serviços sem JWT seguem o fluxo administrativo do servidor.
  if auth.uid() is null then return new; end if;
  select * into v_target from public.school_members where id = new.member_id;
  select * into v_actor from public.school_members
  where school_id = v_target.school_id and user_id = auth.uid()
    and status = 'active' limit 1;
  if not found then
    raise exception 'Sem permissão para alterar ocorrências deste membro.';
  end if;
  -- Na transferência da administração, o antigo dono tem as próprias
  -- permissões zeradas após a troca de papel. Permitir apenas a retirada.
  if v_actor.id = v_target.id then
    if not new.can_edit_occurrences and not new.can_delete_occurrences then
      return new;
    end if;
    raise exception 'Não é permitido conceder permissões a si mesmo.';
  end if;
  if v_actor.role = 'school_admin' then return new; end if;
  if v_actor.role <> 'coordinator' or v_target.role <> 'teacher'
     or not public.has_school_permission(v_target.school_id, 'can_manage_member_permissions') then
    raise exception 'Só o administrador ou coordenador autorizado pode delegar ocorrências.';
  end if;
  select * into v_actor_rights from public.school_member_permissions
  where member_id = v_actor.id;
  if (new.can_edit_occurrences and not old.can_edit_occurrences
      and not coalesce(v_actor_rights.can_edit_occurrences, false))
     or (new.can_delete_occurrences and not old.can_delete_occurrences
      and not coalesce(v_actor_rights.can_delete_occurrences, false)) then
    raise exception 'Você não pode conceder uma permissão que não possui.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_occurrence_permission_delegation() from public, anon, authenticated;
drop trigger if exists guard_occurrence_permission_delegation on public.school_member_permissions;
create trigger guard_occurrence_permission_delegation
before update of can_edit_occurrences, can_delete_occurrences
on public.school_member_permissions for each row
execute function public.guard_occurrence_permission_delegation();

-- A ressalva é acrescentada sem modificar o texto da ocorrência.
create table public.student_occurrence_remarks (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.student_occurrences(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);
create index student_occurrence_remarks_occurrence_created_idx
  on public.student_occurrence_remarks(occurrence_id, created_at, id);
alter table public.student_occurrence_remarks enable row level security;
revoke all on public.student_occurrence_remarks from public, anon, authenticated;
grant select on public.student_occurrence_remarks to authenticated;
create policy "view_occurrence_remarks"
on public.student_occurrence_remarks for select to authenticated
using (exists (
  select 1 from public.student_occurrences occurrence
  where occurrence.id = occurrence_id and occurrence.school_id = school_id
));

create or replace function public.add_student_occurrence_remark(
  p_occurrence_id uuid, p_body text
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_occurrence public.student_occurrences%rowtype;
  v_member public.school_members%rowtype;
  v_name text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 1000 then
    raise exception 'A ressalva deve ter entre 1 e 1000 caracteres.';
  end if;
  select * into v_occurrence from public.student_occurrences
  where id = p_occurrence_id for key share;
  if not found then raise exception 'Ocorrência não encontrada.'; end if;
  select * into v_member from public.school_members
  where school_id = v_occurrence.school_id and user_id = auth.uid()
    and status = 'active' limit 1;
  if not found then raise exception 'Sem acesso ativo a esta escola.'; end if;
  if not (
    v_member.role = 'school_admin'
    or (v_member.role = 'teacher' and v_occurrence.created_by = auth.uid())
    or (v_member.role = 'coordinator' and (
      v_occurrence.created_by = auth.uid()
      or public.can_change_school_occurrence(v_occurrence.school_id, v_occurrence.created_by, 'edit')
      or public.can_change_school_occurrence(v_occurrence.school_id, v_occurrence.created_by, 'delete')
    ))
  ) then raise exception 'Sem permissão para registrar ressalva nesta ocorrência.'; end if;
  if not (
    public.has_school_permission(v_occurrence.school_id, 'can_view_occurrences')
    or public.has_school_permission(v_occurrence.school_id, 'can_edit_all')
    or public.can_change_school_occurrence(v_occurrence.school_id, v_occurrence.created_by, 'edit')
    or public.can_change_school_occurrence(v_occurrence.school_id, v_occurrence.created_by, 'delete')
  ) then raise exception 'Sem permissão para visualizar esta ocorrência.'; end if;
  select nullif(btrim(full_name), '') into v_name from public.profiles
  where id = auth.uid();
  v_name := coalesce(v_name, (select email from auth.users where id = auth.uid()), 'Não informado');
  insert into public.student_occurrence_remarks
    (occurrence_id, school_id, body, created_by, created_by_name)
  values (v_occurrence.id, v_occurrence.school_id, btrim(p_body), auth.uid(), v_name)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_student_occurrence_remark(uuid,text) from public, anon;
grant execute on function public.add_student_occurrence_remark(uuid,text) to authenticated;

-- A antiga policy aceitava a autoria sozinha para mexer no anexo. Ela deve
-- acompanhar as permissões de edição e exclusão da ocorrência.
drop policy if exists "school_members_can_view_occurrence_attachments" on storage.objects;
create policy "school_members_can_view_occurrence_attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'occurrence-attachments'
  and exists (
    select 1 from public.student_occurrences occurrence
    where occurrence.attachment_path = storage.objects.name
      and public.is_active_school_member(occurrence.school_id)
      and (
        public.has_school_permission(occurrence.school_id, 'can_view_occurrences')
        or public.has_school_permission(occurrence.school_id, 'can_edit_all')
        or public.can_change_school_occurrence(occurrence.school_id, occurrence.created_by, 'edit')
        or public.can_change_school_occurrence(occurrence.school_id, occurrence.created_by, 'delete')
      )
  )
);

drop policy if exists "authorized_members_can_upload_occurrence_attachments" on storage.objects;
create policy "authorized_members_can_upload_occurrence_attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'occurrence-attachments'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[3] is not null
  and (
    exists (
      select 1 from public.student_occurrences occurrence
      where occurrence.id::text = (storage.foldername(name))[3]
        and occurrence.school_id::text = (storage.foldername(name))[1]
        and occurrence.created_by::text = (storage.foldername(name))[2]
        and public.can_change_school_occurrence(occurrence.school_id, occurrence.created_by, 'edit')
    )
    or (
      not exists (
        select 1 from public.student_occurrences occurrence
        where occurrence.id::text = (storage.foldername(name))[3]
          and occurrence.school_id::text = (storage.foldername(name))[1]
      )
      and (storage.foldername(name))[2] = auth.uid()::text
      and public.is_active_school_member(((storage.foldername(name))[1])::uuid)
      and (
        public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_register_occurrences')
        or public.has_school_permission(((storage.foldername(name))[1])::uuid, 'can_edit_all')
      )
    )
  )
);

drop policy if exists "authorized_members_can_delete_occurrence_attachments" on storage.objects;
create policy "authorized_members_can_delete_occurrence_attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'occurrence-attachments'
  and (storage.foldername(name))[1] is not null
  and public.is_active_school_member(((storage.foldername(name))[1])::uuid)
  and (
    exists (
      select 1 from public.student_occurrences occurrence
      where occurrence.id::text = (storage.foldername(name))[3]
        and occurrence.school_id::text = (storage.foldername(name))[1]
        and (
          public.can_change_school_occurrence(occurrence.school_id, occurrence.created_by, 'edit')
          or public.can_change_school_occurrence(occurrence.school_id, occurrence.created_by, 'delete')
        )
    )
    or (
      not exists (
        select 1 from public.student_occurrences occurrence
        where occurrence.id::text = (storage.foldername(name))[3]
          and occurrence.school_id::text = (storage.foldername(name))[1]
      )
      and (
        (storage.foldername(name))[2] = auth.uid()::text
        or public.is_school_admin(((storage.foldername(name))[1])::uuid)
        or exists (
          select 1 from public.school_members member
          join public.school_member_permissions rights on rights.member_id = member.id
          where member.school_id = ((storage.foldername(name))[1])::uuid
            and member.user_id = auth.uid() and member.status = 'active'
            and member.role = 'coordinator' and rights.can_delete_occurrences
        )
      )
    )
  )
);

commit;
