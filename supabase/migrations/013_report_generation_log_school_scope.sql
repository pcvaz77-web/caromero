-- CARÔMETRO COMERCIAL
-- Escopo por escola: report_generation_log
-- Migration 013
--
-- OBJETIVO:
-- Adicionar school_id a report_generation_log (Opção A: capturado e
-- congelado no momento da gravação, nunca inferido depois), fechar a
-- validação de posse de scope_id (um usuário da Escola A nunca pode
-- registrar log de aluno/turma da Escola B) e substituir a RLS de
-- leitura global (is_carometro_admin) por RLS escolar, reaproveitando
-- is_school_admin()/is_school_coordinator() (já existentes desde a
-- migration 001) — mesma regra de autorização de sempre (admin ou
-- coordenador têm acesso automático, sem permissão granular extra),
-- só que agora avaliada na escola correta, não globalmente.
--
-- Pré-validação confirmou 11 registros existentes (6 student, 5
-- class, 0 shift), todos gerados por uma única conta, todos
-- associáveis com segurança à Paulo Freire pelo próprio aluno/turma
-- referenciado — nenhum foi atribuído "por padrão".
--
-- NÃO altera students/classes/platform_admins/report_students()/
-- report_occurrences(). NÃO altera reports.js — a nova função é
-- retrocompatível com a chamada de 7 parâmetros já existente.

begin;


-- ============================================================
-- 1. COLUNA school_id (nullable) + FK
-- ============================================================

alter table public.report_generation_log
add column if not exists school_id uuid;

alter table public.report_generation_log
drop constraint if exists report_generation_log_school_id_fkey;

alter table public.report_generation_log
add constraint report_generation_log_school_id_fkey
foreign key (school_id)
references public.schools(id);


-- ============================================================
-- 2. BACKFILL — nunca "Paulo Freire por padrão". Resolve o
--    school_id real a partir do aluno/turma referenciado.
-- ============================================================

-- 2a. scope_type = 'student': escola do próprio aluno referenciado.
update public.report_generation_log rgl
set school_id = st.school_id
from public.students st
where rgl.scope_type = 'student'
  and rgl.school_id is null
  and st.id = rgl.scope_id
  and st.school_id is not null;

-- 2b. scope_type = 'class': escola da própria turma referenciada.
update public.report_generation_log rgl
set school_id = c.school_id
from public.classes c
where rgl.scope_type = 'class'
  and rgl.school_id is null
  and c.id = rgl.scope_id
  and c.school_id is not null;

-- 2c. scope_type = 'shift' (defensivo — 0 linhas hoje, mas outro
--     ambiente poderia ter): só resolve quando o gerador é
--     admin/coordenador ativo em exatamente UMA escola. Nunca
--     escolhe arbitrariamente entre múltiplas.
with eligible as (
  select sm.user_id, sm.school_id
  from public.school_members sm
  where sm.status = 'active'
    and sm.role in ('school_admin', 'coordinator')
),
grouped as (
  select user_id, array_agg(distinct school_id) as school_ids
  from eligible
  group by user_id
),
unambiguous as (
  select user_id, school_ids[1] as school_id
  from grouped
  where array_length(school_ids, 1) = 1
)
update public.report_generation_log rgl
set school_id = u.school_id
from unambiguous u
where rgl.scope_type = 'shift'
  and rgl.school_id is null
  and u.user_id = rgl.generated_by;


-- ============================================================
-- 3. TRAVA DE SEGURANÇA — aborta se sobrar linha sem school_id
-- ============================================================

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.report_generation_log
  where school_id is null;

  if v_count > 0 then
    raise exception
      'Existem % log(s) de relatorio sem school_id apos o backfill. Abortando antes de tornar a coluna NOT NULL.',
      v_count;
  end if;
end $$;


-- ============================================================
-- 4. school_id NOT NULL
-- ============================================================

alter table public.report_generation_log
alter column school_id set not null;


-- ============================================================
-- 5. ÍNDICE para leitura por escola
-- ============================================================

create index if not exists report_generation_log_school_generated_idx
on public.report_generation_log (school_id, generated_at desc);


-- ============================================================
-- 6. RLS: substitui is_carometro_admin() (global) por autorização
--    escolar, reaproveitando is_school_admin()/is_school_coordinator()
-- ============================================================

drop policy if exists "Report generators read own or admin reads all" on public.report_generation_log;

create policy "school_scoped_report_log_access"
on public.report_generation_log
for select
to authenticated
using (
  (
    generated_by = auth.uid()
    and public.is_active_school_member(school_id)
  )
  or public.is_school_admin(school_id)
  or public.is_school_coordinator(school_id)
);


-- ============================================================
-- 7. log_report_generation() — resolve e valida school_id NO
--    SERVIDOR, fecha a validação de posse de scope_id, e passa a
--    autorizar por escola (não mais por user_permissions global).
--
--    Derruba explicitamente a assinatura antiga de 7 parâmetros
--    antes de criar a nova de 8, para não deixar dois overloads
--    coexistindo (o que quebraria a chamada existente em
--    reports.js com "function is not unique").
-- ============================================================

drop function if exists public.log_report_generation(text, uuid, text, jsonb, date, date, integer);

create or replace function public.log_report_generation(
  p_scope_type text,
  p_scope_id uuid,
  p_scope_label text,
  p_contents jsonb,
  p_period_start date,
  p_period_end date,
  p_student_count integer,
  p_school_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  new_id uuid;
  v_school_id uuid;
  v_school_count int;
begin
  if p_scope_type not in ('student', 'class', 'shift') then
    raise exception 'Escopo de relatório inválido.';
  end if;

  -- Resolve e valida a escola do escopo. Para student/class, a
  -- escola vem SEMPRE do próprio registro referenciado (nunca de um
  -- valor enviado pelo cliente) — isso é o que impede um usuário da
  -- Escola A de registrar um log apontando para aluno/turma da
  -- Escola B: se o scope_id pertencer a outra escola, v_school_id
  -- será a escola REAL do dado, e a checagem de autorização abaixo
  -- vai falhar porque o chamador não é admin/coordenador lá.
  if p_scope_type = 'student' then
    if p_scope_id is null then
      raise exception 'Informe o aluno do relatório.';
    end if;

    select st.school_id
    into v_school_id
    from public.students st
    where st.id = p_scope_id;

    if v_school_id is null then
      raise exception 'Aluno informado não foi encontrado ou não possui escola vinculada.';
    end if;

    -- Se o cliente informou p_school_id, ele precisa bater com a
    -- escola real do aluno — nunca é aceito por si só como fonte
    -- de verdade, só como checagem extra de consistência.
    if p_school_id is not null and p_school_id <> v_school_id then
      raise exception 'A escola informada não corresponde à escola do aluno.';
    end if;

  elsif p_scope_type = 'class' then
    if p_scope_id is null then
      raise exception 'Informe a turma do relatório.';
    end if;

    select c.school_id
    into v_school_id
    from public.classes c
    where c.id = p_scope_id;

    if v_school_id is null then
      raise exception 'Turma informada não foi encontrada ou não possui escola vinculada.';
    end if;

    if p_school_id is not null and p_school_id <> v_school_id then
      raise exception 'A escola informada não corresponde à escola da turma.';
    end if;

  else -- 'shift': scope_id precisa continuar null; não há dado para
       -- validar posse, então resolve pela autorização do chamador.
    if p_scope_id is not null then
      raise exception 'Relatório por turno não deve informar scope_id.';
    end if;

    if p_school_id is not null then
      -- Caminho reservado para quando o frontend informar
      -- explicitamente a escola ativa. Não usado hoje (reports.js
      -- nunca envia este parâmetro).
      v_school_id := p_school_id;
    else
      select count(distinct sm.school_id)
      into v_school_count
      from public.school_members sm
      where sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role in ('school_admin', 'coordinator');

      if v_school_count = 0 then
        raise exception 'Você não possui permissão de administrador ou coordenador em nenhuma escola.';
      elsif v_school_count > 1 then
        raise exception 'Você possui permissão de administrador/coordenador em mais de uma escola. Informe explicitamente a escola deste relatório.';
      end if;

      select sm.school_id
      into v_school_id
      from public.school_members sm
      where sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role in ('school_admin', 'coordinator')
      limit 1;
    end if;
  end if;

  -- Autorização: exatamente a regra original ("Administrador ou
  -- Coordenador têm acesso automático, sem permissão granular
  -- nova"), agora avaliada NA ESCOLA resolvida acima.
  if not (
    public.is_school_admin(v_school_id)
    or public.is_school_coordinator(v_school_id)
  ) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Não informado')
    into actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.report_generation_log (
    generated_by, generated_by_name, school_id, scope_type, scope_id, scope_label,
    contents, period_start, period_end, student_count
  ) values (
    auth.uid(), coalesce(actor_name, 'Não informado'), v_school_id, p_scope_type, p_scope_id, coalesce(p_scope_label, ''),
    coalesce(p_contents, '{}'::jsonb), p_period_start, p_period_end, coalesce(p_student_count, 0)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_report_generation(text, uuid, text, jsonb, date, date, integer, uuid)
from public, anon;

grant execute on function public.log_report_generation(text, uuid, text, jsonb, date, date, integer, uuid)
to authenticated;


commit;
