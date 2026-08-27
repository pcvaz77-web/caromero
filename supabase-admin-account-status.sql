-- Execute uma vez no Supabase: SQL Editor > New query > Run.
--
-- Disponibiliza para o proprietário da plataforma, com segurança, os campos
-- necessários para distinguir "aguardando confirmação de e-mail" de
-- "acesso ativo"/"acesso suspenso" na tela de configurações. Não altera
-- estrutura, trigger ou valor existente durante a instalação; a segunda RPC
-- abaixo somente altera access_status quando o proprietário a chama depois.
--
-- auth.users não é acessível ao cliente (chave anon/authenticated não tem
-- grants nesse schema), por isso a leitura precisa passar por uma function
-- SECURITY DEFINER estritamente restrita ao proprietário ativo.

begin;

create or replace function public.admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  access_status text,
  email_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Checagem do proprietário é a primeira instrução: nenhuma linha é
  -- montada ou retornada antes de confirmar a autoridade global do chamador.
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  -- auth.users.email é character varying(255) (não text); profiles.full_name
  -- e user_permissions.role/access_status podem ter o mesmo tipo, dependendo
  -- de como cada tabela foi criada originalmente. Casts explícitos garantem
  -- que o tipo de saída bata com o RETURNS TABLE declarado, qualquer que
  -- seja o tipo real da coluna de origem.
  return query
  select
    u.id::uuid as user_id,
    u.email::text as email,
    p.full_name::text as full_name,
    case
      when exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = u.id
          and pa.role = 'owner'
          and pa.status = 'active'
      ) then 'platform_owner'
      else up.role::text
    end as role,
    paa.status::text as access_status,
    (u.email_confirmed_at is not null)::boolean as email_confirmed
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_permissions up on up.user_id = u.id
  left join public.platform_account_access paa on paa.user_id = u.id
  order by u.created_at;
end;
$function$;

-- Só authenticated pode chamar; anon nunca. A checagem do proprietário
-- dentro da function impede qualquer outro autenticado de ler a lista.
revoke all on function public.admin_list_accounts() from public;
revoke all on function public.admin_list_accounts() from anon;
grant execute on function public.admin_list_accounts() to authenticated;


-- Suspensão e reativação são operações globais da plataforma. A RPC
-- impede que uma policy legada de user_permissions transforme um
-- administrador escolar em administrador de contas da plataforma.
create or replace function public.platform_set_account_access(
  target_user_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous_status text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if target_status is null or target_status not in ('active', 'suspended') then
    raise exception 'Status de acesso inválido.';
  end if;

  if exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = target_user_id
      and pa.role = 'owner'
  ) then
    raise exception 'O proprietário da plataforma não pode ser suspenso.';
  end if;

  select paa.status
    into v_previous_status
  from public.platform_account_access paa
  where paa.user_id = target_user_id
  for update;

  v_previous_status := coalesce(v_previous_status, 'unconfigured');

  insert into public.platform_account_access (user_id, status, updated_at)
  select target_user_id, target_status, now()
  where exists (select 1 from auth.users u where u.id = target_user_id)
  on conflict (user_id) do update
  set status = excluded.status,
      updated_at = now();

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  perform public.record_platform_audit(
    'account_access_changed',
    null,
    target_user_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', target_status)
  );
end;
$function$;

revoke all on function public.platform_set_account_access(uuid, text) from public;
revoke all on function public.platform_set_account_access(uuid, text) from anon;
grant execute on function public.platform_set_account_access(uuid, text) to authenticated;


-- Configuração global de venda: somente o proprietário decide se o botão
-- de assinatura aparece na tela pública de login.
create or replace function public.platform_set_subscription_visibility(
  p_show_subscription boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_rows integer;
  v_previous_visibility boolean;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_show_subscription is null then
    raise exception 'Visibilidade inválida.';
  end if;

  select ps.show_subscription
    into v_previous_visibility
  from public.platform_settings ps
  where ps.id = true
  for update;

  if not found then
    raise exception 'Configuração da plataforma não encontrada.';
  end if;

  update public.platform_settings
  set
    show_subscription = p_show_subscription,
    updated_at = now()
  where id = true;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Configuração da plataforma não encontrada.';
  end if;

  perform public.record_platform_audit(
    'subscription_visibility_changed',
    null,
    null,
    jsonb_build_object('show_subscription', v_previous_visibility),
    jsonb_build_object('show_subscription', p_show_subscription)
  );
end;
$function$;

revoke all on function public.platform_set_subscription_visibility(boolean) from public;
revoke all on function public.platform_set_subscription_visibility(boolean) from anon;
grant execute on function public.platform_set_subscription_visibility(boolean) to authenticated;

commit;
