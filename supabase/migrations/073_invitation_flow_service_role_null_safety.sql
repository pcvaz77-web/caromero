-- CARÔMETRO COMERCIAL
-- Correção de defesa em profundidade nas duas RPCs internas do fluxo de
-- convite (Migrations 071 e 072). A guarda interna
--   if auth.role() <> 'service_role' then raise exception ...
-- não é fail-closed quando auth.role() retorna NULL (conexão sem claim de
-- JWT): NULL <> 'service_role' avalia para NULL, e o IF do PL/pgSQL trata
-- NULL como "não verdadeiro" — a exceção não dispara. Os GRANTs/REVOKEs já
-- aplicados continuam sendo a proteção efetiva contra anon/authenticated
-- (confirmado por has_function_privilege); esta correção fecha a defesa em
-- profundidade para qualquer contexto de chamada sem claim, sem depender
-- só do GRANT.
--
-- CREATE OR REPLACE preserva integralmente assinatura, parâmetros,
-- RETURNS, lógica, privilégios, search_path e comportamento — nenhuma
-- coluna de retorno muda em nenhuma das duas funções, então não há
-- necessidade de DROP. Escopo estritamente limitado às duas RPCs do fluxo
-- de convite; platform_activate_paid_subscription e
-- platform_sync_paid_subscription_access (mesmo defeito, fora do fluxo de
-- convite) permanecem fora desta migration, para decisão futura separada.
--
-- Migrations 071 e 072 não são editadas — esta é uma nova migration que
-- substitui as duas funções via CREATE OR REPLACE.

begin;

create or replace function public.claim_school_invitation_resend_slot(p_token uuid)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  recipient_email text,
  create_user boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_wait_seconds integer;
begin
  -- Defesa em profundidade além do GRANT/REVOKE abaixo: mesmo que algum
  -- caminho futuro conceda EXECUTE incorretamente, a função ainda se
  -- recusa a rodar fora do contexto de service_role. IS DISTINCT FROM,
  -- não <>, para permanecer fail-closed mesmo quando auth.role() é NULL.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Acesso negado.';
  end if;

  -- Trava a linha do convite: duas chamadas simultâneas para o mesmo
  -- token serializam aqui — a segunda só prossegue depois que a primeira
  -- já gravou (ou não) last_auth_sent_at, então nunca as duas passam pelo
  -- cooldown ao mesmo tempo.
  select *
    into v_invitation
  from public.school_invitations
  where token = p_token
  for update;

  if not found
     or v_invitation.status <> 'pending'
     or v_invitation.expires_at <= now() then
    return query select false, null::integer, null::text, null::boolean;
    return;
  end if;

  if v_invitation.last_auth_sent_at is not null
     and v_invitation.last_auth_sent_at > now() - interval '60 seconds' then
    v_wait_seconds := ceil(extract(epoch from (
      v_invitation.last_auth_sent_at + interval '60 seconds' - now()
    )))::integer;
    return query select false, greatest(v_wait_seconds, 1), null::text, null::boolean;
    return;
  end if;

  update public.school_invitations
  set last_auth_sent_at = now()
  where id = v_invitation.id;

  return query
  select
    true,
    null::integer,
    v_invitation.email,
    not exists (
      select 1 from auth.users u
      where lower(trim(u.email)) = v_invitation.email
        and u.deleted_at is null
    );
end;
$function$;

revoke all on function public.claim_school_invitation_resend_slot(uuid) from public;
revoke all on function public.claim_school_invitation_resend_slot(uuid) from anon;
revoke all on function public.claim_school_invitation_resend_slot(uuid) from authenticated;
grant execute on function public.claim_school_invitation_resend_slot(uuid) to service_role;

create or replace function public.is_invitation_recipient_already_linked(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
begin
  -- Defesa em profundidade além do GRANT/REVOKE abaixo: mesmo padrão já
  -- usado em claim_school_invitation_resend_slot acima. IS DISTINCT FROM,
  -- não <>, para permanecer fail-closed mesmo quando auth.role() é NULL.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Acesso negado.';
  end if;

  select *
    into v_invitation
  from public.school_invitations
  where id = p_invitation_id;

  -- Convite inexistente: false, sem revelar mais nada — mesmo padrão de
  -- resposta genérica já usado em claim_school_invitation_resend_slot.
  if not found then
    return false;
  end if;

  return exists (
    select 1
    from public.school_members sm
    join auth.users u on u.id = sm.user_id
    where sm.school_id = v_invitation.school_id
      and sm.status = 'active'
      and lower(trim(u.email)) = v_invitation.email
      and u.deleted_at is null
  );
end;
$function$;

revoke all on function public.is_invitation_recipient_already_linked(uuid) from public;
revoke all on function public.is_invitation_recipient_already_linked(uuid) from anon;
revoke all on function public.is_invitation_recipient_already_linked(uuid) from authenticated;
grant execute on function public.is_invitation_recipient_already_linked(uuid) to service_role;

commit;
