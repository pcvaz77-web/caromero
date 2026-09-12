const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/084_siap_assistant_checkout.sql');
const asaasMigration = read('supabase/migrations/085_asaas_payment_provider.sql');
const landing = read('assistente-siap.html');
const account = read('assistente-siap-conta.js');
const accountHtml = read('assistente-siap-conta.html');
const createCheckout = read('supabase/functions/create-asaas-assistant-checkout/index.ts');
const schoolCheckout = read('supabase/functions/create-asaas-school-checkout/index.ts');
const webhook = read('supabase/functions/asaas-payment-webhook/index.ts');
const hotmartMigration = read('supabase/migrations/087_hotmart_payment_provider.sql');
const hotmartAssistantCheckout = read('supabase/functions/create-hotmart-assistant-checkout/index.ts');
const hotmartSchoolCheckout = read('supabase/functions/create-hotmart-school-checkout/index.ts');
const hotmartBillingCycles = read('supabase/migrations/088_hotmart_school_billing_cycles.sql');
const safeHotmartPriceSync = read('supabase/migrations/090_safe_hotmart_assistant_price_sync.sql');
const safeSchoolPriceSync = read('supabase/migrations/091_safe_hotmart_school_price_sync.sql');
const accountCommercialStatus = read('supabase/migrations/092_account_commercial_status.sql');
const hotmartWebhook = read('supabase/functions/hotmart-payment-webhook/index.ts');
const schoolFrontend = read('subscription-settings.js');
const dashboard = read('platform-owner-dashboard.js');
const purchaseConfirmed = read('compra-confirmada.html');
const carometroPurchaseInvitation = read('supabase/migrations/101_carometro_purchase_requires_invitation.sql');
const separatedProductAccounts = read('supabase/migrations/102_separate_carometro_accounts_from_siap.sql');
const correctedCustomerStatus = read('supabase/migrations/103_fix_siap_customer_status_display.sql');
const endedGrantAccess = read('supabase/migrations/110_siap_grant_end_blocks_free_demo.sql');
const quarterlyOffer = read('supabase/migrations/111_siap_assistant_quarterly_offer.sql');

test('mantem checkout do Assistente separado das assinaturas das escolas', () => {
  assert.match(migration, /create table if not exists public\.siap_assistant_payment_subscriptions/);
  assert.match(migration, /'monthly'.*89\.90.*1, true/s);
  assert.match(migration, /'semiannual'.*129\.90.*6, true/s);
  assert.doesNotMatch(createCheckout, /platform_payment_subscriptions|platform_school_applications/);
  assert.doesNotMatch(schoolCheckout, /siap_assistant_payment_subscriptions|siap_activate_paid_subscription/);
});

test('permite ao proprietário editar valores sem liberar acesso a outros usuários', () => {
  assert.match(migration, /platform_list_siap_assistant_plans/);
  assert.match(migration, /platform_update_siap_assistant_plan/);
  assert.match(migration, /if not public\.is_platform_owner\(\)/);
});

test('sincroniza preco do Assistente somente depois da confirmacao da Hotmart', () => {
  assert.match(safeHotmartPriceSync, /revoke execute on function public\.platform_update_siap_assistant_plan/);
  assert.match(safeHotmartPriceSync, /p_hotmart_confirmed is not true/);
  assert.match(safeHotmartPriceSync, /update public\.siap_assistant_plans/);
  assert.match(safeHotmartPriceSync, /update public\.hotmart_product_mappings/);
  assert.match(safeHotmartPriceSync, /siap_hotmart_price_synchronized/);
  assert.match(dashboard, /platform_sync_siap_assistant_plan_price/);
  assert.match(dashboard, /Confirmo que salvei o mesmo valor na Hotmart/);
});

test('oferece duas utilizações externas por função e persiste a contagem no servidor', () => {
  assert.match(migration, /feature_key in \('planning', 'content', 'attendance', 'pei'\)/);
  assert.match(migration, /used_count between 0 and 2/);
  assert.match(migration, /consume_siap_assistant_feature/);
  assert.match(migration, /used_count < 2/);
});

test('não reabre demonstração após concessão encerrada e aceita nova concessão', () => {
  assert.match(endedGrantAccess, /v_had_grant := found/);
  assert.match(endedGrantAccess, /v_grant\.revoked_at is null and \(v_grant\.expires_at is null or v_grant\.expires_at > v_now\)/);
  assert.match(endedGrantAccess, /'status','grant_ended'/);
  assert.match(endedGrantAccess, /'planning',0,'content',0,'attendance',0,'pei',0/);
  assert.match(endedGrantAccess, /if v_had_grant and v_grant\.revoked_at is null/);
});

test('checkout exige login e aceite antes de abrir a Hotmart', () => {
  assert.match(account, /signInWithOtp/);
  assert.match(account, /legalAccepted:true/);
  assert.match(account, /create-hotmart-assistant-checkout/);
  assert.match(hotmartAssistantCheckout, /legal_acceptance_required/);
  assert.match(hotmartAssistantCheckout, /hotmart_product_mappings/);
  assert.match(schoolFrontend, /create-hotmart-school-checkout/);
  assert.match(landing, /R\$ 89,90 \/ mês/);
  assert.match(landing, /R\$ 129,90 \/ 3 meses/);
  assert.match(landing, /data-assistant-plan="quarterly"/);
});

test('oferta trimestral concede exatamente tres meses e preserva o plano semestral', () => {
  assert.match(quarterlyOffer, /'quarterly', 'Trimestral'/);
  assert.match(quarterlyOffer, /129\.90, 3, true/);
  assert.match(quarterlyOffer, /plan_key = 'semiannual'/);
  assert.match(quarterlyOffer, /active = false/);
  assert.match(quarterlyOffer, /S107499429I\?off=2xaozivg&checkoutMode=6/);
  assert.match(quarterlyOffer, /billing_cycle = 'semiannual'/);
  assert.match(quarterlyOffer, /billing_cycle = 'quarterly'/);
  assert.match(quarterlyOffer, /set plan_key = 'quarterly'/);
  assert.match(quarterlyOffer, /status in \('creating', 'pending', 'expired'\)/);
  assert.doesNotMatch(quarterlyOffer, /status in \([^)]*'authorized'/);
});

test('orienta a instalar a extensao antes de tentar conectar a conta', () => {
  assert.match(accountHtml, /id="installAssistantExtension"/);
  assert.match(accountHtml, /1\. Instalar o Assistente SIAP/);
  assert.match(account, /2\. Conectar extensão a esta conta/);
  assert.match(account, /config\.siapAssistantStoreUrl/);
  assert.match(account, /conclua a instalação/);
});

test('mostra a marca Hotmart somente depois de entrar no checkout de pagamento', () => {
  assert.doesNotMatch(landing, /Hotmart/i);
  assert.doesNotMatch(accountHtml, /Hotmart/i);
  assert.doesNotMatch(account, /confirmação da Hotmart/i);
  assert.match(account, /create-hotmart-assistant-checkout/);
});

test('distingue demonstração gratuita de assinatura ou acesso institucional ao conectar a extensão', () => {
  assert.match(account, /get_siap_assistant_access_status/);
  assert.match(account, /2\. Conectar e experimentar/);
  assert.match(account, /O limite inicial é de 2 usos por recurso/);
  assert.match(account, /Assinatura ativa/);
  assert.match(account, /Acesso institucional/);
  assert.match(account, /\['subscription','carometro'\]/);
  assert.match(accountHtml, /assistantAccessSummary/);
  assert.doesNotMatch(accountHtml, /consumer\.hotmart\.com|Gerenciar ou cancelar assinatura na Hotmart/);
});

test('migra os dois produtos para Asaas sem misturar seus registros', () => {
  assert.match(asaasMigration, /provider in \('mercado_pago',\s*'asaas'\)/);
  assert.match(asaasMigration, /siap_assistant_payment_subscriptions/);
  assert.match(schoolCheckout, /platform_payment_subscriptions/);
  assert.doesNotMatch(schoolCheckout, /siap_assistant_payment_subscriptions/);
  assert.doesNotMatch(createCheckout, /platform_payment_subscriptions|platform_school_applications/);
});

test('webhook valida token, referência, valor e moeda antes da licença', () => {
  assert.match(webhook, /asaas-access-token/);
  assert.match(webhook, /externalReference/);
  assert.match(webhook, /payment\.value/);
  assert.match(webhook, /BRL/);
  assert.match(webhook, /siap_activate_paid_subscription/);
  assert.match(webhook, /platform_activate_paid_subscription/);
});

test('Hotmart usa lista fechada de quatro produtos e mantém escolas e assistente isolados', () => {
  assert.match(hotmartMigration, /provider in \('mercado_pago', 'asaas', 'hotmart'\)/);
  for (const id of ['8469975','8470115','8470304','8470309']) assert.match(hotmartMigration, new RegExp(id));
  assert.match(hotmartMigration, /target in \('school', 'assistant'\)/);
  assert.doesNotMatch(hotmartAssistantCheckout, /platform_payment_subscriptions|platform_school_applications/);
  assert.doesNotMatch(hotmartSchoolCheckout, /siap_assistant_payment_subscriptions|siap_activate_paid_subscription/);
});

test('webhook Hotmart falha fechado e processa aprovação, estorno e cancelamento', () => {
  assert.match(hotmartWebhook, /x-hotmart-hottok/);
  assert.match(hotmartWebhook, /raw\.version!=='2\.0\.0'/);
  assert.match(hotmartWebhook, /request\.formData\(\)/);
  assert.match(hotmartWebhook, /raw\.hottok/);
  assert.match(hotmartWebhook, /payment_mismatch/);
  assert.match(hotmartWebhook, /provider_event_id:eventId/);
  assert.match(hotmartWebhook, /PURCHASE_APPROVED/);
  assert.match(hotmartWebhook, /PURCHASE_REFUNDED/);
  assert.match(hotmartWebhook, /PURCHASE_CHARGEBACK/);
  assert.match(hotmartWebhook, /SUBSCRIPTION_CANCELLATION/);
  assert.match(hotmartWebhook, /platform_activate_paid_subscription/);
  assert.match(hotmartWebhook, /siap_activate_paid_subscription/);
  assert.match(hotmartWebhook, /activation\?\.invitation_id/);
  assert.match(hotmartWebhook, /sendAdministratorInvite/);
  assert.match(hotmartWebhook, /inviteUserByEmail/);
  assert.match(hotmartWebhook, /accept-invite\.html\?token=/);
  assert.match(hotmartMigration, /p_paid_at-interval '30 days'/);
  assert.match(hotmartMigration, /case when v_had_license then v_license\.trial_ends_at else p_paid_at end/);
});

test('Carometro oferece mensal e semestral com links Hotmart distintos', () => {
  assert.match(hotmartBillingCycles, /8470304[\s\S]*'monthly'[\s\S]*189\.90[\s\S]*off=cikuvxq4/);
  assert.match(hotmartBillingCycles, /8470304[\s\S]*'semiannual'[\s\S]*949\.50[\s\S]*off=qh3t6opt/);
  assert.match(hotmartBillingCycles, /8470309[\s\S]*'monthly'[\s\S]*289\.90[\s\S]*off=rr27tuic/);
  assert.match(hotmartBillingCycles, /8470309[\s\S]*'semiannual'[\s\S]*1449\.50[\s\S]*off=kc5tk2ve/);
  assert.match(hotmartSchoolCheckout, /billingCycle/);
  assert.match(hotmartSchoolCheckout, /eq\('billing_cycle',billingCycle\)/);
  assert.match(hotmartWebhook, /purchase\.offer\?\.code/);
  assert.match(hotmartWebhook, /addUtcMonths\(paidAt,6\)/);
});

test('compra do Carometro sempre exige convite proprio, mesmo com Auth existente', () => {
  assert.match(carometroPurchaseInvitation, /insert into public\.school_invitations/);
  assert.match(carometroPurchaseInvitation, /'school_admin'/);
  assert.doesNotMatch(carometroPurchaseInvitation, /insert into public\.school_members/);
  assert.doesNotMatch(carometroPurchaseInvitation, /from auth\.users/);
  assert.match(purchaseConfirmed, /Assistente SIAP e Carômetro são produtos independentes/);
});

test('webhook escolar não grava período em coluna exclusiva do Assistente SIAP', () => {
  assert.doesNotMatch(hotmartWebhook, /from\(table\)\.update\(\{current_period_end/);
  assert.match(hotmartWebhook, /school_subscriptions'\)\.update\(\{status:'active',grant_expires_at:periodEnd/);
});

test('sincroniza os quatro precos do Carometro de forma atomica e confirmada', () => {
  assert.match(safeSchoolPriceSync, /platform_list_school_commercial_mappings/);
  assert.match(safeSchoolPriceSync, /platform_sync_school_plan/);
  assert.match(safeSchoolPriceSync, /p_monthly_hotmart_confirmed is not true/);
  assert.match(safeSchoolPriceSync, /p_semiannual_hotmart_confirmed is not true/);
  assert.match(safeSchoolPriceSync, /update public\.platform_plans/);
  assert.match(safeSchoolPriceSync, /update public\.hotmart_product_mappings/g);
  assert.match(safeSchoolPriceSync, /school_hotmart_plan_synchronized/);
  assert.match(dashboard, /platform_sync_school_plan/);
  assert.match(dashboard, /Confirmo que salvei este valor na Hotmart/);
  assert.doesNotMatch(dashboard, /db\.rpc\('platform_set_plan_details'/);
  assert.doesNotMatch(dashboard, /db\.rpc\('platform_update_plan_billing_options'/);
});

test('distingue login confirmado de compra e aceita pagamento Hotmart tardio', () => {
  assert.match(accountCommercialStatus, /admin_list_accounts_v3/);
  assert.match(accountCommercialStatus, /CHECKOUT_ABANDONED/);
  assert.match(accountCommercialStatus, /created_at < now\(\) - interval '24 hours'/);
  assert.match(hotmartWebhook, /'pending','authorized','paused','expired'/);
});

test('separa contas do Carometro das identidades exclusivas do Assistente SIAP', () => {
  assert.match(separatedProductAccounts, /admin_list_carometro_accounts/);
  assert.match(separatedProductAccounts, /from public\.school_members/);
  assert.match(separatedProductAccounts, /from public\.school_invitations/);
  assert.doesNotMatch(separatedProductAccounts, /siap_assistant_/);
  assert.match(schoolFrontend, /admin_list_carometro_accounts/);
  assert.doesNotMatch(schoolFrontend, /assistant_paid_active|assistant_payment_status/);
  assert.doesNotMatch(dashboard, /platform-account-siap-access|platformSiapAccess/);
  assert.match(dashboard, /platform_list_siap_assistant_customers/);
  assert.match(dashboard, /platform_list_siap_school_users/);
});

test('mostra o estado efetivo dos clientes do Assistente SIAP', () => {
  assert.match(correctedCustomerStatus, /when c\.active_subscription then c\.latest_payment_created_at/);
  assert.match(correctedCustomerStatus, /when c\.active_trial then c\.trial_started_at/);
  assert.match(correctedCustomerStatus, /case when e\.active_subscription then e\.latest_plan_key else null end/);
  assert.match(correctedCustomerStatus, /e\.grant_expires_at <= now\(\)\+interval '3 days'/);
  assert.match(correctedCustomerStatus, /e\.paid_until <= now\(\)\+interval '5 days'/);
  assert.match(correctedCustomerStatus, /e\.trial_ends_at <= now\(\)\+interval '3 days'/);
});
