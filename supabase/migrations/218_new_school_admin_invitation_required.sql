-- Toda escola criada pelo proprietário começa com um convite pendente.
-- Uma conta Auth existente, mesmo com e-mail confirmado, só recebe o vínculo
-- de administrador depois de abrir o convite e concluir o cadastro.
begin;

create or replace function public.platform_provision_school(p_school_name text, p_admin_email text, p_plan text DEFAULT 'free'::text, p_price numeric DEFAULT 0)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := trim(coalesce(p_school_name, ''));
  v_email text := lower(trim(coalesce(p_admin_email, '')));
  v_school_id uuid;
  v_slug_base text;
  v_slug text;
  v_invitation_id uuid;
  v_invitation_token uuid;
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

  v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'escola';
  end if;
  v_slug := left(v_slug_base, 120) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.schools (name, slug, status)
  values (v_name, v_slug, 'active')
  returning id into v_school_id;

  -- O plano manual é concessão administrativa, sem contratação financeira.
  insert into public.school_subscriptions (
    school_id, plan, billing_type, status, price, granted_by, grant_reason,
    contracted_plan, override_plan, override_expires_at
  )
  values (
    v_school_id, p_plan, 'fixed_school', 'active', p_price, auth.uid(),
    'Provisionamento manual pelo proprietário da plataforma', null, p_plan, null
  );

  insert into public.school_invitations (school_id, email, role, invited_by)
  values (v_school_id, v_email, 'school_admin', auth.uid())
  returning id, token into v_invitation_id, v_invitation_token;

  perform public.record_platform_audit(
    'school_provisioned', v_school_id, null, '{}'::jsonb,
    jsonb_build_object(
      'school_name', v_name, 'plan', p_plan, 'price', p_price,
      'admin_state', 'invited'
    )
  );

  return jsonb_build_object(
    'school_id', v_school_id,
    'admin_state', 'invited',
    'admin_user_id', null,
    'admin_email', v_email,
    'invitation_id', v_invitation_id,
    'invitation_token', v_invitation_token
  );
end;
$function$;

revoke all on function public.platform_provision_school(text, text, text, numeric) from public;
revoke all on function public.platform_provision_school(text, text, text, numeric) from anon;
grant execute on function public.platform_provision_school(text, text, text, numeric) to authenticated;

commit;
