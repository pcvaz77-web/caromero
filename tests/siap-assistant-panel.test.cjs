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
  assert.doesNotMatch(index, /siap-attendance-core\.js/);
  assert.match(index, /siap-integration\.js\?v=10/);
});
