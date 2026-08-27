-- CARÔMETRO
-- RPC segura para reivindicar/atualizar uma assinatura Push por endpoint,
-- sem afrouxar a RLS de push_subscriptions.
--
-- Motivação: o mesmo endpoint de Push (navegador/dispositivo) pode já
-- pertencer a outro user_id (dispositivo compartilhado, teste anterior,
-- troca de conta sem logout explícito). O upsert direto do cliente
-- ("push_subscriptions".upsert(..., {onConflict:'endpoint'})) é corretamente
-- bloqueado pela RLS "using (user_id=auth.uid())" nesse caso — o erro real
-- é "new row violates row-level security policy (USING expression)".
--
-- Esta função resolve isso com uma via estreita e auditável: só permite
-- reivindicar um endpoint para o PRÓPRIO usuário autenticado (auth.uid()
-- interno, nunca recebido como parâmetro) — nunca altera a linha de
-- terceiros por qualquer outro caminho.
--
-- Escopo: só esta função. Não altera a RLS de push_subscriptions, não
-- altera a Edge Function, não altera envio de Push nem notificações
-- internas, não toca nenhuma migration 001-015, não é a Migration 016.

begin;

create or replace function public.claim_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.is_platform_owner()
     and not exists (
       select 1
       from public.school_members sm
       where sm.user_id = auth.uid()
         and public.can_use_school(sm.school_id)
     ) then
    raise exception 'Conta sem acesso ativo a uma escola.';
  end if;

  if nullif(btrim(p_endpoint), '') is null
     or nullif(btrim(p_p256dh), '') is null
     or nullif(btrim(p_auth_key), '') is null then
    raise exception 'Assinatura Push incompleta.';
  end if;

  if length(p_endpoint) > 4096
     or length(p_p256dh) > 512
     or length(p_auth_key) > 512
     or length(coalesce(p_user_agent, '')) > 1024 then
    raise exception 'Assinatura Push inválida.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, enabled, last_seen_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key, p_user_agent, true, now())
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        enabled = true,
        last_seen_at = now();
end;
$$;

revoke all on function public.claim_push_subscription(text, text, text, text) from public;
revoke all on function public.claim_push_subscription(text, text, text, text) from anon;
grant execute on function public.claim_push_subscription(text, text, text, text) to authenticated;

commit;
