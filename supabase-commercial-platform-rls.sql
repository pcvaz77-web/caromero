-- CARÔMETRO COMERCIAL
-- Endurecimento da administração global da plataforma.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.

begin;

drop policy if exists "platform_admins_can_view_self" on public.platform_admins;
create policy "platform_admins_can_view_self"
on public.platform_admins
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_owner()
);

-- Operadores não alteram a própria função/status nem criam outros operadores
-- por acesso direto à tabela. Um futuro fluxo deverá usar RPC owner-only.
revoke insert, update, delete on public.platform_admins from anon, authenticated;

drop policy if exists "platform_admins_manage_subscriptions" on public.school_subscriptions;
drop policy if exists "platform_owner_reads_subscriptions" on public.school_subscriptions;
create policy "platform_owner_reads_subscriptions"
on public.school_subscriptions
for select
to authenticated
using (public.is_platform_owner());

-- As alterações são feitas somente pelas RPCs SECURITY DEFINER que verificam
-- is_platform_owner() antes de escrever.
revoke insert, update, delete on public.school_subscriptions from anon, authenticated;

commit;
