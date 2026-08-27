-- CARÔMETRO COMERCIAL — integridade das notificações e preferências.
-- Preparar e revisar antes de aplicar. Este arquivo não é executado automaticamente.
begin;

alter table public.user_notifications
  add column if not exists dismissed_at timestamptz,
  add column if not exists push_sent_at timestamptz;

-- A central sempre filtra pelo destinatário e pelos avisos ainda visíveis,
-- ordenando os mais recentes primeiro. O pacote comercial deve criar o índice
-- sem depender do script legado supabase-notifications-dismiss.sql.
create index if not exists user_notifications_recipient_visible_idx
  on public.user_notifications(recipient_id, dismissed_at, created_at desc);

-- Validação central para qualquer produtor de notificações (gatilhos atuais e
-- futuros). Não apaga histórico: apenas impede novos avisos para uma conta que
-- já não possua acesso efetivo à escola.
create or replace function public.can_receive_school_notification(
  target_user_id uuid,
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select target_user_id is not null
    and target_school_id is not null
    and exists (
      select 1
      from public.platform_account_access paa
      where paa.user_id = target_user_id
        and paa.status = 'active'
    )
    and exists (
      select 1
      from public.schools s
      where s.id = target_school_id
        and s.status = 'active'
    )
    and exists (
      select 1
      from public.school_members sm
      where sm.user_id = target_user_id
        and sm.school_id = target_school_id
        and sm.status = 'active'
    )
    and exists (
      select 1
      from public.school_subscriptions ss
      where ss.school_id = target_school_id
        and ss.status = 'active'
        and (ss.grant_expires_at is null or ss.grant_expires_at > now())
    );
$function$;

revoke all on function public.can_receive_school_notification(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.can_receive_school_notification(uuid, uuid)
to service_role;

create or replace function public.enforce_notification_recipient_effective_access()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.can_receive_school_notification(new.recipient_id, new.school_id) then
    return null;
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_notification_recipient_effective_access()
from public, anon, authenticated;

drop trigger if exists enforce_notification_recipient_effective_access
on public.user_notifications;
create trigger enforce_notification_recipient_effective_access
before insert on public.user_notifications
for each row execute function public.enforce_notification_recipient_effective_access();

-- O destinatário pode marcar ou ocultar a própria notificação, mas não pode
-- reescrever escola, remetente lógico, texto ou destino de navegação.
create or replace function public.protect_commercial_notification_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Processos internos e service_role continuam podendo registrar o envio.
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;

  if auth.uid() <> old.recipient_id or auth.uid() <> new.recipient_id then
    raise exception 'Notificação pertence a outro usuário.';
  end if;
  if new.school_id is distinct from old.school_id
     or new.class_id is distinct from old.class_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id
     or new.created_at is distinct from old.created_at
     or new.push_sent_at is distinct from old.push_sent_at then
    raise exception 'Somente leitura e ocultação da notificação podem ser alteradas.';
  end if;
  if old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception 'Uma notificação lida não pode voltar ao estado anterior.';
  end if;
  if old.dismissed_at is not null and new.dismissed_at is distinct from old.dismissed_at then
    raise exception 'Uma notificação ocultada não pode voltar ao estado anterior.';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_commercial_notification_update() from public, anon, authenticated;

drop trigger if exists protect_commercial_notification_update on public.user_notifications;
create trigger protect_commercial_notification_update
before update on public.user_notifications
for each row execute function public.protect_commercial_notification_update();

drop policy if exists "Own notifications" on public.user_notifications;
drop policy if exists "Update own notifications" on public.user_notifications;
create policy "Own notifications"
on public.user_notifications for select to authenticated
using (
  recipient_id = auth.uid()
  and public.can_use_school(school_id)
);
create policy "Update own notifications"
on public.user_notifications for update to authenticated
using (
  recipient_id = auth.uid()
  and public.can_use_school(school_id)
)
with check (
  recipient_id = auth.uid()
  and public.can_use_school(school_id)
);

-- A linha de preferência sempre pertence à própria conta. O trigger
-- validate_commercial_favorite_class_access, criado pela migration 003,
-- confirma que a turma pertence a uma escola com vínculo ativo.
drop policy if exists "Own favorite classes" on public.user_favorite_classes;
create policy "Own favorite classes"
on public.user_favorite_classes for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Funções internas são chamadas apenas por triggers/outras funções. Retira a
-- permissão padrão de execução para impedir RPC direta com texto, ator ou alvo
-- falsificados. Os triggers continuam funcionando normalmente.
revoke all on function public.create_class_notifications(uuid, text, text, text, text, uuid)
from public, anon, authenticated;
revoke all on function public.notify_admins_and_coordinators(text, text, uuid, text, text, uuid)
from public, anon, authenticated;
revoke all on function public.notify_class_subscribers()
from public, anon, authenticated;
revoke all on function public.validate_commercial_favorite_class_access()
from public, anon, authenticated;

commit;
