-- Auditoria e endurecimento final do CARÔMETRO.
-- Execute UMA vez no Supabase: SQL Editor > New query > Run.
--
-- Este script não remove alunos, turmas, fotos ou ocorrências. Ele apenas
-- consolida regras de segurança que estavam distribuídas por scripts antigos,
-- impedindo que uma política antiga continue liberando alterações indevidas.

-- Colunas usadas pelas permissões atuais (seguro para bancos já atualizados).
alter table public.user_permissions
  add column if not exists is_coordinator boolean not null default false,
  add column if not exists can_delete_students boolean not null default false,
  add column if not exists can_edit_all boolean not null default false,
  add column if not exists can_edit_photo boolean not null default false,
  add column if not exists can_edit_name boolean not null default false,
  add column if not exists can_edit_class boolean not null default false,
  add column if not exists can_edit_report boolean not null default false,
  add column if not exists can_view_uniform boolean not null default false,
  add column if not exists can_edit_uniform boolean not null default false,
  add column if not exists can_mark_all_uniform_received boolean not null default false,
  add column if not exists can_register_occurrences boolean not null default false,
  add column if not exists can_edit_occurrences boolean not null default false,
  add column if not exists can_delete_occurrences boolean not null default false;

-- Uma única fonte para saber se a conta é administradora. A função é usada
-- pelas políticas sem abrir uma brecha de leitura da tabela de permissões.
create or replace function public.is_carometro_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_permissions
    where user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.user_permissions enable row level security;
alter table public.profiles enable row level security;

-- Remove políticas antigas, que no PostgreSQL se somam às novas, e mantém
-- apenas leitura própria/administração pelo administrador.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_permissions'
  loop
    execute format('drop policy if exists %I on public.user_permissions', item.policyname);
  end loop;
end;
$$;

create policy "Users view own permission or admin views all"
on public.user_permissions for select to authenticated
using (user_id = auth.uid() or public.is_carometro_admin());

create policy "Only administrators manage permissions"
on public.user_permissions for update to authenticated
using (public.is_carometro_admin())
with check (public.is_carometro_admin());

-- Perfis não podem ser excluídos nem alterados por outra pessoa. O
-- administrador vê a lista para gerenciar permissões; cada usuário altera
-- somente o próprio nome e e-mail.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', item.policyname);
  end loop;
end;
$$;

create policy "Users create their own profile"
on public.profiles for insert to authenticated
with check (id = auth.uid() and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "Users view their profile or admin views all"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_carometro_admin());

create policy "Users update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Coordenador e professor(a) usam grupos de permissões separados. Ao mudar
-- de um grupo para outro, qualquer permissão incompatível é limpa no banco,
-- evitando privilégios antigos "escondidos".
create or replace function public.enforce_coordinator_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' then
    return new;
  end if;

  if coalesce(new.is_coordinator, false) then
    -- Coordenadores recebem somente permissões avançadas marcadas pelo admin.
    new.can_add_students := false;
    new.can_edit_students := false;
  else
    -- Professores usam somente as permissões gerais selecionadas pelo admin.
    new.can_delete_students := false;
    new.can_edit_all := false;
    new.can_edit_photo := false;
    new.can_edit_name := false;
    new.can_edit_class := false;
    new.can_edit_report := false;
    new.can_view_uniform := false;
    new.can_edit_uniform := false;
    new.can_mark_all_uniform_received := false;
    new.can_register_occurrences := false;
    new.can_edit_occurrences := false;
    new.can_delete_occurrences := false;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_coordinator_permissions on public.user_permissions;
create trigger enforce_coordinator_permissions
before insert or update on public.user_permissions
for each row execute function public.enforce_coordinator_permissions();

-- Atualizações de alunos: o banco confirma cada campo, não apenas a tela.
create or replace function public.limit_student_field_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rights public.user_permissions%rowtype;
  uniform_changed boolean;
  bulk_update boolean;
begin
  select * into rights from public.user_permissions where user_id = auth.uid();
  if rights.role = 'admin' then return new; end if;

  uniform_changed :=
    old.uniform_received is distinct from new.uniform_received
    or old.shoes_received is distinct from new.shoes_received
    or old.material_received is distinct from new.material_received
    or old.uniform_size is distinct from new.uniform_size
    or old.shoe_size is distinct from new.shoe_size
    or old.uniform_received_at is distinct from new.uniform_received_at
    or old.uniform_notes is distinct from new.uniform_notes
    or old.uniform_pending is distinct from new.uniform_pending;
  bulk_update := current_setting('app.uniform_bulk_update', true) = 'true';

  if not coalesce(rights.is_coordinator, false) then
    if not coalesce(rights.can_edit_students, false) then
      raise exception 'Sem permissao para editar alunos';
    end if;
    if uniform_changed then
      raise exception 'Uniforme e material exigem permissao de coordenador';
    end if;
    return new;
  end if;

  if uniform_changed then
    if bulk_update and not coalesce(rights.can_mark_all_uniform_received, false) then
      raise exception 'Sem permissao para marcar todos como receberam';
    end if;
    if not bulk_update and not coalesce(rights.can_edit_all or rights.can_edit_uniform, false) then
      raise exception 'Sem permissao para registrar uniforme e material do aluno';
    end if;
  end if;

  if coalesce(rights.can_edit_all, false) then return new; end if;
  if old.full_name is distinct from new.full_name and not coalesce(rights.can_edit_name, false) then raise exception 'Sem permissao para editar o nome do aluno'; end if;
  if old.photo_path is distinct from new.photo_path and not coalesce(rights.can_edit_photo, false) then raise exception 'Sem permissao para editar a foto do aluno'; end if;
  if (old.class_id is distinct from new.class_id or old.class_name is distinct from new.class_name) and not coalesce(rights.can_edit_class, false) then raise exception 'Sem permissao para mudar o aluno de turma'; end if;
  if old.has_report is distinct from new.has_report and not coalesce(rights.can_edit_report, false) then raise exception 'Sem permissao para editar as observacoes do aluno'; end if;
  return new;
end;
$$;

drop trigger if exists limit_student_field_updates on public.students;
create trigger limit_student_field_updates
before update on public.students
for each row execute function public.limit_student_field_updates();

alter table public.students enable row level security;
alter table public.classes enable row level security;

-- Recria todas as políticas de alunos e turmas, evitando que uma regra antiga
-- deixe de mostrar uma turma ou conceda escrita além do previsto.
do $$
declare item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('students', 'classes')
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end;
$$;

create policy "Authenticated users read students"
on public.students for select to authenticated using (true);

create policy "Authenticated users read classes"
on public.classes for select to authenticated using (true);

create policy "Authorized accounts add students"
on public.students for insert to authenticated
with check (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_add_students) or (p.is_coordinator and p.can_edit_all))
));

create policy "Authorized accounts edit students"
on public.students for update to authenticated
using (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))
))
with check (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo or p.can_edit_name or p.can_edit_class or p.can_edit_report or p.can_edit_uniform)))
));

create policy "Authorized accounts delete students"
on public.students for delete to authenticated
using (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_delete_students or p.can_edit_all)))
));

create policy "Authorized accounts add classes"
on public.classes for insert to authenticated
with check (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_add_students) or (p.is_coordinator and p.can_edit_all))
));

create policy "Authorized accounts edit classes"
on public.classes for update to authenticated
using (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_class)))
))
with check (exists (
  select 1 from public.user_permissions p
  where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_class)))
));

-- Turma pode conter uma lista inteira de alunos; para impedir exclusões em
-- massa por um perfil comum, somente o administrador pode removê-la.
create policy "Only administrators delete classes"
on public.classes for delete to authenticated
using (public.is_carometro_admin());

-- Ocorrências: todos consultam e registram as próprias. O autor pode editar
-- ou excluir as próprias; coordenadores só alteram registros de terceiros se
-- a permissão avançada correspondente estiver marcada.
create or replace function public.lock_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.student_id is distinct from new.student_id
    or old.class_id is distinct from new.class_id
    or old.class_name is distinct from new.class_name
    or old.created_by is distinct from new.created_by
    or old.created_by_name is distinct from new.created_by_name then
    raise exception 'Aluno, turma e responsavel da ocorrencia nao podem ser alterados';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_occurrence_identity on public.student_occurrences;
create trigger lock_occurrence_identity
before update on public.student_occurrences
for each row execute function public.lock_occurrence_identity();

alter table public.student_occurrences enable row level security;
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'student_occurrences'
  loop
    execute format('drop policy if exists %I on public.student_occurrences', item.policyname);
  end loop;
end;
$$;

create policy "Authenticated users view occurrences"
on public.student_occurrences for select to authenticated using (true);

create policy "Teachers register own occurrences"
on public.student_occurrences for insert to authenticated
with check (created_by = auth.uid());

create policy "Authors or authorized coordinators edit occurrences"
on public.student_occurrences for update to authenticated
using (
  created_by = auth.uid()
  or exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences))))
)
with check (
  created_by = auth.uid()
  or exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_edit_occurrences))))
);

create policy "Authors or authorized coordinators delete occurrences"
on public.student_occurrences for delete to authenticated
using (
  created_by = auth.uid()
  or exists (select 1 from public.user_permissions p where p.user_id = auth.uid() and (p.role = 'admin' or (p.is_coordinator and (p.can_edit_all or p.can_delete_occurrences))))
);

-- O bucket é privado. Todas as políticas antigas de objetos são substituídas
-- por estas quatro, para que uma regra histórica não deixe fotos expostas ou
-- apagáveis por uma conta sem a permissão correta.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', false)
on conflict (id) do update set public = false;

do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', item.policyname);
  end loop;
end;
$$;

create policy "Authenticated users view student photos"
on storage.objects for select to authenticated
using (bucket_id = 'student-photos');

create policy "Authorized users upload student photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and exists (select 1 from public.user_permissions p where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and (p.can_add_students or p.can_edit_students)) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo))))
);

create policy "Authorized users update student photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'student-photos'
  and exists (select 1 from public.user_permissions p where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo))))
)
with check (
  bucket_id = 'student-photos'
  and exists (select 1 from public.user_permissions p where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo))))
);

create policy "Authorized users delete student photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-photos'
  and exists (select 1 from public.user_permissions p where p.user_id = auth.uid()
    and (p.role = 'admin' or (not coalesce(p.is_coordinator, false) and p.can_edit_students) or (p.is_coordinator and (p.can_edit_all or p.can_edit_photo))))
);
