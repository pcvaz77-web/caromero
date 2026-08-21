-- CARÔMETRO COMERCIAL
-- Migration 021: corrige a RPC public.mark_all_uniform_received contra o
-- achado crítico de uma auditoria em modo leitura (branch production):
--   1. Não restringia por school_id — o UPDATE podia atingir alunos de
--      qualquer escola.
--   2. target_class_id NULL fazia o UPDATE atingir TODA a tabela students,
--      de todas as escolas de uma vez.
--   3. EXECUTE estava concedido a anon (confirmado por grants reais e pelo
--      Security Advisor do Supabase).
--   4. Bug de propagação de NULL em PL/pgSQL: quando auth.uid() é NULL
--      (chamada anônima), "rights.role <> 'admin' and (...)" avaliava para
--      NULL, o RAISE EXCEPTION não disparava, e o UPDATE rodava sem
--      restrição nenhuma.
--
-- Plano produzido e revisado pelo carometro-arquiteto (duas rodadas, ambas
-- somente leitura, aprovadas pelo usuário) determinou o desenho final:
--   - target_class_id passa a ser OBRIGATÓRIO (fail closed); NULL sempre
--     gera erro, nenhuma linha é tocada. Não existe mais nenhum caminho de
--     "toda a escola" ou "todas as turmas" dentro desta função.
--   - A escola-alvo (target_school_id) é sempre derivada de
--     classes.school_id da turma informada — nunca inferida da quantidade
--     de vínculos do usuário em school_members. Isso resolve de forma
--     limpa o caso de uma conta com vínculo em mais de uma escola, sem
--     precisar de nenhuma regra especial para esse caso.
--   - Autorização passa a usar exclusivamente o modelo comercial
--     (school_members + school_member_permissions, via
--     is_active_school_member/has_school_permission), nunca mais o
--     user_permissions legado — que não tem coluna school_id e por isso é
--     estruturalmente incapaz de impedir uso cross-escola. Isso é uma
--     mudança deliberada em relação à primeira versão do plano: na
--     revisão, o usuário pediu a opção mais restritiva mesmo sabendo que
--     isso deixa bloqueada, nesta RPC especificamente, uma conta hoje
--     dessincronizada entre user_permissions e school_member_permissions
--     (achado separado, registrado pelo arquiteto, e que NÃO é corrigido
--     por esta migration — é tratado como tarefa própria).
--   - UPDATE restrito simultaneamente por class_id e school_id (o segundo
--     termo é defesa em profundidade, redundante hoje mas protege contra
--     dado futuro inconsistente).
--   - REVOKE de PUBLIC e anon; GRANT apenas para authenticated.
--
-- O frontend (uniform-management.js) já foi corrigido, testado
-- (sintaxe + teste funcional manual, sem gravação real) e revisado
-- separadamente, ANTES desta migration, exatamente na ordem definida pelo
-- plano: se esta migration fosse aplicada antes do frontend estar
-- corrigido, todo clique no botão passaria a falhar (o frontend antigo
-- sempre enviava target_class_id:null). O frontend corrigido já envia
-- sempre a turma real selecionada, então já é compatível com esta versão
-- da RPC antes mesmo dela existir.
--
-- Não altera RLS, triggers (limit_student_field_updates continua sem
-- modificação, como camada adicional já existente e preservada), Auth,
-- Storage, nem qualquer dado. Não corrige a dessincronia
-- user_permissions x school_member_permissions (fora de escopo desta
-- migration).
--
-- Esta migration foi aplicada com sucesso em produção (Supabase, projeto
-- ftigviorsuqucxwxqpua) mediante autorização humana explícita, precedida
-- de auditoria/revisão em modo somente leitura (carometro-arquiteto,
-- carometro-revisor, carometro-auditor) e confirmada posteriormente por
-- nova auditoria em modo somente leitura, que verificou ao vivo a função
-- instalada, a ausência de overload/DEFAULT, os grants finais e a
-- preservação do trigger limit_student_field_updates, conforme CLAUDE.md.

begin;

-- CREATE OR REPLACE FUNCTION não permite remover um DEFAULT já existente
-- (erro 42P13); a função atual tem "target_class_id uuid DEFAULT NULL",
-- por isso é preciso DROP explícito antes de recriar sem default.
drop function public.mark_all_uniform_received(uuid);

create or replace function public.mark_all_uniform_received(target_class_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target_school_id uuid;
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if target_class_id is null then
    raise exception 'Selecione uma turma para marcar todos como receberam.';
  end if;

  select c.school_id
    into v_target_school_id
  from public.classes c
  where c.id = target_class_id;

  if v_target_school_id is null then
    raise exception 'Turma não encontrada.';
  end if;

  if not public.is_active_school_member(v_target_school_id) then
    raise exception 'Sem vínculo ativo nesta escola.';
  end if;

  if not public.has_school_permission(v_target_school_id, 'can_mark_all_uniform_received') then
    raise exception 'Sem permissão para marcar todos como receberam.';
  end if;

  perform set_config('app.uniform_bulk_update', 'true', true);

  update public.students
  set uniform_pending = null,
      uniform_received = true,
      shoes_received = true,
      material_received = true
  where class_id = target_class_id
    and school_id = v_target_school_id;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.mark_all_uniform_received(uuid) from public;
revoke all on function public.mark_all_uniform_received(uuid) from anon;
grant execute on function public.mark_all_uniform_received(uuid) to authenticated;

commit;
