-- CARÔMETRO COMERCIAL
-- Escopo por escola: user_notifications
-- Migration 015
--
-- OBJETIVO:
-- Adicionar school_id a user_notifications (mesma Opção A já usada na
-- migration 013: capturado e congelado no momento da gravação, nunca
-- inferido depois), fechando a lacuna arquitetural identificada na
-- auditoria: class_id referencia classes(id) com "on delete set null"
-- (proposital, para preservar o texto da notificação após a exclusão
-- da turma), o que faz a ponte notificação -> escola desaparecer para
-- sempre se a escola não for congelada no próprio registro.
--
-- Pré-validação confirmou 127 notificações existentes, todas com
-- class_id preenchido, nenhuma referência quebrada, nenhuma
-- inconsistência turma -> escola. Backfill 100% seguro via join.
--
-- Esta migration NÃO altera a RLS de user_notifications (permanece
-- exclusivamente recipient_id = auth.uid(), para select e update —
-- school_id aqui é consistência/auditoria, nunca controle de acesso:
-- o usuário sempre pode ver as próprias notificações, mesmo que deixe
-- de ser membro ativo da escola). NÃO altera dismissed_at,
-- push_sent_at, nem os índices já existentes (user_notifications_
-- recipient_idx, user_notifications_recipient_visible_idx). NÃO
-- altera push_subscriptions, student_alerts, student_followups,
-- student_activity, frontend, a Edge Function send-web-push, nem o
-- trigger/função do webhook de push (push_user_notifications_webhook
-- / send_carometro_push_webhook), que usa to_jsonb(new) e portanto já
-- é tolerante a uma coluna nova sem qualquer alteração.
--
-- Atualiza as TRÊS funções que hoje escrevem em user_notifications
-- (auditoria confirmou não existir nenhuma outra, direta ou indireta):
--   1. create_class_notifications()      — já resolvia v_school_id
--   2. notify_admins_and_coordinators()  — já resolvia v_school_id
--   3. notify_class_subscribers()        — NÃO resolvia v_school_id;
--      esta migration adiciona a resolução (via students -> classes)
--      e um retorno antecipado sem gravar nada caso a turma do aluno
--      não seja encontrada ou não tenha escola vinculada — a mesma
--      trava defensiva já usada nas outras duas funções — garantindo
--      que nenhum caminho consegue inserir school_id NULL depois que
--      a coluna virar NOT NULL. Os dois triggers que a acionam
--      (alert_notify_subscribers em student_alerts,
--      followup_notify_subscribers em student_followups — ambos
--      confirmados tgenabled = 'O' na pré-validação) não são
--      alterados, só a função que eles chamam.
--
-- Nenhuma assinatura de função muda (mesmos parâmetros, mesmo tipo de
-- retorno) e NENHUM grant/revoke é emitido nesta migration: CREATE OR
-- REPLACE preserva o ACL já existente de cada função automaticamente,
-- então reemitir revoke/grant seria uma alteração de ACL desnecessária
-- disfarçada de "reafirmação". create_class_notifications() e
-- notify_admins_and_coordinators() mantêm o revoke de
-- public/anon/authenticated já vigente desde a migration 003, sem
-- nenhuma instrução de grant/revoke nova aqui. notify_class_subscribers()
-- nunca teve revoke/grant explícito (é RETURNS TRIGGER: o Postgres já
-- impede chamada direta via RPC, com ou sem grant) e continua sem
-- nenhum, exatamente como está hoje.

begin;


-- ============================================================
-- 1. COLUNA school_id (nullable) + FK
-- ============================================================

alter table public.user_notifications
add column if not exists school_id uuid;

alter table public.user_notifications
drop constraint if exists user_notifications_school_id_fkey;

alter table public.user_notifications
add constraint user_notifications_school_id_fkey
foreign key (school_id)
references public.schools(id);


-- ============================================================
-- 2. BACKFILL — exclusivamente via class_id -> classes.school_id.
--    Pré-validação confirmou 100% das 127 linhas com class_id
--    preenchido e resolvível; nenhuma linha órfã a tratar.
-- ============================================================

update public.user_notifications un
set school_id = c.school_id
from public.classes c
where un.class_id = c.id
  and un.school_id is null;


-- ============================================================
-- 3. TRAVA DE SEGURANÇA — aborta se sobrar linha sem school_id
-- ============================================================

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.user_notifications
  where school_id is null;

  if v_count > 0 then
    raise exception
      'Existem % notificacao(oes) sem school_id apos o backfill. Abortando antes de tornar a coluna NOT NULL.',
      v_count;
  end if;
end $$;


-- ============================================================
-- 4. school_id NOT NULL
-- ============================================================

alter table public.user_notifications
alter column school_id set not null;


-- ============================================================
-- 5. ÍNDICE para leitura por escola
-- ============================================================

create index if not exists user_notifications_school_created_idx
on public.user_notifications (school_id, created_at desc);


-- ============================================================
-- 6. create_class_notifications() — já resolvia v_school_id a
--    partir de classes.school_id; só passa a gravá-lo. Assinatura,
--    lógica de destinatário e ACL inalterados (nenhum grant/revoke
--    emitido: o revoke de public/anon/authenticated já vigente desde
--    a migration 003 é preservado automaticamente pelo CREATE OR
--    REPLACE).
-- ============================================================

create or replace function public.create_class_notifications(
  p_class_id uuid,
  p_title text,
  p_body text,
  p_target_type text,
  p_target_id text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if p_class_id is null then
    return;
  end if;

  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    return;
  end if;

  insert into public.user_notifications (
    recipient_id,
    class_id,
    school_id,
    title,
    body,
    target_type,
    target_id
  )
  select
    f.user_id,
    p_class_id,
    v_school_id,
    p_title,
    p_body,
    p_target_type,
    p_target_id
  from public.user_favorite_classes f
  where f.class_id = p_class_id
    and f.notifications_enabled = true
    and f.user_id is distinct from p_actor
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = v_school_id
        and sm.user_id = f.user_id
        and sm.status = 'active'
    );
end;
$$;


-- ============================================================
-- 7. notify_admins_and_coordinators() — já resolvia v_school_id a
--    partir de classes.school_id; só passa a gravá-lo. Assinatura,
--    lógica de destinatário e ACL inalterados (nenhum grant/revoke
--    emitido: o revoke de public/anon/authenticated já vigente desde
--    a migration 003 é preservado automaticamente pelo CREATE OR
--    REPLACE).
-- ============================================================

create or replace function public.notify_admins_and_coordinators(
  p_title text,
  p_body text,
  p_class_id uuid,
  p_target_type text,
  p_target_id text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if p_class_id is null then
    return;
  end if;

  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    return;
  end if;

  insert into public.user_notifications (
    recipient_id,
    class_id,
    school_id,
    title,
    body,
    target_type,
    target_id
  )
  select
    sm.user_id,
    p_class_id,
    v_school_id,
    p_title,
    p_body,
    p_target_type,
    p_target_id
  from public.school_members sm
  where sm.school_id = v_school_id
    and sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator')
    and sm.user_id is distinct from p_actor;
end;
$$;


-- ============================================================
-- 8. notify_class_subscribers() — NÃO resolvia v_school_id até
--    agora. Passa a resolvê-lo a partir da turma real do aluno de
--    origem (students -> classes), com retorno antecipado (sem
--    gravar nada) se o aluno não for encontrado, se a turma dele já
--    não existir mais, ou se a turma não tiver escola vinculada.
--    Isso garante que NENHUM caminho deste gatilho consegue inserir
--    school_id NULL: ou v_school_id é resolvido de forma inequívoca
--    antes do INSERT, ou a função retorna sem inserir nada.
--
--    Acionada hoje por alert_notify_subscribers (student_alerts) e
--    followup_notify_subscribers (student_followups), ambos
--    confirmados tgenabled = 'O' na pré-validação — nenhum dos dois
--    triggers é alterado, só a função que eles chamam.
-- ============================================================

create or replace function public.notify_class_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  v_school_id uuid;
  student_name text;
  notification_title text;
begin
  select s.class_id, s.full_name
  into cid, student_name
  from public.students s
  where s.id = new.student_id;

  if cid is null then
    return new;
  end if;

  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = cid;

  if v_school_id is null then
    return new;
  end if;

  notification_title := case
    when tg_table_name = 'student_alerts' then 'Novo alerta'
    else 'Novo acompanhamento'
  end;

  insert into public.user_notifications (recipient_id, class_id, school_id, title, body, target_type, target_id)
  select distinct recipient, cid, v_school_id, notification_title, student_name, tg_table_name, new.id::text
  from (
    select f.user_id recipient
    from public.user_favorite_classes f
    where f.class_id = cid
      and f.notifications_enabled

    union

    select ns.user_id
    from public.user_notification_shifts ns
    join public.classes c
      on c.id = cid
      and c.shift = ns.shift
    where ns.school_id = c.school_id
  ) subscribers
  where recipient is distinct from auth.uid();

  return new;
end;
$$;


commit;
