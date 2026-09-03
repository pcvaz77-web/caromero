-- CARÔMETRO COMERCIAL
-- Corrige a orientação: fileiras da esquerda para a direita e mesas da frente
-- para o fundo, preservando as posições já atribuídas aos alunos.

begin;

update public.classroom_maps
set layout = layout || jsonb_build_object(
      'rows', layout->'columns',
      'columns', layout->'rows'
    ),
    updated_at = now()
where jsonb_typeof(layout) = 'object'
  and layout ? 'rows'
  and layout ? 'columns';

create or replace function public.validate_classroom_map_layout(
  target_school_id uuid,
  target_class_id uuid,
  target_layout jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
  v_columns integer;
begin
  if target_layout is null or jsonb_typeof(target_layout) <> 'object' then
    raise exception 'O mapeamento informado é inválido.';
  end if;

  begin
    v_rows := (target_layout->>'rows')::integer;
    v_columns := (target_layout->>'columns')::integer;
  exception when others then
    raise exception 'Informe uma quantidade válida de fileiras e mesas.';
  end;

  if v_rows not between 1 and 30 or v_columns not between 1 and 20 then
    raise exception 'O mapeamento deve ter entre 1 e 20 fileiras e entre 1 e 30 mesas por fileira.';
  end if;

  if jsonb_typeof(coalesce(target_layout->'assignments', '[]'::jsonb)) <> 'array' then
    raise exception 'A distribuição dos alunos é inválida.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    where not (item ? 'studentId' and item ? 'seatIndex')
       or (item->>'seatIndex') !~ '^[0-9]+$'
       or (item->>'seatIndex')::integer < 0
       or (item->>'seatIndex')::integer >= v_rows * v_columns
       or (item->>'studentId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Há uma mesa ou aluno inválido no mapeamento.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    left join public.students s
      on s.id = (item->>'studentId')::uuid
     and s.class_id = target_class_id
     and s.school_id = target_school_id
    where s.id is null
  ) then
    raise exception 'O mapeamento contém um aluno que não pertence a esta turma.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    group by item->>'studentId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(target_layout->'assignments', '[]'::jsonb)) item
    group by item->>'seatIndex'
    having count(*) > 1
  ) then
    raise exception 'Cada aluno e cada mesa podem aparecer apenas uma vez.';
  end if;
end;
$function$;

revoke all on function public.validate_classroom_map_layout(uuid, uuid, jsonb)
  from public, anon, authenticated;

commit;
