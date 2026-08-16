-- CARÔMETRO: notificações de alterações relevantes por turma.
-- Execute uma vez no Supabase SQL Editor. Não apaga nenhuma tabela, coluna ou
-- linha existente: só adiciona funções, gatilhos e ajusta a política de RLS
-- de user_favorite_classes (que hoje está sem uso, restrita a professores
-- comuns) para que qualquer usuário autenticado possa escolher suas próprias
-- turmas de interesse.

begin;

-- =====================================================================
-- 0) Correção necessária de uma restrição já existente: a coluna
--    user_notifications.class_id referencia classes(id) com
--    "on delete cascade". Isso significa que, hoje, excluir uma turma já
--    apaga silenciosamente TODO o histórico de notificações daquela
--    turma (inclusive as antigas, de antes desta migration) — e apagaria
--    também a própria notificação "Turma excluída" no mesmo instante em
--    que ela fosse criada. Trocar para "on delete set null" preserva o
--    texto da notificação (a turma já está no corpo da mensagem) e só
--    desvincula a referência que não existe mais. Não apaga nenhuma
--    linha existente, só troca o comportamento futuro da restrição.
-- =====================================================================

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.user_notifications'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum) from pg_attribute
      where attrelid = 'public.user_notifications'::regclass and attname = 'class_id'
    );
  if fk_name is not null then
    execute format('alter table public.user_notifications drop constraint %I', fk_name);
  end if;
  alter table public.user_notifications
    add constraint user_notifications_class_id_fkey
    foreign key (class_id) references public.classes(id) on delete set null;
end $$;

-- =====================================================================
-- 1) Quais turmas cada usuário pode acessar hoje (mesma regra que o resto
--    do Carômetro já usa: administrador e coordenador enxergam tudo;
--    conselheiro exclusivo fica restrito às turmas designadas a ele;
--    demais professores continuam com o mesmo acesso amplo que já têm).
-- =====================================================================

create or replace function public.user_has_broad_class_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_permissions p
    where p.user_id = p_user_id
      and (p.role = 'admin' or coalesce(p.is_coordinator, false))
  );
$$;

create or replace function public.accessible_class_ids(p_user_id uuid)
returns table (class_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if public.user_has_broad_class_access(p_user_id) then
    return query select c.id from public.classes c;
    return;
  end if;

  if exists (select 1 from public.class_counselors cc where cc.counselor_user_id = p_user_id) then
    return query select cc.class_id from public.class_counselors cc where cc.counselor_user_id = p_user_id;
    return;
  end if;

  -- Professor sem vínculo de conselheiro: o Carômetro não restringe hoje o
  -- acesso desse perfil a turmas específicas, então mantém o mesmo alcance
  -- amplo que ele já tem no restante do sistema.
  return query select c.id from public.classes c;
end;
$$;

-- =====================================================================
-- 2) Utilitários para ler o campo de observações do aluno (has_report),
--    que guarda um texto simples OU um JSON com várias observações,
--    incluindo "Representante de turma".
-- =====================================================================

create or replace function public.decode_observation_values(p_value text)
returns text[]
language plpgsql
immutable
as $$
declare
  parsed jsonb;
begin
  if p_value is null or trim(p_value) = '' then
    return array[]::text[];
  end if;
  begin
    parsed := p_value::jsonb;
  exception when others then
    return array[p_value];
  end;
  if jsonb_typeof(parsed) = 'array' then
    return coalesce(array(select jsonb_array_elements_text(parsed)), array[]::text[]);
  end if;
  return array[p_value];
end;
$$;

create or replace function public.sorted_text_array(p_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(v order by v), array[]::text[]) from unnest(p_values) v;
$$;

-- =====================================================================
-- 3) Envio de notificações: sempre reavalia acesso e preferência no
--    momento do evento (nunca confia em dado antigo guardado) e nunca
--    notifica quem realizou a própria ação.
-- =====================================================================

create or replace function public.create_class_notifications(
  p_class_id uuid,
  p_title text,
  p_body text,
  p_target_type text,
  p_target_id text,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_class_id is null then
    return;
  end if;

  insert into public.user_notifications (recipient_id, class_id, title, body, target_type, target_id)
  select f.user_id, p_class_id, p_title, p_body, p_target_type, p_target_id
  from public.user_favorite_classes f
  where f.class_id = p_class_id
    and f.notifications_enabled
    and f.user_id is distinct from p_actor
    and exists (
      select 1 from public.accessible_class_ids(f.user_id) ac
      where ac.class_id = f.class_id
    );
end;
$$;

create or replace function public.notify_admins_and_coordinators(
  p_title text,
  p_body text,
  p_class_id uuid,
  p_target_type text,
  p_target_id text,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications (recipient_id, class_id, title, body, target_type, target_id)
  select p.user_id, p_class_id, p_title, p_body, p_target_type, p_target_id
  from public.user_permissions p
  where (p.role = 'admin' or coalesce(p.is_coordinator, false))
    and p.user_id is distinct from p_actor;
end;
$$;

-- =====================================================================
-- 4) user_favorite_classes vira a preferência de notificação por turma,
--    disponível para qualquer usuário autenticado (antes só liberado
--    para professores comuns). Continua sempre restrito à própria linha
--    do usuário. Um gatilho impede escolher turma sem acesso a ela.
-- =====================================================================

drop policy if exists "Own favorite classes" on public.user_favorite_classes;
create policy "Own favorite classes" on public.user_favorite_classes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.validate_favorite_class_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.accessible_class_ids(new.user_id) ac
    where ac.class_id = new.class_id
  ) then
    raise exception 'Você não tem permissão para acompanhar esta turma.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_favorite_class_access on public.user_favorite_classes;
create trigger validate_favorite_class_access
before insert or update on public.user_favorite_classes
for each row execute function public.validate_favorite_class_access();

-- =====================================================================
-- 5) Turmas: criada, alterada, excluída.
-- =====================================================================

create or replace function public.notify_class_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admins_and_coordinators(
    'Nova turma',
    new.name || ' foi criada.',
    new.id,
    'class',
    new.id::text,
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists notify_class_created on public.classes;
create trigger notify_class_created
after insert on public.classes
for each row execute function public.notify_class_created();

create or replace function public.notify_class_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.name is distinct from new.name or old.shift is distinct from new.shift then
    perform public.create_class_notifications(
      new.id,
      'Turma atualizada',
      'A turma ' || old.name || ' foi atualizada' ||
        case when old.name is distinct from new.name then ' (novo nome: ' || new.name || ')' else '' end || '.',
      'class',
      new.id::text,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_class_updated on public.classes;
create trigger notify_class_updated
after update on public.classes
for each row execute function public.notify_class_updated();

-- Dispara ANTES da exclusão (e, portanto, antes de qualquer cascata para
-- alunos/conselheiros): envia a notificação de turma excluída e liga uma
-- sinalização, válida só até o fim desta transação, para que as exclusões
-- em cascata de alunos/ocorrências/conselheiros dessa turma não gerem
-- notificações individuais repetidas.
create or replace function public.notify_class_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_class_notifications(
    old.id,
    'Turma excluída',
    old.name || ' foi excluída.',
    'class',
    old.id::text,
    auth.uid()
  );
  perform set_config('carometro.suppress_cascade_notifications', 'true', true);
  return old;
end;
$$;

drop trigger if exists notify_class_deleted on public.classes;
create trigger notify_class_deleted
before delete on public.classes
for each row execute function public.notify_class_deleted();

-- =====================================================================
-- 6) Alunos: cadastro (individual ou em lote), dados alterados, foto,
--    laudo/observação, representante de turma, mudança de turma, exclusão.
-- =====================================================================

-- Cadastro: um único gatilho por instrução (não por linha) agrupa os
-- alunos inseridos na mesma operação por turma. Uma linha inserida gera a
-- mensagem individual de sempre; duas ou mais na mesma turma, na mesma
-- operação, geram uma única mensagem agregada. Não existe nenhum outro
-- gatilho de INSERT em students, então não há risco de duplicidade entre
-- o evento agregado e eventos individuais.
create or replace function public.notify_students_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  rec record;
  class_name text;
  single_student record;
begin
  for rec in
    select class_id, count(*) as total
    from inserted_rows
    group by class_id
  loop
    select c.name into class_name from public.classes c where c.id = rec.class_id;
    class_name := coalesce(class_name, 'turma removida');

    if rec.total = 1 then
      select id, full_name into single_student
      from inserted_rows where class_id = rec.class_id limit 1;
      perform public.create_class_notifications(
        rec.class_id,
        'Aluno cadastrado',
        single_student.full_name || ' foi cadastrado na turma ' || class_name || '.',
        'student',
        single_student.id::text,
        actor
      );
    else
      perform public.create_class_notifications(
        rec.class_id,
        'Alunos cadastrados',
        rec.total || ' alunos foram cadastrados na turma ' || class_name || '.',
        'students_bulk',
        null,
        actor
      );
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_students_inserted on public.students;
create trigger notify_students_inserted
after insert on public.students
referencing new table as inserted_rows
for each statement execute function public.notify_students_inserted();

create or replace function public.notify_student_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  old_class_name text;
  new_class_name text;
  old_values text[];
  new_values text[];
  old_is_rep boolean;
  new_is_rep boolean;
  old_other text[];
  new_other text[];
begin
  -- Mudança de turma: avisa quem acompanha a turma de origem e quem
  -- acompanha a turma de destino, cada um com a mensagem endereçada à
  -- turma correta para o filtro de acesso/preferência funcionar.
  if old.class_id is distinct from new.class_id then
    select c.name into old_class_name from public.classes c where c.id = old.class_id;
    select c.name into new_class_name from public.classes c where c.id = new.class_id;
    old_class_name := coalesce(old_class_name, 'turma removida');
    new_class_name := coalesce(new_class_name, 'turma removida');

    perform public.create_class_notifications(
      old.class_id,
      'Aluno transferido',
      new.full_name || ' foi transferido(a) de ' || old_class_name || ' para ' || new_class_name || '.',
      'student',
      new.id::text,
      actor
    );
    perform public.create_class_notifications(
      new.class_id,
      'Aluno transferido',
      new.full_name || ' foi transferido(a) de ' || old_class_name || ' para ' || new_class_name || '.',
      'student',
      new.id::text,
      actor
    );
  end if;

  select c.name into new_class_name from public.classes c where c.id = new.class_id;
  new_class_name := coalesce(new_class_name, 'turma removida');

  if old.full_name is distinct from new.full_name then
    perform public.create_class_notifications(
      new.class_id,
      'Dados do aluno atualizados',
      'O nome do aluno foi atualizado para ' || new.full_name || ' — ' || new_class_name || '.',
      'student',
      new.id::text,
      actor
    );
  end if;

  if old.photo_path is distinct from new.photo_path then
    if new.photo_path is null then
      perform public.create_class_notifications(
        new.class_id,
        'Foto do aluno atualizada',
        'A foto de ' || new.full_name || ' — ' || new_class_name || ' foi removida.',
        'student',
        new.id::text,
        actor
      );
    else
      perform public.create_class_notifications(
        new.class_id,
        'Foto do aluno atualizada',
        'A foto de ' || new.full_name || ' — ' || new_class_name || ' foi atualizada.',
        'student',
        new.id::text,
        actor
      );
    end if;
  end if;

  if old.has_report is distinct from new.has_report then
    old_values := public.decode_observation_values(old.has_report);
    new_values := public.decode_observation_values(new.has_report);
    old_is_rep := 'Representante de turma' = any(old_values);
    new_is_rep := 'Representante de turma' = any(new_values);
    old_other := array(select x from unnest(old_values) x where x <> 'Representante de turma');
    new_other := array(select x from unnest(new_values) x where x <> 'Representante de turma');

    if old_is_rep is distinct from new_is_rep then
      if new_is_rep then
        perform public.create_class_notifications(
          new.class_id,
          'Representante de turma',
          new.full_name || ' foi marcado(a) como representante da turma ' || new_class_name || '.',
          'student',
          new.id::text,
          actor
        );
      else
        perform public.create_class_notifications(
          new.class_id,
          'Representante de turma',
          new.full_name || ' deixou de ser representante da turma ' || new_class_name || '.',
          'student',
          new.id::text,
          actor
        );
      end if;
    end if;

    if public.sorted_text_array(old_other) is distinct from public.sorted_text_array(new_other) then
      perform public.create_class_notifications(
        new.class_id,
        'Observação do aluno atualizada',
        'Laudo/observação de ' || new.full_name || ' — ' || new_class_name || ' foi atualizado(a).',
        'student',
        new.id::text,
        actor
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_student_updated on public.students;
create trigger notify_student_updated
after update on public.students
for each row execute function public.notify_student_updated();

-- Dispara ANTES da exclusão do aluno. Se a sinalização de cascata de turma
-- já estiver ligada (ou seja, este aluno está sendo removido porque a
-- turma dele foi excluída), não envia a notificação individual — a
-- notificação de "turma excluída" já cobre isso. Em qualquer caso, liga a
-- sinalização antes de a exclusão prosseguir, para que as ocorrências
-- deste aluno (apagadas em cascata) também não gerem avisos individuais.
create or replace function public.notify_student_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  already_suppressed boolean;
  class_name text;
begin
  already_suppressed := coalesce(current_setting('carometro.suppress_cascade_notifications', true), 'false') = 'true';

  if not already_suppressed then
    select c.name into class_name from public.classes c where c.id = old.class_id;
    class_name := coalesce(class_name, old.class_name, 'turma removida');
    perform public.create_class_notifications(
      old.class_id,
      'Aluno excluído',
      old.full_name || ' foi excluído da turma ' || class_name || '.',
      'student',
      old.id::text,
      auth.uid()
    );
  end if;

  perform set_config('carometro.suppress_cascade_notifications', 'true', true);
  return old;
end;
$$;

drop trigger if exists notify_student_deleted on public.students;
create trigger notify_student_deleted
before delete on public.students
for each row execute function public.notify_student_deleted();

-- =====================================================================
-- 7) Ocorrências: registrada, editada, excluída. Nunca inclui o texto da
--    ocorrência na notificação (só o fato de que ela existe/mudou).
-- =====================================================================

create or replace function public.notify_occurrence_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  class_name text;
begin
  select full_name into student_name from public.students where id = new.student_id;
  select name into class_name from public.classes where id = new.class_id;
  student_name := coalesce(student_name, 'Aluno removido');
  class_name := coalesce(class_name, new.class_name, 'turma removida');

  perform public.create_class_notifications(
    new.class_id,
    'Nova ocorrência',
    'Nova ocorrência registrada para ' || student_name || ' — ' || class_name || '.',
    'occurrence',
    new.id::text,
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists notify_occurrence_inserted on public.student_occurrences;
create trigger notify_occurrence_inserted
after insert on public.student_occurrences
for each row execute function public.notify_occurrence_inserted();

create or replace function public.notify_occurrence_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  class_name text;
begin
  if old.occurrence_text is distinct from new.occurrence_text
     or old.occurred_on is distinct from new.occurred_on then
    select full_name into student_name from public.students where id = new.student_id;
    select name into class_name from public.classes where id = new.class_id;
    student_name := coalesce(student_name, 'Aluno removido');
    class_name := coalesce(class_name, new.class_name, 'turma removida');

    perform public.create_class_notifications(
      new.class_id,
      'Ocorrência editada',
      'Uma ocorrência de ' || student_name || ' — ' || class_name || ' foi editada.',
      'occurrence',
      new.id::text,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_occurrence_updated on public.student_occurrences;
create trigger notify_occurrence_updated
after update on public.student_occurrences
for each row execute function public.notify_occurrence_updated();

create or replace function public.notify_occurrence_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  class_name text;
begin
  -- Exclusão em cascata (aluno ou turma removidos): já avisado pela
  -- notificação de nível superior, então não repete aqui.
  if coalesce(current_setting('carometro.suppress_cascade_notifications', true), 'false') = 'true' then
    return old;
  end if;

  select full_name into student_name from public.students where id = old.student_id;
  select name into class_name from public.classes where id = old.class_id;
  student_name := coalesce(student_name, 'Aluno removido');
  class_name := coalesce(class_name, old.class_name, 'turma removida');

  perform public.create_class_notifications(
    old.class_id,
    'Ocorrência excluída',
    'Uma ocorrência de ' || student_name || ' — ' || class_name || ' foi excluída.',
    'occurrence',
    old.id::text,
    auth.uid()
  );
  return old;
end;
$$;

drop trigger if exists notify_occurrence_deleted on public.student_occurrences;
create trigger notify_occurrence_deleted
after delete on public.student_occurrences
for each row execute function public.notify_occurrence_deleted();

-- =====================================================================
-- 8) Conselheiro/responsável de turma alterado.
-- =====================================================================

create or replace function public.notify_counselor_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_name text;
  target_class_id uuid := coalesce(new.class_id, old.class_id);
  target_id text := coalesce(new.id, old.id)::text;
  counselor_name text;
begin
  -- Exclusão em cascata (turma removida): a notificação de turma excluída
  -- já cobre isso.
  if tg_op = 'DELETE' and coalesce(current_setting('carometro.suppress_cascade_notifications', true), 'false') = 'true' then
    return old;
  end if;

  select name into class_name from public.classes where id = target_class_id;
  class_name := coalesce(class_name, 'turma removida');
  counselor_name := coalesce(nullif(trim(coalesce(new.counselor_name, old.counselor_name)), ''), 'um usuário cadastrado');

  perform public.create_class_notifications(
    target_class_id,
    'Conselheiro de turma atualizado',
    'O conselheiro responsável pela turma ' || class_name || ' foi atualizado.',
    'class_counselor',
    target_id,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists notify_counselor_changed on public.class_counselors;
create trigger notify_counselor_changed
after insert or update or delete on public.class_counselors
for each row execute function public.notify_counselor_changed();

commit;
