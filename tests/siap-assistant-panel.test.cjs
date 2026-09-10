const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('mostra o Assistente SIAP ao lado do sino apenas na página principal', () => {
  const source = fs.readFileSync(path.join(__dirname, '../siap-integration.js'), 'utf8');
  assert.match(source, /button\.id = 'openSiapAssistant'/);
  assert.match(source, /greetingRow\.insertBefore\(button, bell\)/);
  assert.match(source, /const onMainPage = !selectedClassId/);
  assert.match(source, /button\.classList\.toggle\('hidden', !onMainPage\)/);
  assert.match(source, /Planejamento, conteúdo, frequência e PEI/);
  assert.match(source, /window\.getSiapPanelActions = \(\) => ''/);
  assert.doesNotMatch(source, /openSiapAttendance/);
  assert.doesNotMatch(source, /SIAP_ATTENDANCE_REQUEST/);
  assert.doesNotMatch(source, /SIAP_COMPONENTS_REQUEST/);
  assert.doesNotMatch(source, /Aplicar etiquetas nesta turma/);
});

test('nao carrega o modulo de importacao de frequencia', () => {
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const permissions = fs.readFileSync(path.join(__dirname, '../permissions-and-details.js'), 'utf8');
  assert.doesNotMatch(index, /siap-attendance-core\.js/);
  assert.match(index, /siap-integration\.js\?v=17/);
  assert.match(index, /permissions-and-details\.js\?v=57/);
  assert.doesNotMatch(permissions, /siapCheck\(item,'can_import_siap_attendance','Importar frequência do SIAP'/);
  assert.match(permissions, /const commercialUpdates = key === 'can_edit_all'\s+\? permissionFields\.map/);
  assert.doesNotMatch(permissions, /setSiapPermission|Usar Assistente SIAP/);
});

test('exibe o botao somente com concessao do proprietario ou assinatura paga', () => {
  const integration = fs.readFileSync(path.join(__dirname, '../siap-integration.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '../platform-owner-dashboard.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/098_platform_owner_siap_access.sql'), 'utf8');
  assert.match(integration, /get_siap_assistant_button_visibility/);
  assert.doesNotMatch(integration, /rights\.role === 'admin' \|\| rights\.can_use_siap_assistant/);
  assert.match(dashboard, /platform_set_siap_assistant_access/);
  assert.match(dashboard, /platform_list_siap_assistant_customers/);
  assert.match(dashboard, /Clientes e vencimentos/);
  assert.match(dashboard, /Novos em 30 dias/);
  assert.match(dashboard, /days_remaining/);
  assert.match(dashboard, /Permitir acesso por escola/);
  assert.match(dashboard, /platform_list_siap_school_users/);
  assert.match(dashboard, /data-siap-user-id/);
  assert.match(migration, /not public\.is_platform_owner\(\)/);
  assert.match(migration, /siap_assistant_access_grants/);
  assert.match(migration, /platform_list_siap_assistant_customers/);
  assert.match(migration, /set_school_member_siap_permission[\s\S]*Somente o proprietário da plataforma/);
});

test('lista usuarios por escola e mantem rolagem ate o final do painel', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '../platform-owner-dashboard.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../platform-owner-dashboard.css'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/099_platform_owner_siap_school_users.sql'), 'utf8');
  assert.match(migration, /platform_list_siap_school_users/);
  assert.match(migration, /not public\.is_platform_owner\(\)/);
  assert.match(dashboard, /renderSiapSchoolAccess/);
  assert.match(css, /\.platform-content\s*\{[^}]*flex:1;[^}]*min-height:0;[^}]*overflow:auto/);
});

test('orienta atualizacao da extensao sem bloquear versao ainda compativel', () => {
  const integration = fs.readFileSync(path.join(__dirname, '../siap-integration.js'), 'utf8');
  const account = fs.readFileSync(path.join(__dirname, '../assistente-siap-conta.js'), 'utf8');
  const config = fs.readFileSync(path.join(__dirname, '../carometro-config.js'), 'utf8');
  assert.match(config, /siapAssistantMinimumVersion: '0\.20\.0'/);
  assert.match(config, /siapAssistantRecommendedVersion: '0\.22\.5'/);
  assert.match(config, /siapAssistantStoreUrl: 'https:\/\/chromewebstore\.google\.com\/detail\/fgpjjlikinpcjpmmjehbgbfonnbfibnc'/);
  assert.match(integration, /result\.extensionVersion/);
  assert.match(integration, /Atualização obrigatória/);
  assert.match(integration, /Atualização recomendada/);
  assert.match(account, /response\.extensionVersion/);
});
