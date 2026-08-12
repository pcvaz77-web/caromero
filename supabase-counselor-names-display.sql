-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Exibe o nome do conselheiro junto da turma para usuários conectados.

update public.class_counselors c
set counselor_name = coalesce(nullif(trim(p.full_name), ''), p.email)
from public.profiles p
where c.counselor_user_id = p.id
  and (c.counselor_name is null or trim(c.counselor_name) = '');

drop policy if exists "Authenticated users view class counselors" on public.class_counselors;
create policy "Authenticated users view class counselors" on public.class_counselors for select to authenticated
  using (true);
