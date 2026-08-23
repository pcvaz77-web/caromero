-- CARÔMETRO COMERCIAL
-- Migration 022: fundação de schema para Livro/Revisa dentro de "Controle
-- de Itens" (renomeação futura de Uniforme) — Etapa 4 da arquitetura já
-- aprovada pelo usuário, com os ajustes finais desta rodada:
--
--   - Livro/Revisa é uma dimensão própria (ano letivo + bimestre), com
--     tabela histórica dedicada — nunca campo solto em students.
--   - Ausência de linha SEMPRE significa "sem informação"/"bimestre não
--     iniciado"/"calendário não configurado" (estados derivados na
--     leitura) — jamais é convertida em "não recebido". Esta migration
--     não insere nenhum registro: as duas tabelas nascem vazias, sem
--     nenhuma pendência histórica artificial.
--   - Calendário letivo (school_terms) é configurável por escola — nunca
--     data global fixa — e só pode ser escrito por school_admin
--     (is_school_admin), via RPC própria. Nenhuma flag de permissão nova
--     foi criada para isso agora; a arquitetura (RPC separada, RLS de
--     SELECT aberta a qualquer membro ativo) permite delegar a escrita a
--     outro papel no futuro sem redesenhar a tabela.
--   - set_livro_revisa_status reaproveita as permissões já existentes e já
--     corrigidas de Uniforme: can_edit_uniform autoriza registrar/corrigir
--     Livro/Revisa (mesma superfície, sem flag nova). A RPC recusa gravar
--     para um bimestre sem calendário configurado ou ainda não iniciado —
--     nunca infere isso, sempre verifica contra school_terms.
--   - Correção de marcação por engano é a mesma ação (tocar no estado
--     oposto): a RPC faz UPDATE na mesma linha (chave única por
--     aluno+ano+bimestre) e registra corrected_at/corrected_by — decisão
--     já justificada de não usar um log de eventos separado, seguindo o
--     mesmo padrão já usado por uniform_pending/material_received.
--   - Notificação é consolidada por turma+bimestre, nunca por aluno
--     isoladamente, para evitar tempestade de notificações quando uma
--     turma inteira é conferida em sequência. Não existe trigger
--     disparando a cada linha gravada — a notificação é uma RPC própria
--     (notify_livro_revisa_pending), chamada explicitamente pelo frontend
--     quando o coordenador concluir a conferência de uma turma+bimestre,
--     reaproveitando a função já existente notify_admins_and_coordinators
--     (mesmo mecanismo real de user_notifications já usado por ocorrências
--     — nenhuma infraestrutura paralela).
--   - Toda escola/aluno é resolvido a partir de student_id (nunca de um
--     school_id solto vindo do cliente, nunca do vínculo "ativo" genérico
--     do chamador) — mesmo padrão de defesa em profundidade já usado e
--     validado na migration 021 (mark_all_uniform_received), cobrindo
--     corretamente contas vinculadas a mais de uma escola.
--   - Nenhuma policy de INSERT/UPDATE/DELETE direta em nenhuma das duas
--     tabelas novas — toda escrita passa exclusivamente pelas RPCs
--     SECURITY DEFINER abaixo, mesmo padrão já usado por
--     school_member_permissions.
--
-- Não altera nenhuma tabela, função, RLS, trigger ou dado existente. Não
-- toca em mark_all_uniform_received, na conta divergente já conhecida, nem
-- em qualquer outra parte do sistema já corrigida nesta sessão.

begin;

-- ---------------------------------------------------------------------
-- 1. Calendário letivo por escola
-- ---------------------------------------------------------------------

create table public.school_terms (
  id uuid primary key default gen_random_uuid(),
  -- school_id sem cascade: mesmo padrão já usado por
  -- student_occurrences_school_id_fkey (restrict) — excluir uma escola
  -- nunca deve arrastar silenciosamente linhas de outra tabela.
  school_id uuid not null references public.schools(id),
  school_year integer not null,
  bimester smallint not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_terms_bimester_range check (bimester between 1 and 4),
  constraint school_terms_date_order check (starts_on <= ends_on),
  constraint school_terms_unique unique (school_id, school_year, bimester)
);

create index school_terms_school_year_idx on public.school_terms (school_id, school_year);

alter table public.school_terms enable row level security;

-- Qualquer membro ativo da escola pode ler o calendário (necessário para o
-- coordenador ver "bimestre não iniciado"/"calendário não configurado" na
-- tela de Livro/Revisa) — só school_admin pode escrever, via RPC abaixo.
create policy active_members_can_view_school_terms
  on public.school_terms
  for select
  to authenticated
  using (public.is_active_school_member(school_id));

-- ---------------------------------------------------------------------
-- 2. Histórico de entrega de Livro/Revisa
-- ---------------------------------------------------------------------

create table public.livro_revisa_deliveries (
  id uuid primary key default gen_random_uuid(),
  -- school_id sem cascade (mesmo racional de school_terms acima);
  -- student_id com cascade, espelhando student_occurrences_student_id_fkey
  -- — excluir um aluno já é uma ação irreversível própria da aplicação, e
  -- o histórico de Livro/Revisa desse aluno deixa de fazer sentido sem ele.
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id) on delete cascade,
  school_year integer not null,
  bimester smallint not null,
  status text not null,
  delivered_at timestamptz,
  recorded_by uuid not null references auth.users(id),
  corrected_at timestamptz,
  corrected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint livro_revisa_bimester_range check (bimester between 1 and 4),
  constraint livro_revisa_status_check check (status in ('recebido', 'nao_recebido')),
  -- Reforça na base o que a RPC já garante: "recebido" sempre tem data
  -- real; "não recebido" nunca carrega uma data de entrega que não houve.
  constraint livro_revisa_delivered_at_consistency check (
    (status = 'recebido' and delivered_at is not null) or
    (status = 'nao_recebido' and delivered_at is null)
  ),
  -- Garante, na própria base, que só existe UMA linha por aluno+ano+bimestre
  -- — é essa chave que faz a correção de engano ser um UPDATE simples.
  constraint livro_revisa_unique unique (student_id, school_year, bimester)
);

create index livro_revisa_school_lookup_idx on public.livro_revisa_deliveries (school_id, school_year, bimester);
create index livro_revisa_student_idx on public.livro_revisa_deliveries (student_id);

alter table public.livro_revisa_deliveries enable row level security;

create policy active_members_can_view_livro_revisa
  on public.livro_revisa_deliveries
  for select
  to authenticated
  using (public.is_active_school_member(school_id));

-- ---------------------------------------------------------------------
-- 3. RPC: configurar/atualizar um bimestre do calendário letivo
--    (somente school_admin; nenhuma flag de permissão nova)
-- ---------------------------------------------------------------------

create or replace function public.upsert_school_term(
  target_school_id uuid,
  p_school_year integer,
  p_bimester smallint,
  p_starts_on date,
  p_ends_on date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_overlap_count integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if not public.is_school_admin(target_school_id) then
    raise exception 'Somente o administrador da escola pode configurar o calendário letivo.';
  end if;

  if p_bimester not between 1 and 4 then
    raise exception 'Bimestre inválido.';
  end if;

  if p_starts_on > p_ends_on then
    raise exception 'A data de início não pode ser depois da data de término.';
  end if;

  select count(*)
    into v_overlap_count
  from public.school_terms t
  where t.school_id = target_school_id
    and t.school_year = p_school_year
    and t.bimester <> p_bimester
    and p_starts_on <= t.ends_on
    and p_ends_on >= t.starts_on;

  if v_overlap_count > 0 then
    raise exception 'O período informado se sobrepõe a outro bimestre já configurado.';
  end if;

  insert into public.school_terms (school_id, school_year, bimester, starts_on, ends_on)
  values (target_school_id, p_school_year, p_bimester, p_starts_on, p_ends_on)
  on conflict (school_id, school_year, bimester)
  do update set
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    updated_at = now();
end;
$function$;

revoke all on function public.upsert_school_term(uuid, integer, smallint, date, date) from public;
revoke all on function public.upsert_school_term(uuid, integer, smallint, date, date) from anon;
grant execute on function public.upsert_school_term(uuid, integer, smallint, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: registrar/corrigir entrega de Livro/Revisa
--    (coordenador/admin com can_edit_uniform — sem flag nova)
-- ---------------------------------------------------------------------

create or replace function public.set_livro_revisa_status(
  target_student_id uuid,
  p_school_year integer,
  p_bimester smallint,
  p_status text
)
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

revoke all on function public.set_livro_revisa_status(uuid, integer, smallint, text) from public;
revoke all on function public.set_livro_revisa_status(uuid, integer, smallint, text) from anon;
grant execute on function public.set_livro_revisa_status(uuid, integer, smallint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC: dataset paginável para o relatório em PDF
--    (mesmo padrão de report_students/report_occurrences)
-- ---------------------------------------------------------------------

create or replace function public.report_livro_revisa(p_student_ids uuid[])
returns table (
  student_id uuid,
  school_year integer,
  bimester smallint,
  status text,
  delivered_at timestamptz
)
language sql
security definer
set search_path to ''
stable
as $function$
  select d.student_id, d.school_year, d.bimester, d.status, d.delivered_at
  from public.livro_revisa_deliveries d
  join public.students s on s.id = d.student_id
  where d.student_id = any(p_student_ids)
    and public.is_active_school_member(s.school_id)
  order by d.student_id, d.school_year, d.bimester;
$function$;

revoke all on function public.report_livro_revisa(uuid[]) from public;
revoke all on function public.report_livro_revisa(uuid[]) from anon;
grant execute on function public.report_livro_revisa(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RPC: notificação consolidada por turma+bimestre
--    (sem trigger por linha — evita tempestade de notificações; reaproveita
--    notify_admins_and_coordinators já existente, sem infraestrutura nova)
-- ---------------------------------------------------------------------

create or replace function public.notify_livro_revisa_pending(
  target_class_id uuid,
  p_school_year integer,
  p_bimester smallint
)
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

revoke all on function public.notify_livro_revisa_pending(uuid, integer, smallint) from public;
revoke all on function public.notify_livro_revisa_pending(uuid, integer, smallint) from anon;
grant execute on function public.notify_livro_revisa_pending(uuid, integer, smallint) to authenticated;

commit;
