-- CARÔMETRO COMERCIAL
-- Migration 020: get_invitation_preview() passa a informar, de forma
-- segura, se o e-mail convidado já possui conta confirmada.
--
-- Causa corrigida (auditoria em modo leitura já apresentada e aprovada):
-- accept-invite.html sempre abre na aba "Criar conta" e chama
-- db.auth.signUp() incondicionalmente quando essa aba é usada. Para um
-- e-mail que já tem conta confirmada, o Supabase Auth responde com a ação
-- interna "user_repeated_signup": HTTP 200, sem erro, sem sessão e — mais
-- importante — SEM enviar nenhum e-mail (comportamento documentado do
-- Supabase para não permitir enumeração de contas por e-mail). O frontend,
-- não sabendo diferenciar isso de um cadastro novo bem-sucedido, mostra
-- "Confirme o e-mail recebido", quando nenhum e-mail foi de fato enviado.
-- Caso real comprovado nos logs de auth.audit_log_entries e nos logs de
-- API do Auth (event action "user_repeated_signup") para
-- melhorparte1@gmail.com, em 2026-08-21.
--
-- Esta migration NÃO altera create_school_invitation, accept_school_invitation
-- (que já valida corretamente, no próprio banco, que a sessão autenticada
-- corresponde ao e-mail do convite antes de criar o vínculo em
-- school_members — nenhuma mudança necessária ali), manage-user,
-- cancelled_logins, RLS ou qualquer vínculo/permissão existente.
--
-- get_invitation_preview() precisa ser recriada (não CREATE OR REPLACE)
-- porque o Postgres não permite mudar o conjunto de colunas de um
-- RETURNS TABLE por CREATE OR REPLACE FUNCTION — é obrigatório DROP
-- FUNCTION antes. Isso remove os grants da função, por isso eles são
-- reaplicados explicitamente logo abaixo, replicando exatamente (nem mais
-- nem menos) o que a função já tinha: EXECUTE para anon, authenticated e
-- service_role.
--
-- A nova coluna email_has_account só é computada e retornada quando o
-- token de convite já é válido (pending, não expirado) — ou seja, nunca é
-- possível descobrir se um e-mail arbitrário tem conta sem antes possuir
-- um convite real e válido para aquele e-mail. Não expõe o e-mail
-- completo (masked_email continua igual). Considera apenas contas com
-- auth.users.email_confirmed_at preenchido e deleted_at nulo — uma conta
-- nunca confirmada não dispara o problema (o Supabase reenvia a
-- confirmação normalmente nesse caso) e uma conta excluída via "Cancelar
-- login" (manage-user, auth.admin.deleteUser) já não existe mais em
-- auth.users, então signUp() para ela funciona como um cadastro
-- genuinamente novo.

begin;

drop function public.get_invitation_preview(uuid);

create or replace function public.get_invitation_preview(invitation_token uuid)
returns table(
  school_name text,
  role text,
  masked_email text,
  email_has_account boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_school_name text;
  v_local text;
  v_domain text;
  v_has_account boolean;
begin
  select *
    into v_invitation
  from public.school_invitations
  where token = invitation_token
    and status = 'pending'
    and expires_at > now();

  if not found then
    return;
  end if;

  select s.name
    into v_school_name
  from public.schools s
  where s.id = v_invitation.school_id;

  v_local := split_part(v_invitation.email, '@', 1);
  v_domain := split_part(v_invitation.email, '@', 2);

  select exists (
    select 1
    from auth.users u
    where lower(trim(u.email)) = lower(trim(v_invitation.email))
      and u.deleted_at is null
      and u.email_confirmed_at is not null
  )
  into v_has_account;

  return query
  select
    v_school_name,
    v_invitation.role,
    left(v_local, least(3, length(v_local))) || '***@' || v_domain,
    coalesce(v_has_account, false);
end;
$function$;

revoke all on function public.get_invitation_preview(uuid) from public;
grant execute on function public.get_invitation_preview(uuid) to anon;
grant execute on function public.get_invitation_preview(uuid) to authenticated;
grant execute on function public.get_invitation_preview(uuid) to service_role;

commit;
