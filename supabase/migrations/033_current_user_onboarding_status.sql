-- CARÔMETRO COMERCIAL
-- Corrige o primeiro acesso via convite: hoje accept-invite.html só exige
-- definição de senha para role = 'school_admin', mas coordenador/professor
-- passam pelo mesmo mecanismo nativo do Supabase (inviteUserByEmail /
-- signInWithOtp) e chegam autenticados sem nunca ter definido senha nem
-- nome. Esta função dá ao frontend uma forma segura de saber, para a
-- própria sessão autenticada, se já existe senha própria e se já existe
-- nome válido salvo em profiles.full_name (fonte funcional do nome usado
-- no Carômetro em ocorrências e demais registros) — sem expor hash de
-- senha nem permitir consultar outra conta.
--
-- Não altera accept_school_invitation, create_school_invitation,
-- school_members, school_member_permissions, RLS existente ou os fluxos
-- já aprovados de coordenador/professor/segunda escola.

create or replace function public.current_user_onboarding_status()
returns table(has_password boolean, has_name boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select u.encrypted_password is not null and u.encrypted_password <> ''
      from auth.users u
      where u.id = auth.uid()
    ), false) as has_password,
    coalesce((
      select length(trim(p.full_name)) >= 2
      from public.profiles p
      where p.id = auth.uid()
    ), false) as has_name;
$$;

revoke all on function public.current_user_onboarding_status() from public;
revoke all on function public.current_user_onboarding_status() from anon;
grant execute on function public.current_user_onboarding_status() to authenticated;
