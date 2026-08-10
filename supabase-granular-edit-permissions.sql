-- Execute uma vez no Supabase: SQL Editor > New query > Run.
alter table public.user_permissions
  add column if not exists can_edit_all boolean not null default false,
  add column if not exists can_edit_photo boolean not null default false,
  add column if not exists can_edit_name boolean not null default false,
  add column if not exists can_edit_class boolean not null default false,
  add column if not exists can_edit_report boolean not null default false;

-- Quem já podia editar continua podendo editar tudo.
update public.user_permissions
set can_edit_all = true
where can_edit_students = true or role = 'admin';

drop policy if exists "Allowed users edit students" on public.students;
create policy "Allowed users edit students" on public.students for update to authenticated
  using (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid() and (
      p.role = 'admin' or p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report
    )
  ))
  with check (exists (
    select 1 from public.user_permissions p
    where p.user_id = auth.uid() and (
      p.role = 'admin' or p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report
    )
  ));

create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' or rights.can_edit_all then return new; end if;
  if old.full_name is distinct from new.full_name and not rights.can_edit_name then raise exception 'Sem permissão para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not rights.can_edit_photo then raise exception 'Sem permissão para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not rights.can_edit_class then raise exception 'Sem permissão para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not rights.can_edit_report then raise exception 'Sem permissão para editar a informação de laudo'; end if;
  return new;
end;
$$;

drop trigger if exists limit_student_field_updates on public.students;
create trigger limit_student_field_updates
before update on public.students
for each row execute function public.limit_student_field_updates();

drop policy if exists "Allowed users upload student photos" on storage.objects;
drop policy if exists "Allowed users update student photos" on storage.objects;
drop policy if exists "Allowed users delete student photos" on storage.objects;
create policy "Allowed users upload student photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and exists (
    select 1 from public.user_permissions p where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_add_students or p.can_edit_all or p.can_edit_photo)
  ));
create policy "Allowed users update student photos" on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and exists (
    select 1 from public.user_permissions p where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_edit_all or p.can_edit_photo)
  ));
create policy "Allowed users delete student photos" on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and exists (
    select 1 from public.user_permissions p where p.user_id = auth.uid()
      and (p.role = 'admin' or p.can_edit_all or p.can_edit_photo)
  ));
