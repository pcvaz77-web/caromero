-- CARÔMETRO COMERCIAL
-- Enforcement real de max_students/max_classes por plano efetivo,
-- aplicado no backend via trigger — não depende do frontend, não pode
-- ser contornado por chamada direta, RPC de importação, ou por qualquer
-- papel (incluindo o Proprietário da Plataforma, que não tem nenhum
-- caminho de inserção direta de aluno/turma hoje; o mecanismo correto
-- para aumentar capacidade continua sendo conceder outro plano/override).
--
-- AFTER INSERT ... REFERENCING NEW TABLE ... FOR EACH STATEMENT: dispara
-- uma única vez por instrução inteira (não por linha), vendo todas as
-- linhas recém-inseridas de uma vez via a transition table — cobre
-- corretamente tanto um INSERT de uma linha quanto o INSERT multi-linha
-- feito por bulk_import_classes_and_students (auditado antes desta
-- migration: aquela função não tem nenhum bloco EXCEPTION, então uma
-- exceção levantada aqui propaga e reverte a função inteira, incluindo
-- turmas já criadas antes do INSERT de alunos que excedeu o limite).
--
-- Agrupamento por school_id, ordenado pela ordem nativa de uuid antes de
-- travar (SELECT DISTINCT + ORDER BY por expressão derivada, como
-- school_id::text, não é aceito pelo Postgres sem repetir a expressão no
-- SELECT — a ordem nativa de uuid já é determinística e suficiente):
-- ordem idêntica entre execuções concorrentes, evitando deadlock caso um
-- único INSERT (hipotético, nenhum caminho real produz isso hoje)
-- contenha linhas de mais de uma escola.
--
-- SELECT ... FOR UPDATE em school_subscriptions serializa contra
-- inserções concorrentes na mesma escola E contra as RPCs de override
-- (que travam a mesma linha) — uma concessão de plano em andamento nunca
-- fica numa janela inconsistente com uma inserção em andamento.
--
-- Falha fechada: ausência de linha em school_subscriptions, ou plano
-- efetivo sem correspondência em platform_plans, nunca é interpretada
-- como ilimitado — sempre bloqueia com CONFIGURACAO_PLANO_AUSENTE.
--
-- Limite NULL em platform_plans = ilimitado (Profissional/Empresarial).
-- Bloqueio só quando total_atual > limite — permite chegar exatamente
-- ao limite, bloqueia qualquer inclusão além dele, e preserva sem
-- exceção uma escola já acima do limite por downgrade (o trigger só
-- reage a INSERT; nunca apaga/modifica linha existente).
--
-- SECURITY DEFINER + search_path='' + referências totalmente
-- qualificadas (public.): a função não pode depender das
-- permissões/RLS de quem disparou o INSERT para ler school_subscriptions
-- (SELECT restrita ao proprietário) ou platform_plans.

begin;

create or replace function public.enforce_student_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_total integer;
begin
  for v_school_id in
    select distinct new_rows.school_id
    from new_rows
    where new_rows.school_id is not null
    order by new_rows.school_id
  loop
    perform 1 from public.school_subscriptions where school_id = v_school_id for update;
    if not found then
      raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
    end if;

    v_effective_plan := public.school_effective_plan(v_school_id);

    select p.display_name, p.max_students
      into v_display_name, v_limit
    from public.platform_plans p
    where p.plan_key = v_effective_plan;

    if not found then
      raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
    end if;

    if v_limit is not null then
      select count(*) into v_total from public.students where school_id = v_school_id;
      if v_total > v_limit then
        raise exception 'LIMITE_ALUNOS: Sua escola atingiu o limite de % alunos do plano %. Para cadastrar novos alunos, altere o plano.', v_limit, v_display_name;
      end if;
    end if;
  end loop;

  return null;
end;
$function$;

create or replace function public.enforce_class_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_effective_plan text;
  v_display_name text;
  v_limit integer;
  v_total integer;
begin
  for v_school_id in
    select distinct new_rows.school_id
    from new_rows
    where new_rows.school_id is not null
    order by new_rows.school_id
  loop
    perform 1 from public.school_subscriptions where school_id = v_school_id for update;
    if not found then
      raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
    end if;

    v_effective_plan := public.school_effective_plan(v_school_id);

    select p.display_name, p.max_classes
      into v_display_name, v_limit
    from public.platform_plans p
    where p.plan_key = v_effective_plan;

    if not found then
      raise exception 'CONFIGURACAO_PLANO_AUSENTE: Não foi possível confirmar o plano desta escola. Contate o suporte.';
    end if;

    if v_limit is not null then
      select count(*) into v_total from public.classes where school_id = v_school_id;
      if v_total > v_limit then
        raise exception 'LIMITE_TURMAS: Sua escola atingiu o limite de % turmas do plano %. Para cadastrar novas turmas, altere o plano.', v_limit, v_display_name;
      end if;
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function public.enforce_student_plan_limit() from public;
revoke all on function public.enforce_class_plan_limit() from public;

drop trigger if exists enforce_student_plan_limit on public.students;
create trigger enforce_student_plan_limit
after insert on public.students
referencing new table as new_rows
for each statement
execute function public.enforce_student_plan_limit();

drop trigger if exists enforce_class_plan_limit on public.classes;
create trigger enforce_class_plan_limit
after insert on public.classes
referencing new table as new_rows
for each statement
execute function public.enforce_class_plan_limit();

commit;
