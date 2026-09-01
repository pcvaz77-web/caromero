-- CARÔMETRO COMERCIAL
-- Etapa 1 (revisada para zero-downtime) da arquitetura definitiva de
-- convite/onboarding aprovada nesta sessão. Esta migration é
-- exclusivamente ADITIVA: nenhum objeto existente é removido, substituído
-- ou tem seu contrato alterado.
--
-- get_invitation_preview(uuid) — a função hoje usada pelo accept-invite.js
-- publicado — permanece EXATAMENTE como está. O novo contrato mínimo
-- (Arquitetura B: o frontend nunca recebe informação sobre existência de
-- conta ou senha antes da autenticação) nasce em uma função nova e
-- paralela, get_invitation_preview_v2, para que o fluxo em produção nunca
-- pare de funcionar entre esta etapa e a publicação do frontend novo
-- (Etapa 3). Só depois de confirmado que nenhum código chama mais a
-- função antiga é que uma migration separada decidirá se ela é mantida
-- por compatibilidade ou revogada/removida — nada disso acontece aqui.
--
-- Nenhuma linha existente de school_invitations é alterada por esta
-- migration. last_auth_sent_at nasce NULL para todo convite já existente e
-- só passa a ter valor quando claim_school_invitation_resend_slot for
-- chamada pela primeira vez para aquele convite (Etapa 2 em diante).

begin;

-- 1. Coluna aditiva para o cooldown de reenvio.
alter table public.school_invitations
  add column if not exists last_auth_sent_at timestamptz null;

-- 2. RPC exclusiva de service_role: decide, de forma atômica e
-- server-side, se um novo OTP pode ser emitido para o convite, sem nunca
-- revelar ao chamador se a conta já existe. Recebe SOMENTE o token — o
-- destinatário do e-mail é sempre resolvido a partir de
-- school_invitations.email, nunca de um parâmetro do cliente. school_id e
-- role do convite nunca são recebidos nem retornados por esta função.
--
-- last_auth_sent_at é um SLOT DE TENTATIVA DE ENVIO, não uma confirmação
-- de entrega: é gravado antes de o Edge Function efetivamente chamar
-- signInWithOtp. Se essa chamada falhar depois por erro de infraestrutura
-- do lado do Supabase Auth, o cooldown de 60s permanece consumido mesmo
-- assim — isso é intencional, é a proteção contra abuso descrita no
-- desenho aprovado, e não deve ser compensado automaticamente revertendo
-- o timestamp (reverter reabriria a janela de corrida/abuso que esta
-- função existe para fechar). A camada de UI (Etapa 3) é responsável por
-- mostrar corretamente o erro de infraestrutura nesse caso, distinto da
-- mensagem de "aguarde para tentar de novo".
create function public.claim_school_invitation_resend_slot(p_token uuid)
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
  -- recusa a rodar fora do contexto de service_role. Mesmo padrão já
  -- usado em platform_activate_paid_subscription (061).
  if auth.role() <> 'service_role' then
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

-- Privilégios explícitos, sem depender de default implícito: PUBLIC,
-- anon e authenticated nunca executam; somente service_role (usado pelas
-- Edge Functions) executa. Mesmo padrão de 017/020/057/061.
revoke all on function public.claim_school_invitation_resend_slot(uuid) from public;
revoke all on function public.claim_school_invitation_resend_slot(uuid) from anon;
revoke all on function public.claim_school_invitation_resend_slot(uuid) from authenticated;
grant execute on function public.claim_school_invitation_resend_slot(uuid) to service_role;

-- 3. get_invitation_preview_v2: contrato mínimo aprovado (Arquitetura B).
-- Função NOVA e paralela — get_invitation_preview(uuid) original não é
-- tocada nesta migration. Retorna apenas o estado do CONVITE, nunca da
-- conta ou senha do e-mail convidado.
create function public.get_invitation_preview_v2(p_token uuid)
returns table(
  school_name text,
  role text,
  masked_email text,
  status text,
  reason text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_local text;
  v_domain text;
begin
  select i.*
    into v_invitation
  from public.school_invitations i
  where i.token = p_token;

  if not found then
    return query select null::text, null::text, null::text, 'unavailable', 'not_found';
    return;
  end if;

  if v_invitation.status = 'accepted' then
    return query select null::text, null::text, null::text, 'unavailable', 'accepted';
    return;
  end if;

  if v_invitation.status = 'cancelled' then
    return query select null::text, null::text, null::text, 'unavailable', 'cancelled';
    return;
  end if;

  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    return query select null::text, null::text, null::text, 'unavailable', 'expired';
    return;
  end if;

  v_local := split_part(v_invitation.email, '@', 1);
  v_domain := split_part(v_invitation.email, '@', 2);

  return query
  select
    s.name,
    v_invitation.role,
    left(v_local, least(3, length(v_local))) || '***@' || v_domain,
    'pending',
    null::text
  from public.schools s
  where s.id = v_invitation.school_id
    and s.status = 'active'
    and exists (
      select 1
      from public.school_subscriptions ss
      where ss.school_id = s.id
        and ss.status = 'active'
        and (ss.grant_expires_at is null or ss.grant_expires_at > now())
    );

  -- Convite pending/válido, mas escola ou assinatura indisponível: mesma
  -- rotulagem 'not_found' do contrato aprovado (4 motivos: expired /
  -- cancelled / accepted / not_found), sem introduzir um quinto motivo
  -- fora do que foi combinado.
  if not found then
    return query select null::text, null::text, null::text, 'unavailable', 'not_found';
  end if;
end;
$function$;

revoke all on function public.get_invitation_preview_v2(uuid) from public;
grant execute on function public.get_invitation_preview_v2(uuid) to anon;
grant execute on function public.get_invitation_preview_v2(uuid) to authenticated;

commit;
