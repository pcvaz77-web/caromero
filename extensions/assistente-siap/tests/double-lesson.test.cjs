const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8')
  .replace('  install();', '  // Instalação omitida no teste de DOM sintético.')
  .replace(/\}\)\(\);\s*$/, 'globalThis.subject = { resumeContentBatch, readAttendanceStudents, readCalendarDays, setLicense(license) { model.license = license; model.page = "content"; }, finishingAuthorizedFreeWork };\n})();');
const Core = require('../src/core.js');

function makePage() {
  const storage = new Map();
  const options = ['1ª Aula', '2ª Aula'].map(value => ({ value, disabled:false, selected:false, hasAttribute(name) { return name === 'selected' && this.selected; } }));
  options[0].selected = true;
  const select = {
    options,
    value:'1ª Aula',
    get selectedOptions() { return options.filter(option => option.value === this.value); },
    dispatchEvent() { this.dispatched = true; }
  };
  const calendarCell = {
    textContent:'23',
    getAttribute(name) { return { 'data-planejado':'True', 'data-executado':this.executed ? 'True' : 'False' }[name] || null; },
    click() { this.clicked = true; }
  };
  const calendar = { querySelectorAll() { return [calendarCell]; } };
  const fields = {
    cphFuncionalidade_cphCampos_LstAulasDiaSelecionado:select,
    cphFuncionalidade_cphCampos_txtDataSelecionada:{ value:'23/09/2026' },
    cphFuncionalidade_cphCampos_CalendarioMensal:calendar,
    selectMesCalendarioMensal:{ selectedIndex:8 }
  };
  const document = {
    getElementById(id) { return fields[id] || null; },
    querySelector(selector) { return selector.includes('GrdConteudoRealizado') ? { id:'realized' } : null; },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    chrome:{ runtime:{ getManifest:() => ({ version:'test' }), onMessage:{ addListener() {} } } },
    window:{ AssistenteSiapCore:Core },
    location:{ pathname:'/ConteudoProgramaticoEdicao.aspx' },
    sessionStorage:{ getItem:key => storage.get(key) || null, setItem:(key,value) => storage.set(key,value), removeItem:key => storage.delete(key) },
    document,
    getComputedStyle:() => ({ backgroundColor:calendarCell.executed ? 'rgb(37, 205, 30)' : calendarCell.orange ? 'rgb(255, 204, 153)' : 'rgb(15, 122, 221)' }),
    setTimeout:() => 1,
    clearTimeout:() => {},
    Event:class Event {},
    console
  };
  vm.runInNewContext(source, sandbox);
  const readBatch = () => JSON.parse(storage.get('assistenteSiapContentBatch'));
  const writeBatch = batch => storage.set('assistenteSiapContentBatch', JSON.stringify(batch));
  return { subject:sandbox.subject, document, select, options, calendarCell, readBatch, writeBatch };
}

test('a primeira aula confirmada abre a segunda e a data só termina verde', () => {
  const page = makePage();
  const base = { phase:'saving', months:[8], monthIndex:0, currentLabel:'23/09/2026', lessonValues:['1ª Aula','2ª Aula'], lessonIndex:0, completed:0, verifyNotBefore:0 };
  page.writeBatch(base);
  page.subject.resumeContentBatch();
  assert.equal(page.readBatch().lessonIndex, 1);
  assert.equal(page.readBatch().phase, 'day');

  page.subject.resumeContentBatch();
  assert.equal(page.select.value, '2ª Aula');
  assert.equal(page.select.dispatched, true);

  page.options[0].selected = false;
  page.options[1].selected = true;
  page.writeBatch({ ...page.readBatch(), phase:'saving', verifyNotBefore:0 });
  page.subject.resumeContentBatch();
  assert.equal(page.readBatch().phase, 'retry-wait');
  assert.equal(page.readBatch().lessonIndex, 0);
  assert.equal(page.readBatch().dayAttempts, 1);

  page.calendarCell.executed = true;
  page.writeBatch({ ...page.readBatch(), phase:'saving', lessonIndex:1, verifyNotBefore:0 });
  page.subject.resumeContentBatch();
  assert.equal(page.readBatch().phase, 'month');
  assert.equal(page.readBatch().completed, 2);
  assert.deepEqual(page.readBatch().processedDays, ['8|23/09/2026']);
});

test('último uso gratuito conclui o lote já autorizado sem liberar outro', () => {
  const page=makePage();
  page.subject.setLicense({active:false,mode:'external',status:'free',freeUses:{content:0,attendance:0,planning:0,pei:0}});
  page.writeBatch({authorized:true,active:true,phase:'saving',months:[8],monthIndex:0,currentLabel:'23/09/2026',lessonValues:['1ª Aula','2ª Aula'],lessonIndex:0,completed:0,verifyNotBefore:0});
  assert.equal(page.subject.finishingAuthorizedFreeWork(),true);
  page.subject.resumeContentBatch();
  assert.equal(page.readBatch().lessonIndex,1);
  page.writeBatch({...page.readBatch(),authorized:false});
  assert.equal(page.subject.finishingAuthorizedFreeWork(),false);
});

test('a leitura da frequência soma as duas colunas de aula', () => {
  const page = makePage();
  const names = ['1. ANA', '2. BRUNO'].map(text => ({
    querySelector(selector) { return selector === '.aluno' ? { textContent:text } : null; }
  }));
  const lists = [
    ['•', 'F'],
    ['F', '•']
  ].map(values => ({ querySelectorAll() { return values.map(textContent => ({ textContent })); } }));
  page.document.querySelectorAll = selector => selector.includes('.listaDeAlunos') ? names : selector.includes('.listaDeFrequencias') ? lists : [];
  const rows = page.subject.readAttendanceStudents();
  assert.equal(rows.length, 2);
  assert.deepEqual({ present:rows[0].present, absent:rows[0].absent, total:rows[0].total }, { present:1, absent:1, total:2 });
  assert.deepEqual({ present:rows[1].present, absent:rows[1].absent, total:rows[1].total }, { present:1, absent:1, total:2 });
});

test('uma data laranja com aula planejada e não executada continua pendente', () => {
  const page = makePage();
  page.calendarCell.orange = true;
  assert.equal(page.subject.readCalendarDays()[0].state, 'pending');
});

test('a data sem confirmação verde pausa após cinco tentativas', () => {
  const page = makePage();
  page.select.value = '2ª Aula';
  page.options[0].selected = false;
  page.options[1].selected = true;
  page.writeBatch({ phase:'saving', months:[8], monthIndex:0, currentLabel:'23/09/2026', lessonValues:['1ª Aula','2ª Aula'], lessonIndex:1, completed:1, dayAttempts:4, verifyNotBefore:0 });
  page.subject.resumeContentBatch();
  assert.equal(page.readBatch().paused, true);
  assert.equal(page.readBatch().dayAttempts, 5);
});
