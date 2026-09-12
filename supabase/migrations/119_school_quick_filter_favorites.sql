begin;

create table if not exists public.school_quick_filter_favorites (
  school_id uuid primary key references public.schools(id) on delete cascade,
  favorite_1 text not null,
  favorite_2 text not null,
  favorite_3 text not null,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint school_quick_filter_favorites_distinct check (
    favorite_1<>favorite_2 and favorite_1<>favorite_3 and favorite_2<>favorite_3
  ),
  constraint school_quick_filter_favorites_nonempty check (
    btrim(favorite_1)<>'' and btrim(favorite_2)<>'' and btrim(favorite_3)<>''
  )
);

alter table public.school_quick_filter_favorites enable row level security;

create policy "members_view_quick_filter_favorites"
on public.school_quick_filter_favorites for select to authenticated
using (public.is_active_school_member(school_id));

create policy "admin_coordinator_insert_quick_filter_favorites"
on public.school_quick_filter_favorites for insert to authenticated
with check (
  updated_by=auth.uid()
  and (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
);

create policy "admin_coordinator_update_quick_filter_favorites"
on public.school_quick_filter_favorites for update to authenticated
using (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
with check (
  updated_by=auth.uid()
  and (public.is_school_admin(school_id) or public.is_school_coordinator(school_id))
);

create policy "admin_coordinator_delete_quick_filter_favorites"
on public.school_quick_filter_favorites for delete to authenticated
using (public.is_school_admin(school_id) or public.is_school_coordinator(school_id));

create or replace function public.touch_school_quick_filter_favorites()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.updated_by=auth.uid();
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists touch_school_quick_filter_favorites_before_update
on public.school_quick_filter_favorites;
create trigger touch_school_quick_filter_favorites_before_update
before update on public.school_quick_filter_favorites
for each row execute function public.touch_school_quick_filter_favorites();

grant select,insert,update,delete on public.school_quick_filter_favorites to authenticated;

alter table public.school_quick_filter_favorites replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='school_quick_filter_favorites'
  ) then
    alter publication supabase_realtime add table public.school_quick_filter_favorites;
  end if;
end $$;

comment on table public.school_quick_filter_favorites is
  'Três atalhos de filtro escolhidos pela administração ou coordenação, isolados por escola.';
comment on column public.school_quick_filter_favorites.favorite_1 is
  'Chave de filtro do sistema ou obsid:<uuid> para uma etiqueta da escola.';

commit;
