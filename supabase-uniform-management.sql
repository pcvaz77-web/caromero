-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Controle de uniforme e tênis por aluno.

alter table public.students
  add column if not exists uniform_received boolean not null default false,
  add column if not exists shoes_received boolean not null default false,
  add column if not exists uniform_size text,
  add column if not exists shoe_size text,
  add column if not exists uniform_received_at date,
  add column if not exists uniform_notes text;

alter table public.students replica identity full;

-- Uniforme é controlado exclusivamente pelo administrador, inclusive se um
-- usuário comum tentar alterar os campos fora da tela do Carômetro.
create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  counselor public.class_counselors%rowtype;
  is_counselor boolean;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' then return new; end if;

  if old.uniform_received is distinct from new.uniform_received
    or old.shoes_received is distinct from new.shoes_received
    or old.uniform_size is distinct from new.uniform_size
    or old.shoe_size is distinct from new.shoe_size
    or old.uniform_received_at is distinct from new.uniform_received_at
    or old.uniform_notes is distinct from new.uniform_notes then
    raise exception 'Somente administradores podem alterar o controle de uniforme';
  end if;

  select exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid()) into is_counselor;
  if is_counselor then
    select * into counselor from public.class_counselors where counselor_user_id = auth.uid() and class_id = old.class_id;
    if counselor.id is null then raise exception 'Conselheiros só podem editar alunos de suas turmas'; end if;
    if old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name then raise exception 'Conselheiros não podem mover alunos de turma'; end if;
    if old.full_name is distinct from new.full_name and not (counselor.can_edit_all or counselor.can_edit_name) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
    if old.photo_path is distinct from new.photo_path and not (counselor.can_edit_all or counselor.can_edit_photo) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
    if old.has_report is distinct from new.has_report and not (counselor.can_edit_all or counselor.can_edit_report) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
    return new;
  end if;

  if rights.can_edit_all then return new; end if;
  if old.full_name is distinct from new.full_name and not rights.can_edit_name then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not rights.can_edit_photo then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not rights.can_edit_class then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not rights.can_edit_report then raise exception 'Sem permissão para editar as observações do aluno'; end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;
end $$;
