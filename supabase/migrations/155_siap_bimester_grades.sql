begin;

-- A exibição no card pertence ao lote turma/disciplina/bimestre. Ocultar não
-- remove notas, que continuam disponíveis nos relatórios autorizados.
create table public.siap_grade_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2100),
  bimester integer not null check (bimester between 1 and 4),
  subject text not null check (length(btrim(subject)) between 2 and 120),
  source_kind text not null default 'teacher' check (source_kind in ('teacher','secretary')),
  show_on_card boolean not null default false,
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (school_id,class_id,academic_year,bimester,subject,source_kind)
);

create table public.siap_grade_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.siap_grade_batches(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  score numeric(3,1) not null check (score between 0 and 10),
  imported_at timestamptz not null default now(),
  unique (batch_id,student_id)
);

create index siap_grade_batches_school_class_idx on public.siap_grade_batches(school_id,class_id,academic_year,bimester);
create index siap_grade_entries_school_student_idx on public.siap_grade_entries(school_id,student_id);

alter table public.siap_grade_batches enable row level security;
alter table public.siap_grade_entries enable row level security;

create function public.can_view_siap_grade_batch(
  p_school_id uuid,p_class_id uuid
) returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.school_members sm
    left join public.school_member_permissions p on p.member_id=sm.id
    where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active'
      and (sm.role in ('school_admin','coordinator')
           or coalesce(p.can_view_class_summary,false)
           or public.can_import_counselor_attendance(p_school_id,p_class_id))
  );
$function$;

create policy siap_grade_batches_school_read on public.siap_grade_batches
  for select to authenticated using (
    public.can_view_siap_grade_batch(school_id,class_id));
create policy siap_grade_entries_school_read on public.siap_grade_entries
  for select to authenticated using (
    exists (select 1 from public.siap_grade_batches b
            where b.id=siap_grade_entries.batch_id and b.school_id=siap_grade_entries.school_id
              and public.can_view_siap_grade_batch(b.school_id,b.class_id)));

-- Nenhuma escrita direta pelo navegador: o banco valida escola, conselheiro,
-- turma, bimestre e cada aluno dentro de uma transação.
revoke all on public.siap_grade_batches from public, anon, authenticated;
revoke all on public.siap_grade_entries from public, anon, authenticated;
grant select on public.siap_grade_batches to authenticated;
grant select on public.siap_grade_entries to authenticated;
revoke all on function public.can_view_siap_grade_batch(uuid,uuid) from public, anon;
grant execute on function public.can_view_siap_grade_batch(uuid,uuid) to authenticated;

create function public.import_siap_bimester_grades(
  p_school_id uuid, p_class_id uuid, p_year integer, p_bimester integer,
  p_subject text, p_rows jsonb, p_show_on_card boolean
) returns integer
language plpgsql security definer set search_path = ''
as $function$
declare
  v_subject text := pg_catalog.btrim(p_subject);
  v_batch_id uuid;
  v_item jsonb;
  v_student_id uuid;
  v_score numeric;
  v_count integer := 0;
begin
  if not public.can_import_counselor_attendance(p_school_id,p_class_id) then
    raise exception 'Somente o professor conselheiro desta turma pode importar notas.';
  end if;
  if p_year not between 2000 and 2100 or p_bimester not between 1 and 4
     or length(v_subject) not between 2 and 120 or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 100
     or p_show_on_card is null then
    raise exception 'Dados inválidos para as notas bimestrais.';
  end if;
  if exists (select 1 from public.classes c where c.id=p_class_id and c.school_id=p_school_id
             and c.school_year is not null and c.school_year <> p_year) then
    raise exception 'O ano letivo não corresponde à turma.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) <>
     (select count(distinct value->>'student_id') from jsonb_array_elements(p_rows)) then
    raise exception 'Aluno repetido na importação.';
  end if;
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_score := (v_item->>'score')::numeric;
    if v_student_id is null or v_score is null
       or v_score < 0 or v_score > 10 or v_score <> pg_catalog.round(v_score,1)
       or not exists (select 1 from public.students s where s.id=v_student_id
                      and s.school_id=p_school_id and s.class_id=p_class_id) then
      raise exception 'Aluno ou nota inválido para esta turma.';
    end if;
  end loop;

  insert into public.siap_grade_batches
    (school_id,class_id,academic_year,bimester,subject,source_kind,show_on_card,imported_by)
  values (p_school_id,p_class_id,p_year,p_bimester,v_subject,'teacher',p_show_on_card,auth.uid())
  on conflict (school_id,class_id,academic_year,bimester,subject,source_kind)
  do update set imported_by=auth.uid(),imported_at=now(),show_on_card=excluded.show_on_card
  returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    insert into public.siap_grade_entries (batch_id,school_id,student_id,score)
    values (v_batch_id,p_school_id,(v_item->>'student_id')::uuid,(v_item->>'score')::numeric)
    on conflict (batch_id,student_id) do update
      set score=excluded.score,imported_at=now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create function public.set_siap_grade_card_visibility(p_batch_id uuid,p_visible boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_batch public.siap_grade_batches%rowtype;
begin
  select * into v_batch from public.siap_grade_batches where id=p_batch_id;
  if not found or p_visible is null or
     not public.can_import_counselor_attendance(v_batch.school_id,v_batch.class_id) then
    raise exception 'Somente o conselheiro desta turma pode alterar o card.';
  end if;
  update public.siap_grade_batches set show_on_card=p_visible where id=p_batch_id;
end;
$function$;

revoke all on function public.import_siap_bimester_grades(uuid,uuid,integer,integer,text,jsonb,boolean) from public, anon;
revoke all on function public.set_siap_grade_card_visibility(uuid,boolean) from public, anon;
grant execute on function public.import_siap_bimester_grades(uuid,uuid,integer,integer,text,jsonb,boolean) to authenticated;
grant execute on function public.set_siap_grade_card_visibility(uuid,boolean) to authenticated;

create function public.report_siap_bimester_grades(
  p_school_id uuid,p_year integer,p_bimester integer
) returns table (
  student_id uuid,subject text,source_kind text,score numeric,
  academic_year integer,bimester integer,imported_at timestamptz
) language plpgsql security definer set search_path = ''
as $function$
begin
  if p_year not between 2000 and 2100 or p_bimester not between 1 and 4
     or not exists (select 1 from public.school_members sm
                    where sm.school_id=p_school_id and sm.user_id=auth.uid()
                      and sm.status='active' and sm.role in ('school_admin','coordinator')) then
    raise exception 'Acesso restrito à administração e coordenação da escola.';
  end if;
  return query
    select e.student_id,b.subject,b.source_kind,e.score,b.academic_year,b.bimester,e.imported_at
    from public.siap_grade_entries e
    join public.siap_grade_batches b on b.id=e.batch_id and b.school_id=e.school_id
    where b.school_id=p_school_id and b.academic_year=p_year and b.bimester=p_bimester
    order by b.subject,e.student_id;
end;
$function$;
revoke all on function public.report_siap_bimester_grades(uuid,integer,integer) from public, anon;
grant execute on function public.report_siap_bimester_grades(uuid,integer,integer) to authenticated;

commit;
