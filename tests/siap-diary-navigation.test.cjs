const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'background.js'),
  'utf8'
);
const request = {
  composition:'Ensino Fundamental de 6º ao 9º Ano',
  grade:'6º Ano',
  className:'6D',
  shift:'Vespertino',
  subject:'Educação Física',
  term:'3º Bimestre',
  months:['Agosto']
};
let listener;
let url = 'https://siap.educacao.go.gov.br/DiarioEscolarListagem.aspx';
let rows = [];
let selected = false;
let pageToken = 'diary-1';
const matchingRow = {
  year:'2026', term:'3º Bimestre', composition:'199 - Ensino Fundamental de 6º ao 9º Ano',
  grade:'6º Ano', shift:'Vespertino', subject:'55 - EDUCAÇÃO FÍSICA', className:'6D'
};
const serialized = value => [{ result:JSON.stringify({ value }) }];

const chrome = {
  runtime:{ onMessage:{ addListener(callback) { listener = callback; } } },
  tabs:{
    query(_query, callback) { callback([{ id:9, url, status:'complete' }]); },
    get() { return Promise.resolve({ id:9, url, status:'complete' }); },
    update(_id, change) { url = change.url; return Promise.resolve({ id:9, url, status:'complete' }); }
  },
  scripting:{
    executeScript(details) {
      if (details.files) return Promise.resolve([{ result:true }]);
      const [method] = details.args;
      if (method === '__carometroDiarySnapshot') {
        return Promise.resolve(serialized({
          pageToken,
          composition:'199 - Ensino Fundamental de 6º ao 9º Ano',
          grade:'6º Ano', term:'3º Bimestre', shift:'Vespertino', subject:'55 - EDUCAÇÃO FÍSICA',
          compositions:['Selecione','199 - Ensino Fundamental de 6º ao 9º Ano'],
          grades:['Selecione','6º Ano'],
          rows:rows.map(row => ({ ...row, selected }))
        }));
      }
      if (method === '__carometroListDiary') {
        setTimeout(() => { rows = [matchingRow]; pageToken = 'diary-2'; }, 20);
        return Promise.reject(new Error('Execution context was destroyed by navigation'));
      }
      if (method === '__carometroSelectDiaryRow') {
        setTimeout(() => { selected = true; pageToken = 'diary-3'; }, 20);
        return Promise.reject(new Error('Execution context was destroyed by navigation'));
      }
      if (method === '__carometroOpenFrequency') {
        setTimeout(() => { url = 'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx'; pageToken = 'frequency-1'; }, 20);
        return Promise.reject(new Error('Execution context was destroyed by navigation'));
      }
      if (method === '__carometroAttendanceSnapshot') {
        return Promise.resolve(serialized({
          pageToken,
          context:{ year:'2026', className:'6D', shift:'Vespertino', subject:'Educação Física', term:'3º Bimestre' },
          month:'Agosto', monthNumber:8, registeredDays:[3], selectedDate:'03/08/2026',
          entries:[{ date:'03/08/2026', lesson:'1', registration:'A1', name:'ALUNA UM', absent:false, blocked:false }]
        }));
      }
      throw new Error(`Método inesperado: ${method}`);
    }
  }
};

vm.runInNewContext(source, { chrome, setTimeout, clearTimeout, Date, URL, Map, Set, Math, String, Error, Promise });
const response = new Promise(resolve => {
  assert.equal(listener(
    { type:'CM_ATTENDANCE_REQUEST', request },
    { tab:{ url:'https://sistemacarometro.com.br/' } },
    resolve
  ), true);
});

response.then(result => {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.result.lessons, 1);
  assert.equal(result.result.students[0].percentage, 100);
  assert.match(url, /FrequenciaAlunoEdicao\.aspx/);
  assert.equal(selected, true);
  console.log('Navegação Diário → turma → Frequência aprovada.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
