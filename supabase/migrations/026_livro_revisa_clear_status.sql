-- CARÔMETRO COMERCIAL
-- Migration 026: RPC para desfazer, especificamente, uma marcação ✕
-- (nao_recebido) de Livro/Revisa feita por engano — nunca um ✓ (recebido).
--
-- Não cria nenhuma policy DELETE direta em livro_revisa_deliveries: a única
-- forma de remover uma linha continua sendo esta RPC SECURITY DEFINER,
-- reaproveitando exatamente as mesmas validações de set_livro_revisa_status
-- (migration 022) — escola derivada de students.school_id (nunca de um
-- parâmetro solto), vínculo ativo, can_edit_uniform.
--
-- A cláusula "and status = 'nao_recebido'" no DELETE é intencional e
-- obrigatória: mesmo que alguém chame esta função manualmente fora da UI
-- com o student_id/ano/bimestre de um aluno marcado como 'recebido', a
-- linha não é removida — a RPC nunca apaga uma entrega confirmada.
--
-- Não altera set_livro_revisa_status, RLS, nem nenhuma tabela existente.

create or replace function public.clear_livro_revisa_status(
  target_student_id uuid,
  p_school_year integer,
  p_bimester smallint
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  if p_bimester not between 1 and 4 then
    raise exception 'Bimestre inválido.';
  end if;

  -- Escola sempre derivada do aluno-alvo, mesmo padrão de defesa em
  -- profundidade já usado em set_livro_revisa_status.
  select s.school_id
    into v_school_id
  from public.students s
  where s.id = target_student_id;

  if v_school_id is null then
    raise exception 'Aluno não encontrado ou não pertence a uma escola comercial.';
  end if;

  if not public.is_active_school_member(v_school_id) then
    raise exception 'Sem vínculo ativo nesta escola.';
  end if;

  if not public.has_school_permission(v_school_id, 'can_edit_uniform') then
    raise exception 'Sem permissão para corrigir Livro/Revisa.';
  end if;

  -- Remove somente a linha exata aluno+ano+bimestre+escola, e somente se
  -- ela representar hoje uma marcação 'nao_recebido' — nunca 'recebido'.
  delete from public.livro_revisa_deliveries
  where student_id = target_student_id
    and school_year = p_school_year
    and bimester = p_bimester
    and school_id = v_school_id
    and status = 'nao_recebido';
end;
$function$;

revoke all on function public.clear_livro_revisa_status(uuid, integer, smallint) from public;
revoke all on function public.clear_livro_revisa_status(uuid, integer, smallint) from anon;
grant execute on function public.clear_livro_revisa_status(uuid, integer, smallint) to authenticated;
