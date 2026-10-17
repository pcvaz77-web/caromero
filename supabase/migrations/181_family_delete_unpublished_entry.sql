-- Permite remover entradas de chegada que ainda nao foram publicadas.
-- Uma entrada publicada permanece protegida e seu historico familiar e preservado.
begin;

create function public.family_delete_entry(p_school_id uuid,p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.family_student_entries%rowtype;
begin
  if not public.family_school_manager(p_school_id) then
    raise exception 'Sem permissao para excluir entradas' using errcode='42501';
  end if;

  select * into v_entry
    from public.family_student_entries
    where id=p_entry_id and school_id=p_school_id
    for update;
  if not found then
    raise exception 'Entrada nao encontrada nesta escola';
  end if;
  if v_entry.family_message_id is not null or v_entry.published_at is not null then
    raise exception 'Entradas publicadas nao podem ser excluidas';
  end if;

  delete from public.family_student_entries
    where id=v_entry.id and school_id=p_school_id
      and family_message_id is null and published_at is null;
  if not found then
    raise exception 'A entrada foi alterada; atualize a lista e tente novamente';
  end if;

  insert into public.family_audit(school_id,actor_id,action,subject_id)
    values(p_school_id,auth.uid(),'entry_deleted',v_entry.id);
  return true;
end;
$$;

revoke all on function public.family_delete_entry(uuid,uuid) from public,anon;
grant execute on function public.family_delete_entry(uuid,uuid) to authenticated;

commit;
