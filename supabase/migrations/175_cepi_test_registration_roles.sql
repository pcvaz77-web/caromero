-- Apenas coordenadores e administradores escolares cadastram ou alteram provas.
-- Professores continuam podendo inserir e editar questões de provas em produção.
begin;

drop policy if exists cepi_tests_insert on public.cepi_tests;
create policy cepi_tests_insert on public.cepi_tests
  for insert to authenticated
  with check (public.is_cepi_coordinator(school_id) and created_by=auth.uid());

drop policy if exists cepi_tests_update on public.cepi_tests;
create policy cepi_tests_update on public.cepi_tests
  for update to authenticated
  using (public.is_cepi_coordinator(school_id))
  with check (public.is_cepi_coordinator(school_id));

commit;
