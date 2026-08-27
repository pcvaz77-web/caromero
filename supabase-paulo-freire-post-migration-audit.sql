-- CARÔMETRO COMERCIAL — AUDITORIA DA FUTURA MIGRAÇÃO DA PAULO FREIRE
-- SOMENTE LEITURA. Executar no destino de ensaio após a migração autorizada.

with paulo_freire as (
  select id from public.schools
  where slug = 'colegio-estadual-paulo-freire'
)
select
  (select count(*) from paulo_freire) as school_rows,
  (select count(*) from public.school_members sm join paulo_freire pf on pf.id = sm.school_id) as members,
  (select count(*) from public.classes c join paulo_freire pf on pf.id = c.school_id) as classes,
  (select count(*) from public.students s join paulo_freire pf on pf.id = s.school_id) as students,
  (select count(*) from public.student_occurrences o join paulo_freire pf on pf.id = o.school_id) as occurrences,
  (select count(*) from public.class_counselors cc join paulo_freire pf on pf.id = cc.school_id) as counselors,
  (select count(*) from public.user_notifications n join paulo_freire pf on pf.id = n.school_id) as notifications;

select
  (select count(*) from public.classes where school_id is null) as classes_without_school,
  (select count(*) from public.students where school_id is null) as students_without_school,
  (select count(*) from public.student_occurrences where school_id is null) as occurrences_without_school,
  (select count(*) from public.class_counselors where school_id is null) as counselors_without_school,
  (select count(*) from public.school_members sm left join auth.users u on u.id = sm.user_id where u.id is null) as members_without_auth,
  (select count(*) from public.school_members sm left join public.school_member_permissions smp on smp.member_id = sm.id where sm.status = 'active' and smp.member_id is null) as active_members_without_permissions,
  (select count(*) from public.school_members group by school_id, user_id having count(*) > 1 limit 1) as duplicate_membership_group;

select
  count(*) filter (where s.photo_path is not null) as referenced_photos,
  count(*) filter (where s.photo_path is not null and o.name is null) as missing_photo_objects
from public.students s
left join storage.objects o
  on o.bucket_id = 'student-photos'
 and o.name = s.photo_path
where s.school_id = (
  select id from public.schools
  where slug = 'colegio-estadual-paulo-freire'
);

select
  u.id,
  lower(trim(u.email)) as email,
  sm.role,
  sm.status,
  (smp.member_id is not null) as has_permission_row
from public.school_members sm
join public.schools s on s.id = sm.school_id
join auth.users u on u.id = sm.user_id
left join public.school_member_permissions smp on smp.member_id = sm.id
where s.slug = 'colegio-estadual-paulo-freire'
order by lower(trim(u.email));
