const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/104_sales_plans_launch_offer.sql');
const storefront = read('subscription-settings.js');
const dashboard = read('platform-owner-dashboard.js');
const styles = read('platform-owner-dashboard.css');

test('atualiza os limites e o nome comercial sem remover o plano grátis', () => {
  assert.match(migration, /max_students = 100,[\s\S]*max_staff = 5,[\s\S]*max_classes = 2,[\s\S]*plan_key = 'free'/);
  assert.match(migration, /max_students = 1000,[\s\S]*max_staff = 10,[\s\S]*max_classes = 12,[\s\S]*plan_key = 'basic'/);
  assert.match(migration, /display_name = 'Premium',[\s\S]*plan_key = 'professional'/);
});

test('mantém o preço riscado apenas como apresentação comercial', () => {
  assert.match(migration, /add column compare_at_price numeric/);
  assert.match(migration, /compare_at_price é somente visual/);
  assert.match(dashboard, /Preço anterior \(riscado na oferta\)/);
  assert.match(dashboard, /Não altera o valor cobrado na Hotmart/);
  assert.match(storefront, /public-plan-compare-price/);
  assert.match(storefront, /public-plan-old-price/);
  assert.match(storefront, /public-plan-price-connector/);
  assert.match(storefront, /PREÇO DE LANÇAMENTO/);
  assert.match(storefront, /public-plan-launch-stamp/);
  assert.doesNotMatch(styles, /public-plan-launch-label/);
  assert.match(styles, /\.public-plan-compare-price\{[^}]*font-size:16px[^}]*font-weight:800/);
  assert.match(styles, /\.public-plan-launch-stamp[^}]*width:184px[^}]*height:78px/);
  assert.match(styles, /clip-path:polygon/);
  assert.match(styles, /font-size:13px/);
  assert.match(styles, /\.public-plan-old-price\{[^}]*text-decoration-thickness:1px/);
  assert.match(styles, /\.public-plan-price-connector\{[^}]*color:#101828[^}]*text-decoration:none/);
});

test('destaca o acesso aos planos sem desrespeitar movimento reduzido', () => {
  assert.match(styles, /@keyframes public-plans-pulse/);
  assert.match(styles, /@keyframes public-plans-shine/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test('usa os termos comerciais solicitados com concordância correta', () => {
  assert.match(storefront, /formatLimit\(plan\.max_staff, 'funcionários'\)/);
  assert.match(storefront, /label === 'turmas' \? 'ilimitadas' : 'ilimitados'/);
});

test('moderniza o formulário comercial dos três planos sem alterar o fluxo', () => {
  assert.match(storefront, /school-application-kicker/);
  assert.match(storefront, /school-application-intro/);
  assert.match(storefront, /school-application-section-title/);
  assert.match(storefront, /applicationModal\.dataset\.planKey = plan\.plan_key/);
  assert.match(storefront, /billing-option input \{ appearance:none/);
  assert.match(styles, /\.school-application-head\{[^}]*linear-gradient/);
  assert.match(styles, /\.school-application-modal \.actions \.primary\{[^}]*linear-gradient/);
  assert.match(styles, /data-plan-key="basic"/);
  assert.match(styles, /data-plan-key="professional"/);
});
