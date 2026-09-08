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
  assert.match(index, /siap-integration\.js\?v=16/);
  assert.match(index, /permissions-and-details\.js\?v=54/);
  assert.doesNotMatch(permissions, /siapCheck\(item,'can_import_siap_attendance','Importar frequência do SIAP'/);
  assert.match(permissions, /const commercialUpdates = key === 'can_edit_all'\s+\? permissionFields\.map/);
  assert.match(permissions, /const siapCheck = .*item\[key\]/);
  assert.doesNotMatch(permissions, /const siapCheck = .*can_edit_all/);
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
