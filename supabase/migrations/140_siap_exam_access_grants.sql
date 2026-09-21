-- Correção de Provas: concessão por conta, independente da licença geral.
-- Sem concessões automáticas. Apenas o proprietário administra os acessos.
begin;
create table if not exists public.siap_exam_access_grants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_by uuid not null references auth.users(id),
 granted_at timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.siap_exam_access_grants enable row level security;
revoke all on public.siap_exam_access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.siap_exam_access_grants to service_role;

create or replace function public.platform_set_siap_exam_access(p_user_id uuid, p_enabled boolean, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
 v_actor uuid := auth.uid();
 v_previous public.siap_exam_access_grants%rowtype;
begin
 if v_actor is null or not public.is_platform_owner() then
  raise exception 'Somente o proprietário pode conceder Correção de Provas.' using errcode='42501';
 end if;
 if p_user_id is null or p_enabled is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'Usuário inválido.';
 end if;
 if p_enabled and p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at <= now()) then
  raise exception 'A data final deve estar no futuro.';
 end if;
 -- Serializa concessões da mesma conta, inclusive na primeira inserção.
 perform 1 from auth.users where id=p_user_id for update;
 select * into v_previous from public.siap_exam_access_grants where user_id=p_user_id;
 insert into public.siap_exam_access_grants(user_id,granted_by,granted_at,expires_at,revoked_at,updated_at)
 values(p_user_id,v_actor,now(),case when p_enabled then p_expires_at else null end,case when p_enabled then null else now() end,now())
 on conflict(user_id) do update set granted_by=v_actor,granted_at=now(),
 expires_at=case when p_enabled then p_expires_at else null end,
 revoked_at=case when p_enabled then null else now() end,updated_at=now();
 insert into public.platform_audit_log(actor_user_id,event_type,target_user_id,previous_state,new_state)
 values(v_actor,case when p_enabled then 'siap_exam_access_granted' else 'siap_exam_access_revoked' end,p_user_id,
 jsonb_build_object('expires_at',v_previous.expires_at,'revoked_at',v_previous.revoked_at,'existed',v_previous.user_id is not null),
 jsonb_build_object('enabled',p_enabled,'expires_at',case when p_enabled then p_expires_at else null end));
 return jsonb_build_object('enabled',p_enabled,'expiresAt',case when p_enabled then p_expires_at else null end);
end;
$function$;
revoke all on function public.platform_set_siap_exam_access(uuid,boolean,timestamptz) from public,anon;
grant execute on function public.platform_set_siap_exam_access(uuid,boolean,timestamptz) to authenticated;

create or replace function public.platform_list_siap_exam_access()
returns table(user_id uuid,active boolean,expires_at timestamptz,revoked_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
begin
 if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 return query select g.user_id,g.revoked_at is null and (g.expires_at is null or g.expires_at>now()),g.expires_at,g.revoked_at
 from public.siap_exam_access_grants g;
end;
$function$;
revoke all on function public.platform_list_siap_exam_access() from public,anon;
grant execute on function public.platform_list_siap_exam_access() to authenticated;

create or replace function public.get_siap_assistant_button_visibility()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant public.siap_assistant_access_grants%rowtype;
  v_paid boolean := false;
  v_exam boolean := false;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  select * into v_grant from public.siap_assistant_access_grants
  where user_id=v_user_id and revoked_at is null and (expires_at is null or expires_at > now());
  select exists(select 1 from public.siap_assistant_licenses
    where user_id=v_user_id and suspended_at is null and paid_until > now()) into v_paid;
  select exists(select 1 from public.siap_exam_access_grants where user_id=v_user_id and revoked_at is null and (expires_at is null or expires_at>now())) into v_exam;
  return jsonb_build_object('visible',v_grant.user_id is not null or v_paid or v_exam,'examGranted',v_exam,
    'ownerGranted',v_grant.user_id is not null,'grantExpiresAt',v_grant.expires_at,
    'grantPermanent',v_grant.user_id is not null and v_grant.expires_at is null,'paid',v_paid);
end;
$function$;


commit;
