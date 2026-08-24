-- CARÔMETRO COMERCIAL
-- Migration 029: a autorização real de "Gerenciar Conselheiros" passa a
-- ser derivada diretamente de school_members.role='coordinator' AND
-- status='active' NA ESCOLA INFORMADA — não mais de
-- school_member_permissions.can_manage_counselors.
--
-- Motivação (auditoria em produção, sem escrita):
--   - set_school_member_role só zerava can_manage_counselors ao rebaixar
--     (coordinator->teacher); a promoção inversa (teacher->coordinator)
--     nunca concedia a flag — é exatamente essa lacuna que deixou
--     pcvaz25@gmail.com coordenador sem a permissão, corrigido
--     manualmente na rodada anterior.
--   - accept_school_invitation aceita convites com role='coordinator'
--     (create_school_invitation já permite isso a um school_admin, mesmo
--     que o frontend hoje só use role='teacher' na prática) e só aplica
--     o "piso" de permissões quando role='teacher' — um coordenador
--     aceito por convite direto nasce com a linha de
--     school_member_permissions inteira em false.
--   - restore_school_membership tem a mesma lacuna: só aplica piso de
--     professor quando o vínculo reativado tem permissões órfãs E
--     role='teacher'; um coordinator reativado com permissões órfãs não
--     recebe nenhum piso equivalente.
--   Qualquer solução baseada em sincronizar o flag em cada um desses
--   pontos de escrita depende de nunca esquecer nenhum — já falhou uma
--   vez. Derivar a autorização direto do role elimina essa classe inteira
--   de bug de uma vez, cobrindo inclusive caminhos futuros ainda não
--   escritos.
--
-- can_manage_counselors permanece na tabela (não é removida, não é
-- migration destrutiva) por compatibilidade/coerência — mas deixa de ser
-- a fonte de autorização. As três funções de escrita abaixo passam a
-- sincronizá-la automaticamente mesmo assim, só para o dado nunca ficar
-- "mentiroso" (dizendo false para quem, na prática, já tem a permissão
-- via role). Nenhuma outra flag é tocada em nenhuma das três.
--
-- Funções substituídas nesta migration (todas via CREATE OR REPLACE,
-- NENHUMA mudança de assinatura, portanto sem necessidade de DROP nem de
-- qualquer alteração no frontend):
--   - can_manage_class_counselors(target_school_id uuid) — corpo trocado.
--   - set_school_member_role(target_member_id uuid, new_role text) —
--     acrescenta só o bloco espelhado de promoção (teacher->coordinator).
--   - accept_school_invitation(invitation_token uuid) — acrescenta só o
--     piso de coordinator, ao lado do piso de teacher já existente.
--   - restore_school_membership(target_user_id uuid, target_school_id uuid)
--     — acrescenta só o piso de coordinator, ao lado do piso de teacher
--     já existente.
--
-- list_counselor_candidates(target_school_id uuid) NÃO é alterada nesta
-- migration: já filtra corretamente por escola, status='active' e
-- role in ('teacher','coordinator') desde a migration 028 — preservada
-- exatamente como está.
--
-- Não altera: RLS de nenhuma tabela, a tabela class_counselors, o trigger
-- enforce_counselor_school_scope, RLS/tabela de user_permissions, nem
-- qualquer dado existente. Nenhum UPDATE de dado é feito aqui — o
-- backfill dos coordenadores já existentes é uma etapa separada,
-- apresentada e autorizada à parte.

begin;

-- ---------------------------------------------------------------------
-- 1. can_manage_class_counselors — autorização direta pelo role, nunca
--    mais pelo flag.
-- ---------------------------------------------------------------------

create or replace function public.can_manage_class_counselors(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.school_members sm
    where sm.user_id = auth.uid()
      and sm.school_id = target_school_id
      and sm.role = 'coordinator'
      and sm.status = 'active'
  );
$function$;

revoke all on function public.can_manage_class_counselors(uuid) from public;
revoke all on function public.can_manage_class_counselors(uuid) from anon;
grant execute on function public.can_manage_class_counselors(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. set_school_member_role — promoção teacher->coordinator passa a
--    sincronizar can_manage_counselors=true (só coerência do dado; a
--    autorização real já não depende mais disto). O bloco de
--    rebaixamento (coordinator->teacher), que já zerava a flag junto com
--    as demais, permanece exatamente como estava.
-- ---------------------------------------------------------------------

create or replace function public.set_school_member_role(
  target_member_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target public.school_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if new_role not in ('coordinator', 'teacher') then
    raise exception 'Função inválida.';
  end if;

  select *
    into v_target
  from public.school_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Membro não encontrado.';
  end if;

  if not public.is_member_of_administered_school(v_target.id) then
    raise exception 'Você não possui permissão para alterar este membro.';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'Você não pode alterar sua própria função.';
  end if;

  if v_target.role = 'school_admin' then
    raise exception 'A função de administradores não pode ser alterada.';
  end if;

  update public.school_members
  set
    role = new_role,
    updated_at = now()
  where id = v_target.id;

  -- A limpeza só ocorre numa transição REAL de coordenador para
  -- professor (v_target.role, lido antes do update acima, ainda
  -- reflete o papel anterior) — nunca quando o alvo já era professor.
  -- Isso protege qualquer concessão individual futura feita
  -- diretamente a um professor: essa concessão nunca passaria por
  -- este bloco, pois ele só executa numa transição efetiva de papel.
  if v_target.role = 'coordinator' and new_role = 'teacher' then
    update public.school_member_permissions
    set
      -- Permissões administrativas exclusivas de coordenador.
      can_manage_observation_options = false,
      can_invite_teachers = false,
      can_manage_member_permissions = false,
      can_manage_counselors = false,
      -- Bypass total: nunca deve sobreviver a um rebaixamento.
      can_edit_all = false,
      -- Demais permissões avançadas herdadas da coordenação.
      can_add_students = false,
      can_edit_students = false,
      can_delete_students = false,
      can_edit_photo = false,
      can_edit_name = false,
      can_edit_class = false,
      can_edit_report = false,
      can_view_uniform = false,
      can_edit_uniform = false,
      can_mark_all_uniform_received = false,
      can_edit_occurrences = false,
      can_delete_occurrences = false,
      can_view_dashboard = false,
      can_view_history = false,
      can_manage_alerts = false,
      can_record_followups = false,
      can_export_reports = false,
      can_use_bulk_actions = false,
      can_view_audit = false,
      can_view_class_summary = false,
      -- Padrão obrigatório de professor.
      can_view_occurrences = true,
      can_register_occurrences = true,
      updated_at = now()
    where member_id = v_target.id;
  end if;

  -- Espelho do bloco acima, só para can_manage_counselors: numa transição
  -- REAL de professor para coordenador, sincroniza a flag por coerência
  -- do dado — a autorização real de Gerenciar Conselheiros já não depende
  -- mais dela (ver can_manage_class_counselors acima). Não concede
  -- nenhuma outra permissão avançada: essas continuam exigindo concessão
  -- explícita pela tela de Permissões, como já era.
  if v_target.role = 'teacher' and new_role = 'coordinator' then
    update public.school_member_permissions
    set
      can_manage_counselors = true,
      updated_at = now()
    where member_id = v_target.id;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. accept_school_invitation — coordenador aceito por convite direto
--    nasce com can_manage_counselors=true, mesmo padrão do piso de
--    teacher já existente logo acima. Nenhuma outra flag é tocada.
-- ---------------------------------------------------------------------

create or replace function public.accept_school_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_invitation public.school_invitations%rowtype;
  v_user_id uuid;
  v_user_email text;
  v_member_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select lower(trim(email))
    into v_user_email
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    raise exception 'E-mail do usuário não encontrado.';
  end if;

  select *
    into v_invitation
  from public.school_invitations
  where token = invitation_token
  for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Este convite não está mais disponível.';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Este convite expirou.';
  end if;

  if lower(trim(v_invitation.email)) <> v_user_email then
    raise exception 'Este convite pertence a outro usuário.';
  end if;

  insert into public.school_members (
    school_id,
    user_id,
    role,
    status
  )
  values (
    v_invitation.school_id,
    v_user_id,
    v_invitation.role,
    'active'
  )
  on conflict (school_id, user_id)
  do nothing
  returning id into v_member_id;

    if v_member_id is null then
    raise exception 'Este usuário já pertence a esta escola.';
  end if;

  -- Cria a linha inicial de permissões do novo vínculo.
  -- Todas começam como false e depois são concedidas conforme a hierarquia.
  insert into public.school_member_permissions (member_id)
  values (v_member_id)
  on conflict (member_id) do nothing;

  -- Padrão do papel "teacher", válido para qualquer escola do sistema
  -- comercial (não específico da Paulo Freire): visualizar e registrar
  -- ocorrências da escola ficam liberados por padrão. Editar/excluir
  -- permanecem false — o direito de editar/excluir a própria ocorrência já
  -- vem, à parte, da autoria (created_by = auth.uid()) na RLS de
  -- student_occurrences, não desta flag. Demais permissões continuam todas
  -- false, concedidas conforme a hierarquia.
  if v_invitation.role = 'teacher' then
    update public.school_member_permissions
    set can_view_occurrences = true,
        can_register_occurrences = true,
        updated_at = now()
    where member_id = v_member_id;
  end if;

  -- Padrão do papel "coordinator" aceito por convite direto:
  -- can_manage_counselors=true por coerência do dado — a autorização real
  -- de Gerenciar Conselheiros já vem do role, não desta flag (ver
  -- can_manage_class_counselors). Nenhuma outra permissão avançada é
  -- concedida aqui: continuam exigindo concessão explícita pela tela de
  -- Permissões, como já era para as demais.
  if v_invitation.role = 'coordinator' then
    update public.school_member_permissions
    set can_manage_counselors = true,
        updated_at = now()
    where member_id = v_member_id;
  end if;

  update public.school_invitations
  set
    status = 'accepted',
    accepted_at = now()
  where id = v_invitation.id;

  return v_member_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. restore_school_membership — mesma lacuna do piso de teacher,
--    espelhada para coordinator. Só se aplica quando a linha de
--    permissões estava órfã e acabou de ser criada agora (v_permissions_
--    created) — nunca reseta uma linha já existente, exatamente a mesma
--    regra já usada para o piso de teacher.
-- ---------------------------------------------------------------------

create or replace function public.restore_school_membership(target_user_id uuid, target_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_member_role text;
  v_members_created boolean;
  v_permissions_created boolean;
  v_target_email text;
  v_email_confirmed boolean;
begin
  -- Chamador precisa estar autenticado.
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Chamador precisa ser school_admin ATIVO exatamente da escola-alvo.
  -- Comparação direta contra target_school_id porque ainda não existe
  -- school_members para o alvo — é exatamente o que esta function cria.
  if not exists (
    select 1
    from public.school_members admin_member
    where admin_member.school_id = target_school_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'school_admin'
      and admin_member.status = 'active'
  ) then
    raise exception 'Somente o administrador desta escola pode restaurar vínculos.';
  end if;

  -- Usuário-alvo precisa existir e ter e-mail confirmado.
  select email, (email_confirmed_at is not null)
    into v_target_email, v_email_confirmed
  from auth.users
  where id = target_user_id;

  if v_target_email is null then
    raise exception 'Usuário não encontrado.';
  end if;

  if not v_email_confirmed then
    raise exception 'A conta ainda não confirmou o e-mail — não é possível restaurar o vínculo agora.';
  end if;

  -- Tentativa atômica de criação. Sob concorrência, no máximo uma chamada
  -- para a mesma (school_id, user_id) recebe FOUND=true — a outra cai no
  -- ramo UPDATE abaixo. Não há janela entre "checar" e "agir".
  insert into public.school_members (school_id, user_id, role, status)
  values (target_school_id, target_user_id, 'teacher', 'active')
  on conflict (school_id, user_id) do nothing
  returning id into v_member_id;

  v_members_created := found;

  if v_members_created then
    v_member_role := 'teacher';
  else
    -- Já existia: reativa status, NUNCA altera role. Um vínculo com
    -- role='coordinator' que foi suspenso volta como coordinator, nunca é
    -- rebaixado silenciosamente a teacher.
    update public.school_members
    set status = 'active', updated_at = now()
    where school_id = target_school_id and user_id = target_user_id
    returning id, role into v_member_id, v_member_role;
  end if;

  -- Salvaguarda de elegibilidade: um vínculo NOVO só pode ser criado por
  -- esta function para uma conta com histórico real de cancelamento de
  -- login no e-mail atual. Não se aplica à reativação de vínculo já
  -- existente. Isto impede que a RPC vire uma forma paralela de adicionar
  -- qualquer pessoa a uma escola, contornando o fluxo de convites.
  if v_members_created and not exists (
    select 1 from public.cancelled_logins cl
    where lower(trim(cl.email)) = lower(trim(v_target_email))
  ) then
    raise exception 'Esta conta não possui histórico de cancelamento de login — use o fluxo de convite normal.';
  end if;

  -- Mesma lógica atômica para a linha de permissões: FOUND indica que ela
  -- não existia e foi criada agora — seja porque o vínculo é novo, seja
  -- porque um vínculo já existente estava com permissões órfãs (ausentes).
  -- Não sobrescreve nada se a linha já existir (reativação preserva as
  -- permissões como estavam, sem reset).
  insert into public.school_member_permissions (member_id)
  values (v_member_id)
  on conflict (member_id) do nothing;

  v_permissions_created := found;

  -- Piso obrigatório de professor — a RLS de student_occurrences exige
  -- estas duas flags para SELECT/INSERT funcionarem (migration 003). Só
  -- se aplica quando a linha de permissões acabou de ser criada agora E
  -- o papel do vínculo é 'teacher'. Nunca reseta uma linha existente;
  -- nunca aplica piso de professor a coordinator/school_admin.
  if v_permissions_created and v_member_role = 'teacher' then
    update public.school_member_permissions
    set
      can_view_occurrences = true,
      can_register_occurrences = true,
      updated_at = now()
    where member_id = v_member_id;
  end if;

  -- Mesma lógica, espelhada para coordinator: can_manage_counselors=true
  -- por coerência do dado quando a linha de permissões estava órfã e foi
  -- criada agora para um vínculo já reativado como coordinator (role
  -- nunca é alterado por esta function — ver comentário acima). A
  -- autorização real de Gerenciar Conselheiros já vem do role, não desta
  -- flag.
  if v_permissions_created and v_member_role = 'coordinator' then
    update public.school_member_permissions
    set
      can_manage_counselors = true,
      updated_at = now()
    where member_id = v_member_id;
  end if;

  return v_member_id;
end;
$function$;

commit;
