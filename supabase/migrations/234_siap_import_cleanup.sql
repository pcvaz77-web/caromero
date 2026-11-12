begin;

-- Novos professores aguardam a liberação da escola. Autorizações já
-- concedidas permanecem, para não interromper capturas em andamento.
alter table public.school_member_permissions
  alter column can_import_siap_attendance set default false;

-- O acesso do professor às capturas passa a seguir a permissão já
-- administrada pela escola, sem alterar os perfis da gestão.
create or replace function public.can_import_counselor_attendance(
  target_school_id uuid, target_class_id uuid
) returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.school_members sm
    join public.classes c on c.id=target_class_id and c.school_id=sm.school_id
    join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=target_school_id and sm.user_id=auth.uid()
      and sm.status='active' and sm.role='teacher'
      and p.can_import_siap_attendance=true
  );
$function$;

-- Remove somente a importação escolhida para a turma e o bimestre.
-- A Frequência da Secretaria não é afetada.
create function public.clear_siap_class_import(
  p_school_id uuid, p_class_id uuid, p_year integer, p_bimester integer,
  p_subject text, p_kind text
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor public.school_members%rowtype;
  v_allowed boolean;
  v_count integer := 0;
  v_subject text := pg_catalog.btrim(p_subject);
begin
  select * into v_actor from public.school_members
  where school_id=p_school_id and user_id=auth.uid() and status='active';
  if not found then raise exception 'Sem acesso ativo a esta escola.'; end if;
  select v_actor.role in ('school_admin','coordinator') or
    (v_actor.role='teacher' and coalesce(permissions.can_import_siap_attendance,false))
    into v_allowed
  from public.school_member_permissions permissions where permissions.member_id=v_actor.id;
  if not coalesce(v_allowed,v_actor.role in ('school_admin','coordinator')) or
     not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id) then
    raise exception 'Sem permissão para limpar importações desta turma.';
  end if;
  if p_year is null or p_year not between 2000 and 2100 or
     p_bimester is null or p_bimester not between 1 and 4 or
     v_subject is null or length(v_subject) not between 2 and 120 or
     p_kind is null or p_kind not in ('absences','grades','calls') then
    raise exception 'Importação inválida para limpeza.';
  end if;

  if p_kind='absences' then
    delete from public.siap_bimester_absences
    where school_id=p_school_id and class_id=p_class_id and academic_year=p_year
      and bimester=p_bimester and subject=v_subject;
    get diagnostics v_count = row_count;
  elsif p_kind='grades' then
    delete from public.siap_grade_entries e using public.siap_grade_batches b
    where e.batch_id=b.id and b.school_id=p_school_id and b.class_id=p_class_id
      and b.academic_year=p_year and b.bimester=p_bimester and b.subject=v_subject
      and b.source_kind='teacher';
    get diagnostics v_count = row_count;
    delete from public.siap_grade_batches
    where school_id=p_school_id and class_id=p_class_id and academic_year=p_year
      and bimester=p_bimester and subject=v_subject and source_kind='teacher';
  else
    delete from public.siap_attendance_history
    where school_id=p_school_id and class_id=p_class_id and academic_year=p_year
      and substring(term from '^[1-4]')::integer=p_bimester and subject=v_subject;
    delete from public.siap_attendance_current
    where school_id=p_school_id and class_id=p_class_id and academic_year=p_year
      and substring(term from '^[1-4]')::integer=p_bimester and subject=v_subject;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$function$;

revoke all on function public.clear_siap_class_import(uuid,uuid,integer,integer,text,text) from public, anon;
grant execute on function public.clear_siap_class_import(uuid,uuid,integer,integer,text,text) to authenticated;

commit;
