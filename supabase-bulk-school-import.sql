-- CARÔMETRO COMERCIAL
-- Importação em massa de turmas e alunos para escolas novas (colar de
-- Excel/Google Sheets). Preparado para aplicação posterior; este arquivo
-- não executa nada sozinho. Aplicar SOMENTE no Supabase Comercial
-- (ppkndfwmqdmomkjoemre). Não tocar no legado nem na Paulo Freire.
--
-- Hardening igual ao já usado nas demais RPCs comerciais: SECURITY
-- DEFINER, search_path vazio, autorização refeita inteiramente aqui
-- dentro (nunca confia em school_id/papel/permissão enviados pelo
-- cliente), REVOKE de public/anon, GRANT só a authenticated. A
-- importação nunca concede mais do que o cadastro manual já permite —
-- mesma checagem de has_school_permission('can_add_students') que a RLS
-- de INSERT em classes/students já usa hoje.

begin;

-- Normalização usada SOMENTE para comparação (existência/duplicidade).
-- O texto original digitado pelo administrador é sempre o que é gravado
-- em classes.name e students.full_name; esta função nunca decide o que
-- é salvo, só o que já existe ou está repetido.
create or replace function public.normalize_pt_br_text(input text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select trim(translate(
    lower(coalesce(input, '')),
    'àáâãäåèéêëìíîïòóôõöùúûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  ));
$function$;

-- Usada apenas internamente por bulk_import_classes_and_students (que
-- roda SECURITY DEFINER, com o privilégio do dono da função) — nenhum
-- cliente autenticado precisa nem pode chamá-la diretamente.
revoke all on function public.normalize_pt_br_text(text) from public;
revoke all on function public.normalize_pt_br_text(text) from anon;

-- rows: array de objetos {class_name, shift, student_name} com o texto
-- ORIGINAL digitado (só espaços nas pontas já removidos pelo cliente).
-- Nunca recebe ids, escola, papel ou normalização prontos do cliente —
-- tudo que importa para autorização e deduplicação é recalculado aqui,
-- contra o estado real do banco no momento da chamada.
create or replace function public.bulk_import_classes_and_students(
  target_school_id uuid,
  rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_role text;
  v_allowed boolean := false;
  v_row jsonb;
  v_class_name text;
  v_shift_input text;
  v_shift text;
  v_student_name text;
  v_total_rows int := 0;
  v_invalid int := 0;
  v_classes_created int := 0;
  v_students_created int := 0;
  v_duplicates int := 0;
  v_created_class_names text[] := '{}';
begin
  if target_school_id is null then
    raise exception 'Escola inválida.';
  end if;

  -- Autorização: idêntica à que a RLS de INSERT em classes/students já
  -- aplica hoje para cadastro manual. Nunca confia em papel/permissão
  -- enviados pelo cliente — recalcula tudo a partir de school_members.
  select sm.id, sm.role
    into v_member_id, v_role
  from public.school_members sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;

  if v_member_id is null or not public.is_active_school_member(target_school_id) then
    raise exception 'Você não possui acesso ativo a esta escola.';
  end if;

  if v_role = 'school_admin' then
    v_allowed := true;
  else
    v_allowed := public.has_school_permission(target_school_id, 'can_add_students')
      or public.has_school_permission(target_school_id, 'can_edit_all');
  end if;

  if not v_allowed then
    raise exception 'Você não possui permissão para adicionar alunos nesta escola.';
  end if;

  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'Lista de importação inválida.';
  end if;

  v_total_rows := jsonb_array_length(rows);
  if v_total_rows = 0 then
    raise exception 'Nenhuma linha para importar.';
  end if;
  -- Limite de produto/UX desta etapa (não é um teto de performance
  -- medido) — mantém a prévia revisável e o lote dentro de um tamanho de
  -- escola real.
  if v_total_rows > 1000 then
    raise exception 'Limite de 1000 linhas por importação excedido.';
  end if;

  -- Serializa importações concorrentes da MESMA escola: sem isso, duas
  -- confirmações simultâneas poderiam checar "turma não existe" ao mesmo
  -- tempo e criar a mesma turma duas vezes. Lock de transação — liberado
  -- sozinho no commit ou rollback, sem exigir constraint nova no schema.
  perform pg_advisory_xact_lock(hashtext('bulk_import_classes_and_students:' || target_school_id::text));

  create temporary table tmp_bulk_import_rows (
    class_name text not null,
    shift text not null,
    student_name text not null,
    class_key text not null,
    student_key text not null
  ) on commit drop;

  for v_row in select * from jsonb_array_elements(rows)
  loop
    v_class_name := trim(both from coalesce(v_row->>'class_name', ''));
    v_shift_input := trim(both from coalesce(v_row->>'shift', ''));
    v_student_name := trim(both from coalesce(v_row->>'student_name', ''));

    -- Turno é sempre recalculado aqui contra a lista fixa de valores
    -- válidos, independente do que o cliente mandou digitado.
    v_shift := case lower(v_shift_input)
      when 'matutino' then 'Matutino'
      when 'vespertino' then 'Vespertino'
      when 'noturno' then 'Noturno'
      else null
    end;

    if v_class_name = '' or length(v_student_name) < 3 or v_shift is null then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    insert into tmp_bulk_import_rows (class_name, shift, student_name, class_key, student_key)
    values (
      v_class_name,
      v_shift,
      v_student_name,
      public.normalize_pt_br_text(v_class_name) || '|' || v_shift,
      public.normalize_pt_br_text(v_student_name)
    );
  end loop;

  -- Uma linha por turma distinta (nome normalizado + turno) presente no lote.
  create temporary table tmp_bulk_import_classes (
    class_key text primary key,
    class_name text not null,
    shift text not null,
    class_id uuid
  ) on commit drop;

  insert into tmp_bulk_import_classes (class_key, class_name, shift)
  select distinct on (class_key) class_key, class_name, shift
  from tmp_bulk_import_rows
  order by class_key, class_name;

  -- Turmas já existentes: consulta o estado REAL do banco agora, não o
  -- que a prévia do cliente tinha visto antes de confirmar.
  update tmp_bulk_import_classes t
  set class_id = c.id
  from public.classes c
  where c.school_id = target_school_id
    and public.normalize_pt_br_text(c.name) || '|' || c.shift = t.class_key;

  -- Cria só as que realmente ainda não existem, e já captura contagem e
  -- nomes diretamente do retorno do INSERT (nunca reconstrói depois).
  with inserted as (
    insert into public.classes (name, shift, school_id)
    select class_name, shift, target_school_id
    from tmp_bulk_import_classes
    where class_id is null
    returning id, name, shift
  )
  select count(*), coalesce(array_agg(name || ' (' || shift || ')' order by name), '{}')
    into v_classes_created, v_created_class_names
  from inserted;

  update tmp_bulk_import_classes t
  set class_id = c.id
  from public.classes c
  where t.class_id is null
    and c.school_id = target_school_id
    and public.normalize_pt_br_text(c.name) || '|' || c.shift = t.class_key;

  -- Alunos já existentes NAQUELA turma, consultados agora no banco real.
  create temporary table tmp_bulk_import_existing_students (
    class_id uuid not null,
    student_key text not null
  ) on commit drop;

  insert into tmp_bulk_import_existing_students (class_id, student_key)
  select s.class_id, public.normalize_pt_br_text(s.full_name)
  from public.students s
  join tmp_bulk_import_classes t on t.class_id = s.class_id
  where s.school_id = target_school_id;

  -- Linhas a gravar de fato: primeira ocorrência por (turma, aluno)
  -- dentro do próprio lote, e que ainda não existe naquela turma no
  -- banco. Isto é o que garante que uma reimportação acidental do mesmo
  -- lote não duplica nada.
  create temporary table tmp_bulk_import_to_insert (
    class_id uuid not null,
    student_name text not null
  ) on commit drop;

  insert into tmp_bulk_import_to_insert (class_id, student_name)
  select distinct on (tc.class_id, r.student_key)
    tc.class_id, r.student_name
  from tmp_bulk_import_rows r
  join tmp_bulk_import_classes tc on tc.class_key = r.class_key
  where not exists (
    select 1 from tmp_bulk_import_existing_students e
    where e.class_id = tc.class_id and e.student_key = r.student_key
  )
  order by tc.class_id, r.student_key, r.student_name;

  select (select count(*) from tmp_bulk_import_rows) - (select count(*) from tmp_bulk_import_to_insert)
    into v_duplicates;

  with inserted_students as (
    insert into public.students (class_id, class_name, full_name, has_report, photo_path)
    select i.class_id, c.name, i.student_name, '', null
    from tmp_bulk_import_to_insert i
    join public.classes c on c.id = i.class_id
    returning id
  )
  select count(*) into v_students_created from inserted_students;

  return jsonb_build_object(
    'classes_created', v_classes_created,
    'created_class_names', to_jsonb(v_created_class_names),
    'students_created', v_students_created,
    'duplicates_skipped', v_duplicates,
    'invalid_rows', v_invalid
  );
end;
$function$;

revoke all on function public.bulk_import_classes_and_students(uuid, jsonb) from public;
revoke all on function public.bulk_import_classes_and_students(uuid, jsonb) from anon;
grant execute on function public.bulk_import_classes_and_students(uuid, jsonb) to authenticated;

commit;
