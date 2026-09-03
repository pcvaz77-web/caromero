-- CARÔMETRO COMERCIAL
-- Mapeamento visual da sala por turma, com rascunho privado, publicação
-- versionada e aviso aos usuários que acompanham a turma.

begin;

create table if not exists public.classroom_maps (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  layout jsonb not null default '{"rows":5,"columns":6,"assignments":[]}'::jsonb,
  version integer not null default 0 check (version >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint classroom_maps_layout_object check (jsonb_typeof(layout) = 'object')
);

create index if not exists classroom_maps_school_class_idx
  on public.classroom_maps (school_id, class_id, status, updated_at desc);
create unique index if not exists classroom_maps_one_draft_per_class
  on public.classroom_maps (school_id, class_id) where status = 'draft';
create unique index if not exists classroom_maps_one_published_per_class
  on public.classroom_maps (school_id, class_id) where status = 'published';

create or replace function public.can_edit_classroom_map(target_school_id uuid, target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (
    auth.uid() is not null
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role in ('school_admin', 'coordinator')
    )
  ) or (
      auth.uid() is not null
      and exists (
        select 1
        from public.school_members sm
        where sm.school_id = target_school_id
          and sm.user_id = auth.uid()
          and sm.status = 'active'
      )
      and exists (
        select 1
        from public.class_counselors cc
        where cc.school_id = target_school_id
          and cc.class_id = target_class_id
          and cc.counselor_user_id = auth.uid()
      )
  );
$function$;

create or replace function public.validate_classroom_map_layout(
  target_school_id uuid,
  target_class_id uuid,
  target_layout jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
  v_columns integer;
begin
  if target_layout is null or jsonb_typeof(target_layout) <> 'object' then
    raise exception 'O mapeamento informado é inválido.';
  end if;

  begin
    v_rows := (target_layout->>'rows')::integer;
    v_columns := (target_layout->>'columns')::integer;
  exception when others then
    raise exception 'Informe uma quantidade válida de fileiras e colunas.';
  end;

  if v_rows not between 1 and 10 or v_columns not between 1 and 10 then
    raise exception 'O mapeamento deve ter entre 1 e 10 fileiras e colunas.';
  end if;

  if jsonb_typeof(coalesce(target_layout->'assignments', '[]'::jsonb)) <> 'array' then
    raise exception 'A distribuição dos alunos é inválida.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    where not (item ? 'studentId' and item ? 'seatIndex')
       or (item->>'seatIndex') !~ '^[0-9]+$'
       or (item->>'seatIndex')::integer < 0
       or (item->>'seatIndex')::integer >= v_rows * v_columns
       or (item->>'studentId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Há uma carteira ou aluno inválido no mapeamento.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    left join public.students s
      on s.id = (item->>'studentId')::uuid
     and s.class_id = target_class_id
     and s.school_id = target_school_id
    where s.id is null
  ) then
    raise exception 'O mapeamento contém um aluno que não pertence a esta turma.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    group by item->>'studentId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    group by item->>'seatIndex'
    having count(*) > 1
  ) then
    raise exception 'Cada aluno e cada carteira podem aparecer apenas uma vez.';
  end if;
end;
$function$;

create or replace function public.get_classroom_map(target_class_id uuid, include_draft boolean default false)
returns table (
  id uuid,
  school_id uuid,
  class_id uuid,
  status text,
  layout jsonb,
  version integer,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_can_edit boolean;
begin
  select c.school_id into v_school_id
  from public.classes c
  where c.id = target_class_id;

  if v_school_id is null or not public.is_active_school_member(v_school_id) then
    raise exception 'Turma não encontrada ou sem acesso.';
  end if;

  v_can_edit := public.can_edit_classroom_map(v_school_id, target_class_id);
  if include_draft and not v_can_edit then
    raise exception 'Somente o conselheiro ou a gestão podem editar o mapeamento.';
  end if;

  return query
  select m.id, m.school_id, m.class_id, m.status, m.layout, m.version,
         m.updated_at, m.published_at
  from public.classroom_maps m
  where m.school_id = v_school_id
    and m.class_id = target_class_id
    and (
      (include_draft and v_can_edit and m.status in ('draft', 'published'))
      or (not include_draft and m.status = 'published')
    )
  order by case when m.status = 'draft' then 0 else 1 end, m.updated_at desc
  limit 1;
end;
$function$;

create or replace function public.save_classroom_map_draft(target_class_id uuid, target_layout jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_map_id uuid;
begin
  select c.school_id into v_school_id
  from public.classes c
  where c.id = target_class_id;

  if v_school_id is null or not public.can_edit_classroom_map(v_school_id, target_class_id) then
    raise exception 'Somente o conselheiro ou a gestão podem editar o mapeamento.';
  end if;

  perform public.validate_classroom_map_layout(v_school_id, target_class_id, target_layout);

  insert into public.classroom_maps (
    school_id, class_id, status, layout, created_by, updated_by
  ) values (
    v_school_id, target_class_id, 'draft', target_layout, auth.uid(), auth.uid()
  )
  on conflict (school_id, class_id) where status = 'draft'
  do update set layout = excluded.layout, updated_by = auth.uid(), updated_at = now()
  returning id into v_map_id;

  return v_map_id;
end;
$function$;

create or replace function public.publish_classroom_map(target_class_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_class_name text;
  v_draft public.classroom_maps%rowtype;
  v_next_version integer;
begin
  select c.school_id, c.name into v_school_id, v_class_name
  from public.classes c
  where c.id = target_class_id;

  if v_school_id is null or not public.can_edit_classroom_map(v_school_id, target_class_id) then
    raise exception 'Somente o conselheiro ou a gestão podem publicar o mapeamento.';
  end if;

  select * into v_draft
  from public.classroom_maps m
  where m.school_id = v_school_id and m.class_id = target_class_id and m.status = 'draft'
  for update;

  if not found then
    raise exception 'Salve um rascunho antes de publicar.';
  end if;

  perform public.validate_classroom_map_layout(v_school_id, target_class_id, v_draft.layout);

  select coalesce(max(m.version), 0) + 1 into v_next_version
  from public.classroom_maps m
  where m.school_id = v_school_id and m.class_id = target_class_id;

  update public.classroom_maps
  set status = 'archived', updated_at = now(), updated_by = auth.uid()
  where school_id = v_school_id and class_id = target_class_id and status = 'published';

  update public.classroom_maps
  set status = 'published', version = v_next_version, published_at = now(),
      published_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
  where id = v_draft.id;

  insert into public.user_notifications
    (recipient_id, class_id, school_id, title, body, target_type, target_id)
  select f.user_id, target_class_id, v_school_id,
         'Mapeamento atualizado',
         'Um novo mapeamento da turma ' || coalesce(v_class_name, 'não informada') || ' foi publicado.',
         'classroom_map', target_class_id::text
  from public.user_favorite_classes f
  join public.school_members sm
    on sm.user_id = f.user_id
   and sm.school_id = v_school_id
   and sm.status = 'active'
  where f.class_id = target_class_id
    and f.notifications_enabled = true
    and f.user_id is distinct from auth.uid();

  return v_draft.id;
end;
$function$;

alter table public.classroom_maps enable row level security;

drop policy if exists "school_members_view_classroom_maps" on public.classroom_maps;
create policy "school_members_view_classroom_maps"
on public.classroom_maps for select to authenticated
using (
  public.is_active_school_member(school_id)
  and (status = 'published' or public.can_edit_classroom_map(school_id, class_id))
);

revoke all on table public.classroom_maps from public, anon, authenticated;
grant select on table public.classroom_maps to authenticated;

revoke all on function public.can_edit_classroom_map(uuid, uuid) from public, anon;
revoke all on function public.validate_classroom_map_layout(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_classroom_map(uuid, boolean) from public, anon;
revoke all on function public.save_classroom_map_draft(uuid, jsonb) from public, anon;
revoke all on function public.publish_classroom_map(uuid) from public, anon;
grant execute on function public.can_edit_classroom_map(uuid, uuid) to authenticated;
grant execute on function public.get_classroom_map(uuid, boolean) to authenticated;
grant execute on function public.save_classroom_map_draft(uuid, jsonb) to authenticated;
grant execute on function public.publish_classroom_map(uuid) to authenticated;

commit;
