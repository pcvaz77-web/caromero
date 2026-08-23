-- CARÔMETRO COMERCIAL
-- Migration 028: fonte de verdade de "Gerenciar Conselheiros" passa a ser
-- school_member_permissions.can_manage_counselors por escola ativa —
-- alinhada à RLS real de class_counselors (que já usa
-- has_school_permission(school_id,'can_manage_counselors'), não alterada
-- aqui), em vez de user_permissions.can_manage_counselors (global, sem
-- noção de escola).
--
-- Achados da auditoria que motivam esta migration:
--   - list_counselor_candidates() (sem argumento) retornava TODO usuário
--     com linha em user_permissions, sem nenhum filtro por escola/status:
--     incluía usuários de outra escola (estrutural, hoje sem efeito
--     visível pois só existe 1 escola), membros com school_members.status
--     = 'suspended' (nelmaduartesoares@gmail.com, confirmado em produção)
--     e usuários sem nenhum vínculo comercial (melhorparte1@gmail.com,
--     confirmado em produção).
--   - can_manage_class_counselors() (sem argumento) e o gate do frontend
--     usavam user_permissions.can_manage_counselors (legado, global);
--     como a RLS de SELECT de class_counselors já exige
--     has_school_permission(school_id,'can_manage_counselors') (comercial),
--     um coordenador com o flag legado true e o comercial false (caso
--     real confirmado: pcvaz25@gmail.com) conseguia abrir a tela mas via
--     a lista de conselheiros já cadastrados sempre vazia, e a gravação
--     falhava com "new row violates row-level security policy" (o
--     .upsert() do supabase-js sempre pede RETURNING, que também depende
--     da mesma policy de SELECT).
--
-- can_manage_class_counselors(): assinatura muda de () para
-- (target_school_id uuid). DROP da assinatura antiga demonstrado seguro
-- por auditoria: nenhuma policy RLS ativa a referencia (verificado via
-- pg_policies.qual/with_check) e nenhuma outra função a chama (verificado
-- via pg_proc.prosrc) além de list_counselor_candidates(), substituída
-- nesta mesma migration. O arquivo solto supabase-coordinator-manage-
-- counselors.sql definia uma versão ainda mais antiga desta função com
-- policies próprias (nomes "Authenticated users view counselor
-- assignments" etc.) — essas policies não existem mais em produção há
-- muito tempo (substituídas pelas 4 policies escopadas por escola já
-- ativas hoje: school_members_can_view_class_counselors,
-- authorized_school_members_can_edit/add/delete_class_counselors),
-- confirmado consultando pg_policies antes desta migration.
--
-- list_counselor_candidates(): mesma troca de assinatura (mesmo motivo:
-- nenhuma outra referência encontrada). Passa a exigir target_school_id
-- explícito (mesmo padrão de report_uniform_status/report_students) e
-- filtra:
--   - sm.school_id = target_school_id (nunca outra escola);
--   - sm.status = 'active' (nunca suspenso, nunca sem vínculo);
--   - sm.role in ('teacher','coordinator') (nunca school_admin — regra de
--     produto: administrador não é candidato elegível a conselheiro).
-- Não restringe nada além disso: o trigger enforce_counselor_school_scope
-- (não alterado aqui) continua sendo a validação final no momento de
-- salvar.
--
-- Esta migration NÃO altera: RLS de class_counselors, a tabela
-- class_counselors, o trigger enforce_counselor_school_scope,
-- set_school_member_permission, set_school_member_role, RLS/tabela de
-- user_permissions, nem qualquer dado existente. Nenhum UPDATE de dado é
-- feito aqui — a sincronização do usuário divergente (pcvaz25@gmail.com)
-- é uma etapa de dado separada, deliberadamente fora desta migration
-- estrutural, a ser autorizada depois de validar estas RPCs.

begin;

drop function if exists public.can_manage_class_counselors();

create or replace function public.can_manage_class_counselors(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.school_members sm
    join public.school_member_permissions smp on smp.member_id = sm.id
    where sm.user_id = auth.uid()
      and sm.school_id = target_school_id
      and sm.role = 'coordinator'
      and sm.status = 'active'
      and smp.can_manage_counselors = true
  );
$function$;

revoke all on function public.can_manage_class_counselors(uuid) from public;
revoke all on function public.can_manage_class_counselors(uuid) from anon;
grant execute on function public.can_manage_class_counselors(uuid) to authenticated;

drop function if exists public.list_counselor_candidates();

create or replace function public.list_counselor_candidates(target_school_id uuid)
returns table(user_id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.can_manage_class_counselors(target_school_id) then
    raise exception 'Somente um coordenador autorizado pode listar candidatos a conselheiro';
  end if;

  return query
  select sm.user_id, pr.email::text, pr.full_name::text
  from public.school_members sm
  join public.profiles pr on pr.id = sm.user_id
  where sm.school_id = target_school_id
    and sm.status = 'active'
    and sm.role in ('teacher', 'coordinator')
  order by coalesce(nullif(trim(pr.full_name), ''), pr.email);
end;
$function$;

revoke all on function public.list_counselor_candidates(uuid) from public;
revoke all on function public.list_counselor_candidates(uuid) from anon;
grant execute on function public.list_counselor_candidates(uuid) to authenticated;

commit;
