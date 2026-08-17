-- CARÔMETRO: proteção de banco para a funcionalidade RELATÓRIOS (V1).
-- Execute uma vez no Supabase SQL Editor.
--
-- Este script é aditivo: cria funções novas (RPCs) e uma tabela nova de
-- auditoria. NÃO altera nenhuma policy, tabela ou função já existente de
-- students/classes/student_occurrences/storage. O acesso amplo de leitura
-- que essas tabelas já concedem hoje a qualquer usuário autenticado
-- continua exatamente como está — essa é uma pendência de segurança maior,
-- já registrada, e será tratada em uma revisão específica futura, não aqui.
--
-- Regra de acesso a Relatórios (definida pelo usuário, sem nova permissão
-- granular): Administrador (role = 'admin') ou Coordenador (is_coordinator
-- = true) têm acesso automático. Professor comum nunca tem acesso, mesmo
-- chamando as funções diretamente pela API — a checagem abaixo roda dentro
-- do banco e usa sempre auth.uid(), nunca um id enviado pelo cliente.

begin;

-- =====================================================================
-- 1) Helper interno: só existe para ser chamado por outras funções deste
--    arquivo. Não é exposto à API (revogado de public/anon/authenticated).
-- =====================================================================
create or replace function public.is_report_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_permissions
    where user_id = auth.uid()
      and (role = 'admin' or coalesce(is_coordinator, false))
  );
$$;
revoke execute on function public.is_report_manager() from public, anon, authenticated;

-- =====================================================================
-- 2) report_students(): devolve os alunos dentro do escopo pedido
--    (turno/turma/aluno), somente para quem passa em is_report_manager().
--    Não amplia dado nenhum: students/classes já são de leitura aberta a
--    todo autenticado hoje; esta função só restringe quem pode usar este
--    caminho específico de geração de relatório.
-- =====================================================================
create or replace function public.report_students(
  p_shift text default null,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns table (
  student_id uuid,
  full_name text,
  class_id uuid,
  class_name text,
  shift text,
  has_report text,
  photo_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_report_manager() then
    raise exception 'Sem permissão para gerar relatórios.';
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.class_id,
    coalesce(c.name, s.class_name, ''),
    coalesce(c.shift, 'Matutino'),
    s.has_report,
    s.photo_path
  from public.students s
  left join public.classes c on c.id = s.class_id
  where (p_student_id is null or s.id = p_student_id)
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_shift is null or coalesce(c.shift, 'Matutino') = p_shift)
  order by coalesce(c.name, s.class_name, ''), s.full_name;
end;
$$;
revoke execute on function public.report_students(text, uuid, uuid) from public, anon;
grant execute on function public.report_students(text, uuid, uuid) to authenticated;

-- =====================================================================
-- 3) report_occurrences(): ocorrências dos alunos informados, dentro do
--    período opcional. Mesma proteção de report_students(). Devolve só
--    os campos necessários ao PDF (data, responsável, descrição) — nada
--    de status/categoria/campo que não existe na tabela.
--    occurrence_text é varchar(500) em student_occurrences (supabase-
--    occurrences.sql); a função declara text no retorno, então precisa do
--    cast explícito abaixo (::text) — sem ele o Postgres recusa a função
--    inteira com "structure of query does not match function result type".
-- =====================================================================
create or replace function public.report_occurrences(
  p_student_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table (
  student_id uuid,
  occurred_on date,
  created_by_name text,
  occurrence_text text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_report_manager() then
    raise exception 'Sem permissão para gerar relatórios.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return;
  end if;

  return query
  select o.student_id, o.occurred_on, o.created_by_name, o.occurrence_text::text
  from public.student_occurrences o
  where o.student_id = any(p_student_ids)
    and (p_start is null or o.occurred_on >= p_start)
    and (p_end is null or o.occurred_on <= p_end)
  order by o.student_id, o.occurred_on;
end;
$$;
revoke execute on function public.report_occurrences(uuid[], date, date) from public, anon;
grant execute on function public.report_occurrences(uuid[], date, date) to authenticated;

-- =====================================================================
-- 4) Auditoria mínima de geração de relatório. Guarda só metadados: quem,
--    quando, escopo e quais conteúdos — nunca o PDF, a foto, o texto das
--    ocorrências ou das observações.
-- =====================================================================
create table if not exists public.report_generation_log (
  id uuid primary key default gen_random_uuid(),
  generated_by uuid references auth.users(id) on delete set null,
  generated_by_name text not null default 'Não informado',
  generated_at timestamptz not null default now(),
  scope_type text not null check (scope_type in ('student', 'class', 'shift')),
  scope_id uuid,
  scope_label text not null default '',
  contents jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  student_count integer not null default 0
);

alter table public.report_generation_log enable row level security;

drop policy if exists "Report generators read own or admin reads all" on public.report_generation_log;
create policy "Report generators read own or admin reads all"
on public.report_generation_log for select to authenticated
using (generated_by = auth.uid() or public.is_carometro_admin());

-- Sem nenhuma policy de INSERT/UPDATE/DELETE para authenticated/anon: a
-- única forma de gravar é pela função abaixo (security definer), que
-- resolve a identidade e o nome sempre no servidor.
-- =====================================================================
-- 5) log_report_generation(): grava a auditoria. Também exige
--    is_report_manager() — quem não pode gerar relatório também não pode
--    forjar uma linha de auditoria de geração.
-- =====================================================================
create or replace function public.log_report_generation(
  p_scope_type text,
  p_scope_id uuid,
  p_scope_label text,
  p_contents jsonb,
  p_period_start date,
  p_period_end date,
  p_student_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  new_id uuid;
begin
  if not public.is_report_manager() then
    raise exception 'Sem permissão para gerar relatórios.';
  end if;
  if p_scope_type not in ('student', 'class', 'shift') then
    raise exception 'Escopo de relatório inválido.';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Não informado')
    into actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.report_generation_log (
    generated_by, generated_by_name, scope_type, scope_id, scope_label,
    contents, period_start, period_end, student_count
  ) values (
    auth.uid(), coalesce(actor_name, 'Não informado'), p_scope_type, p_scope_id, coalesce(p_scope_label, ''),
    coalesce(p_contents, '{}'::jsonb), p_period_start, p_period_end, coalesce(p_student_count, 0)
  )
  returning id into new_id;

  return new_id;
end;
$$;
revoke execute on function public.log_report_generation(text, uuid, text, jsonb, date, date, integer) from public, anon;
grant execute on function public.log_report_generation(text, uuid, text, jsonb, date, date, integer) to authenticated;

commit;
