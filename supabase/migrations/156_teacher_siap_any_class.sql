begin;

-- Mantem a assinatura usada pela Frequencia Assistida e pelas notas do SIAP.
-- A autorizacao passa a depender do papel Professor na escola da turma,
-- sem exigir que o professor seja conselheiro daquela turma.
create or replace function public.can_import_counselor_attendance(
  target_school_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_members sm
      join public.classes c
        on c.id = target_class_id
       and c.school_id = sm.school_id
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role = 'teacher'
    );
$function$;

revoke all on function public.can_import_counselor_attendance(uuid,uuid) from public, anon;
grant execute on function public.can_import_counselor_attendance(uuid,uuid) to authenticated;

commit;
