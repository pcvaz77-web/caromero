-- CARÔMETRO COMERCIAL
-- Alteração mínima e isolada em platform_provision_school: uma escola
-- criada manualmente pelo Proprietário da Plataforma ainda não tem
-- contratação financeira comprovada — o plano escolhido no
-- provisionamento deve nascer como concessão administrativa
-- (override_plan), nunca como contracted_plan. `plan` continua sendo
-- gravado, só como espelho de compatibilidade (mesmo padrão já usado
-- pelas RPCs de override desde a migration 050).
--
-- Única mudança real: o INSERT em school_subscriptions passa a incluir
-- contracted_plan (NULL), override_plan (= p_plan) e override_expires_at
-- (NULL, concessão permanente). Nenhuma outra coluna, validação,
-- comportamento de admin/convite, auditoria ou retorno desta função é
-- alterado — RETURNS, SECURITY DEFINER, search_path e grants
-- (authenticated apenas, sem anon) permanecem exatamente como estavam.

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
  v_user_id uuid;
  v_school_id uuid;
  v_member_id uuid;
  v_slug_base text;
  v_slug text;
  v_invitation_id uuid;
  v_invitation_token uuid;
  v_admin_state text;
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

  -- Mesma consulta de antes: só considera a conta "pronta" se já existir e já
  -- estiver confirmada. Continua sendo o único critério que decide entre os
  -- dois caminhos abaixo — nada no comportamento desta checagem mudou.
  select u.id
    into v_user_id
  from auth.users u
  where lower(trim(u.email)) = v_email
    and u.email_confirmed_at is not null
    and u.deleted_at is null;

  v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'escola';
  end if;
  v_slug := left(v_slug_base, 120) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- A escola e a assinatura já existem imediatamente em qualquer um dos dois
  -- casos: o provisionamento não fica pendente do onboarding do administrador.
  insert into public.schools (name, slug, status)
  values (v_name, v_slug, 'active')
  returning id into v_school_id;

  -- p_plan nasce como override_plan (concessão administrativa permanente
  -- do proprietário), nunca como contracted_plan — esta função nunca tem
  -- evidência de contratação financeira. plan continua gravado igual,
  -- só como espelho de compatibilidade para os leitores que ainda o
  -- consultam.
  insert into public.school_subscriptions (
    school_id,
    plan,
    billing_type,
    status,
    price,
    granted_by,
    grant_reason,
    contracted_plan,
    override_plan,
    override_expires_at
  )
  values (
    v_school_id,
    p_plan,
    'fixed_school',
    'active',
    p_price,
    auth.uid(),
    'Provisionamento manual pelo proprietário da plataforma',
    null,
    p_plan,
    null
  );

  if v_user_id is not null then
    -- Conta já confirmada: vínculo imediato. Comportamento já testado e
    -- aprovado, idêntico ao que existia antes desta mudança.
    insert into public.school_members (school_id, user_id, role, status)
    values (v_school_id, v_user_id, 'school_admin', 'active')
    returning id into v_member_id;

    insert into public.school_member_permissions (member_id)
    values (v_member_id)
    on conflict (member_id) do nothing;

    v_admin_state := 'linked';
  else
    -- Conta inexistente OU existente e ainda não confirmada: os dois casos
    -- recebem o mesmo tratamento aqui — um convite school_admin pendente.
    -- A diferença entre "nunca existiu" e "existe mas não confirmou" só
    -- importa para o envio do e-mail (Edge Function invite_school_admin),
    -- nunca para esta função.
    insert into public.school_invitations (school_id, email, role, invited_by)
    values (v_school_id, v_email, 'school_admin', auth.uid())
    returning id, token into v_invitation_id, v_invitation_token;

    v_admin_state := 'invited';
  end if;

  perform public.record_platform_audit(
    'school_provisioned',
    v_school_id,
    v_user_id,
    '{}'::jsonb,
    jsonb_build_object(
      'school_name', v_name,
      'plan', p_plan,
      'price', p_price,
      'admin_state', v_admin_state
    )
  );

  return jsonb_build_object(
    'school_id', v_school_id,
    'admin_state', v_admin_state,
    'admin_user_id', v_user_id,
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
