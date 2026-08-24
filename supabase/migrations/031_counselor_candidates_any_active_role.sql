-- CARÔMETRO COMERCIAL
-- Migration 031: candidatos a conselheiro de turma passam a incluir todo
-- membro ATIVO da escola, independente de role (teacher, coordinator ou
-- school_admin) — regra de produto definida explicitamente pelo usuário.
--
-- Contexto (auditoria em produção, sem escrita):
--   list_counselor_candidates(target_school_id) filtrava também por
--   sm.role in ('teacher','coordinator'), herdado da Migration 028. Na
--   única escola real hoje (Colégio Estadual Paulo Freire), isso deixava
--   de fora o único membro ativo com role='school_admin'
--   (passosdigital77@gmail.com) — o único ausente da lista de candidatos
--   dentre os membros ativos.
--
--   Auditoria confirmou que nenhuma outra camada depende dessa restrição
--   de role para "ser candidato a conselheiro": o trigger
--   enforce_counselor_school_scope (não alterado aqui) já valida somente
--   escola + status='active' do counselor_user_id, sem checar role; as
--   RLS de INSERT/UPDATE/DELETE de class_counselors (não alteradas aqui)
--   controlam quem pode ATRIBUIR um conselheiro (admin/coordenador), não
--   quem pode SER o conselheiro. Ou seja, o banco já aceitaria gravar um
--   school_admin como counselor_user_id — só a listagem de candidatos
--   impedia escolhê-lo na tela.
--
-- Mudança: remove exclusivamente a condição "and sm.role in
-- ('teacher','coordinator')" do WHERE. Mantém escola
-- (sm.school_id = target_school_id) e vínculo ativo (sm.status =
-- 'active') exatamente como antes — nunca lista suspenso, nunca lista
-- usuário de outra escola, nunca lista quem não tem vínculo nesta escola.
-- Mesma assinatura (sem DROP necessário), mesma autorização
-- (can_manage_class_counselors, inalterada), mesma ordenação, mesmo
-- retorno, mesmos grants (preservados automaticamente pelo CREATE OR
-- REPLACE sobre a função existente).
--
-- Esta migration NÃO altera: class_counselors, nenhuma RLS, nenhum
-- trigger, school_members, school_member_permissions, user_permissions,
-- autenticação/login, dados de usuários/alunos/turmas/fotos/ocorrências/
-- observações/uniforme/notificações, nem os conselheiros já cadastrados.
-- Nenhum INSERT/UPDATE/DELETE de dado é feito aqui.

begin;

create or replace function public.list_counselor_candidates(target_school_id uuid)
returns table(user_id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.can_manage_class_counselors(target_school_id) then
    raise exception 'Somente um coordenador autorizado pode listar candidatos a conselheiro';
  end if;

  return query
  select sm.user_id, pr.email::text, pr.full_name::text
  from public.school_members sm
  join public.profiles pr on pr.id = sm.user_id
  where sm.school_id = target_school_id
    and sm.status = 'active'
  order by coalesce(nullif(trim(pr.full_name), ''), pr.email);
end;
$function$;

commit;
