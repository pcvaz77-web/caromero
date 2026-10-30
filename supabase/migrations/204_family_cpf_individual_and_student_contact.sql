-- Convite individual por nome e CPF; celular local apenas para contato na ficha do aluno.
begin;

alter table public.family_cpf_guardians
  add column phone_local text check (phone_local is null or phone_local ~ '^[1-9][0-9]{9,10}$');

create table public.family_cpf_invites (
  token uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.family_cpf_guardians(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  claimed_at timestamptz
);
create index family_cpf_invites_guardian_idx on public.family_cpf_invites(guardian_id,expires_at);
alter table public.family_cpf_invites enable row level security;
revoke all on public.family_cpf_invites from public,anon,authenticated;
grant all on public.family_cpf_invites to service_role;

-- O gestor do Portal pode sincronizar apenas o contato do responsável que
-- ele acabou de vincular ao aluno; demais edições continuam com a permissão própria.
create or replace function public.enforce_student_guardian_contact_permission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_changed boolean; v_has_data boolean; v_registered_contact boolean := false;
begin
  v_has_data := new.guardian_name is not null or new.guardian_phone is not null
    or new.show_guardian_on_card;
  v_changed := tg_op='INSERT' and v_has_data;
  if tg_op='UPDATE' then
    v_changed := old.guardian_name is distinct from new.guardian_name
      or old.guardian_phone is distinct from new.guardian_phone
      or old.show_guardian_on_card is distinct from new.show_guardian_on_card;
    if v_changed and current_setting('app.family_cpf_contact_sync',true)='true'
      and old.show_guardian_on_card is not distinct from new.show_guardian_on_card
      and public.family_school_manager(new.school_id) then
      v_registered_contact := exists(
        select 1 from public.family_cpf_guardians g
        join public.family_cpf_children c on c.guardian_id=g.id and c.school_id=g.school_id
        where g.school_id=new.school_id and c.student_id=new.id and c.status='active'
          and g.removed_at is null and g.phone_local=new.guardian_phone
          and public.family_cpf_name_key(g.guardian_name)=public.family_cpf_name_key(new.guardian_name)
      );
    end if;
  end if;
  if v_changed and not public.can_edit_student_guardian_contact(new.school_id)
    and not v_registered_contact then
    raise exception 'Sem permissao para editar os dados do responsavel pelo aluno';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_student_guardian_contact_permission() from public,anon,authenticated;

create function public.family_cpf_register_bundle_contact(
  p_school_id uuid,p_student_ids uuid[],p_name text,p_cpf text,p_phone_local text
)
returns table(guardian_id uuid,filled_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_guardian_id uuid; v_filled integer := 0; v_student_id uuid;
  v_previous_sync text := current_setting('app.family_cpf_contact_sync',true);
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  if p_phone_local is null or p_phone_local !~ '^[1-9][0-9]{9,10}$' then
    raise exception 'Informe DDD e número de celular, sem DDI';
  end if;
  v_guardian_id := public.family_cpf_register_bundle(p_school_id,p_student_ids,p_name,p_cpf);
  update public.family_cpf_guardians g set phone_local=p_phone_local
    where g.id=v_guardian_id and g.school_id=p_school_id;
  perform set_config('app.family_cpf_contact_sync','true',true);
  foreach v_student_id in array p_student_ids loop
    update public.students s
      set guardian_name=btrim(p_name),guardian_phone=p_phone_local
      where s.id=v_student_id and s.school_id=p_school_id
        and (nullif(btrim(coalesce(s.guardian_name,'')),'') is null
          and nullif(btrim(coalesce(s.guardian_phone,'')),'') is null
          or public.family_cpf_name_key(s.guardian_name)=public.family_cpf_name_key(p_name));
    if found then v_filled := v_filled + 1; end if;
  end loop;
  perform set_config('app.family_cpf_contact_sync',coalesce(v_previous_sync,''),true);
  return query select v_guardian_id,v_filled;
end;
$$;
revoke all on function public.family_cpf_register_bundle_contact(uuid,uuid[],text,text,text) from public,anon;
grant execute on function public.family_cpf_register_bundle_contact(uuid,uuid[],text,text,text) to authenticated;
-- Cadastros escolares novos passam obrigatoriamente pelo telefone local.
revoke execute on function public.family_cpf_register(uuid,uuid,text,text) from authenticated;
revoke execute on function public.family_cpf_register_bundle(uuid,uuid[],text,text) from authenticated;

create function public.family_cpf_create_individual_invite(
  p_school_id uuid,p_student_ids uuid[],p_name text,p_cpf text,p_phone_local text
)
returns table(invitation_token uuid,guardian_id uuid,filled_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_guardian_id uuid; v_filled integer; v_token uuid;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  select c.guardian_id,c.filled_count into v_guardian_id,v_filled
    from public.family_cpf_register_bundle_contact(p_school_id,p_student_ids,p_name,p_cpf,p_phone_local) c;
  insert into public.family_cpf_invites(school_id,guardian_id,created_by)
    values(p_school_id,v_guardian_id,auth.uid()) returning token into v_token;
  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'cpf_individual_invite_created',v_guardian_id);
  return query select v_token,v_guardian_id,v_filled;
end;
$$;
revoke all on function public.family_cpf_create_individual_invite(uuid,uuid[],text,text,text) from public,anon;
grant execute on function public.family_cpf_create_individual_invite(uuid,uuid[],text,text,text) to authenticated;

create function public.family_cpf_redeem_invite(p_token uuid,p_guardian_id uuid,p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_invite public.family_cpf_invites%rowtype; v_count integer;
begin
  select * into v_invite from public.family_cpf_invites
    where token=p_token and guardian_id=p_guardian_id for update;
  if not found or v_invite.claimed_at is not null or v_invite.expires_at<=now()
    or not exists(select 1 from public.family_cpf_guardians g
      where g.id=p_guardian_id and g.school_id=v_invite.school_id and g.removed_at is null) then
    raise exception 'Convite individual inválido ou vencido';
  end if;
  v_count := public.family_cpf_claim(p_guardian_id,p_user_id);
  update public.family_cpf_invites set claimed_at=now() where token=p_token;
  return v_count;
end;
$$;
revoke all on function public.family_cpf_redeem_invite(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.family_cpf_redeem_invite(uuid,uuid,uuid) to service_role;

commit;
