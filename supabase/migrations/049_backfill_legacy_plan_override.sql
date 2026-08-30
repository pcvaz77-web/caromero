-- CARÔMETRO COMERCIAL
-- Backfill de compatibilidade, uma única vez, para as assinaturas
-- legadas ainda não classificadas no novo modelo (fundação criada na
-- migration 048). Cobre somente as linhas existentes no momento desta
-- aplicação — não é um mecanismo permanente; escolas provisionadas
-- futuramente serão tratadas separadamente em platform_provision_school.
--
-- Sem evidência de contratação financeira real para nenhuma linha hoje
-- (auditado: ambas as assinaturas atuais foram criadas/alteradas
-- exclusivamente pelo proprietário via RPC manual; a palavra
-- "contratação" em grant_reason não é, por si só, prova de pagamento) —
-- por isso todo o plano legado vira override_plan (concessão manual
-- permanente), nunca contracted_plan, que permanece NULL.
--
-- Não altera plan, status, price, billing_type, granted_by, grant_reason
-- nem grant_expires_at (só copiado, não movido) — e não toca em nenhuma
-- outra tabela. A aplicação continua lendo exclusivamente a coluna
-- legada plan depois desta migration.

begin;

update public.school_subscriptions
set
  override_plan = plan,
  override_expires_at = grant_expires_at
where override_plan is null
  and contracted_plan is null;

-- Autoverificação obrigatória: aborta a migration inteira se, para
-- qualquer linha, o plano efetivo calculado divergir do plano legado
-- vigente. Sem exceções toleradas.
do $$
declare
  v_mismatch_count integer;
begin
  select count(*)
    into v_mismatch_count
  from public.school_subscriptions
  where plan is distinct from public.school_effective_plan(school_id);

  if v_mismatch_count > 0 then
    raise exception 'Backfill abortado: % assinatura(s) com plano efetivo divergente do plano legado.', v_mismatch_count;
  end if;
end $$;

commit;
