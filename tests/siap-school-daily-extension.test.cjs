const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'carometro-bridge.js'), 'utf8');

assert.equal(manifest.version, '0.7.0');
assert.match(content, /FrequenciaDiaria\.aspx/);
assert.match(content, /\.containerTurmaTurno/);
assert.match(content, /\.listaTurmas\[data-codigoturma\]/);
assert.match(content, /\.listaDeAlunos \.item\[data-matricula\]/);
assert.match(content, /\.listaDeFrequencias \.item\[data-matricula\]/);
assert.match(content, /dentroPrazo/);
assert.match(content, /foraPrazo/);
assert.match(content, /diaNaoLetivo/);
assert.match(content, /existeExcecao/);
assert.match(content, /duplicateName:normalizedNameCounts/);
assert.match(content, /__carometroSchoolDailySelectDate/);
assert.match(content, /__carometroSchoolDailyOpenClass/);
assert.doesNotMatch(content, /cphFuncionalidade_Salvar(?:Proximo)?[^\n]*click/);
assert.doesNotMatch(background, /btnAlterar|btnExcluir|Salvar|Excluir/);
assert.match(background, /CM_SCHOOL_DAILY_COLLECT/);
assert.match(background, /item\.selectedDate === date && item\.classes\.length > 0/);
assert.match(background, /filled_on_time.*filled_late/);
assert.match(background, /notFilled:0, nonSchoolDay:0, exception:0, future:0/);
assert.match(bridge, /CAROMETRO_SCHOOL_DAILY_REQUEST/);
assert.match(bridge, /CAROMETRO_SCHOOL_DAILY_RESULT/);

const sandbox = {
  URL,
  setTimeout,
  chrome:{ runtime:{ onMessage:{ addListener() {} } } }
};
vm.runInNewContext(`${background}\nglobalThis.chooseSchoolDailyTabForTest = chooseSchoolDailyTab;`, sandbox);
const chosen = sandbox.chooseSchoolDailyTabForTest([
  { id:1, url:'https://siap.educacao.go.gov.br/FrequenciaDiaria.aspx', active:false, lastAccessed:100 },
  { id:2, url:'https://siap.educacao.go.gov.br/FrequenciaDiaria.aspx', active:true, lastAccessed:50 },
  { id:3, url:'https://siap.educacao.go.gov.br/DiarioEscolarListagem.aspx', active:true, lastAccessed:500 }
]);
assert.equal(chosen.id, 2);

console.log('Extensão: leitor diário isolado, automático e somente leitura aprovado.');
