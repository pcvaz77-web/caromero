-- Na turma selecionada, mostre todos os filhos ativos dos responsáveis encontrados.
create or replace function public.family_cpf_school_roster(p_school_id uuid,p_class_id uuid)
returns table(guardian_id uuid,guardian_name text,cpf_last4 text,student_id uuid,student_name text,account_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  return query select g.id,g.guardian_name,right(g.cpf,4),s.id,s.full_name,g.guardian_user_id is not null
    from public.family_cpf_guardians g
    join public.family_cpf_children c on c.guardian_id=g.id and c.school_id=g.school_id and c.status='active'
    join public.students s on s.id=c.student_id and s.school_id=p_school_id and s.enrollment_status='active'
    where g.school_id=p_school_id and g.removed_at is null
      and exists (
        select 1 from public.family_cpf_children selected_child
        join public.students selected_student on selected_student.id=selected_child.student_id
          and selected_student.school_id=p_school_id and selected_student.enrollment_status='active'
        where selected_child.guardian_id=g.id and selected_child.school_id=p_school_id
          and selected_child.status='active' and selected_student.class_id=p_class_id
      )
    order by g.guardian_name,s.full_name;
end;
$$;
revoke all on function public.family_cpf_school_roster(uuid,uuid) from public,anon;
grant execute on function public.family_cpf_school_roster(uuid,uuid) to authenticated;
