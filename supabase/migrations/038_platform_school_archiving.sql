-- CARÔMETRO COMERCIAL
-- Fase 1 da simplificação do Painel da Plataforma:
--   1) e-mail do administrador (ativo ou convite pendente) na listagem de escolas;
--   2) arquivamento de escola (soft delete) — nunca exclusão física.
--
-- Decisão de arquitetura (auditada antes desta migration, sem escrita):
-- estender public.schools.status para aceitar 'archived', em vez de criar
-- um archived_at isolado como fonte de verdade. Motivo: TODA a cadeia de
-- autorização multi-escola já depende de is_school_active(target_school_id),
-- que testa exatamente `s.status = 'active'` (comparação estrita, não
-- `<> 'suspended'`). Confirmado lendo is_school_active, is_active_school_member,
-- has_active_school_subscription, can_receive_school_notification,
-- get_invitation_preview e invitation_email_matches — todas usam essa mesma
-- comparação estrita. Um novo valor de status é automaticamente tratado como
-- "não ativa" por todas elas, sem precisar alterar nenhuma. Um archived_at
-- isolado exigiria auditar e alterar cada uma dessas funções para checar
-- também archived_at is null — superfície maior e mais arriscada.
-- archived_at é mantido como coluna adicional, só para exibição/auditoria
-- (quando foi arquivada), nunca usado em nenhuma decisão de autorização.
--
-- platform_set_school_status (já existente, usada por "Suspender/Reativar
-- escola") não é alterada — continua exigindo p_status in ('active',
-- 'suspended'), nunca aceita 'archived'. Arquivar é uma operação própria,
-- deliberadamente separada de suspender.
--
-- Esta migration NÃO altera: manage-user, permanent_delete, lookup_user,
-- school_members, school_member_permissions, RLS existente, Storage,
-- fotos, ocorrências, conselheiros, convite/senha (033/034), migration 037,
-- nem platform_list_schools_with_counts_v2 (mantida intacta — nova versão
-- v3 criada ao lado, sem quebrar quem ainda usa a v2).

begin;

alter table public.schools
  drop constraint schools_status_check,
  add constraint schools_status_check
    check (status = any (array['active', 'suspended', 'archived']));

alter table public.schools
  add column if not exists archived_at timestamptz null;

-- 1) Listagem de escolas com e-mail do administrador.
-- Prioridade: school_admin ativo > convite school_admin pendente e não
-- expirado > nenhum. Não duplica e-mail em schools — resolvido por join no
-- momento da consulta, a partir de school_members/school_invitations, exatamente
-- como já é feito em list_counselor_candidates e get_invitation_preview.
create or replace function public.platform_list_schools_with_counts_v3()
returns table (
  school_id uuid,
  school_name text,
  school_status text,
  archived_at timestamptz,
  plan text,
  billing_type text,
  price numeric,
  subscription_status text,
  created_at timestamptz,
  user_count bigint,
  student_count bigint,
  admin_email text,
  admin_state text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    s.id,
    s.name::text,
    s.status::text,
    s.archived_at,
    ss.plan::text,
    ss.billing_type::text,
    ss.price,
    case
      when ss.status = 'active'
       and ss.grant_expires_at is not null
       and ss.grant_expires_at <= now()
        then 'expired'
      else ss.status
    end::text,
    s.created_at,
    coalesce(members.total, 0),
    coalesce(students.total, 0),
    coalesce(active_admin.admin_email, pending_admin.admin_email),
    coalesce(active_admin.admin_state, pending_admin.admin_state, 'none')
  from public.schools s
  left join public.school_subscriptions ss on ss.school_id = s.id
  left join lateral (
    select count(*)::bigint as total
    from public.school_members sm
    where sm.school_id = s.id
  ) members on true
  left join lateral (
    select count(*)::bigint as total
    from public.students st
    where st.school_id = s.id
  ) students on true
  left join lateral (
    select u.email::text as admin_email, 'active'::text as admin_state
    from public.school_members sm
    join auth.users u on u.id = sm.user_id
    where sm.school_id = s.id
      and sm.role = 'school_admin'
      and sm.status = 'active'
    order by sm.created_at asc
    limit 1
  ) active_admin on true
  left join lateral (
    select i.email::text as admin_email, 'pending'::text as admin_state
    from public.school_invitations i
    where i.school_id = s.id
      and i.role = 'school_admin'
      and i.status = 'pending'
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
  ) pending_admin on true
  order by s.created_at desc;
end;
$function$;

revoke all on function public.platform_list_schools_with_counts_v3() from public;
revoke all on function public.platform_list_schools_with_counts_v3() from anon;
grant execute on function public.platform_list_schools_with_counts_v3() to authenticated;

-- 2) Arquivamento de escola — soft delete, nunca DELETE físico.
-- Preserva alunos, turmas, ocorrências, fotos, histórico e auditoria
-- intactos. Não toca school_members (nem exclui, nem suspende linhas) —
-- desnecessário: is_school_active() já bloqueia todo acesso à escola assim
-- que status='archived', então os vínculos existentes ficam simplesmente
-- inertes, sem precisar de nenhuma alteração própria. Não exclui nenhuma
-- conta de auth.users. Cancela convites pendentes (nunca deixa um convite
-- 'pending' sobrevivendo a uma escola arquivada) e suspende a assinatura,
-- registrando tudo em platform_audit_log.
create or replace function public.platform_archive_school(
  p_school_id uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school public.schools%rowtype;
  v_previous_subscription_status text;
  v_cancelled_invitations integer;
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

  if v_school.status = 'archived' then
    raise exception 'Esta escola já está arquivada.';
  end if;

  if p_confirm_name is null or btrim(p_confirm_name) <> v_school.name then
    raise exception 'O nome digitado não corresponde ao nome exato da escola.';
  end if;

  update public.schools
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  where id = p_school_id;

  update public.school_invitations
  set status = 'cancelled'
  where school_id = p_school_id
    and status = 'pending';
  get diagnostics v_cancelled_invitations = row_count;

  select ss.status
    into v_previous_subscription_status
  from public.school_subscriptions ss
  where ss.school_id = p_school_id;

  update public.school_subscriptions
  set status = 'suspended',
      updated_at = now()
  where school_id = p_school_id
    and status <> 'suspended';

  perform public.record_platform_audit(
    'school_archived',
    p_school_id,
    null,
    jsonb_build_object(
      'status', v_school.status,
      'subscription_status', v_previous_subscription_status
    ),
    jsonb_build_object(
      'status', 'archived',
      'subscription_status', 'suspended',
      'pending_invitations_cancelled', v_cancelled_invitations
    )
  );
end;
$function$;

revoke all on function public.platform_archive_school(uuid, text) from public;
revoke all on function public.platform_archive_school(uuid, text) from anon;
grant execute on function public.platform_archive_school(uuid, text) to authenticated;

commit;
