-- CARÔMETRO COMERCIAL — PRÉ-VALIDAÇÃO DE DADOS SOMENTE LEITURA
-- Executar futuramente apenas na cópia de homologação, depois das migrations
-- 001 a 004 e antes da 006. Não altera nenhum registro.

do $preflight$
declare
  v_owner_count integer;
  v_orphan_permissions integer;
  v_orphan_students integer;
  v_orphan_occurrences integer;
  v_invalid_counselors integer;
  v_existing_school_count integer;
begin
  select count(*) into v_owner_count
  from auth.users u
  where lower(trim(u.email)) = 'passosdigital77@gmail.com'
    and u.email_confirmed_at is not null
    and u.deleted_at is null;

  if v_owner_count <> 1 then
    raise exception
      'A migration 006 exige exatamente uma conta proprietária confirmada na cópia de homologação; encontradas: %.',
      v_owner_count;
  end if;

  select count(*) into v_orphan_permissions
  from public.user_permissions up
  left join auth.users u on u.id = up.user_id
  where u.id is null;

  if v_orphan_permissions > 0 then
    raise exception 'Existem % permissões sem usuário correspondente.', v_orphan_permissions;
  end if;

  select count(*) into v_orphan_students
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.class_id is not null and c.id is null;

  if v_orphan_students > 0 then
    raise exception 'Existem % alunos vinculados a turmas inexistentes.', v_orphan_students;
  end if;

  select count(*) into v_orphan_occurrences
  from public.student_occurrences o
  left join public.students s on s.id = o.student_id
  left join public.classes c on c.id = o.class_id
  where s.id is null
     or (o.class_id is not null and c.id is null);

  if v_orphan_occurrences > 0 then
    raise exception 'Existem % ocorrências com aluno ou turma inexistente.', v_orphan_occurrences;
  end if;

  select count(*) into v_invalid_counselors
  from public.class_counselors cc
  left join public.classes c on c.id = cc.class_id
  left join auth.users u on u.id = cc.counselor_user_id
  left join public.user_permissions up on up.user_id = cc.counselor_user_id
  where c.id is null
     or u.id is null
     or (
       up.user_id is null
       and lower(trim(u.email)) <> 'passosdigital77@gmail.com'
     );

  if v_invalid_counselors > 0 then
    raise exception 'Existem % vínculos de conselheiro sem turma, usuário ou permissão-base válida.', v_invalid_counselors;
  end if;

  select count(*) into v_existing_school_count
  from public.schools s
  where s.slug = 'colegio-estadual-paulo-freire';

  if v_existing_school_count > 1 then
    raise exception 'Há mais de uma escola com o slug reservado da Paulo Freire.';
  end if;

  raise notice 'Pré-validação de dados concluída com sucesso.';
end;
$preflight$;

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.user_permissions) as permission_rows,
  (select count(*) from public.classes) as classes,
  (select count(*) from public.students) as students;
