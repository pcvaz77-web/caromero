-- Exibe exclusivamente o nome do conselheiro da turma para membros ativos da
-- mesma escola. Não concede SELECT direto, edição ou remoção em
-- class_counselors e mantém a funcionalidade condicionada ao plano da escola.
begin;

create or replace function public.list_school_class_counselor_labels(target_school_id uuid)
returns table(class_id uuid, counselor_user_id uuid, counselor_name text)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    cc.class_id,
    cc.counselor_user_id,
    coalesce(nullif(trim(pr.full_name), ''), pr.email)::text as counselor_name
  from public.class_counselors cc
  join public.profiles pr on pr.id = cc.counselor_user_id
  where cc.school_id = target_school_id
    and public.is_active_school_member(target_school_id)
    and public.school_has_feature_strict(target_school_id, 'class_counselors')
  order by cc.class_id, coalesce(nullif(trim(pr.full_name), ''), pr.email);
$function$;

revoke all on function public.list_school_class_counselor_labels(uuid) from public;
revoke all on function public.list_school_class_counselor_labels(uuid) from anon;
grant execute on function public.list_school_class_counselor_labels(uuid) to authenticated;

commit;
