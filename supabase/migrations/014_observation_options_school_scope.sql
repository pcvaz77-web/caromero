-- CARÔMETRO COMERCIAL
-- Escopo por escola: observation_options
-- Migration 014
--
-- OBJETIVO:
-- Tornar observation_options obrigatoriamente por escola (sem
-- registros globais/compartilhados — decisão de produto aprovada),
-- trocar a unicidade de global para (school_id, lower(label)), e
-- habilitar can_manage_observation_options para coordenadores,
-- reaproveitando is_school_admin()/is_school_coordinator()/
-- has_school_permission() (já existentes desde as migrations 001/
-- 002). Nenhuma autorização depende de user_permissions global.
--
-- IMPORTANTE sobre has_school_permission(): essa função (migration
-- 002) não restringe por role além do atalho automático para
-- school_admin — para qualquer outro papel ela só lê a flag em
-- school_member_permissions e devolve o valor, sem checar se quem
-- pergunta é coordenador ou professor. Por isso a autorização aqui
-- NUNCA usa has_school_permission() sozinha: sempre combinada com
-- is_school_coordinator(), que É role-restritiva (checa
-- role='coordinator' e status='active'). Isso garante que teacher
-- nunca gerencia observation_options, mesmo que a flag
-- can_manage_observation_options fique true por alguma
-- inconsistência futura numa linha de professor.
--
-- Compatibilidade com o frontend: o INSERT atual de
-- student-edit-improvements.js NÃO envia school_id. Para não quebrar
-- o botão "Adicionar observação" antes da Fase B, school_id recebe
-- um DEFAULT que é uma função (mesmo padrão já usado nativamente no
-- projeto para user_favorite_classes.user_id/student_alerts.created_by
-- via "default auth.uid()"), que resolve a escola autorizada do
-- chamador no servidor. RLS continua sendo a proteção real (mesmo um
-- insert com school_id explícito e errado seria bloqueado pelo
-- WITH CHECK) — o DEFAULT é só compatibilidade, não é a segurança.
--
-- Pré-validação confirmou: sem duplicidade de labels, só as 2
-- policies legadas conhecidas, índice único global confirmado,
-- ninguém com can_manage_observation_options=true ainda, tabela em
-- supabase_realtime com REPLICA IDENTITY FULL.
--
-- NÃO altera students/has_report (não há FK — confirmado na
-- auditoria: excluir uma opção nunca afetou os alunos que já tinham
-- aquele texto salvo, e isso continua exatamente igual). NÃO altera
-- frontend. NÃO altera platform_admins.

begin;


-- ============================================================
-- 1. FUNÇÃO DE RESOLUÇÃO — reaproveita is_school_admin() e
--    has_school_permission(), mesmo padrão de proteção contra
--    ambiguidade já usado na migration 013 (scope_type='shift').
-- ============================================================

create or replace function public.resolve_authorized_observation_school()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_count int;
begin
  select count(*)
  into v_count
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and (
      public.is_school_admin(sm.school_id)
      or (
        public.is_school_coordinator(sm.school_id)
        and public.has_school_permission(sm.school_id, 'can_manage_observation_options')
      )
    );

  if v_count = 0 then
    raise exception 'Você não possui permissão para gerenciar observações em nenhuma escola.';
  elsif v_count > 1 then
    raise exception 'Você possui permissão de gerenciar observações em mais de uma escola. Informe explicitamente a escola.';
  end if;

  select sm.school_id
  into v_school_id
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and (
      public.is_school_admin(sm.school_id)
      or (
        public.is_school_coordinator(sm.school_id)
        and public.has_school_permission(sm.school_id, 'can_manage_observation_options')
      )
    )
  limit 1;

  return v_school_id;
end;
$$;

revoke all on function public.resolve_authorized_observation_school()
from public, anon;

grant execute on function public.resolve_authorized_observation_school()
to authenticated;


-- ============================================================
-- 2. COLUNA school_id (nullable) + FK
-- ============================================================

alter table public.observation_options
add column if not exists school_id uuid;

alter table public.observation_options
drop constraint if exists observation_options_school_id_fkey;

alter table public.observation_options
add constraint observation_options_school_id_fkey
foreign key (school_id)
references public.schools(id);


-- ============================================================
-- 3. BACKFILL — todas as opções existentes pertencem à Paulo
--    Freire (decisão de produto já aprovada; não há "posse real"
--    a verificar aqui, ao contrário de report_generation_log).
-- ============================================================

update public.observation_options oo
set school_id = s.id
from public.schools s
where s.slug = 'colegio-estadual-paulo-freire'
  and oo.school_id is null;


-- ============================================================
-- 4. TRAVA DE SEGURANÇA — aborta se sobrar linha sem school_id
-- ============================================================

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.observation_options
  where school_id is null;

  if v_count > 0 then
    raise exception
      'Existem % opcao(oes) de observacao sem school_id apos o backfill. Abortando antes de tornar a coluna NOT NULL.',
      v_count;
  end if;
end $$;


-- ============================================================
-- 5. school_id NOT NULL + DEFAULT (compatibilidade com o insert
--    atual do frontend, que não envia school_id)
-- ============================================================

alter table public.observation_options
alter column school_id set not null;

alter table public.observation_options
alter column school_id set default public.resolve_authorized_observation_school();


-- ============================================================
-- 6. UNICIDADE: de global (lower(label)) para por escola
--    (school_id, lower(label))
-- ============================================================

drop index if exists observation_options_label_unique;

create unique index if not exists observation_options_school_label_unique
on public.observation_options (school_id, lower(label));


-- ============================================================
-- 7. RLS: leitura só da própria escola; gestão via
--    is_school_admin() ou has_school_permission(...,
--    'can_manage_observation_options') — nunca user_permissions.
-- ============================================================

drop policy if exists "Authenticated users view observation options" on public.observation_options;
drop policy if exists "Admins manage observation options" on public.observation_options;

create policy "school_members_view_observation_options"
on public.observation_options
for select
to authenticated
using (
  public.is_active_school_member(school_id)
);

create policy "school_authorized_manage_observation_options"
on public.observation_options
for all
to authenticated
using (
  public.is_school_admin(school_id)
  or (
    public.is_school_coordinator(school_id)
    and public.has_school_permission(school_id, 'can_manage_observation_options')
  )
)
with check (
  public.is_school_admin(school_id)
  or (
    public.is_school_coordinator(school_id)
    and public.has_school_permission(school_id, 'can_manage_observation_options')
  )
);


commit;
