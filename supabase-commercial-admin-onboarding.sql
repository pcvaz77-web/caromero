-- CARÔMETRO COMERCIAL
-- P0: onboarding definitivo do administrador principal.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.
-- Aplicar SOMENTE no Supabase Comercial (ppkndfwmqdmomkjoemre). Não tocar no legado.
--
-- Faz duas coisas, nesta ordem, dentro da mesma transação:
--   1. permite role = 'school_admin' em public.school_invitations, mantendo
--      coordinator/teacher exatamente como já eram aceitos;
--   2. substitui public.platform_provision_school para que, quando o e-mail do
--      administrador ainda não tiver conta confirmada, a escola seja criada
--      normalmente e um convite school_admin seja gerado, em vez de lançar
--      exceção. O tipo de retorno muda de uuid para jsonb, por isso a função
--      precisa ser removida e recriada. Postgres não permite CREATE OR REPLACE
--      quando o tipo de retorno muda.
--
-- Nenhuma mudança em accept_school_invitation, create_school_invitation,
-- school_members, school_member_permissions, RLS ou nos fluxos de
-- coordenador/professor já aprovados — todos continuam exatamente como estão.

begin;

-- 1. Amplia o papel aceito em convites, só o suficiente para permitir
--    school_admin. A função create_school_invitation, chamável por
--    administradores e coordenadores comuns, continua sem nenhuma mudança,
--    rejeitando 'school_admin' na própria função — esta é a defesa real
--    contra autoelevação, não a constraint da tabela.
alter table public.school_invitations
  drop constraint school_invitations_role_check,
  add constraint school_invitations_role_check
    check (role in ('coordinator', 'teacher', 'school_admin'));

-- 2. Remove a versão atual, que retorna uuid, antes de recriar com jsonb.
drop function if exists public.platform_provision_school(text, text, text, numeric);

create function public.platform_provision_school(
  p_school_name text,
  p_admin_email text,
  p_plan text default 'free',
  p_price numeric default 0
)
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
