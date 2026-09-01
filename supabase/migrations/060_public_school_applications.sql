-- CARÔMETRO COMERCIAL
-- Funil público de entrada de novas escolas.
--
-- O visitante pode enviar uma solicitação sem estar autenticado, mas não
-- pode ler, alterar ou excluir nenhuma solicitação. O proprietário é o
-- único que pode listar e decidir. A aprovação continua usando
-- platform_provision_school no frontend, portanto cria exatamente a mesma
-- escola/assinatura/convite do fluxo manual já existente.

begin;

create table public.platform_school_applications (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.platform_plans(plan_key),
  school_name text not null check (school_name = btrim(school_name) and length(school_name) between 3 and 160),
  responsible_name text not null check (responsible_name = btrim(responsible_name) and length(responsible_name) between 3 and 160),
  email text not null check (email = lower(btrim(email)) and length(email) <= 320),
  phone text not null check (phone = btrim(phone) and length(phone) between 8 and 40),
  city text not null check (city = btrim(city) and length(city) between 2 and 120),
  state text not null check (state = upper(btrim(state)) and length(state) = 2),
  estimated_students integer null check (estimated_students is null or estimated_students between 0 and 1000000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  legal_version text not null,
  legal_accepted_at timestamptz not null,
  school_id uuid null references public.schools(id) on delete set null,
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_school_applications_one_pending_email
on public.platform_school_applications(email)
where status = 'pending';

create index platform_school_applications_status_created
on public.platform_school_applications(status, created_at desc);

alter table public.platform_school_applications enable row level security;

-- Deliberadamente sem policies e sem grants diretos na tabela: PII nunca
-- fica exposta ao papel anon nem a usuários escolares autenticados.
revoke all on table public.platform_school_applications from public, anon, authenticated;

create or replace function public.submit_school_application(
  p_plan_key text,
  p_school_name text,
  p_responsible_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_state text,
  p_estimated_students integer,
  p_legal_accepted boolean,
  p_website text default ''
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_school_name text := btrim(coalesce(p_school_name, ''));
  v_responsible_name text := btrim(coalesce(p_responsible_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_state text := upper(btrim(coalesce(p_state, '')));
begin
  -- Honeypot: bots que preencherem o campo invisível recebem resposta
  -- genérica, mas nenhum dado é gravado.
  if btrim(coalesce(p_website, '')) <> '' then
    return gen_random_uuid();
  end if;

  if p_legal_accepted is distinct from true then
    raise exception 'Aceite os Termos de Uso e a Política de Privacidade.';
  end if;
  if not exists (select 1 from public.platform_plans p where p.plan_key = p_plan_key) then
    raise exception 'Plano inválido.';
  end if;
  if length(v_school_name) not between 3 and 160 then raise exception 'Informe o nome da escola.'; end if;
  if length(v_responsible_name) not between 3 and 160 then raise exception 'Informe o nome do responsável.'; end if;
  if v_email = '' or length(v_email) > 320 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if length(v_phone) not between 8 and 40 then raise exception 'Informe um telefone ou WhatsApp válido.'; end if;
  if length(v_city) not between 2 and 120 or v_state !~ '^[A-Z]{2}$' then raise exception 'Informe cidade e UF.'; end if;
  if p_estimated_students is not null and p_estimated_students not between 0 and 1000000 then
    raise exception 'Quantidade estimada de alunos inválida.';
  end if;
  if exists (select 1 from public.platform_school_applications a where a.email = v_email and a.status = 'pending') then
    raise exception 'Já existe uma solicitação em análise para este e-mail.';
  end if;

  insert into public.platform_school_applications (
    plan_key, school_name, responsible_name, email, phone, city, state,
    estimated_students, legal_version, legal_accepted_at
  ) values (
    p_plan_key, v_school_name, v_responsible_name, v_email, v_phone, v_city,
    v_state, p_estimated_students, '2026-08-31', now()
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.submit_school_application(text,text,text,text,text,text,text,integer,boolean,text) from public;
grant execute on function public.submit_school_application(text,text,text,text,text,text,text,integer,boolean,text) to anon, authenticated;

create or replace function public.platform_list_school_applications()
returns setof public.platform_school_applications
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  return query select * from public.platform_school_applications order by created_at desc;
end;
$function$;

revoke all on function public.platform_list_school_applications() from public, anon;
grant execute on function public.platform_list_school_applications() to authenticated;

create or replace function public.platform_decide_school_application(
  p_application_id uuid,
  p_status text,
  p_school_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_application public.platform_school_applications%rowtype;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Decisão inválida.'; end if;

  select * into v_application from public.platform_school_applications
  where id = p_application_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_application.status <> 'pending' then raise exception 'Esta solicitação já foi decidida.'; end if;
  if p_status = 'approved' and (p_school_id is null or not exists(select 1 from public.schools s where s.id = p_school_id)) then
    raise exception 'Informe a escola criada para concluir a aprovação.';
  end if;

  update public.platform_school_applications
  set status = p_status,
      school_id = case when p_status = 'approved' then p_school_id else null end,
      decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = p_application_id;
end;
$function$;

revoke all on function public.platform_decide_school_application(uuid,text,uuid) from public, anon;
grant execute on function public.platform_decide_school_application(uuid,text,uuid) to authenticated;

create or replace function public.platform_approve_school_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_application public.platform_school_applications%rowtype;
  v_plan public.platform_plans%rowtype;
  v_result jsonb;
  v_school_id uuid;
begin
  if auth.uid() is null or not public.is_platform_owner() then raise exception 'Acesso negado.'; end if;
  select * into v_application from public.platform_school_applications where id = p_application_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_application.status <> 'pending' then raise exception 'Esta solicitação já foi decidida.'; end if;
  select * into v_plan from public.platform_plans where plan_key = v_application.plan_key;
  if not found then raise exception 'O plano solicitado não existe mais.'; end if;

  -- Reutiliza o provisionamento manual oficial. Assim os dois caminhos
  -- terminam com as mesmas regras de escola, assinatura e convite.
  v_result := public.platform_provision_school(
    v_application.school_name,
    v_application.email,
    v_application.plan_key,
    coalesce(v_plan.price, 0)
  );
  v_school_id := (v_result->>'school_id')::uuid;

  insert into public.school_billing_contacts (school_id, full_name, email, phone, updated_by)
  values (v_school_id, v_application.responsible_name, v_application.email, v_application.phone, auth.uid());

  update public.platform_school_applications
  set status = 'approved', school_id = v_school_id, decided_by = auth.uid(),
      decided_at = now(), updated_at = now()
  where id = p_application_id;

  return v_result;
end;
$function$;

revoke all on function public.platform_approve_school_application(uuid) from public, anon;
grant execute on function public.platform_approve_school_application(uuid) to authenticated;

commit;
