-- CARÔMETRO COMERCIAL
-- Migration 024: corrige report_students() e report_occurrences() contra o
-- vazamento cross-escola confirmado pela auditoria (nenhuma das duas
-- filtrava por escola; is_report_manager() é um flag legado global, sem
-- nenhuma noção de qual escola comercial está em jogo).
--
-- DESENHO REVISADO — aditivo, sem downtime, sem DROP FUNCTION:
--   Ao contrário da primeira versão desta migration (que fazia DROP +
--   CREATE trocando a assinatura, quebrando qualquer frontend publicado
--   até o próximo deploy), esta versão:
--     1) ACRESCENTA uma nova sobrecarga (overload) de cada função, com
--        target_school_id explícito na frente — é isso que reports.js
--        (versão local, ainda não publicada) passa a chamar.
--     2) SUBSTITUI só o CORPO da assinatura antiga (mesmos parâmetros,
--        mesmos nomes, mesmos defaults — CREATE OR REPLACE, sem DROP),
--        trocando is_report_manager() por uma resolução seria de escola:
--        conta a quantidade de escolas onde o usuário é school_admin ou
--        coordinator; se for exatamente 1, usa essa escola (mesmo
--        resultado de sempre para qualquer conta de hoje — confirmado por
--        auditoria: toda conta com is_report_manager()=true tem
--        exatamente 1 vínculo comercial ativo); se for 0, nega acesso; se
--        for 2+, nega com mensagem pedindo para atualizar o app (nunca
--        adivinha qual das duas).
--     3) Resultado: a assinatura antiga (chamada pelo reports.js já
--        publicado em produção) continua funcionando sem nenhuma mudança
--        de comportamento para qualquer conta real hoje, mas já fica
--        segura (nunca mais retorna aluno de outra escola) no instante em
--        que esta migration é aplicada — antes mesmo do próximo deploy.
--   Uma limpeza futura (remover a assinatura antiga depois que o deploy
--   novo estiver no ar) fica para uma migration separada, não esta.
--
--   - report_students: mesma regra comercial já usada e comprovada em
--     log_report_generation() — is_school_admin(escola) OR
--     is_school_coordinator(escola). Não é permissão nova.
--   - Se p_class_id/p_student_id forem informados, precisam pertencer à
--     MESMA escola resolvida — senão, exceção explícita.
--   - report_occurrences: mesma autorização por escola, e nunca mais
--     confia só nos IDs enviados pelo cliente — o resultado é restringido
--     via join com students.school_id = escola resolvida, mesmo padrão
--     que report_livro_revisa já usava (por isso ela não precisou de
--     correção).
--   - report_livro_revisa e log_report_generation preservadas sem
--     alteração de corpo — log_report_generation já tem o p_school_id
--     reservado, agora efetivamente usado pelo reports.js atualizado.
--
-- NÃO ALTERA: RLS de nenhuma tabela, report_livro_revisa,
-- log_report_generation, report_generation_log, Auth, Storage ou qualquer
-- dado existente.

begin;

-- ---------------------------------------------------------------------
-- report_students — assinatura antiga (compatibilidade), corpo seguro
-- ---------------------------------------------------------------------
create or replace function public.report_students(
  p_shift text default null,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns table(student_id uuid, full_name text, class_id uuid, class_name text, shift text, has_report text, photo_path text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_school_count int;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  select count(distinct sm.school_id)
    into v_school_count
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator');

  if v_school_count = 0 then
    raise exception 'Sem permissão para gerar relatórios.';
  elsif v_school_count > 1 then
    raise exception 'Sua conta possui permissão em mais de uma escola. Atualize o aplicativo para selecionar a escola.';
  end if;

  select sm.school_id
    into v_school_id
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator')
  limit 1;

  if p_class_id is not null and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.school_id = v_school_id
  ) then
    raise exception 'Turma informada não pertence à escola selecionada.';
  end if;

  if p_student_id is not null and not exists (
    select 1 from public.students s where s.id = p_student_id and s.school_id = v_school_id
  ) then
    raise exception 'Aluno informado não pertence à escola selecionada.';
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.class_id,
    coalesce(c.name, s.class_name, ''),
    coalesce(c.shift, 'Matutino'),
    s.has_report,
    s.photo_path
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.school_id = v_school_id
    and (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name;
end;
$function$;

revoke all on function public.report_students(text, uuid, uuid) from public;
revoke all on function public.report_students(text, uuid, uuid) from anon;
grant execute on function public.report_students(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- report_students — nova sobrecarga explícita (usada pelo reports.js
-- atualizado)
-- ---------------------------------------------------------------------
create or replace function public.report_students(
  target_school_id uuid,
  p_shift text default null,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns table(student_id uuid, full_name text, class_id uuid, class_name text, shift text, has_report text, photo_path text)
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

  if not (public.is_school_admin(target_school_id) or public.is_school_coordinator(target_school_id)) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  if p_class_id is not null and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.school_id = target_school_id
  ) then
    raise exception 'Turma informada não pertence à escola selecionada.';
  end if;

  if p_student_id is not null and not exists (
    select 1 from public.students s where s.id = p_student_id and s.school_id = target_school_id
  ) then
    raise exception 'Aluno informado não pertence à escola selecionada.';
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.class_id,
    coalesce(c.name, s.class_name, ''),
    coalesce(c.shift, 'Matutino'),
    s.has_report,
    s.photo_path
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.school_id = target_school_id
    and (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name;
end;
$function$;

revoke all on function public.report_students(uuid, text, uuid, uuid) from public;
revoke all on function public.report_students(uuid, text, uuid, uuid) from anon;
grant execute on function public.report_students(uuid, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- report_occurrences — assinatura antiga (compatibilidade), corpo seguro
-- ---------------------------------------------------------------------
create or replace function public.report_occurrences(
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table(student_id uuid, occurred_on date, created_by_name text, occurrence_text text, created_at timestamptz, updated_by_name text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
  v_school_count int;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  select count(distinct sm.school_id)
    into v_school_count
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator');

  if v_school_count = 0 then
    raise exception 'Sem permissão para gerar relatórios.';
  elsif v_school_count > 1 then
    raise exception 'Sua conta possui permissão em mais de uma escola. Atualize o aplicativo para selecionar a escola.';
  end if;

  select sm.school_id
    into v_school_id
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator')
  limit 1;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return;
  end if;

  return query
  select
    o.student_id,
    o.occurred_on,
    o.created_by_name,
    o.occurrence_text::text,
    o.created_at,
    o.updated_by_name,
    o.updated_at
  from public.student_occurrences o
  join public.students s on s.id = o.student_id
  where o.student_id = any(p_student_ids)
    and s.school_id = v_school_id
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on;
end;
$function$;

revoke all on function public.report_occurrences(uuid[], date, date) from public;
revoke all on function public.report_occurrences(uuid[], date, date) from anon;
grant execute on function public.report_occurrences(uuid[], date, date) to authenticated;

-- ---------------------------------------------------------------------
-- report_occurrences — nova sobrecarga explícita
-- ---------------------------------------------------------------------
create or replace function public.report_occurrences(
  target_school_id uuid,
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table(student_id uuid, occurred_on date, created_by_name text, occurrence_text text, created_at timestamptz, updated_by_name text, updated_at timestamptz)
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

  if not (public.is_school_admin(target_school_id) or public.is_school_coordinator(target_school_id)) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return;
  end if;

  return query
  select
    o.student_id,
    o.occurred_on,
    o.created_by_name,
    o.occurrence_text::text,
    o.created_at,
    o.updated_by_name,
    o.updated_at
  from public.student_occurrences o
  join public.students s on s.id = o.student_id
  where o.student_id = any(p_student_ids)
    and s.school_id = target_school_id
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on;
end;
$function$;

revoke all on function public.report_occurrences(uuid, uuid[], date, date) from public;
revoke all on function public.report_occurrences(uuid, uuid[], date, date) from anon;
grant execute on function public.report_occurrences(uuid, uuid[], date, date) to authenticated;

commit;
