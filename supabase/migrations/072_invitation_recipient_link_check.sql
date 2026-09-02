-- CARÔMETRO COMERCIAL
-- Fase A (Edge Function de convite) — infraestrutura interna, exclusiva de
-- service_role, para eliminar a paginação de auth.users (listUsers) que
-- ainda restava em send-school-invitation.
--
-- Migration puramente aditiva: não altera nenhuma tabela, RLS, policy ou
-- função existente, inclusive a Migration 071 (claim_school_invitation_resend_slot
-- e get_invitation_preview_v2 permanecem exatamente como estão).
--
-- Separação de responsabilidade deliberada: esta função responde SOMENTE
-- "o e-mail deste convite já é membro ativo desta escola?" — nunca valida
-- status/expiração/papel do convite. Essas validações já são feitas antes,
-- em handleAdminMode (supabase/functions/send-school-invitation/index.ts),
-- que só chama esta RPC depois de confirmar que o convite está pending,
-- não expirado e que o papel é permitido. Duplicar essa validação aqui
-- criaria duas fontes de verdade para a mesma regra.

begin;

create function public.is_invitation_recipient_already_linked(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
begin
  -- Defesa em profundidade além do GRANT/REVOKE abaixo: mesmo padrão já
  -- usado em claim_school_invitation_resend_slot (Migration 071) e em
  -- platform_activate_paid_subscription (Migration 061).
  if auth.role() <> 'service_role' then
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

-- Privilégios explícitos, sem depender de default implícito: PUBLIC, anon
-- e authenticated nunca executam; somente service_role (usado pela Edge
-- Function) executa. Mesmo padrão de 017/020/057/061/071.
revoke all on function public.is_invitation_recipient_already_linked(uuid) from public;
revoke all on function public.is_invitation_recipient_already_linked(uuid) from anon;
revoke all on function public.is_invitation_recipient_already_linked(uuid) from authenticated;
grant execute on function public.is_invitation_recipient_already_linked(uuid) to service_role;

commit;
