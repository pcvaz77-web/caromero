const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'carometro-bridge.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, ['https://siap.educacao.go.gov.br/*', 'https://sistemacarometro.com.br/*']);
assert.deepEqual(manifest.permissions, ['tabs', 'scripting']);
assert.doesNotMatch(content, /chrome\.(cookies|history|storage)|fetch\s*\(|XMLHttpRequest|sendBeacon/);
assert.doesNotMatch(content, /btnAlterar.*click|btnExcluirFrequencia.*click/);
assert.doesNotMatch(content, /\.ausente\s*=|dataset\.ausente\s*=/);
assert.match(content, /FrequenciaAlunoEdicao\.aspx/);
assert.match(background, /chrome\.scripting\.executeScript/);
assert.match(background, /CM_ASSISTED_CAPTURE/);
assert.match(background, /function chooseSiapTab\(tabs\)/);
assert.match(background, /right\.lastAccessed/);
assert.match(bridge, /CAROMETRO_ASSISTED_CAPTURE_REQUEST/);
assert.match(bridge, /if \(!chrome\.runtime\?\.id\)/);
assert.doesNotMatch(bridge, /cm-attendance-import|Buscar chamadas salvas|CM_ATTENDANCE_REQUEST/);
assert.doesNotMatch(background, /tabs\.sendMessage/);
assert.match(content, /__carometroAttendanceSnapshot/);
assert.match(content, /__carometroSelectRegisteredDay/);
assert.doesNotMatch(content, /ControleFrequenciaHistorico|hasSavedHistory/);
assert.match(content, /globalThis\.__carometroDocumentPageToken \|\|=/);
assert.match(content, /isSavedAttendanceCell/);
assert.match(content, /data-executado/);
assert.match(content, /data-lancamento-frequencia/);
assert.match(content, /select\.selectedIndex = index/);
assert.match(content, /selectedOptions\?\.\[0\]\?\.textContent/);
assert.doesNotMatch(content, /const selectedMonth =/);
assert.doesNotMatch(content, /colorOf\(/);
assert.match(background, /injection\?\.error/);
assert.match(background, /triggerReaderNavigation/);
assert.match(background, /NAVIGATION_ACTION_TIMEOUT_MS/);
assert.doesNotMatch(background, /btnAlterar|btnExcluir|Salvar|Excluir/);
assert.doesNotMatch(content, /carometro-frequencia-leitura|data-cm-month|Mês exibido no SIAP/);
assert.match(content, /document\.querySelectorAll\('\.listaDeFrequencias'\)/);
assert.match(content, /const lesson = normalize\(list\.dataset\.numeroaula\)/);
assert.equal(manifest.content_scripts[0].css, undefined);

const sandbox = {
  URL,
  setTimeout,
  chrome:{ runtime:{ onMessage:{ addListener() {} } } }
};
vm.runInNewContext(`${background}\nglobalThis.chooseSiapTabForTest = chooseSiapTab;`, sandbox);
const chosen = sandbox.chooseSiapTabForTest([
  { id:1, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx', active:false, lastAccessed:100 },
  { id:2, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx', active:false, lastAccessed:300 },
  { id:3, url:'https://siap.educacao.go.gov.br/OutraPagina.aspx', active:true, lastAccessed:400 }
]);
assert.equal(chosen.id, 2, 'deve escolher a aba de frequência acessada mais recentemente');

console.log('Extensão de frequência somente leitura: contrato estrutural aprovado.');
