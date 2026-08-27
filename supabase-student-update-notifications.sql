-- CARÔMETRO: liga somente a notificação de aluno atualizado (observação,
-- representante de turma, nome, foto, transferência de turma), que hoje
-- não está disparando. Execute uma vez no Supabase SQL Editor.
--
-- Escopo mínimo, de propósito: recria só as 2 funções auxiliares de
-- observação e a função/trigger notify_student_updated(), copiadas sem
-- nenhuma alteração das linhas 164-196 e 463-592 de
-- supabase-class-notifications.sql (versão já revisada/hardened,
-- com EXECUTE revogado de public/anon/authenticated).
--
-- Este script NÃO:
-- - toca em ocorrências (student_occurrences) nem em nenhum dos triggers
--   que já notificam ocorrências hoje;
-- - cria, altera ou remove nenhuma RLS policy;
-- - altera nenhuma foreign key;
-- - altera a estrutura de user_notifications (nenhum ALTER TABLE aqui);
-- - interfere em "Marcar como lida", "Marcar todas como lidas" ou
--   "Limpar notificações" (não toca em read_at/dismissed_at);
-- - recria create_class_notifications(), accessible_class_ids() ou
--   qualquer outra função de supabase-class-notifications.sql: assume que
--   create_class_notifications() já existe e está ativa (comprovado pelo
--   funcionamento das notificações de ocorrência, que dependem dela).
--
-- Se create_class_notifications() NÃO existir no banco por algum motivo,
-- este script ainda assim é criado sem erro (Postgres só valida a
-- existência de funções chamadas dentro de um corpo plpgsql em tempo de
-- execução, não em tempo de criação) — mas o trigger abaixo passaria a
-- falhar ao salvar qualquer aluno até create_class_notifications() também
-- existir. Confirme antes de rodar, se possível, que salvar uma ocorrência
-- continua funcionando normalmente hoje (evidência indireta de que
-- create_class_notifications() está ativa).

-- =====================================================================
-- 1) Utilitários para ler o campo de observações do aluno (has_report),
--    idênticos aos de supabase-class-notifications.sql.
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
revoke execute on function public.decode_observation_values(text) from public, anon, authenticated;

create or replace function public.sorted_text_array(p_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(v order by v), array[]::text[]) from unnest(p_values) v;
$$;
revoke execute on function public.sorted_text_array(text[]) from public, anon, authenticated;

-- =====================================================================
-- 2) notify_student_updated(): dados alterados, foto, laudo/observação,
--    representante de turma, mudança de turma. Idêntica a
--    supabase-class-notifications.sql — nenhuma linha modificada.
-- =====================================================================

create or replace function public.notify_student_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
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
revoke execute on function public.notify_student_updated() from public, anon, authenticated;

drop trigger if exists notify_student_updated on public.students;
create trigger notify_student_updated
after update on public.students
for each row execute function public.notify_student_updated();
