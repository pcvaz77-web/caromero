-- CARÔMETRO COMERCIAL
-- Provisionamento atômico de escola pelo proprietário da plataforma.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

create or replace function public.platform_provision_school(
  p_school_name text,
  p_admin_email text,
  p_plan text default 'free',
  p_price numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := trim(coalesce(p_school_name, ''));
  v_email text := lower(trim(coalesce(p_admin_email, '')));
  v_user_id uuid;
  v_school_id uuid;
  v_member_id uuid;
  v_slug_base text;
  v_slug text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if length(v_name) < 3 or length(v_name) > 160 then
    raise exception 'Informe um nome de escola entre 3 e 160 caracteres.';
  end if;

  if v_email = ''
     or length(v_email) > 320
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe o e-mail do administrador da escola.';
  end if;

  if coalesce(p_plan, '') not in ('free', 'basic', 'professional', 'enterprise') then
    raise exception 'Plano inválido.';
  end if;

  if p_price is null or p_price < 0 or p_price > 99999999.99 then
    raise exception 'Preço inválido.';
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(trim(u.email)) = v_email
    and u.email_confirmed_at is not null
    and u.deleted_at is null;

  if v_user_id is null then
    raise exception 'A conta não existe ou ainda não confirmou o e-mail.';
  end if;

  v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'escola';
  end if;
  v_slug := left(v_slug_base, 120) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.schools (name, slug, status)
  values (v_name, v_slug, 'active')
  returning id into v_school_id;

  insert into public.school_members (school_id, user_id, role, status)
  values (v_school_id, v_user_id, 'school_admin', 'active')
  returning id into v_member_id;

  insert into public.school_member_permissions (member_id)
  values (v_member_id);

  insert into public.school_subscriptions (
    school_id,
    plan,
    billing_type,
    status,
    price,
    granted_by,
    grant_reason
  )
  values (
    v_school_id,
    p_plan,
    'fixed_school',
    'active',
    p_price,
    auth.uid(),
    'Provisionamento manual pelo proprietário da plataforma'
  );

  perform public.record_platform_audit(
    'school_provisioned',
    v_school_id,
    v_user_id,
    '{}'::jsonb,
    jsonb_build_object(
      'school_name', v_name,
      'plan', p_plan,
      'price', p_price
    )
  );

  return v_school_id;
end;
$function$;

revoke all on function public.platform_provision_school(text, text, text, numeric) from public;
revoke all on function public.platform_provision_school(text, text, text, numeric) from anon;
grant execute on function public.platform_provision_school(text, text, text, numeric) to authenticated;

-- Suspende ou reativa o acesso operacional de uma escola sem excluir nem
-- modificar alunos, fotos, usuários, vínculos ou demais dados existentes.
create or replace function public.platform_set_school_status(
  p_school_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_status text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null or p_status not in ('active', 'suspended') then
    raise exception 'Escola ou status inválido.';
  end if;

  select s.status
    into v_previous_status
  from public.schools s
  where s.id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  update public.schools
  set status = p_status,
      updated_at = now()
  where id = p_school_id;

  perform public.record_platform_audit(
    'school_status_changed',
    p_school_id,
    null,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status)
  );
end;
$function$;

revoke all on function public.platform_set_school_status(uuid, text) from public;
revoke all on function public.platform_set_school_status(uuid, text) from anon;
grant execute on function public.platform_set_school_status(uuid, text) to authenticated;

-- Suspende ou reativa a assinatura sem apagar a escola. Reativar a escola e
-- reativar a assinatura são decisões independentes e auditáveis.
create or replace function public.platform_set_subscription_status(
  p_school_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_status text;
  v_previous_expires_at timestamptz;
  v_new_expires_at timestamptz;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null or p_status not in ('active', 'suspended', 'expired') then
    raise exception 'Escola ou status de assinatura inválido.';
  end if;

  select ss.status, ss.grant_expires_at
    into v_previous_status, v_previous_expires_at
  from public.school_subscriptions ss
  where ss.school_id = p_school_id
  for update;

  if not found then
    raise exception 'Assinatura da escola não encontrada.';
  end if;

  update public.school_subscriptions
  set status = p_status,
      grant_expires_at = case
        when p_status = 'active'
         and grant_expires_at is not null
         and grant_expires_at <= now()
          then null
        else grant_expires_at
      end,
      updated_at = now()
  where school_id = p_school_id
  returning grant_expires_at into v_new_expires_at;

  perform public.record_platform_audit(
    'subscription_status_changed',
    p_school_id,
    null,
    jsonb_build_object(
      'status', v_previous_status,
      'grant_expires_at', v_previous_expires_at
    ),
    jsonb_build_object(
      'status', p_status,
      'grant_expires_at', v_new_expires_at
    )
  );
end;
$function$;

revoke all on function public.platform_set_subscription_status(uuid, text) from public;
revoke all on function public.platform_set_subscription_status(uuid, text) from anon;
grant execute on function public.platform_set_subscription_status(uuid, text) to authenticated;

commit;
