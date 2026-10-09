begin;

-- Emite apenas a carteirinha solicitada. A impressão por turma continua
-- usando family_issue_cards, sem substituir os QR Codes já ativos.
create function public.family_issue_card(p_school_id uuid,p_student_id uuid)
returns table(card_id uuid,qr_token uuid,student_id uuid,student_name text,
  class_name text,photo_path text,guardian_name text,guardian_phone text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.students s
    join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    where s.id=p_student_id and s.school_id=p_school_id
      and s.enrollment_status='active' and c.archived_at is null
  ) then raise exception 'Aluno ativo não encontrado nesta escola'; end if;

  perform pg_advisory_xact_lock(hashtext(p_school_id::text || p_student_id::text));
  insert into public.family_student_cards(school_id,student_id,issued_by)
    select p_school_id,p_student_id,auth.uid()
    where not exists(
      select 1 from public.family_student_cards x
      where x.school_id=p_school_id and x.student_id=p_student_id and x.revoked_at is null
    ) on conflict do nothing;

  return query select card.id,card.qr_token,s.id,s.full_name,c.name,s.photo_path,
    coalesce(s.guardian_name,contact.guardian_name),
    coalesce(s.guardian_phone,contact.phone_e164)
    from public.family_student_cards card
    join public.students s on s.id=card.student_id and s.school_id=card.school_id
    join public.classes c on c.id=s.class_id and c.school_id=s.school_id
    left join lateral (
      select l.guardian_name,l.phone_e164 from public.family_links l
      where l.school_id=s.school_id and l.student_id=s.id and l.status in ('active','pending')
      order by case when l.status='active' then 0 else 1 end,l.created_at desc limit 1
    ) contact on true
    where card.school_id=p_school_id and card.student_id=p_student_id
      and card.revoked_at is null and s.enrollment_status='active'
      and c.archived_at is null;
end;
$$;
revoke all on function public.family_issue_card(uuid,uuid) from public,anon;
grant execute on function public.family_issue_card(uuid,uuid) to authenticated;

commit;
