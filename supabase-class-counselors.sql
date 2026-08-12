-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Cadastro de conselheiros de turma e permissões limitadas à turma designada.

create table if not exists public.class_counselors (
  id uuid primary key default gen_random_uuid(),
  counselor_user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  can_add_students boolean not null default false,
  can_delete_students boolean not null default false,
  can_edit_all boolean not null default false,
  can_edit_photo boolean not null default false,
  can_edit_name boolean not null default false,
  can_edit_class boolean not null default false,
  can_edit_report boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (counselor_user_id, class_id)
);

alter table public.class_counselors enable row level security;

drop policy if exists "Admins manage class counselors" on public.class_counselors;
create policy "Admins manage class counselors" on public.class_counselors for all to authenticated
  using (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists "Counselors view own assignments" on public.class_counselors;
create policy "Counselors view own assignments" on public.class_counselors for select to authenticated
  using (counselor_user_id = auth.uid());

-- Permite atualizações somente na turma designada, respeitando cada caixa marcada.
create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  counselor public.class_counselors%rowtype;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' or rights.can_edit_all then return new; end if;

  select * into counselor from public.class_counselors
  where counselor_user_id = auth.uid() and class_id = old.class_id;

  if counselor.id is not null then
    if old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name then
      raise exception 'Conselheiros não podem mover alunos de turma';
    end if;
    if old.full_name is distinct from new.full_name and not (counselor.can_edit_all or counselor.can_edit_name) then raise exception 'Sem permissão para editar o nome do aluno'; end if;
    if old.photo_path is distinct from new.photo_path and not (counselor.can_edit_all or counselor.can_edit_photo) then raise exception 'Sem permissão para editar a foto do aluno'; end if;
    if old.has_report is distinct from new.has_report and not (counselor.can_edit_all or counselor.can_edit_report) then raise exception 'Sem permissão para editar as observações do aluno'; end if;
    return new;
  end if;

  if old.full_name is distinct from new.full_name and not rights.can_edit_name then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not rights.can_edit_photo then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not rights.can_edit_class then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not rights.can_edit_report then raise exception 'Sem permissão para editar as observações do aluno'; end if;
  return new;
end;
$$;

drop policy if exists "Allowed users edit students" on public.students;
create policy "Allowed users edit students" on public.students for update to authenticated
  using (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report))
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report))
  )
  with check (
    exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report))
    or exists (select 1 from public.class_counselors c where c.counselor_user_id = auth.uid() and c.class_id = students.class_id and (c.can_edit_all or c.can_edit_photo or c.can_edit_name or c.can_edit_report))
  );

-- Atualiza imediatamente dispositivos já abertos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_counselors'
  ) then
    alter publication supabase_realtime add table public.class_counselors;
  end if;
end $$;
