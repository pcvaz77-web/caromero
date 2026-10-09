-- Portal da Família: o aviso do aparelho usa a mesma infraestrutura Web Push,
-- mas só para comunicações já publicadas e entregues a um vínculo ativo.
-- O texto da notificação é genérico para não expor dados do estudante na tela bloqueada.

create or replace function public.can_receive_family_notification(
  target_user_id uuid, target_school_id uuid, target_message_id uuid
)
returns boolean language sql volatile security definer set search_path = '' as $$
  select target_user_id is not null and target_school_id is not null and target_message_id is not null
    and exists (
      select 1 from public.family_receipts r
      join public.family_messages m on m.id=r.message_id
      join public.family_links l on l.id=r.link_id
        and l.school_id=m.school_id and l.student_id=m.student_id
      join public.schools sc on sc.id=l.school_id and sc.status='active'
      join public.students st on st.id=l.student_id
        and st.school_id=l.school_id and st.enrollment_status='active'
      join auth.users u on u.id=l.guardian_user_id
      where r.message_id=target_message_id and m.school_id=target_school_id
        and m.status='published' and l.status='active'
        and l.guardian_user_id=target_user_id
        and u.email=('familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
        and u.email_confirmed_at is not null
        and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
    );
$$;
revoke all on function public.can_receive_family_notification(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_receive_family_notification(uuid,uuid,uuid) to service_role;

-- Conserva a checagem atual dos profissionais; apenas a categoria familiar
-- usa a validação por vínculo e mensagem publicada.
create or replace function public.enforce_notification_recipient_effective_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_type='family_message' then
    if new.target_id is null or new.target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not public.can_receive_family_notification(new.recipient_id,new.school_id,new.target_id::uuid) then
      return null;
    end if;
  elsif not public.can_receive_school_notification(new.recipient_id,new.school_id) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_notification_recipient_effective_access() from public,anon,authenticated;

-- O mesmo aparelho só pode ser reivindicado pela conta autenticada. Famílias
-- precisam de vínculo ativo; a regra existente dos profissionais permanece.
create or replace function public.claim_push_subscription(
  p_endpoint text, p_p256dh text, p_auth_key text, p_user_agent text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_platform_owner()
     and not exists (
       select 1 from public.school_members sm
       where sm.user_id=auth.uid() and public.can_use_school(sm.school_id)
     )
     and not exists (
       select 1 from public.family_links l
       join public.schools sc on sc.id=l.school_id and sc.status='active'
       join public.students st on st.id=l.student_id
         and st.school_id=l.school_id and st.enrollment_status='active'
       join auth.users u on u.id=l.guardian_user_id
       where l.guardian_user_id=auth.uid() and l.status='active'
         and u.email=('familia-' || substring(l.phone_e164 from 2) || '@sistemacarometro.com.br')
         and u.email_confirmed_at is not null
         and coalesce(u.raw_app_meta_data->>'family_portal','false')='true'
     ) then
    raise exception 'Conta sem acesso ativo a uma escola.';
  end if;
  if nullif(btrim(p_endpoint),'') is null or nullif(btrim(p_p256dh),'') is null
     or nullif(btrim(p_auth_key),'') is null then raise exception 'Assinatura Push incompleta.'; end if;
  if length(p_endpoint)>4096 or length(p_p256dh)>512 or length(p_auth_key)>512
     or length(coalesce(p_user_agent,''))>1024 then raise exception 'Assinatura Push inválida.'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,user_agent,enabled,last_seen_at)
  values(auth.uid(),p_endpoint,p_p256dh,p_auth_key,p_user_agent,true,now())
  on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,
    auth_key=excluded.auth_key,user_agent=excluded.user_agent,enabled=true,last_seen_at=now();
end;
$$;
revoke all on function public.claim_push_subscription(text,text,text,text) from public,anon;
grant execute on function public.claim_push_subscription(text,text,text,text) to authenticated;

create or replace function public.queue_family_push_for_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_message public.family_messages%rowtype; v_link public.family_links%rowtype;
begin
  select * into v_message from public.family_messages where id=new.message_id;
  select * into v_link from public.family_links where id=new.link_id;
  -- Não notifica mensagens antigas anexadas a uma conta durante o convite.
  if v_message.status='published' and v_link.status='active'
     and v_link.accepted_at is not null and v_link.accepted_at<=v_message.published_at
     and v_link.school_id=v_message.school_id and v_link.student_id=v_message.student_id
     and exists(select 1 from public.push_subscriptions p
       where p.user_id=v_link.guardian_user_id and p.enabled=true)
     and public.can_receive_family_notification(v_link.guardian_user_id,v_link.school_id,v_message.id) then
    insert into public.user_notifications(recipient_id,school_id,title,body,target_type,target_id)
      values(v_link.guardian_user_id,v_link.school_id,'Portal da Família',
        'A escola publicou uma nova comunicação para você. Abra o Portal da Família para ler.',
        'family_message',v_message.id::text);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_family_push_for_receipt() from public,anon,authenticated;
create trigger queue_family_push_for_receipt after insert on public.family_receipts
  for each row execute function public.queue_family_push_for_receipt();
