-- CARÔMETRO COMERCIAL
-- Secretários de escolas com CEPI ativo administram a Tutoria e visualizam
-- suas etiquetas, sem receber acesso implícito às ocorrências dos alunos.

begin;

create or replace function public.is_cepi_manager(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and (
        sm.role in ('school_admin', 'coordinator')
        or (
          sm.role = 'secretary'
          and public.cepi_school_enabled(p_school_id)
        )
      )
  );
$function$;

create or replace function public.get_cepi_tutored_student_activity(
  p_school_id uuid,
  p_student_ids uuid[]
)
returns table(
  student_id uuid,
  occurrences jsonb,
  attendance jsonb,
  livro_revisa jsonb,
  counselors jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id,
    case
      when exists (
        select 1
        from public.school_members sm
        left join public.school_member_permissions permissions
          on permissions.member_id = sm.id
        where sm.school_id = p_school_id
          and sm.user_id = auth.uid()
          and sm.status = 'active'
          and (
            sm.role <> 'secretary'
            or coalesce(permissions.can_view_occurrences, false)
            or coalesce(permissions.can_edit_all, false)
          )
      ) then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id,
          'date', o.occurred_on,
          'text', o.occurrence_text,
          'responsible', o.created_by_name
        ) order by o.occurred_on desc, o.created_at desc)
        from public.student_occurrences o
        where o.school_id = p_school_id
          and o.student_id = s.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'academic_year', a.academic_year,
        'term', a.term,
        'subject', a.subject,
        'percentage', a.percentage,
        'status', a.status,
        'updated_at', a.updated_at
      ) order by a.updated_at desc)
      from public.siap_attendance_current a
      where a.school_id = p_school_id
        and a.student_id = s.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'school_year', l.school_year,
        'bimester', l.bimester,
        'status', l.status,
        'delivered_at', l.delivered_at
      ) order by l.school_year desc, l.bimester desc)
      from public.livro_revisa_deliveries l
      where l.school_id = p_school_id
        and l.student_id = s.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', cc.counselor_user_id,
        'name', coalesce(nullif(btrim(p.full_name), ''), p.email)
      ) order by coalesce(nullif(btrim(p.full_name), ''), p.email))
      from public.class_counselors cc
      join public.profiles p on p.id = cc.counselor_user_id
      where cc.school_id = p_school_id
        and cc.class_id = s.class_id
    ), '[]'::jsonb)
  from public.students s
  where s.school_id = p_school_id
    and s.id = any(coalesce(p_student_ids, '{}'::uuid[]))
    and public.can_access_cepi_student(p_school_id, s.id);
$function$;

revoke all on function public.is_cepi_manager(uuid) from public, anon;
grant execute on function public.is_cepi_manager(uuid) to authenticated;

revoke all on function public.get_cepi_tutored_student_activity(uuid, uuid[]) from public, anon;
grant execute on function public.get_cepi_tutored_student_activity(uuid, uuid[]) to authenticated;

comment on function public.is_cepi_manager(uuid) is
  'Gestão CEPI por administrador/coordenador e por secretário ativo somente quando o CEPI da escola está habilitado.';

commit;
