-- CARÔMETRO COMERCIAL
-- Escopo por escola: user_notification_shifts
-- Migration 012
--
-- OBJETIVO:
-- Tornar as preferências de notificação por turno ("Matutino",
-- "Vespertino", "Noturno") isoladas por escola, permitindo que o
-- mesmo usuário tenha preferências diferentes em escolas diferentes,
-- e corrigindo o vazamento de escopo em notify_class_subscribers(),
-- que hoje casa turno sem checar a escola da turma.
--
-- Tabela confirmada vazia na pré-validação (0 registros) — mesmo
-- assim a migration mantém a proteção de backfill/abort, seguindo o
-- mesmo padrão de segurança das migrations anteriores, para o caso
-- de rodar em outro ambiente que já tenha dados.
--
-- NÃO altera students/classes/user_notifications/push_subscriptions.
-- NÃO altera platform_admins. NÃO altera nenhuma outra RLS.
-- NÃO altera frontend.
--
-- Autorização de gestão: preserva o comportamento atual (só
-- administrador ou coordenador podem gerenciar preferência de turno),
-- mas agora avaliado NA ESCOLA daquele registro, nunca via
-- user_permissions global — reaproveitando is_school_admin() e
-- is_school_coordinator(), já existentes desde a migration 001.
-- Professor comum continua sem acesso a esta tabela, exatamente como
-- hoje.

begin;


-- ============================================================
-- 1. COLUNA school_id (nullable) + FK
-- ============================================================

alter table public.user_notification_shifts
add column if not exists school_id uuid;

alter table public.user_notification_shifts
drop constraint if exists user_notification_shifts_school_id_fkey;

alter table public.user_notification_shifts
add constraint user_notification_shifts_school_id_fkey
foreign key (school_id)
references public.schools(id);


-- ============================================================
-- 2. BACKFILL — exclusivamente Colégio Estadual Paulo Freire,
--    e somente para usuários com vínculo real naquela escola.
-- ============================================================

update public.user_notification_shifts ns
set school_id = s.id
from public.schools s
where s.slug = 'colegio-estadual-paulo-freire'
  and ns.school_id is null
  and exists (
    select 1
    from public.school_members sm
    where sm.user_id = ns.user_id
      and sm.school_id = s.id
  );


-- ============================================================
-- 3. TRAVA DE SEGURANÇA — aborta se sobrar linha sem school_id
-- ============================================================

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.user_notification_shifts
  where school_id is null;

  if v_count > 0 then
    raise exception
      'Existem % linha(s) em user_notification_shifts sem school_id apos o backfill. Abortando antes de tornar a coluna NOT NULL.',
      v_count;
  end if;
end $$;


-- ============================================================
-- 4. school_id NOT NULL
-- ============================================================

alter table public.user_notification_shifts
alter column school_id set not null;


-- ============================================================
-- 5. NOVA PK: (user_id, school_id, shift)
-- ============================================================

alter table public.user_notification_shifts
drop constraint if exists user_notification_shifts_pkey;

alter table public.user_notification_shifts
add constraint user_notification_shifts_pkey
primary key (user_id, school_id, shift);


-- ============================================================
-- 6. ÍNDICE (school_id, shift)
-- ============================================================

create index if not exists user_notification_shifts_school_shift_idx
on public.user_notification_shifts (school_id, shift);


-- ============================================================
-- 7. RLS: substitui a policy global/legada por policy escolar
-- ============================================================
--
-- Reaproveita is_school_admin(school_id) e is_school_coordinator
-- (school_id), já existentes desde a migration 001. Ambas já exigem
-- status = 'active' no vínculo, então um membro suspenso naquela
-- escola nunca passa nesta policy. Professor comum (sem nenhum dos
-- dois papéis) continua sem acesso, preservando o comportamento
-- atual.

drop policy if exists "Own notification shifts" on public.user_notification_shifts;

create policy "school_admins_and_coordinators_manage_notification_shifts"
on public.user_notification_shifts
for all
to authenticated
using (
  user_id = auth.uid()
  and (
    public.is_school_admin(school_id)
    or public.is_school_coordinator(school_id)
  )
)
with check (
  user_id = auth.uid()
  and (
    public.is_school_admin(school_id)
    or public.is_school_coordinator(school_id)
  )
);


-- ============================================================
-- 8. notify_class_subscribers() — considera obrigatoriamente o
--    school_id da turma ao casar por turno. A parte de
--    user_favorite_classes permanece idêntica, sem alteração.
-- ============================================================

create or replace function public.notify_class_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  student_name text;
  notification_title text;
begin
  select s.class_id, s.full_name
  into cid, student_name
  from public.students s
  where s.id = new.student_id;

  notification_title := case
    when tg_table_name = 'student_alerts' then 'Novo alerta'
    else 'Novo acompanhamento'
  end;

  insert into public.user_notifications (recipient_id, class_id, title, body, target_type, target_id)
  select distinct recipient, cid, notification_title, student_name, tg_table_name, new.id::text
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
