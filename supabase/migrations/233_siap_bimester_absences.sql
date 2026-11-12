begin;

-- Totais parciais da aba Notas. Só calcula etiquetas quando a carga
-- ministrada é compatível com todas as faltas lidas na turma.
create table public.siap_bimester_absences (
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year integer not null check (academic_year between 2000 and 2100),
  bimester integer not null check (bimester between 1 and 4),
  subject text not null check (length(btrim(subject)) between 2 and 120),
  absences integer not null check (absences between 0 and 9999),
  taught_hours integer check (taught_hours between 0 and 9999),
  planned_hours integer check (planned_hours between 0 and 9999),
  percentage integer check (percentage between 0 and 100),
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  primary key (school_id,student_id,academic_year,bimester,subject),
  check (percentage is null or
    (taught_hours > 0 and absences <= taught_hours and
     percentage = round((taught_hours - absences)::numeric * 100 / taught_hours)::integer))
);

create index siap_bimester_absences_class_idx on public.siap_bimester_absences
  (school_id,class_id,academic_year,bimester);

alter table public.siap_bimester_absences enable row level security;
create policy siap_bimester_absences_read on public.siap_bimester_absences
  for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.siap_bimester_absences from public, anon, authenticated;
grant select on public.siap_bimester_absences to authenticated;

create function public.import_siap_bimester_absences(
  p_school_id uuid, p_class_id uuid, p_year integer, p_bimester integer,
  p_subject text, p_taught_hours integer, p_planned_hours integer,
  p_use_percentage boolean, p_rows jsonb
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  v_subject text := pg_catalog.btrim(p_subject);
  v_item jsonb;
  v_student_id uuid;
  v_absences integer;
begin
  if not public.can_import_counselor_attendance(p_school_id,p_class_id) then
    raise exception 'Somente um professor da escola pode importar faltas desta turma.';
  end if;
  if p_year not between 2000 and 2100 or p_bimester not between 1 and 4
     or length(v_subject) not between 2 and 120 or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'Dados inválidos para as faltas bimestrais.';
  end if;
  if (p_taught_hours is not null and p_taught_hours not between 0 and 9999) or
     (p_planned_hours is not null and p_planned_hours not between 0 and 9999) then
    raise exception 'Carga horária ministrada ou prevista inválida.';
  end if;
  if p_use_percentage is null or (p_use_percentage and coalesce(p_taught_hours,0)=0) then
    raise exception 'Base de percentual inválida.';
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
    if (v_item->>'absences') is null or (v_item->>'absences') !~ '^\d{1,4}$' then
      raise exception 'Quantidade de faltas inválida.';
    end if;
    v_absences := (v_item->>'absences')::integer;
    if v_student_id is null or (p_use_percentage and v_absences > p_taught_hours) or not exists (
      select 1 from public.students s where s.id=v_student_id
        and s.school_id=p_school_id and s.class_id=p_class_id
    ) then
      raise exception 'Aluno ou faltas inválidos para esta turma.';
    end if;
  end loop;

  insert into public.siap_bimester_absences
    (school_id,class_id,student_id,academic_year,bimester,subject,absences,taught_hours,planned_hours,percentage,imported_by)
  select p_school_id,p_class_id,(value->>'student_id')::uuid,p_year,p_bimester,
         v_subject,(value->>'absences')::integer,p_taught_hours,p_planned_hours,
         case when p_use_percentage then
           pg_catalog.round((p_taught_hours-(value->>'absences')::integer)::numeric*100/p_taught_hours)::integer
         else null end,
         auth.uid()
  from jsonb_array_elements(p_rows)
  on conflict (school_id,student_id,academic_year,bimester,subject) do update set
    class_id=excluded.class_id,absences=excluded.absences,taught_hours=excluded.taught_hours,
    planned_hours=excluded.planned_hours,percentage=excluded.percentage,
    imported_by=excluded.imported_by,imported_at=now();
  return jsonb_array_length(p_rows);
end;
$function$;

revoke all on function public.import_siap_bimester_absences(uuid,uuid,integer,integer,text,integer,integer,boolean,jsonb) from public, anon;
grant execute on function public.import_siap_bimester_absences(uuid,uuid,integer,integer,text,integer,integer,boolean,jsonb) to authenticated;

commit;
