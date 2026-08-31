-- CARÔMETRO COMERCIAL
-- Primeira peça do frontend comercial: uma única RPC read-only que devolve
-- o plano efetivo, limites e features da escola ativa, para o frontend
-- comum (não o Painel do Dono, que continua com suas próprias RPCs
-- administrativas). Objetivo explícito: o frontend nunca duplica a matriz
-- de planos em JavaScript — só lê o que esta função já resolve usando as
-- fontes de verdade existentes (school_effective_plan_strict,
-- school_has_feature_strict, platform_plans). Se o Proprietário alterar
-- limite, composição, override ou plano contratado depois, esta RPC reflete
-- automaticamente, sem precisar de nova migration.
--
-- Segurança: não basta conhecer o UUID da escola. is_active_school_member()
-- já é o mesmo gate usado em toda a aplicação (vínculo ativo em
-- school_members para exatamente este school_id, escola ativa, conta da
-- plataforma ativa, assinatura com status ativo) — reaproveitado aqui
-- integralmente, não reimplementado. Nenhum bypass para o Proprietário da
-- Plataforma: ele só recebe capabilities de uma escola se for membro ativo
-- dela, exatamente como qualquer outro usuário.
--
-- Fail-closed: escola sem school_subscriptions, ou com configuração
-- comercial incompleta (sem override válido no momento e contracted_plan
-- NULL), nunca é convertida silenciosamente para Free — propaga
-- CONFIGURACAO_PLANO_AUSENTE via school_effective_plan_strict.
--
-- Contagens (student_count/class_count/staff_count): incluídas porque são
-- de baixo custo (COUNT indexado por school_id, mesmo padrão já usado em
-- 056/057 a cada escrita) e só executam depois que a checagem de membership
-- já validou o acesso — não são uma superfície nova de exposição de dados,
-- só evitam 3 round-trips extras do frontend para montar "1301 / ilimitado"
-- ou "800 / 800". staff_count segue exatamente a definição comercial da
-- 057: status='active' AND role IN ('teacher','coordinator') —
-- school_admin nunca conta.

begin;

create function public.get_active_school_plan_capabilities(p_school_id uuid)
returns table(
  school_id uuid,
  plan_key text,
  display_name text,
  max_students integer,
  max_staff integer,
  max_classes integer,
  item_control boolean,
  reports boolean,
  class_counselors boolean,
  student_count integer,
  class_count integer,
  staff_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_key text;
  v_display_name text;
  v_max_students integer;
  v_max_staff integer;
  v_max_classes integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if p_school_id is null or not public.is_active_school_member(p_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  -- Resolução estrita do plano: propaga CONFIGURACAO_PLANO_AUSENTE tanto
  -- para ausência de assinatura quanto para configuração comercial
  -- incompleta (sem override válido e contracted_plan NULL) — nunca infere
  -- Free silenciosamente.
  v_plan_key := public.school_effective_plan_strict(p_school_id);

  select p.display_name, p.max_students, p.max_staff, p.max_classes
    into v_display_name, v_max_students, v_max_staff, v_max_classes
  from public.platform_plans p
  where p.plan_key = v_plan_key;

  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;

  return query
  select
    p_school_id,
    v_plan_key,
    v_display_name,
    v_max_students,
    v_max_staff,
    v_max_classes,
    public.school_has_feature_strict(p_school_id, 'item_control'),
    public.school_has_feature_strict(p_school_id, 'reports'),
    public.school_has_feature_strict(p_school_id, 'class_counselors'),
    (select count(*)::integer from public.students s where s.school_id = p_school_id),
    (select count(*)::integer from public.classes c where c.school_id = p_school_id),
    (select count(*)::integer
       from public.school_members sm
       where sm.school_id = p_school_id
         and sm.status = 'active'
         and sm.role in ('teacher', 'coordinator'));
end;
$function$;

revoke all on function public.get_active_school_plan_capabilities(uuid) from public;
revoke all on function public.get_active_school_plan_capabilities(uuid) from anon;
grant execute on function public.get_active_school_plan_capabilities(uuid) to authenticated;

commit;
