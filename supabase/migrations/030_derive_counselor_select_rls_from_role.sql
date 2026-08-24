-- CARÔMETRO COMERCIAL
-- Migration 030: elimina a última dependência estrutural da flag legada
-- em "Gerenciar Conselheiros" — a policy de SELECT de class_counselors.
--
-- Contexto (auditoria em produção, sem escrita, motivada por pedido
-- explícito do usuário após a Migration 029):
--   A Migration 029 já tornou a autorização de Gerenciar Conselheiros
--   (can_manage_class_counselors(), e por consequência
--   list_counselor_candidates()) puramente derivada de
--   school_members.role='coordinator' AND status='active' AND
--   school_id=target_school_id — não mais de
--   school_member_permissions.can_manage_counselors.
--
--   As policies de INSERT/UPDATE/DELETE de class_counselors já usavam
--   is_active_school_coordinator(school_id) (puramente por role) desde
--   antes da 029 — nenhuma mudança necessária nelas.
--
--   Só a policy de SELECT (school_members_can_view_class_counselors)
--   ficou para trás: continua autorizando coordenadores via
--   has_school_permission(school_id,'can_manage_counselors'), que lê a
--   MESMA flag legada que a 029 removeu como fonte de autorização real.
--   Isso cria uma assimetria: um coordenador (por role) já pode
--   inserir/editar/excluir conselheiros mesmo com a flag dessincronizada,
--   mas o SELECT (ver as atribuições existentes) continuaria dependendo
--   dela — reintroduzindo, por uma porta lateral, exatamente a classe de
--   bug que a 029 eliminou (ex.: pcvaz25@gmail.com, coordenador sem a
--   flag sincronizada, via um caminho de escrita futuro que esqueça de
--   sincronizá-la).
--
-- Mudança: troca have_school_permission(...) por
-- is_active_school_coordinator(school_id) na policy de SELECT —
-- exatamente a mesma condição já usada nas policies de escrita e em
-- can_manage_class_counselors(). Acesso de school_admin
-- (is_school_admin(school_id)) e o acesso do próprio conselheiro à sua
-- atribuição (counselor_user_id = auth.uid()) são preservados
-- integralmente, sem nenhuma alteração.
--
-- Esta migration altera exclusivamente a policy de SELECT de
-- class_counselors (via ALTER POLICY, preservando nome, comando e
-- grants). Não altera: as demais 3 policies de class_counselors, a
-- tabela class_counselors, nenhum trigger, has_school_permission()
-- (ainda usada por outras permissões comerciais — Uniforme, Ocorrências,
-- Observações — que permanecem exatamente como estão), nenhuma outra
-- RLS, RPC ou dado existente. Nenhum UPDATE/INSERT/DELETE de dado é
-- feito aqui.

begin;

alter policy school_members_can_view_class_counselors
  on public.class_counselors
  using (
    school_id is not null
    and is_active_school_member(school_id)
    and (
      counselor_user_id = auth.uid()
      or is_school_admin(school_id)
      or is_active_school_coordinator(school_id)
    )
  );

commit;
