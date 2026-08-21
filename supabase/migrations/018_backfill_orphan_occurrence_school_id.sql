-- CARÔMETRO COMERCIAL
-- Migration 018: preenche school_id de duas ocorrências históricas órfãs.
--
-- A Migration 003 (supabase/migrations/003_commercial_school_features_scope.sql)
-- adicionou a coluna public.student_occurrences.school_id, a RLS e o trigger
-- enforce_occurrence_school_scope, mas não fez backfill das linhas já
-- existentes na tabela. Duas ocorrências criadas antes dessa migração
-- ficaram com school_id NULL e, por isso, ficaram bloqueadas pela RLS
-- (invisíveis e não editáveis/excluíveis pela tela Gerenciar Ocorrências),
-- embora continuassem visíveis em relatórios via report_occorrences()
-- (SECURITY DEFINER, que ignora RLS). Investigação completa registrada na
-- auditoria em modo leitura que precedeu esta migration.
--
-- Esta migration corrige exclusivamente as duas linhas identificadas,
-- preenchendo school_id com o school_id do aluno correspondente (única
-- forma de derivar esse valor com segurança, e a mesma regra que o próprio
-- trigger enforce_occurrence_school_scope já aplica em qualquer INSERT).
-- Não cria, altera nem remove tabela, coluna, trigger, policy, RPC ou
-- permissão alguma.

begin;

-- Confirma, dentro da própria transação, que a base ainda está exatamente
-- como a auditoria encontrou antes de gravar qualquer coisa: só essas duas
-- linhas com school_id NULL, com os ids esperados.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.student_occurrences
  where school_id is null;

  if v_count <> 2 then
    raise exception 'Esperava exatamente 2 ocorrências com school_id NULL, encontrou %.', v_count;
  end if;

  if not exists (
    select 1 from public.student_occurrences
    where id = 'e2daba71-a583-4562-b3f7-42e03997bd13'::uuid and school_id is null
  ) then
    raise exception 'Ocorrência e2daba71-a583-4562-b3f7-42e03997bd13 não encontrada com school_id NULL.';
  end if;

  if not exists (
    select 1 from public.student_occurrences
    where id = '92ba73ac-9c69-4e42-9fc7-08d28335f5b7'::uuid and school_id is null
  ) then
    raise exception 'Ocorrência 92ba73ac-9c69-4e42-9fc7-08d28335f5b7 não encontrada com school_id NULL.';
  end if;
end;
$$;

update public.student_occurrences o
set school_id = s.school_id
from public.students s
where o.id in (
    'e2daba71-a583-4562-b3f7-42e03997bd13'::uuid,
    '92ba73ac-9c69-4e42-9fc7-08d28335f5b7'::uuid
  )
  and o.student_id = s.id
  and o.school_id is null
  and s.school_id is not null;

-- Confere que as duas linhas (e só elas) foram corrigidas.
do $$
declare
  v_remaining integer;
  v_updated integer;
begin
  select count(*) into v_remaining
  from public.student_occurrences
  where id in (
      'e2daba71-a583-4562-b3f7-42e03997bd13'::uuid,
      '92ba73ac-9c69-4e42-9fc7-08d28335f5b7'::uuid
    )
    and school_id is null;

  if v_remaining <> 0 then
    raise exception 'Backfill não completou: % linha(s) ainda com school_id NULL.', v_remaining;
  end if;

  select count(*) into v_updated
  from public.student_occurrences
  where id in (
      'e2daba71-a583-4562-b3f7-42e03997bd13'::uuid,
      '92ba73ac-9c69-4e42-9fc7-08d28335f5b7'::uuid
    )
    and school_id is not null;

  if v_updated <> 2 then
    raise exception 'Esperava exatamente 2 linhas corrigidas, encontrou %.', v_updated;
  end if;
end;
$$;

commit;
