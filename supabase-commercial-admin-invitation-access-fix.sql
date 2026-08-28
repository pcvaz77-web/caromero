-- CARÔMETRO COMERCIAL
-- Correção mínima: enforce_invitation_effective_school_access bloqueava o
-- proprietário da plataforma ao inserir o convite school_admin de uma escola
-- recém-criada, onde ele nunca é membro. O trigger irmão em
-- school_member_permissions (enforce_member_permission_effective_access) já
-- tem essa exceção para is_platform_owner(); este trigger não tinha.
-- Preparado para aplicação posterior; este arquivo não executa nada sozinho.
-- Aplicar SOMENTE no Supabase Comercial (ppkndfwmqdmomkjoemre). Não tocar no legado.
--
-- Única mudança: a condição de bypass do trigger passa a incluir
-- public.is_platform_owner(), igual ao trigger irmão. Nenhuma outra proteção
-- é alterada — a checagem de membro ativo continua exatamente igual para
-- administradores, coordenadores, professores e qualquer outro chamador.
-- create_school_invitation, accept_school_invitation, RLS e qualquer outra
-- função/política permanecem intocadas.

begin;

create or replace function public.enforce_invitation_effective_school_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() = 'service_role' or public.is_platform_owner() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'expired'
     and old.expires_at <= now()
     and new.school_id = old.school_id then
    return new;
  end if;

  if auth.uid() is null
     or not public.is_active_school_member(new.school_id) then
    raise exception 'O acesso a esta escola está suspenso ou indisponível.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_invitation_effective_school_access() from public;
revoke all on function public.enforce_invitation_effective_school_access() from anon;

commit;
