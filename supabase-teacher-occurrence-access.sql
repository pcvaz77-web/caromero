-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Ocorrências são uma função padrão: qualquer professor conectado pode
-- registrar e consultar. Cada pessoa edita/exclui apenas o que ela registrou.
-- Coordenadores com as permissões avançadas podem editar/excluir qualquer uma.

-- A permissão antiga deixa de controlar o registro, pois registrar é padrão.
update public.user_permissions
set can_register_occurrences = false
where role <> 'admin';

-- Remove qualquer bloqueio antigo criado para exigir que o professor fosse
-- coordenador para registrar uma ocorrência.
drop trigger if exists enforce_occurrence_registration on public.student_occurrences;
drop function if exists public.enforce_occurrence_registration();

-- Políticas RLS são somadas. Remova todas as versões anteriores antes de
-- instalar as regras únicas abaixo, evitando que regras antigas conflitem.
do $$
declare item record;
begin
  for item in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_occurrences'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.student_occurrences', item.policyname);
  end loop;
end;
$$;

create policy "Authenticated users view occurrences"
on public.student_occurrences
for select to authenticated
using (true);

create policy "Teachers register own occurrences"
on public.student_occurrences
for insert to authenticated
with check (created_by = auth.uid());

create policy "Authors or authorized coordinators edit occurrences"
on public.student_occurrences
for update to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.user_permissions p
    where p.user_id = auth.uid()
      and (
        p.role = 'admin'
        or (
          coalesce(p.is_coordinator, false)
          and (
            coalesce(p.can_edit_all, false)
            or coalesce(p.can_edit_occurrences, false)
          )
        )
      )
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.user_permissions p
    where p.user_id = auth.uid()
      and (
        p.role = 'admin'
        or (
          coalesce(p.is_coordinator, false)
          and (
            coalesce(p.can_edit_all, false)
            or coalesce(p.can_edit_occurrences, false)
          )
        )
      )
  )
);

create policy "Authors or authorized coordinators delete occurrences"
on public.student_occurrences
for delete to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.user_permissions p
    where p.user_id = auth.uid()
      and (
        p.role = 'admin'
        or (
          coalesce(p.is_coordinator, false)
          and (
            coalesce(p.can_edit_all, false)
            or coalesce(p.can_delete_occurrences, false)
          )
        )
      )
  )
);
