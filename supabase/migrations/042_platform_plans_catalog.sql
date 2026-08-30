-- CARÔMETRO COMERCIAL
-- Fundação do catálogo de planos comerciais (Grátis/Básico/Profissional/
-- Empresarial). Migration puramente aditiva: cria uma tabela nova e faz
-- seed idempotente. Não altera school_subscriptions, não altera nenhuma
-- funcionalidade existente (Mercado Pago, tela de login,
-- subscription-settings.js e platform-owner-dashboard.js continuam
-- exatamente como estão — este catálogo ainda não é lido por nenhum
-- frontend nesta fase).
--
-- Preços: só o Grátis tem valor definido (0). Básico e Profissional ficam
-- com price=NULL propositalmente — os valores reais ainda não foram
-- decididos e não devem ser inventados aqui. Empresarial permanece
-- price=NULL por desenho (plano "Fale conosco", sem preço público).
--
-- Segurança: leitura pública (authenticated + anon) — é o catálogo que a
-- tela pública de login vai exibir no futuro, não há nenhum dado sensível
-- nele. Nenhuma policy de escrita é criada agora: assim como
-- school_subscriptions, toda alteração futura passará por uma RPC
-- SECURITY DEFINER dedicada (a ser criada só quando essa edição for
-- realmente implementada) — não há necessidade estrutural de uma policy
-- de escrita direta nesta fase.

begin;

create table public.platform_plans (
  plan_key text primary key
    check (plan_key in ('free', 'basic', 'professional', 'enterprise')),
  display_name text not null,
  price numeric null
    check (price is null or price >= 0),
  description text null,
  cta_label text not null,
  highlighted boolean not null default false,
  contact_only boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_plans enable row level security;

create policy "Anyone can view platform plans"
on public.platform_plans
for select
to authenticated, anon
using (true);

-- Seed idempotente: só insere o que ainda não existir. Uma reaplicação
-- desta migration (ou execução manual repetida) nunca duplica linhas nem
-- sobrescreve edições que o proprietário já tenha feito depois.
insert into public.platform_plans (
  plan_key, display_name, price, description, cta_label,
  highlighted, contact_only, display_order
)
values
  ('free',         'Grátis',       0,    null, 'Começar grátis', false, false, 1),
  ('basic',        'Básico',       null, null, 'Assinar',        false, false, 2),
  ('professional', 'Profissional', null, null, 'Assinar',        true,  false, 3),
  ('enterprise',   'Empresarial',  null, null, 'Fale conosco',   false, true,  4)
on conflict (plan_key) do nothing;

commit;
