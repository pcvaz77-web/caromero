-- CARÔMETRO COMERCIAL
-- Enforcement real das funcionalidades comerciais item_control, reports e
-- class_counselors, no backend, como autoridade — nunca dependente do
-- frontend. Regra fundamental preservada em toda alteração desta migration:
-- acesso a recurso comercial é sempre "plano permite E permissão/role atual
-- permite" — nunca OU, e nunca uma condição substitui a outra. Toda função
-- recriada abaixo preserva integralmente suas validações, roles, permissões,
-- escopo por escola, auth.uid(), checagem de membro ativo, tratamento de
-- parâmetros, comportamento/retorno, efeitos colaterais, SECURITY
-- DEFINER/INVOKER, search_path e grants já existentes — a única adição é a
-- dimensão comercial.
--
-- school_effective_plan() NÃO é alterada nesta migration: continua servindo,
-- sem mudança de comportamento, os leitores de compatibilidade já migrados
-- nas migrations 051/053. As três funções novas abaixo (*_strict e
-- assert_school_feature_access) existem exatamente porque
-- school_effective_plan() cai silenciosamente para 'free' em duas situações
-- — comportamento aceitável para leitura administrativa, mas inaceitável
-- para enforcement comercial: (1) a escola não tem linha em
-- school_subscriptions; (2) a linha existe mas está com configuração
-- comercial incompleta (sem override válido no momento E contracted_plan
-- NULL). Uma escola nessas condições nunca pode herdar silenciosamente o
-- que quer que o Free venha a ganhar no futuro. As versões estritas tratam
-- as duas situações como falha de configuração, nunca como "é Free".
--
-- Nenhum bypass para o Proprietário da Plataforma é criado em nenhuma das
-- funções abaixo — o único caminho de acesso a um recurso indisponível no
-- plano contratado continua sendo o mecanismo de concessão já existente
-- (override_plan, migrations 049/050).

begin;

-- =============================================================================
-- 1. FUNÇÕES ESTRITAS DE PLANO/FEATURE
-- =============================================================================

-- Versão estrita de school_effective_plan(), para uso em RPC/trigger (pode
-- levantar exceção). Diferença deliberada em relação à versão legada: além
-- da linha de assinatura precisar existir, uma configuração comercial
-- incompleta (nenhum override válido no momento E contracted_plan NULL)
-- também é tratada como falha — nunca cai para 'free'. Isso cobre o caso
-- em que a linha existe (ex.: status='active') mas nenhum plano foi
-- efetivamente atribuído, situação que a versão legada (mantida como está,
-- só para os leitores de compatibilidade já migrados) resolve para 'free'
-- silenciosamente.
create or replace function public.school_effective_plan_strict(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.school_subscriptions%rowtype;
begin
  select * into v_row
  from public.school_subscriptions
  where school_id = p_school_id;

  if not found then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;

  if v_row.override_plan is not null
     and (v_row.override_expires_at is null or v_row.override_expires_at > now()) then
    return v_row.override_plan;
  end if;

  if v_row.contracted_plan is null then
    raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
  end if;

  return v_row.contracted_plan;
end;
$function$;

-- Versão booleana estrita, para uso em predicados de RLS (que não podem
-- levantar exceção — precisam sempre resolver para um boolean). Mesmo
-- critério de configuração incompleta da versão acima: sem override válido
-- e contracted_plan NULL resolve para false, nunca para o resultado de
-- 'free'. Ausência de linha de assinatura ou feature_key desconhecida
-- também resolvem para false.
create or replace function public.school_has_feature_strict(p_school_id uuid, p_feature_key text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.school_subscriptions%rowtype;
  v_plan_key text;
  v_enabled boolean;
begin
  select * into v_row
  from public.school_subscriptions
  where school_id = p_school_id;

  if not found then
    return false;
  end if;

  if v_row.override_plan is not null
     and (v_row.override_expires_at is null or v_row.override_expires_at > now()) then
    v_plan_key := v_row.override_plan;
  elsif v_row.contracted_plan is not null then
    v_plan_key := v_row.contracted_plan;
  else
    return false;
  end if;

  select enabled into v_enabled
  from public.platform_plan_features
  where plan_key = v_plan_key
    and feature_key = p_feature_key;

  return coalesce(v_enabled, false);
end;
$function$;

-- Ponto único de enforcement para RPC/trigger (contextos que podem
-- levantar exceção): resolve o plano pela via estrita (propaga
-- CONFIGURACAO_PLANO_AUSENTE se não houver assinatura ou se a configuração
-- estiver incompleta) e, se o plano resolvido não tiver a feature
-- habilitada, levanta RECURSO_PLANO_INDISPONIVEL com o nome amigável do
-- plano — sem detalhe interno.
create or replace function public.assert_school_feature_access(p_school_id uuid, p_feature_key text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_key text;
  v_display_name text;
  v_enabled boolean;
begin
  v_plan_key := public.school_effective_plan_strict(p_school_id);

  select p.display_name into v_display_name
  from public.platform_plans p
  where p.plan_key = v_plan_key;

  select enabled into v_enabled
  from public.platform_plan_features
  where plan_key = v_plan_key
    and feature_key = p_feature_key;

  if not coalesce(v_enabled, false) then
    raise exception 'RECURSO_PLANO_INDISPONIVEL: Este recurso não está disponível no plano % desta escola.', coalesce(v_display_name, v_plan_key);
  end if;
end;
$function$;

-- Grants mínimos necessários: school_effective_plan_strict e
-- assert_school_feature_access só são chamadas internamente por outras
-- funções SECURITY DEFINER (rodam como o dono, sem precisar de EXECUTE
-- próprio do chamador) — mesmo padrão de enforce_student_plan_limit/
-- limit_student_field_updates (migrations 056 e base), que também não têm
-- grant para authenticated. school_has_feature_strict, ao contrário, é
-- usada diretamente dentro de predicados de RLS avaliados como o papel do
-- chamador (authenticated) — precisa do mesmo grant que school_has_feature
-- já tem hoje, ou a policy de class_counselors falharia por falta de
-- permissão de execução.
revoke all on function public.school_effective_plan_strict(uuid) from public;
revoke all on function public.assert_school_feature_access(uuid, text) from public;

revoke all on function public.school_has_feature_strict(uuid, text) from public;
revoke all on function public.school_has_feature_strict(uuid, text) from anon;
grant execute on function public.school_has_feature_strict(uuid, text) to authenticated;

-- =============================================================================
-- 2. ITEM_CONTROL
-- =============================================================================

create or replace function public.mark_all_uniform_received(target_school_id uuid, target_class_id uuid DEFAULT NULL::uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_affected integer;
begin
  if auth.uid() is null
     or target_school_id is null
     or not public.is_active_school_member(target_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  perform public.assert_school_feature_access(target_school_id, 'item_control');

  if not public.has_school_permission(target_school_id, 'can_mark_all_uniform_received')
     and not public.has_school_permission(target_school_id, 'can_edit_all') then
    raise exception 'Sem permissão para marcar todos como receberam.';
  end if;

  if target_class_id is not null and not exists (
    select 1 from public.classes c
    where c.id = target_class_id
      and c.school_id = target_school_id
  ) then
    raise exception 'A turma não pertence à escola ativa.';
  end if;

  perform set_config('app.uniform_bulk_update', 'true', true);

  update public.students s
  set uniform_pending = null,
      uniform_received = true,
      shoes_received = true,
      material_received = true
  where s.school_id = target_school_id
    and (target_class_id is null or s.class_id = target_class_id);

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$function$;

create or replace function public.set_livro_revisa_status(target_student_id uuid, p_school_year integer, p_bimester smallint, p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_existing public.livro_revisa_deliveries%rowtype;
  v_delivered_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if p_status not in ('recebido', 'nao_recebido') then
    raise exception 'Status inválido.';
  end if;

  if p_bimester not between 1 and 4 then
    raise exception 'Bimestre inválido.';
  end if;

  -- Escola sempre derivada do aluno-alvo — nunca de um parâmetro solto,
  -- nunca do vínculo "ativo" genérico de quem chama (cobre corretamente
  -- contas vinculadas a mais de uma escola).
  select s.school_id
    into v_school_id
  from public.students s
  where s.id = target_student_id;

  if v_school_id is null then
    raise exception 'Aluno não encontrado ou não pertence a uma escola comercial.';
  end if;

  if not public.is_active_school_member(v_school_id) then
    raise exception 'Sem vínculo ativo nesta escola.';
  end if;

  perform public.assert_school_feature_access(v_school_id, 'item_control');

  if not public.has_school_permission(v_school_id, 'can_edit_uniform') then
    raise exception 'Sem permissão para registrar Livro/Revisa.';
  end if;

  -- Nunca grava estado real para um período sem calendário configurado ou
  -- ainda futuro — evita que qualquer bug de UI transforme "não
  -- configurado"/"não iniciado" em um falso "não recebido" persistido.
  if not exists (
    select 1 from public.school_terms t
    where t.school_id = v_school_id
      and t.school_year = p_school_year
      and t.bimester = p_bimester
      and t.starts_on <= current_date
  ) then
    raise exception 'Calendário letivo não configurado ou bimestre ainda não iniciado para este período.';
  end if;

  select *
    into v_existing
  from public.livro_revisa_deliveries
  where student_id = target_student_id
    and school_year = p_school_year
    and bimester = p_bimester;

  if found then
    -- Idempotente: reenviar o mesmo status já gravado não é uma correção —
    -- não fabrica corrected_at/corrected_by nem toca delivered_at.
    if v_existing.status = p_status then
      return;
    end if;

    -- delivered_at reflete sempre o estado vigente: só carrega data quando
    -- o status resultante é 'recebido'; uma transição para 'nao_recebido'
    -- sempre volta a NULL, nunca preserva uma data antiga.
    v_delivered_at := case when p_status = 'recebido' then now() else null end;

    -- Correção de marcação por engano: mesma ação, mesma linha (chave
    -- única aluno+ano+bimestre) — nunca cria uma segunda linha concorrente.
    update public.livro_revisa_deliveries
    set
      status = p_status,
      delivered_at = v_delivered_at,
      corrected_at = now(),
      corrected_by = auth.uid(),
      updated_at = now()
    where id = v_existing.id;
  else
    v_delivered_at := case when p_status = 'recebido' then now() else null end;
    insert into public.livro_revisa_deliveries (
      school_id, student_id, school_year, bimester, status, delivered_at, recorded_by
    ) values (
      v_school_id, target_student_id, p_school_year, p_bimester, p_status, v_delivered_at, auth.uid()
    );
  end if;
end;
$function$;

create or replace function public.clear_livro_revisa_status(target_student_id uuid, p_school_year integer, p_bimester smallint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if p_bimester not between 1 and 4 then
    raise exception 'Bimestre inválido.';
  end if;

  -- Escola sempre derivada do aluno-alvo, mesmo padrão de defesa em
  -- profundidade já usado em set_livro_revisa_status.
  select s.school_id
    into v_school_id
  from public.students s
  where s.id = target_student_id;

  if v_school_id is null then
    raise exception 'Aluno não encontrado ou não pertence a uma escola comercial.';
  end if;

  if not public.is_active_school_member(v_school_id) then
    raise exception 'Sem vínculo ativo nesta escola.';
  end if;

  perform public.assert_school_feature_access(v_school_id, 'item_control');

  if not public.has_school_permission(v_school_id, 'can_edit_uniform') then
    raise exception 'Sem permissão para corrigir Livro/Revisa.';
  end if;

  -- Remove somente a linha exata aluno+ano+bimestre+escola, e somente se
  -- ela representar hoje uma marcação 'nao_recebido' — nunca 'recebido'.
  delete from public.livro_revisa_deliveries
  where student_id = target_student_id
    and school_year = p_school_year
    and bimester = p_bimester
    and school_id = v_school_id
    and status = 'nao_recebido';
end;
$function$;

create or replace function public.notify_livro_revisa_pending(target_class_id uuid, p_school_year integer, p_bimester smallint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_class_name text;
  v_pending_count integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  select c.school_id, c.name
    into v_school_id, v_class_name
  from public.classes c
  where c.id = target_class_id;

  if v_school_id is null then
    raise exception 'Turma não encontrada.';
  end if;

  if not public.is_active_school_member(v_school_id) then
    raise exception 'Sem vínculo ativo nesta escola.';
  end if;

  perform public.assert_school_feature_access(v_school_id, 'item_control');

  if not public.has_school_permission(v_school_id, 'can_edit_uniform') then
    raise exception 'Sem permissão para notificar sobre Livro/Revisa.';
  end if;

  select count(*)
    into v_pending_count
  from public.livro_revisa_deliveries d
  join public.students s on s.id = d.student_id
  where s.class_id = target_class_id
    and d.school_year = p_school_year
    and d.bimester = p_bimester
    and d.status = 'nao_recebido';

  if v_pending_count = 0 then
    return;
  end if;

  perform public.notify_admins_and_coordinators(
    'Livro/Revisa pendente',
    format('Turma %s — %sº bimestre: %s aluno(s) ainda não receberam Livro/Revisa.', v_class_name, p_bimester, v_pending_count),
    target_class_id,
    'livro_revisa',
    target_class_id::text,
    auth.uid()
  );
end;
$function$;

-- Trigger de campo (já instalado, migration anterior à 048): compara OLD×NEW
-- por grupo de coluna e já fecha corretamente o lado de PERMISSÃO da regra
-- "plano E permissão" para a atualização direta de students (RLS de UPDATE é
-- uma única OR ampla entre todos os can_edit_*; este trigger é quem
-- realmente distingue qual grupo de campo mudou e exige a permissão
-- específica). Falta apenas o lado do PLANO — adicionado abaixo como a
-- primeira verificação dentro do bloco uniform_changed, reaproveitando
-- exclusivamente a variável já calculada. Os 8 campos considerados
-- "uniforme" não mudam (4 vestigiais nunca escritos por nenhum caminho
-- vivo, mantidos para não criar uma segunda definição divergente do mesmo
-- conceito). Nenhum outro grupo de campo (nome, foto, turma, observações)
-- é alterado.
create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uniform_changed boolean;
  bulk_update boolean;
begin
  -- O usuário precisa possuir vínculo ativo com a escola
  -- do registro que está sendo alterado.
  if new.school_id is null
     or not public.is_active_school_member(new.school_id) then
    raise exception 'Sem permissao para editar alunos desta escola';
  end if;

  uniform_changed :=
    old.uniform_received is distinct from new.uniform_received
    or old.shoes_received is distinct from new.shoes_received
    or old.material_received is distinct from new.material_received
    or old.uniform_size is distinct from new.uniform_size
    or old.shoe_size is distinct from new.shoe_size
    or old.uniform_received_at is distinct from new.uniform_received_at
    or old.uniform_notes is distinct from new.uniform_notes
    or old.uniform_pending is distinct from new.uniform_pending;

  bulk_update :=
    current_setting('app.uniform_bulk_update', true) = 'true';

  -- Permissão total dentro da própria escola.
  if public.has_school_permission(new.school_id, 'can_edit_all') then
    return new;
  end if;

  -- Uniforme/material possui permissões próprias.
  if uniform_changed then
    perform public.assert_school_feature_access(new.school_id, 'item_control');

    if bulk_update then
      if not public.has_school_permission(
        new.school_id,
        'can_mark_all_uniform_received'
      ) then
        raise exception 'Sem permissao para marcar todos como receberam';
      end if;
    else
      if not public.has_school_permission(
        new.school_id,
        'can_edit_uniform'
      ) then
        raise exception 'Sem permissao para registrar uniforme e material do aluno';
      end if;
    end if;
  end if;

  -- Nome.
  if old.full_name is distinct from new.full_name
     and not public.has_school_permission(
       new.school_id,
       'can_edit_name'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar o nome do aluno';
  end if;

  -- Foto.
  if old.photo_path is distinct from new.photo_path
     and not public.has_school_permission(
       new.school_id,
       'can_edit_photo'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar a foto do aluno';
  end if;

  -- Turma.
  if (
       old.class_id is distinct from new.class_id
       or old.class_name is distinct from new.class_name
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_class'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para mudar o aluno de turma';
  end if;

  -- Observações / laudo.
  if old.has_report is distinct from new.has_report
     and not public.has_school_permission(
       new.school_id,
       'can_edit_report'
     )
     and not public.has_school_permission(
       new.school_id,
       'can_edit_students'
     ) then
    raise exception 'Sem permissao para editar as observacoes do aluno';
  end if;

  return new;
end;
$function$;

-- =============================================================================
-- 3. REPORTS
-- =============================================================================

create or replace function public.report_students(p_school_id uuid, p_shift text DEFAULT NULL::text, p_class_id uuid DEFAULT NULL::uuid, p_student_id uuid DEFAULT NULL::uuid)
returns table(student_id uuid, full_name text, class_id uuid, class_name text, shift text, has_report text, photo_path text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  perform public.assert_school_feature_access(p_school_id, 'reports');

  return query
  select s.id, s.full_name, s.class_id,
         coalesce(c.name, s.class_name, ''),
         coalesce(c.shift, 'Matutino'), s.has_report, s.photo_path
  from public.students s
  left join public.classes c
    on c.id = s.class_id
   and c.school_id = s.school_id
  where s.school_id = p_school_id
    and (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name, s.id;
end;
$function$;

create or replace function public.report_occurrences(p_school_id uuid, p_student_ids uuid[], p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
returns table(student_id uuid, occurred_on date, created_by_name text, occurrence_text text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  perform public.assert_school_feature_access(p_school_id, 'reports');

  if p_student_ids is null or array_length(p_student_ids, 1) is null then return; end if;

  return query
  select o.student_id, o.occurred_on, o.created_by_name, o.occurrence_text::text
  from public.student_occurrences o
  join public.students s
    on s.id = o.student_id
   and s.school_id = o.school_id
  where o.school_id = p_school_id
    and o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on, o.id;
end;
$function$;

create or replace function public.report_uniform_status(target_school_id uuid, p_student_ids uuid[])
returns table(student_id uuid, uniform_pending text, uniform_received boolean, shoes_received boolean, material_received boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if target_school_id is null then
    raise exception 'Selecione a escola para gerar o relatório.';
  end if;

  perform public.assert_school_feature_access(target_school_id, 'reports');

  if not (public.is_school_admin(target_school_id) or public.is_school_coordinator(target_school_id)) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  return query
  select s.id, s.uniform_pending, s.uniform_received, s.shoes_received, s.material_received
  from public.students s
  where s.id = any(p_student_ids)
    and s.school_id = target_school_id
  order by s.id;
end;
$function$;

create or replace function public.log_report_generation(p_school_id uuid, p_scope_type text, p_scope_id uuid, p_scope_label text, p_contents jsonb, p_period_start date, p_period_end date, p_student_count integer)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_name text;
  v_new_id uuid;
begin
  if p_school_id is null or not public.is_school_report_manager(p_school_id) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  perform public.assert_school_feature_access(p_school_id, 'reports');

  if p_scope_type not in ('student', 'class', 'shift') then
    raise exception 'Escopo de relatório inválido.';
  end if;
  if p_scope_type = 'student' and not exists (
    select 1 from public.students s where s.id = p_scope_id and s.school_id = p_school_id
  ) then raise exception 'Aluno fora da escola ativa.';
  end if;
  if p_scope_type = 'class' and not exists (
    select 1 from public.classes c where c.id = p_scope_id and c.school_id = p_school_id
  ) then raise exception 'Turma fora da escola ativa.';
  end if;
  if p_scope_type = 'shift' and p_scope_id is not null then
    raise exception 'Escopo de turno não aceita identificador.';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Não informado')
    into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.report_generation_log (
    school_id, generated_by, generated_by_name, scope_type, scope_id,
    scope_label, contents, period_start, period_end, student_count
  ) values (
    p_school_id, auth.uid(), coalesce(v_actor_name, 'Não informado'),
    p_scope_type, p_scope_id, left(coalesce(p_scope_label, ''), 200),
    coalesce(p_contents, '{}'::jsonb), p_period_start, p_period_end,
    greatest(coalesce(p_student_count, 0), 0)
  ) returning id into v_new_id;

  return v_new_id;
end;
$function$;

-- =============================================================================
-- 4. report_livro_revisa — ÚNICA SUPERFÍCIE COMPARTILHADA (OR, só aqui)
-- =============================================================================

-- item_control OU reports habilita a leitura: o dado (status de entrega do
-- Livro/Revisa) é legitimamente consumido pelos dois módulos. Esta regra OR
-- é local a esta função — nenhuma outra superfície deste enforcement usa OR
-- entre as duas features. Preserva exatamente o filtro de membro ativo já
-- existente; segue o padrão já em uso na própria função de filtrar
-- silenciosamente em vez de levantar exceção por linha.
create or replace function public.report_livro_revisa(p_student_ids uuid[])
returns table(student_id uuid, school_year integer, bimester smallint, status text, delivered_at timestamp with time zone)
language sql
stable
security definer
set search_path to ''
as $function$
  select d.student_id, d.school_year, d.bimester, d.status, d.delivered_at
  from public.livro_revisa_deliveries d
  join public.students s on s.id = d.student_id
  where d.student_id = any(p_student_ids)
    and public.is_active_school_member(s.school_id)
    and (
      public.school_has_feature_strict(s.school_id, 'item_control')
      or public.school_has_feature_strict(s.school_id, 'reports')
    )
  order by d.student_id, d.school_year, d.bimester;
$function$;

-- =============================================================================
-- 5. CLASS_COUNSELORS — RLS direta (sem RPC central de escrita)
-- =============================================================================

-- As quatro policies preservam integralmente a lógica de autorização
-- existente (admin, can_manage_counselors, e — só no SELECT — o próprio
-- conselheiro vendo seu vínculo) e apenas acrescentam a exigência da
-- feature via AND. Sem a feature: vínculos não são apagados (nenhum DELETE
-- é executado por esta migration), só deixam de ser legíveis/graváveis
-- pelo cliente; counselorRightsForClass() no frontend deixa de encontrar
-- vínculo (a SELECT que o alimenta passa a retornar vazio) e portanto
-- deixa de conceder direitos adicionais — sem qualquer mudança de código
-- no frontend. Reativação do plano/override faz os vínculos preservados
-- reaparecerem imediatamente, sem nenhuma ação adicional.
alter policy "school_members_can_view_class_counselors" on public.class_counselors
using (
  (school_id is not null)
  and is_active_school_member(school_id)
  and ((counselor_user_id = auth.uid()) or is_school_admin(school_id) or has_school_permission(school_id, 'can_manage_counselors'))
  and school_has_feature_strict(school_id, 'class_counselors')
);

alter policy "authorized_school_members_can_add_class_counselors" on public.class_counselors
with check (
  (school_id is not null)
  and is_active_school_member(school_id)
  and (is_school_admin(school_id) or has_school_permission(school_id, 'can_manage_counselors'))
  and school_has_feature_strict(school_id, 'class_counselors')
);

alter policy "authorized_school_members_can_edit_class_counselors" on public.class_counselors
using (
  (school_id is not null)
  and is_active_school_member(school_id)
  and (is_school_admin(school_id) or has_school_permission(school_id, 'can_manage_counselors'))
  and school_has_feature_strict(school_id, 'class_counselors')
)
with check (
  (school_id is not null)
  and is_active_school_member(school_id)
  and (is_school_admin(school_id) or has_school_permission(school_id, 'can_manage_counselors'))
  and school_has_feature_strict(school_id, 'class_counselors')
);

alter policy "authorized_school_members_can_delete_class_counselors" on public.class_counselors
using (
  (school_id is not null)
  and is_active_school_member(school_id)
  and (is_school_admin(school_id) or has_school_permission(school_id, 'can_manage_counselors'))
  and school_has_feature_strict(school_id, 'class_counselors')
);

commit;
