-- CARÔMETRO COMERCIAL
-- Substitui a fonte de has_password em current_user_onboarding_status():
-- auth.users.encrypted_password NUNCA pode ser usado como prova de senha
-- própria — admin.auth.admin.inviteUserByEmail() grava um hash bcrypt
-- gerado internamente pelo GoTrue mesmo quando o usuário nunca escolheu
-- senha nenhuma (comprovado em auditoria: as 3 contas do projeto têm hash
-- de 60 caracteres, incluindo uma que nunca definiu senha própria).
--
-- Cria um estado próprio, gravado explicitamente pelo Carômetro somente
-- depois de um evento comprovado de senha bem-sucedida (login, cadastro,
-- definição no primeiro acesso, recuperação ou troca em "Meu Perfil") —
-- nunca inferido do estado interno do GoTrue.
--
-- Não altera a migration 033 (mantida como histórico). Só substitui
-- semanticamente current_user_onboarding_status() via CREATE OR REPLACE
-- (assinatura e tipo de retorno idênticos — não é necessário DROP).

create table if not exists public.user_credentials_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_set_at timestamptz not null default now()
);

alter table public.user_credentials_status enable row level security;
-- Nenhuma policy é criada de propósito: com RLS ligado e zero policies,
-- nenhuma role (nem authenticated, nem anon) enxerga ou grava linha
-- nenhuma aqui, mesmo que algum grant futuro seja concedido por engano. O
-- único caminho de escrita é a RPC abaixo; o único caminho de leitura é
-- dentro de current_user_onboarding_status(). Ambas security definer.
revoke all on public.user_credentials_status from public, anon, authenticated;

create or replace function public.mark_current_user_password_set()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.user_credentials_status (user_id, password_set_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set password_set_at = excluded.password_set_at;
end;
$$;

revoke all on function public.mark_current_user_password_set() from public;
revoke all on function public.mark_current_user_password_set() from anon;
grant execute on function public.mark_current_user_password_set() to authenticated;

create or replace function public.current_user_onboarding_status()
returns table(has_password boolean, has_name boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.user_credentials_status c where c.user_id = auth.uid()
    ) as has_password,
    coalesce((
      select length(trim(p.full_name)) >= 2
      from public.profiles p
      where p.id = auth.uid()
    ), false) as has_name;
$$;

-- Reafirma os grants explicitamente nesta migration para auditoria própria
-- (CREATE OR REPLACE não altera grants já concedidos na 033, mas deixamos
-- explícito aqui também).
revoke all on function public.current_user_onboarding_status() from public;
revoke all on function public.current_user_onboarding_status() from anon;
grant execute on function public.current_user_onboarding_status() to authenticated;
