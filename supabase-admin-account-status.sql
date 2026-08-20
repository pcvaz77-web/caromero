-- Execute uma vez no Supabase: SQL Editor > New query > Run.
--
-- Disponibiliza para o administrador, com segurança, apenas os campos
-- necessários para distinguir "aguardando confirmação de e-mail" de
-- "acesso ativo"/"acesso suspenso" na tela de configurações. Não altera
-- nenhuma tabela, trigger, coluna ou valor de access_status existente.
--
-- auth.users não é acessível ao cliente (chave anon/authenticated não tem
-- grants nesse schema), por isso a leitura precisa passar por uma function
-- SECURITY DEFINER estritamente restrita a administradores.

create or replace function public.admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  access_status text,
  email_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Checagem de admin é a primeira instrução: nenhuma linha é montada
  -- ou retornada antes de confirmar que o chamador é administrador.
  if not public.is_carometro_admin() then
    raise exception 'Acesso negado.';
  end if;

  -- auth.users.email é character varying(255) (não text); profiles.full_name
  -- e user_permissions.role/access_status podem ter o mesmo tipo, dependendo
  -- de como cada tabela foi criada originalmente. Casts explícitos garantem
  -- que o tipo de saída bata com o RETURNS TABLE declarado, qualquer que
  -- seja o tipo real da coluna de origem.
  return query
  select
    u.id::uuid as user_id,
    u.email::text as email,
    p.full_name::text as full_name,
    up.role::text as role,
    up.access_status::text as access_status,
    (u.email_confirmed_at is not null)::boolean as email_confirmed
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_permissions up on up.user_id = u.id
  order by u.created_at;
end;
$function$;

-- Só authenticated pode chamar; anon nunca. A checagem de admin dentro da
-- function é o que impede um usuário autenticado comum de ler a lista.
revoke all on function public.admin_list_accounts() from public;
revoke all on function public.admin_list_accounts() from anon;
grant execute on function public.admin_list_accounts() to authenticated;
