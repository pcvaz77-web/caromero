-- CARÔMETRO COMERCIAL
-- RPCs para o proprietário da plataforma gerenciar o Responsável pela
-- Assinatura (school_billing_contacts, migration 043) pelo Painel da
-- Plataforma. A tabela continua sem qualquer GRANT/policy direta para
-- authenticated/anon — todo acesso passa exclusivamente por estas duas
-- funções SECURITY DEFINER, gated por is_platform_owner(), exatamente
-- como já documentado na migration 043.
--
-- As colunas de retorno usam o prefixo "out_" (out_school_id, etc.) em vez
-- dos mesmos nomes das colunas da tabela: em PL/pgSQL, RETURNS TABLE(...)
-- cria variáveis com esses nomes no escopo da função, e nomes iguais aos
-- das colunas reais de school_billing_contacts (school_id, full_name,
-- email, phone, updated_at) geram "column reference is ambiguous" em
-- praticamente qualquer INSERT/SELECT que toque a tabela dentro da
-- própria função — confirmado empiricamente ao testar esta migration.
--
-- platform_list_billing_contacts(): retorna o responsável comercial de
-- TODAS as escolas em uma única chamada (mesmo padrão já usado por
-- platform_list_schools_with_counts_v3 para o administrador de cada
-- escola) — evita N chamadas ao abrir o Painel. Nunca expõe user_id, só
-- out_has_linked_user (boolean).
--
-- platform_set_billing_contact(): cria ou atualiza o responsável de uma
-- escola (upsert por school_id, que já é PRIMARY KEY). Normaliza nome
-- (btrim) e e-mail (lower+btrim); telefone só recebe btrim, sem validação
-- de formato, por instrução explícita. Resolve user_id automaticamente
-- comparando o e-mail informado com auth.users.email (mesmo critério de
-- auth.users.deleted_at is null já usado em platform_provision_school) —
-- mas SÓ quando existir exatamente uma conta correspondente; qualquer
-- ambiguidade (zero ou mais de uma conta) resulta em user_id = NULL. Não
-- cria conta, não envia convite, não altera school_members nem
-- school_subscriptions.
--
-- Auditoria (billing_contact_changed): registra apenas metadados —
-- existência anterior/nova, campos alterados e se há conta vinculada —
-- nunca nome/e-mail/telefone completos, por instrução explícita.

begin;

create or replace function public.platform_list_billing_contacts()
returns table(
  out_school_id uuid,
  out_full_name text,
  out_email text,
  out_phone text,
  out_has_linked_user boolean,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    c.school_id,
    c.full_name,
    c.email,
    c.phone,
    c.user_id is not null,
    c.updated_at
  from public.school_billing_contacts c;
end;
$function$;

create or replace function public.platform_set_billing_contact(
  p_school_id uuid,
  p_full_name text,
  p_email text,
  p_phone text
)
returns table(
  out_school_id uuid,
  out_full_name text,
  out_email text,
  out_phone text,
  out_has_linked_user boolean,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_user_id uuid;
  v_match_count int;
  v_previous public.school_billing_contacts%rowtype;
  v_existed boolean;
  v_new public.school_billing_contacts%rowtype;
  v_changed_fields text[] := '{}';
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Acesso negado.';
  end if;

  if not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'Escola não encontrada.';
  end if;

  if v_name = '' then
    raise exception 'Informe o nome do responsável.';
  end if;

  if v_email = '' then
    raise exception 'Informe o e-mail do responsável.';
  end if;

  -- Vínculo automático só quando não houver ambiguidade nenhuma: exatamente
  -- uma conta com este e-mail normalizado. Em qualquer outro caso (0 ou 2+)
  -- v_user_id permanece NULL.
  select count(*)
    into v_match_count
  from auth.users u
  where lower(btrim(u.email)) = v_email
    and u.deleted_at is null;

  if v_match_count = 1 then
    select u.id
      into v_user_id
    from auth.users u
    where lower(btrim(u.email)) = v_email
      and u.deleted_at is null
    limit 1;
  else
    v_user_id := null;
  end if;

  select * into v_previous
  from public.school_billing_contacts c
  where c.school_id = p_school_id;

  v_existed := found;

  insert into public.school_billing_contacts as sbc (school_id, full_name, email, phone, user_id, updated_by)
  values (p_school_id, v_name, v_email, v_phone, v_user_id, auth.uid())
  on conflict (school_id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      user_id = excluded.user_id,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning sbc.* into v_new;

  if v_existed then
    if v_previous.full_name is distinct from v_new.full_name then
      v_changed_fields := array_append(v_changed_fields, 'full_name');
    end if;
    if v_previous.email is distinct from v_new.email then
      v_changed_fields := array_append(v_changed_fields, 'email');
    end if;
    if v_previous.phone is distinct from v_new.phone then
      v_changed_fields := array_append(v_changed_fields, 'phone');
    end if;
    if v_previous.user_id is distinct from v_new.user_id then
      v_changed_fields := array_append(v_changed_fields, 'linked_user');
    end if;
  else
    v_changed_fields := array['full_name', 'email', 'phone', 'linked_user'];
  end if;

  perform public.record_platform_audit(
    'billing_contact_changed',
    p_school_id,
    v_new.user_id,
    jsonb_build_object(
      'existed', v_existed,
      'has_linked_user', coalesce(v_previous.user_id is not null, false)
    ),
    jsonb_build_object(
      'existed', true,
      'has_linked_user', v_new.user_id is not null,
      'changed_fields', to_jsonb(v_changed_fields)
    )
  );

  return query
  select v_new.school_id, v_new.full_name, v_new.email, v_new.phone, v_new.user_id is not null, v_new.updated_at;
end;
$function$;

revoke all on function public.platform_list_billing_contacts() from public;
revoke all on function public.platform_list_billing_contacts() from anon;
grant execute on function public.platform_list_billing_contacts() to authenticated;

revoke all on function public.platform_set_billing_contact(uuid, text, text, text) from public;
revoke all on function public.platform_set_billing_contact(uuid, text, text, text) from anon;
grant execute on function public.platform_set_billing_contact(uuid, text, text, text) to authenticated;

commit;
