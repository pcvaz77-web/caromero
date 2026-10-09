begin;

-- A retirada oculta o responsavel da lista desta escola sem apagar recibos,
-- auditoria ou vinculos que a mesma conta possua em outras escolas.
alter table public.family_links
  add column if not exists removed_at timestamptz;

create or replace function public.family_remove_school_guardian(p_school_id uuid, p_link_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_phone text;
  v_count integer;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissao para excluir responsaveis desta escola' using errcode='42501';
  end if;

  select l.phone_e164 into v_phone
    from public.family_links l
    where l.id=p_link_id and l.school_id=p_school_id and l.removed_at is null
    for update;
  if not found then raise exception 'Responsavel nao encontrado nesta escola'; end if;

  with removed as (
    update public.family_links l
      set status='revoked', invitation_token=null,
          revoked_at=coalesce(l.revoked_at,now()), removed_at=now()
      where l.school_id=p_school_id and l.phone_e164=v_phone and l.removed_at is null
      returning l.id
  )
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    select p_school_id,auth.uid(),'guardian_removed_from_school',id from removed;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.family_remove_school_guardian(uuid,uuid) from public,anon;
grant execute on function public.family_remove_school_guardian(uuid,uuid) to authenticated;

create or replace function public.family_school_overview(p_school_id uuid)
returns table(link_id uuid,student_id uuid,student_name text,guardian_name text,phone_e164 text,link_status text,message_id uuid,message_title text,published_at timestamptz,viewed_at timestamptz,acknowledged_at timestamptz,delivery_status text,invite_delivery_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_school_manager(p_school_id) then raise exception 'Sem permissao'; end if;
  return query select l.id,l.student_id,l.student_name,l.guardian_name,l.phone_e164,l.status,
    m.id,m.title,m.published_at,r.viewed_at,r.acknowledged_at,d.status,di.status
    from public.family_links l left join public.family_receipts r on r.link_id=l.id
    left join public.family_messages m on m.id=r.message_id and m.status='published'
    left join public.family_deliveries d on d.kind='message' and d.link_id=l.id and d.message_id=m.id
    left join public.family_deliveries di on di.kind='invite' and di.link_id=l.id
    where l.school_id=p_school_id and l.removed_at is null
    order by l.created_at desc,m.published_at desc;
end;
$$;
revoke all on function public.family_school_overview(uuid) from public,anon;
grant execute on function public.family_school_overview(uuid) to authenticated;

commit;
