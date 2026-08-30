-- CARÔMETRO COMERCIAL
-- Fase 2 da simplificação do Painel da Plataforma: Restaurar escola e
-- Excluir permanentemente (só a partir de uma escola já arquivada pela
-- Fase 1 / migration 038, que não é alterada aqui).
--
-- Desenho aprovado (auditado antes desta migration, sem escrita):
--   - platform_school_deletion_jobs é a única máquina de estados da
--     exclusão permanente. schools.status NÃO ganha um novo valor
--     'deleting' — continua só 'active'/'suspended'/'archived' (038):
--     um novo valor exigiria outra migration no CHECK e criaria dois
--     lugares guardando o mesmo fato, podendo divergir. A existência da
--     linha de job (em qualquer status) já é suficiente e necessária para
--     bloquear Restaurar — e, ao contrário de schools.status, sobrevive ao
--     DELETE da escola porque não tem FK para schools(id).
--   - Restaurar sempre volta para 'suspended' (nunca 'active' direto):
--     a assinatura permanece suspensa (Fase 1 já garantia isso; a mudança
--     aqui é o status da escola em si), e o painel não mostra "Ativa" para
--     uma escola que ainda não pode ser usada — os dois selos (status e
--     assinatura) ficam coerentes entre si logo após restaurar. Reativar
--     escola e assinatura continuam sendo decisões conscientes separadas,
--     pelos controles já existentes (platform_set_school_status,
--     platform_set_subscription_status — nenhum dos dois recriado aqui).
--   - platform_set_school_status() ganha uma única guarda nova: rejeita
--     alterar uma escola com status='archived' (ela precisa passar por
--     Restaurar primeiro). Nenhuma outra linha da função muda — o
--     comportamento para escolas active/suspended é idêntico ao que já
--     existia.
--   - platform_purge_school_data() faz SOMENTE a limpeza relacional
--     (tabelas Postgres), numa única transação, na ordem confirmada pelo
--     catálogo (pg_constraint, reconsultado imediatamente antes desta
--     migration). NUNCA toca Storage (isso não é possível de dentro de
--     SQL) e NUNCA executa DELETE em auth.users — as contas globais
--     permanecem existindo mesmo sem vínculo escolar algum.
--   - A limpeza de Storage é responsabilidade exclusiva da nova Edge
--     Function (fora desta migration), chamada ANTES desta RPC: só depois
--     de confirmar o prefixo <school_id>/ vazio no bucket é que a Edge
--     Function chama platform_purge_school_data(). Essa ordem (Storage
--     primeiro) é a que deixa o estado mais recuperável em qualquer ponto
--     de falha: enquanto o Storage não estiver confirmado vazio, a escola
--     e o job continuam existindo e retomáveis; só o passo final
--     (irreversível) apaga a linha de schools.
--
-- Esta migration NÃO altera: migration 038, accept-invite.*, migrations
-- 033/034 (convite/senha), migration 037 (ocorrências), RLS de
-- student_occurrences/class_counselors/school_members, manage-user,
-- "Gerenciar conta", nem qualquer dado existente.

begin;

-- 1) Job durável de exclusão permanente — sobrevive ao DELETE da escola
-- (sem FK para schools.id, de propósito). unique(school_id): no máximo
-- uma operação por escola, para sempre — é essa constraint, resolvida via
-- INSERT ... ON CONFLICT DO UPDATE em platform_begin_school_deletion, que
-- protege contra duas chamadas simultâneas no próprio banco, não só no
-- frontend. Nenhuma informação pessoal de aluno/usuário é armazenada —
-- só o nome da própria escola (já público no painel) e contadores.
create table if not exists public.platform_school_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique,
  school_name_snapshot text not null,
  status text not null default 'pending'
    check (status in ('pending', 'deleting_storage', 'deleting_database', 'completed', 'failed')),
  requested_by uuid null references auth.users(id) on delete set null,
  error_message text null,
  storage_objects_removed integer not null default 0,
  students_removed integer null,
  classes_removed integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

alter table public.platform_school_deletion_jobs enable row level security;

drop policy if exists "Platform owner manages deletion jobs" on public.platform_school_deletion_jobs;
create policy "Platform owner manages deletion jobs"
on public.platform_school_deletion_jobs
for all
to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

revoke all on public.platform_school_deletion_jobs from public, anon;
-- Sem DELETE concedido a ninguém: o registro é permanente por desenho,
-- nunca apagado pela aplicação (nem sequer pelo proprietário).
grant select, insert, update on public.platform_school_deletion_jobs to authenticated;

-- 2) Inicia (ou retoma, de forma segura contra concorrência) a exclusão
-- permanente. É o único ponto que cria a linha de job — a partir daqui,
-- Restaurar fica bloqueado. Exige escola arquivada e nome exato, com
-- is_platform_owner() verificado de forma independente de qualquer
-- checagem já feita pela Edge Function chamadora.
create or replace function public.platform_begin_school_deletion(
  p_school_id uuid,
  p_confirm_name text
)
returns public.platform_school_deletion_jobs
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school public.schools%rowtype;
  v_job public.platform_school_deletion_jobs%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null then
    raise exception 'Escola inválida.';
  end if;

  select *
    into v_school
  from public.schools
  where id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if v_school.status <> 'archived' then
    raise exception 'Somente escolas arquivadas podem entrar em exclusão permanente.';
  end if;

  if p_confirm_name is null or btrim(p_confirm_name) <> v_school.name then
    raise exception 'O nome digitado não corresponde ao nome exato da escola.';
  end if;

  insert into public.platform_school_deletion_jobs (
    school_id, school_name_snapshot, status, requested_by
  )
  values (
    p_school_id, v_school.name, 'pending', auth.uid()
  )
  on conflict (school_id) do update
    set updated_at = now()
  returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.platform_begin_school_deletion(uuid, text) from public;
revoke all on function public.platform_begin_school_deletion(uuid, text) from anon;
grant execute on function public.platform_begin_school_deletion(uuid, text) to authenticated;

-- 3) Atualiza o progresso do job (chamada pela Edge Function entre as
-- etapas de Storage e antes/depois da etapa de banco). Idempotente por
-- natureza: só atualiza a linha já existente daquela escola.
create or replace function public.platform_update_school_deletion_job(
  p_school_id uuid,
  p_status text,
  p_error_message text default null,
  p_storage_objects_removed integer default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_status not in ('pending', 'deleting_storage', 'deleting_database', 'completed', 'failed') then
    raise exception 'Status de exclusão inválido.';
  end if;

  update public.platform_school_deletion_jobs
  set status = p_status,
      error_message = case when p_status = 'failed' then p_error_message else null end,
      storage_objects_removed = coalesce(p_storage_objects_removed, storage_objects_removed),
      updated_at = now()
  where school_id = p_school_id;

  if not found then
    raise exception 'Job de exclusão não encontrado para esta escola.';
  end if;
end;
$function$;

revoke all on function public.platform_update_school_deletion_job(uuid, text, text, integer) from public;
revoke all on function public.platform_update_school_deletion_job(uuid, text, text, integer) from anon;
grant execute on function public.platform_update_school_deletion_job(uuid, text, text, integer) to authenticated;

-- 4) Limpeza relacional transacional (tudo ou nada). Ordem confirmada
-- pelo catálogo (pg_constraint) imediatamente antes desta migration:
--   a) tabelas sem cascade próprio, ligadas direto a schools (RESTRICT/
--      NO ACTION/dupla FK legada em report_generation_log): apagadas
--      explicitamente primeiro;
--   b) students (cascateia student_occurrences, student_alerts,
--      student_followups, student_activity, livro_revisa_deliveries —
--      todas com student_id NOT NULL, então nenhuma sobra);
--   c) classes (cascateia class_counselors, user_favorite_classes);
--   d) auditoria school_permanently_deleted, com school_id/nome também no
--      jsonb — necessário porque platform_audit_log.school_id é SET NULL
--      e o DELETE de schools no passo seguinte, na MESMA transação, já
--      zera a FK da própria linha que acabamos de inserir;
--   e) DELETE FROM schools — cascateia school_members, school_invitations,
--      school_subscriptions (nenhum dado de auth.users é tocado).
-- Reverificação independente de is_platform_owner(), do job existir, do
-- status ser 'archived' e do nome exato — nunca confia só no que a Edge
-- Function já validou antes de chamar.
create or replace function public.platform_purge_school_data(
  p_school_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school public.schools%rowtype;
  v_job public.platform_school_deletion_jobs%rowtype;
  v_students_removed integer;
  v_classes_removed integer;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  select *
    into v_job
  from public.platform_school_deletion_jobs
  where school_id = p_school_id
  for update;

  if not found then
    raise exception 'Nenhuma exclusão permanente foi iniciada para esta escola.';
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object(
      'already_completed', true,
      'school_id', p_school_id,
      'school_name', v_job.school_name_snapshot
    );
  end if;

  select *
    into v_school
  from public.schools
  where id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada (verifique se a exclusão já foi concluída).';
  end if;

  if v_school.status <> 'archived' then
    raise exception 'Somente escolas arquivadas podem ser excluídas permanentemente.';
  end if;

  if p_confirm_name is null or btrim(p_confirm_name) <> v_school.name then
    raise exception 'O nome digitado não corresponde ao nome exato da escola.';
  end if;

  update public.platform_school_deletion_jobs
  set status = 'deleting_database',
      updated_at = now()
  where school_id = p_school_id;

  delete from public.observation_options where school_id = p_school_id;
  delete from public.user_notification_shifts where school_id = p_school_id;
  delete from public.user_notifications where school_id = p_school_id;
  delete from public.school_terms where school_id = p_school_id;
  delete from public.report_generation_log where school_id = p_school_id;

  delete from public.students where school_id = p_school_id;
  get diagnostics v_students_removed = row_count;

  delete from public.classes where school_id = p_school_id;
  get diagnostics v_classes_removed = row_count;

  perform public.record_platform_audit(
    'school_permanently_deleted',
    p_school_id,
    null,
    jsonb_build_object(
      'school_id', p_school_id,
      'school_name', v_school.name,
      'status', v_school.status
    ),
    jsonb_build_object(
      'school_id', p_school_id,
      'school_name', v_school.name,
      'students_removed', v_students_removed,
      'classes_removed', v_classes_removed,
      'storage_objects_removed', v_job.storage_objects_removed,
      'deleted_at', now()
    )
  );

  delete from public.schools where id = p_school_id;

  update public.platform_school_deletion_jobs
  set status = 'completed',
      students_removed = v_students_removed,
      classes_removed = v_classes_removed,
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where school_id = p_school_id;

  return jsonb_build_object(
    'school_id', p_school_id,
    'school_name', v_school.name,
    'students_removed', v_students_removed,
    'classes_removed', v_classes_removed,
    'storage_objects_removed', v_job.storage_objects_removed
  );
end;
$function$;

revoke all on function public.platform_purge_school_data(uuid, text) from public;
revoke all on function public.platform_purge_school_data(uuid, text) from anon;
grant execute on function public.platform_purge_school_data(uuid, text) to authenticated;

-- 5) Restaurar escola arquivada — sempre para 'suspended' (nunca
-- 'active' direto), archived_at volta a NULL. Bloqueada por completo se
-- existir qualquer linha de job para esta escola (em qualquer status:
-- pending, em andamento ou até 'failed' — uma vez iniciada a exclusão,
-- não há mais caminho de volta, só retomar a exclusão).
create or replace function public.platform_restore_school(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school public.schools%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null then
    raise exception 'Escola inválida.';
  end if;

  if exists (
    select 1 from public.platform_school_deletion_jobs where school_id = p_school_id
  ) then
    raise exception 'Esta escola tem uma exclusão permanente em andamento e não pode ser restaurada.';
  end if;

  select *
    into v_school
  from public.schools
  where id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if v_school.status <> 'archived' then
    raise exception 'Esta escola não está arquivada.';
  end if;

  update public.schools
  set status = 'suspended',
      archived_at = null,
      updated_at = now()
  where id = p_school_id;

  perform public.record_platform_audit(
    'school_restored',
    p_school_id,
    null,
    jsonb_build_object('status', 'archived'),
    jsonb_build_object('status', 'suspended')
  );
end;
$function$;

revoke all on function public.platform_restore_school(uuid) from public;
revoke all on function public.platform_restore_school(uuid) from anon;
grant execute on function public.platform_restore_school(uuid) to authenticated;

-- 6) Guarda mínima em platform_set_school_status: impede que o fluxo
-- comum de Suspender/Reativar tire uma escola do arquivamento por fora de
-- Restaurar (o que puraria o job/archived_at/auditoria corretos). Única
-- mudança em relação à versão da migration 036 — comportamento para
-- escolas active/suspended permanece idêntico.
create or replace function public.platform_set_school_status(p_school_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_status text;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if p_school_id is null or p_status not in ('active', 'suspended') then
    raise exception 'Escola ou status inválido.';
  end if;

  select s.status
    into v_previous_status
  from public.schools s
  where s.id = p_school_id
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if v_previous_status = 'archived' then
    raise exception 'Escola arquivada. Use Restaurar escola antes de alterar o status.';
  end if;

  update public.schools
  set status = p_status,
      updated_at = now()
  where id = p_school_id;

  perform public.record_platform_audit(
    'school_status_changed',
    p_school_id,
    null,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status)
  );
end;
$function$;

commit;
