-- CARÔMETRO COMERCIAL
-- Migration 027: RPC de leitura para a nova seção de relatório "Uniforme /
-- Tênis / Material" — mesmo padrão comercial já consolidado em
-- report_students/report_occurrences (migration 024), não o padrão mais
-- solto de report_livro_revisa (is_active_school_member sozinho, que um
-- professor ativo também satisfaz). Aqui a autorização exige
-- explicitamente school_admin OU coordinator NA ESCOLA INFORMADA.
--
-- target_school_id é explícito e revalidado no servidor — nunca inferido
-- do vínculo "ativo" genérico de quem chama, mesmo padrão de
-- report_students. O resultado é restrito a alunos que pertencem
-- simultaneamente aos IDs enviados E à escola informada — nunca confia
-- apenas nos IDs vindos do cliente para isolamento.
--
-- Não altera report_students, RLS de students, nem nenhuma tabela.

create or replace function public.report_uniform_status(
  target_school_id uuid,
  p_student_ids uuid[]
)
returns table (
  student_id uuid,
  uniform_pending text,
  uniform_received boolean,
  shoes_received boolean,
  material_received boolean
)
language plpgsql
security definer
set search_path to ''
stable
as $function$
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if target_school_id is null then
    raise exception 'Selecione a escola para gerar o relatório.';
  end if;

  if not (public.is_school_admin(target_school_id) or public.is_school_coordinator(target_school_id)) then
    raise exception 'Sem permissão para gerar relatórios nesta escola.';
  end if;

  return query
  select s.id, s.uniform_pending, s.uniform_received, s.shoes_received, s.material_received
  from public.students s
  where s.id = any(p_student_ids)
    and s.school_id = target_school_id
  order by s.id;
end;
$function$;

revoke all on function public.report_uniform_status(uuid, uuid[]) from public;
revoke all on function public.report_uniform_status(uuid, uuid[]) from anon;
grant execute on function public.report_uniform_status(uuid, uuid[]) to authenticated;
