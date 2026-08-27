-- CARÔMETRO COMERCIAL
-- RPCs de conselheiros explicitamente limitadas à escola ativa informada.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

-- Retira as assinaturas globais legadas. Elas não identificam a escola e não
-- são adequadas para contas com mais de um vínculo.
do $legacy$
begin
  if to_regprocedure('public.can_manage_class_counselors()') is not null then
    execute 'revoke all on function public.can_manage_class_counselors() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.list_counselor_candidates()') is not null then
    execute 'revoke all on function public.list_counselor_candidates() from public, anon, authenticated';
  end if;
end;
$legacy$;

create or replace function public.can_manage_class_counselors(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    target_school_id is not null
    and public.is_active_school_member(target_school_id)
    and (
      public.is_school_admin(target_school_id)
      or public.has_school_permission(target_school_id, 'can_manage_counselors')
    );
$function$;

revoke all on function public.can_manage_class_counselors(uuid) from public, anon;
grant execute on function public.can_manage_class_counselors(uuid) to authenticated;

create or replace function public.list_counselor_candidates(
  target_school_id uuid
)
returns table (
  user_id uuid,
  email text,
  full_name text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null
     or not public.can_manage_class_counselors(target_school_id) then
    raise exception 'Você não possui permissão para gerenciar conselheiros nesta escola.';
  end if;

  return query
  select
    sm.user_id,
    p.email::text,
    p.full_name::text
  from public.school_members sm
  left join public.profiles p on p.id = sm.user_id
  where sm.school_id = target_school_id
    and sm.status = 'active'
  order by coalesce(nullif(trim(p.full_name), ''), p.email, sm.user_id::text);
end;
$function$;

revoke all on function public.list_counselor_candidates(uuid) from public, anon;
grant execute on function public.list_counselor_candidates(uuid) to authenticated;

commit;
