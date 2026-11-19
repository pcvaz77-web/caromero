-- Renomeia a turma ativa e os nomes exibidos nos cadastros ativos dos alunos
-- em uma unica transacao, sem alterar ocorrencias nem historicos arquivados.
begin;

create or replace function public.rename_school_class(
  p_school_id uuid,
  p_class_id uuid,
  p_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class public.classes%rowtype;
  v_name text := btrim(p_name);
begin
  if auth.uid() is null or public.is_school_admin(p_school_id) is not true then
    raise exception 'Somente administradores da escola podem editar o nome da turma.';
  end if;
  if v_name is null or v_name = '' or length(v_name) > 80 then
    raise exception 'Informe um nome de turma com ate 80 caracteres.';
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id and school_id = p_school_id and archived_at is null
  for update;
  if not found then
    raise exception 'Turma ativa nao encontrada nesta escola.';
  end if;

  if exists (
    select 1 from public.classes c
    where c.school_id = p_school_id and c.id <> p_class_id and c.archived_at is null
      and lower(btrim(c.name)) = lower(v_name)
      and coalesce(c.shift, 'Matutino') = coalesce(v_class.shift, 'Matutino')
  ) then
    raise exception 'Essa turma ja esta cadastrada neste turno.';
  end if;

  update public.classes set name = v_name where id = p_class_id;
  update public.students set class_name = v_name
  where school_id = p_school_id and class_id = p_class_id and enrollment_status = 'active';
  return v_name;
end;
$fn$;

revoke all on function public.rename_school_class(uuid, uuid, text) from public, anon;
grant execute on function public.rename_school_class(uuid, uuid, text) to authenticated;

commit;
