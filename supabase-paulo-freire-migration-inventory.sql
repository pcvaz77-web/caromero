-- CARÔMETRO COMERCIAL — INVENTÁRIO PRÉ-MIGRAÇÃO DA PAULO FREIRE
-- SOMENTE LEITURA. Não cria, altera ou remove dados ou objetos.
-- Executar no projeto de origem somente quando a migração for autorizada.

select 'auth_users' as item, count(*)::bigint as total from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'user_permissions', count(*) from public.user_permissions
union all select 'classes', count(*) from public.classes
union all select 'students', count(*) from public.students
union all select 'student_occurrences', count(*) from public.student_occurrences
union all select 'class_counselors', count(*) from public.class_counselors
union all select 'observation_options', count(*) from public.observation_options
union all select 'user_favorite_classes', count(*) from public.user_favorite_classes
union all select 'user_notifications', count(*) from public.user_notifications
union all select 'report_generation_log', count(*) from public.report_generation_log
union all select 'push_subscriptions', count(*) from public.push_subscriptions
union all select 'student_photo_references', count(*) from public.students where photo_path is not null
union all select 'student_photo_objects', count(*) from storage.objects where bucket_id = 'student-photos'
order by item;

select
  (select count(*) from public.user_permissions up left join auth.users u on u.id = up.user_id where u.id is null) as permissions_without_auth,
  (select count(*) from public.students s left join public.classes c on c.id = s.class_id where s.class_id is not null and c.id is null) as students_without_class,
  (select count(*) from public.student_occurrences o left join public.students s on s.id = o.student_id where s.id is null) as occurrences_without_student,
  (select count(*) from public.class_counselors cc left join public.classes c on c.id = cc.class_id where c.id is null) as counselors_without_class,
  (select count(*) from public.students s where s.photo_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'student-photos' and o.name = s.photo_path
  )) as photo_references_without_object,
  (select count(*) from storage.objects o where o.bucket_id = 'student-photos' and not exists (
    select 1 from public.students s where s.photo_path = o.name
  )) as photo_objects_without_student;

select
  count(*) filter (where email_confirmed_at is null) as unconfirmed_users,
  count(*) filter (where deleted_at is not null) as deleted_users,
  count(*) filter (where encrypted_password is null or encrypted_password = '') as users_without_password
from auth.users;
