-- Preparada para revisão. Não executar sem autorização específica.
begin;
create table public.siap_exam_offers (
 offer_key text primary key,
 display_name text not null,
 base_plan text references public.siap_assistant_plans(plan_key),
 amount numeric(10,2) not null check(amount>0),
 credits integer not null default 0 check(credits in (0,1,4)),
 months integer not null default 0 check(months in (0,1,3,6)),
 product_id bigint,
 offer_code text unique,
 checkout_url text,
 active boolean not null default false,
 check((credits>0 and months=0 and base_plan is null) or (credits=0 and months>0 and base_plan is not null)),
 check(not active or (product_id>0 and offer_code is not null and checkout_url like 'https://pay.hotmart.com/%'))
);
insert into public.siap_exam_offers(offer_key,display_name,amount,credits) values
 ('exam_one','Uma correção de bloco',20,1),('exam_four','Todos os quatro blocos',80,4);
insert into public.siap_exam_offers(offer_key,display_name,base_plan,amount,months)
 select plan_key||'_exam',display_name||' com Correção de Provas',plan_key,
 amount+case when plan_key='monthly' then 35 else 45 end,billing_months
 from public.siap_assistant_plans where amount>0;
alter table public.siap_exam_offers enable row level security;
grant select on public.siap_exam_offers to anon,authenticated;
create policy exam_catalog on public.siap_exam_offers for select to anon,authenticated using(true);

create table public.siap_exam_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 offer_key text not null references public.siap_exam_offers(offer_key),
 payer_email text not null,
 legal_accepted_at timestamptz not null,
 amount numeric(10,2) not null,
 credits integer not null,
 months integer not null,
 product_id bigint not null,
 offer_code text not null,
 created_at timestamptz not null default now()
);
create table public.siap_exam_purchases (
 transaction_id text primary key,
 order_id uuid not null references public.siap_exam_orders(id),
 user_id uuid not null references auth.users(id),
 approved_at timestamptz,
 expires_at timestamptz,
 revoked_at timestamptz,
 check(expires_at is null or expires_at>approved_at)
);
create table public.siap_exam_credits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 transaction_id text not null references public.siap_exam_purchases(transaction_id),
 ordinal integer not null check(ordinal between 1 and 4),
 block_key text,
 bound_at timestamptz,
 finished_at timestamptz,
 unique(transaction_id,ordinal)
);
-- Um bloco já encerrado não pode reutilizar outro crédito por acidente.
create unique index exam_credit_block on public.siap_exam_credits(user_id,block_key) where block_key is not null;
alter table public.siap_exam_orders enable row level security;
alter table public.siap_exam_purchases enable row level security;
alter table public.siap_exam_credits enable row level security;
revoke all on public.siap_exam_orders,public.siap_exam_purchases,public.siap_exam_credits from public,anon,authenticated;
grant all on public.siap_exam_offers,public.siap_exam_orders,public.siap_exam_purchases,public.siap_exam_credits to service_role;

-- Todas as operações mutáveis são exclusivas do backend autenticado.
create function public.siap_exam_commerce_access(p_user uuid,p_block text default null,p_operation text default 'status')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_end timestamptz; v_general timestamptz; v_credit public.siap_exam_credits%rowtype; v_available integer; v_open integer; v_manual boolean;
begin
 if auth.role() is distinct from 'service_role' or p_user is null then raise exception 'Acesso negado'; end if;
 if p_operation not in ('status','preview','check','bind','finish') then raise exception 'Operação inválida'; end if;
 if p_operation<>'status' and (p_block is null or length(p_block)>200 or length(p_block)<5) then raise exception 'Bloco inválido'; end if;
 perform 1 from auth.users where id=p_user for update;
 select max(p.expires_at) into v_general from public.siap_exam_purchases p
 join public.siap_exam_orders o on o.id=p.order_id
 where p.user_id=p_user and p.revoked_at is null and p.approved_at is not null and p.expires_at>now() and o.months>0;
 select exists(select 1 from public.siap_exam_access_grants where user_id=p_user and revoked_at is null and (expires_at is null or expires_at>now())) into v_manual;
 v_end:=v_general;
 if v_manual then
  select expires_at into v_end from public.siap_exam_access_grants where user_id=p_user;
  if v_end is not null then v_end:=greatest(v_end,v_general); end if;
 end if;
 select count(*) into v_available from public.siap_exam_credits c join public.siap_exam_purchases p using(transaction_id)
 where c.user_id=p_user and c.block_key is null and p.revoked_at is null and p.approved_at is not null;
 select count(*) into v_open from public.siap_exam_credits c join public.siap_exam_purchases p using(transaction_id)
 where c.user_id=p_user and c.block_key is not null and c.finished_at is null and p.revoked_at is null and p.approved_at is not null;
 if p_operation='status' then
  return jsonb_build_object('active',v_manual or v_general is not null or v_available+v_open>0,'expiresAt',v_end,'status',case when v_manual then 'granted' when v_general is not null then 'subscription' else 'credits' end,'credits',v_available,'openBlocks',v_open,'generalUntil',v_general);
 end if;
 if p_operation<>'finish' and (v_manual or v_general is not null) then
  return jsonb_build_object('active',true,'expiresAt',v_end,'status',case when v_manual then 'granted' else 'subscription' end);
 end if;
 select c.* into v_credit from public.siap_exam_credits c join public.siap_exam_purchases p using(transaction_id)
 where c.user_id=p_user and c.block_key=p_block and p.revoked_at is null and p.approved_at is not null for update of c;
 if p_operation='bind' and v_credit.id is null and not exists(select 1 from public.siap_exam_credits where user_id=p_user and block_key=p_block) then
  select c.* into v_credit from public.siap_exam_credits c join public.siap_exam_purchases p using(transaction_id)
  where c.user_id=p_user and c.block_key is null and p.revoked_at is null and p.approved_at is not null order by p.approved_at,c.ordinal limit 1 for update of c;
  if v_credit.id is not null then
   update public.siap_exam_credits set block_key=p_block,bound_at=now() where id=v_credit.id;
  end if;
 end if;
 if p_operation='finish' and v_credit.id is not null then
  update public.siap_exam_credits set finished_at=coalesce(finished_at,now()) where id=v_credit.id;
  return jsonb_build_object('active',false,'status','finished');
 end if;
 return jsonb_build_object('active',(v_credit.id is not null and v_credit.finished_at is null) or (p_operation='preview' and v_available>0 and not exists(select 1 from public.siap_exam_credits where user_id=p_user and block_key=p_block)), 'status',case when v_credit.finished_at is not null then 'finished' when v_credit.id is not null then 'block' when p_operation='preview' and v_available>0 then 'pending_scan' else 'no_credit' end,'expiresAt',null);
end $$;

-- Pagamento e concessão são atômicos; repetição/ordem dos webhooks não duplica créditos.
create function public.siap_exam_payment_event(p_order uuid,p_transaction text,p_amount numeric,p_event text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.siap_exam_orders%rowtype; f public.siap_exam_offers%rowtype; p public.siap_exam_purchases%rowtype; v_start timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado'; end if;
 if p_transaction is null or length(p_transaction) not between 1 and 200 or p_event not in ('approved','revoked','cancelled') then raise exception 'Evento inválido'; end if;
 select * into o from public.siap_exam_orders where id=p_order;
 if not found then raise exception 'Pedido não encontrado'; end if;
 perform 1 from auth.users where id=o.user_id for update;
 select * into f from public.siap_exam_offers where offer_key=o.offer_key;
 if p_event='approved' and (p_amount is distinct from o.amount or p_paid_at is null or p_paid_at>now()+interval '5 minutes') then raise exception 'Pagamento divergente'; end if;
 insert into public.siap_exam_purchases(transaction_id,order_id,user_id) values(p_transaction,o.id,o.user_id) on conflict do nothing;
 select * into p from public.siap_exam_purchases where transaction_id=p_transaction for update;
 if p.order_id<>o.id then raise exception 'Transação já vinculada'; end if;
 if p_event='revoked' then
  update public.siap_exam_purchases set revoked_at=coalesce(revoked_at,now()) where transaction_id=p_transaction;
 elsif p_event='approved' and p.approved_at is null and p.revoked_at is null then
  -- Planos casados não consomem créditos, nem sobrescrevem concessões antigas.
  v_start:=p_paid_at;
  -- A vigência acompanha a cobrança efetivamente aprovada, não outras compras.
  update public.siap_exam_purchases set approved_at=p_paid_at,expires_at=case when o.months>0 then v_start+make_interval(months=>o.months) else null end where transaction_id=p_transaction;
  insert into public.siap_exam_credits(user_id,transaction_id,ordinal) select o.user_id,p_transaction,n from generate_series(1,o.credits) n on conflict do nothing;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.siap_exam_commerce_access(uuid,text,text),public.siap_exam_payment_event(uuid,text,numeric,text,timestamptz) from public,anon,authenticated;
grant execute on function public.siap_exam_commerce_access(uuid,text,text),public.siap_exam_payment_event(uuid,text,numeric,text,timestamptz) to service_role;

-- Mantém integralmente a implementação anterior e acrescenta o plano casado.
do $$ begin
 execute replace(pg_get_functiondef('public.get_siap_assistant_access_status()'::regprocedure),
 'FUNCTION public.get_siap_assistant_access_status()', 'FUNCTION public.siap_access_before_exam_commerce()');
end $$;
revoke all on function public.siap_access_before_exam_commerce() from public,anon,authenticated;
create or replace function public.get_siap_assistant_access_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_status jsonb; v_end timestamptz;
begin
 v_status:=public.siap_access_before_exam_commerce();
 select max(expires_at) into v_end from public.siap_exam_purchases where user_id=auth.uid() and revoked_at is null and approved_at is not null and expires_at>now();
 if v_end is not null and not(coalesce((v_status->>'active')::boolean,false) and v_status->>'mode' in ('subscription','carometro')) then
  v_status:=v_status||jsonb_build_object('active',true,'status','subscribed','mode','subscription','accessEndsAt',v_end,'daysRemaining',ceil(extract(epoch from v_end-now())/86400),'freeUses',null);
 end if;
 return v_status;
end $$;
-- Quem só comprou correção também pode instalar/conectar pelo Carômetro.
do $$ begin
 if to_regprocedure('public.get_siap_assistant_button_visibility()') is not null then
  execute replace(pg_get_functiondef('public.get_siap_assistant_button_visibility()'::regprocedure),'FUNCTION public.get_siap_assistant_button_visibility()','FUNCTION public.siap_visibility_before_exam_commerce()');
  revoke all on function public.siap_visibility_before_exam_commerce() from public,anon,authenticated;
 end if;
end $$;
create or replace function public.get_siap_assistant_button_visibility()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; v_paid boolean;
begin
 if auth.uid() is null then return jsonb_build_object('visible',false);end if;
 v:=public.siap_visibility_before_exam_commerce();
 select exists(select 1 from public.siap_exam_purchases p where p.user_id=auth.uid() and p.revoked_at is null and p.approved_at is not null and
 (p.expires_at>now() or exists(select 1 from public.siap_exam_credits c where c.transaction_id=p.transaction_id and c.finished_at is null))) into v_paid;
 return v||jsonb_build_object('visible',coalesce((v->>'visible')::boolean,false) or v_paid,'examPurchased',v_paid);
end $$;
revoke all on function public.get_siap_assistant_button_visibility() from public,anon;
grant execute on function public.get_siap_assistant_button_visibility() to authenticated;
commit;
