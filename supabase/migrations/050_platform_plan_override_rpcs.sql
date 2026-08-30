-- CARÔMETRO COMERCIAL
-- Fundação das RPCs de concessão manual de plano (override), separadas
-- deliberadamente de platform_set_subscription_plan (mantida intocada e
-- funcionando exatamente como hoje). Nenhum leitor legado é alterado
-- nesta migration; contracted_plan/override_plan/school_effective_plan()
-- continuam sem uso por nenhum fluxo real além destas duas funções.
--
-- plan é apenas espelho temporário de compatibilidade para os leitores
-- legados que ainda não foram migrados para school_effective_plan() —
-- NÃO é mais a fonte conceitual de verdade do plano de uma escola. As
-- duas RPCs abaixo atualizam esse espelho só porque ele ainda é
-- consultado por platform_list_schools_with_counts_v3 e
-- platform_dashboard_summary; quando esses leitores migrarem, o espelho
-- e as duas linhas de UPDATE que o mantêm deixam de ser necessários.
--
-- Sem pg_cron, sem job periódico: por instrução explícita, não criamos
-- infraestrutura permanente só para sincronizar um campo que será
-- aposentado. A sincronização é só a que ocorre na própria escrita
-- (dentro desta função). Por isso, override_expires_at (concessão
-- temporária) não é exposto ainda no frontend — a expiração silenciosa
-- pela passagem do tempo, sem nenhuma escrita ocorrer, poderia deixar
-- plan divergente de school_effective_plan() até a próxima ação manual.
-- A RPC já suporta o parâmetro tecnicamente; a interface só libera essa
-- opção depois que os leitores legados migrarem.

begin;

create or replace function public.platform_set_plan_override(
  p_school_id uuid,
  p_override_plan text,
  p_override_expires_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous public.school_subscriptions%rowtype;
  v_effective text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_override_plan is null or p_override_plan not in ('free', 'basic', 'professional', 'enterprise') then
    raise exception 'Plano inválido.';
  end if;

  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'Informe um motivo válido para a concessão.';
  end if;

  if p_override_expires_at is not null and p_override_expires_at <= now() then
    raise exception 'A data de expiração da concessão deve estar no futuro.';
  end if;

  select * into v_previous
  from public.school_subscriptions
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Assinatura da escola não encontrada.';
  end if;

  update public.school_subscriptions
  set
    override_plan = p_override_plan,
    override_expires_at = p_override_expires_at,
    granted_by = auth.uid(),
    grant_reason = v_reason,
    updated_at = now()
  where school_id = p_school_id;

  -- school_effective_plan() é chamado DEPOIS do UPDATE acima, na mesma
  -- transação: enxerga corretamente o override_plan recém-gravado (mesma
  -- visibilidade de comando dentro da transação), então o espelho reflete
  -- o valor já resultante, nunca o estado anterior. plan é só o espelho
  -- de compatibilidade — ver nota no cabeçalho desta migration.
  v_effective := public.school_effective_plan(p_school_id);

  update public.school_subscriptions
  set plan = v_effective
  where school_id = p_school_id;

  perform public.record_platform_audit(
    'plan_override_set',
    p_school_id,
    null,
    jsonb_build_object(
      'override_plan', v_previous.override_plan,
      'override_expires_at', v_previous.override_expires_at,
      'plan', v_previous.plan
    ),
    jsonb_build_object(
      'override_plan', p_override_plan,
      'override_expires_at', p_override_expires_at,
      'plan', v_effective
    )
  );
end;
$function$;

create or replace function public.platform_remove_plan_override(
  p_school_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous public.school_subscriptions%rowtype;
  v_effective text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'Informe um motivo válido para a remoção da concessão.';
  end if;

  select * into v_previous
  from public.school_subscriptions
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Assinatura da escola não encontrada.';
  end if;

  -- contracted_plan nunca é tocado aqui: remover a concessão manual
  -- restaura o plano contratado vigente (se houver) ou 'free' — nunca
  -- apaga nem altera o que está contratado. A lógica de precedência já
  -- vive inteiramente em school_effective_plan(), chamada logo abaixo.
  update public.school_subscriptions
  set
    override_plan = null,
    override_expires_at = null,
    granted_by = auth.uid(),
    grant_reason = v_reason,
    updated_at = now()
  where school_id = p_school_id;

  -- plan é só o espelho de compatibilidade — ver nota no cabeçalho desta
  -- migration. Chamado depois do UPDATE acima, mesma transação.
  v_effective := public.school_effective_plan(p_school_id);

  update public.school_subscriptions
  set plan = v_effective
  where school_id = p_school_id;

  perform public.record_platform_audit(
    'plan_override_removed',
    p_school_id,
    null,
    jsonb_build_object(
      'override_plan', v_previous.override_plan,
      'override_expires_at', v_previous.override_expires_at,
      'plan', v_previous.plan
    ),
    jsonb_build_object(
      'override_plan', null,
      'override_expires_at', null,
      'plan', v_effective
    )
  );
end;
$function$;

revoke all on function public.platform_set_plan_override(uuid, text, timestamptz, text) from public;
revoke all on function public.platform_set_plan_override(uuid, text, timestamptz, text) from anon;
grant execute on function public.platform_set_plan_override(uuid, text, timestamptz, text) to authenticated;

revoke all on function public.platform_remove_plan_override(uuid, text) from public;
revoke all on function public.platform_remove_plan_override(uuid, text) from anon;
grant execute on function public.platform_remove_plan_override(uuid, text) to authenticated;

commit;
