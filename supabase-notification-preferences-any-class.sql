-- CARÔMETRO: Professor, Coordenador e Administrador podem escolher QUALQUER
-- turma cadastrada para "Notificações por turma", independente de serem
-- conselheiros dela. Execute uma vez no Supabase SQL Editor, depois de
-- supabase-class-notifications.sql.
--
-- Escopo estritamente limitado ao sistema de preferências/notificações:
-- redefine só validate_favorite_class_access() e create_class_notifications().
-- NÃO toca em accessible_class_ids(), em nenhuma RLS/policy, em nenhuma FK,
-- nem em nenhum outro trigger/função. A notificação continua sendo só um
-- aviso: não concede nem amplia acesso a alunos/turmas/ocorrências — isso
-- continua inteiramente sob as regras normais de cada tela, inclusive na
-- navegação ao clicar em uma notificação.

begin;

-- =====================================================================
-- 1) validate_favorite_class_access(): deixa de restringir por
--    accessible_class_ids(). A RLS "Own favorite classes" já garante que
--    a linha pertence ao próprio usuário (user_id = auth.uid()); este
--    trigger passa a exigir só que class_id corresponda a uma turma que
--    realmente existe.
-- =====================================================================

create or replace function public.validate_favorite_class_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.classes c where c.id = new.class_id) then
    raise exception 'Turma inválida.';
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_favorite_class_access() from public, anon, authenticated;

-- =====================================================================
-- 2) create_class_notifications(): remove a exigência de
--    accessible_class_ids(f.user_id) na hora de gerar a notificação.
--    Continua exigindo turma = destino, notificações ligadas para essa
--    turma, e nunca notificar quem realizou a própria ação.
-- =====================================================================

create or replace function public.create_class_notifications(
  p_class_id uuid,
  p_title text,
  p_body text,
  p_target_type text,
  p_target_id text,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_class_id is null then
    return;
  end if;

  insert into public.user_notifications (recipient_id, class_id, title, body, target_type, target_id)
  select f.user_id, p_class_id, p_title, p_body, p_target_type, p_target_id
  from public.user_favorite_classes f
  where f.class_id = p_class_id
    and f.notifications_enabled
    and f.user_id is distinct from p_actor;
end;
$$;
revoke execute on function public.create_class_notifications(uuid,text,text,text,text,uuid) from public, anon, authenticated;

commit;
