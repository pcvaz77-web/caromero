const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'background.js'),
  'utf8'
).replace('const ATTEMPT_TIMEOUT_MS = 10000;', 'const ATTEMPT_TIMEOUT_MS = 60;');

let listener;
let pageToken = 'august-page';
let month = 'Agosto';
let selectedDate = '02/08/2026';
let registeredDays = [2];
let clickedDayTwoInJune = false;
let juneAttempts = 0;

const snapshot = () => ({
  pageToken,
  context:{ year:'2026', className:'6D', shift:'Vespertino', subject:'Educação Física', term:'3º Bimestre' },
  month,
  monthNumber:month === 'Junho' ? 6 : 8,
  registeredDays,
  selectedDate,
  entries:[{ date:selectedDate, lesson:'1', registration:'A1', name:'ALUNA UM', absent:false, blocked:false }]
});
const serialized = value => [{ result:JSON.stringify({ value }) }];

const chrome = {
  runtime:{ onMessage:{ addListener(callback) { listener = callback; } } },
  tabs:{
    query(_query, callback) { callback([{ id:11, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx' }]); },
    get() { return Promise.resolve({ id:11, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx', status:'complete' }); }
  },
  scripting:{
    executeScript(details) {
      if (details.files) return Promise.resolve([{ result:true }]);
      const [method, args] = details.args;
      if (method === '__carometroAttendanceSnapshot' || method === '__carometroAttendancePosition') return Promise.resolve(serialized(snapshot()));
      if (method === '__carometroPageToken') return Promise.resolve(serialized(pageToken));
      if (method === '__carometroSelectMonth') {
        const target = args[0];
        if (target === 'Junho' && ++juneAttempts === 1) {
          return Promise.resolve(serialized(true)); // o SIAP ignorou o primeiro clique
        }
        // Estado intermediário real: o select muda agora, mas calendário/token
        // continuam pertencendo ao documento anterior até o postback terminar.
        month = target;
        setTimeout(() => {
          pageToken = target === 'Junho' ? 'june-page' : 'august-restored-page';
          registeredDays = target === 'Junho' ? [1] : [2];
          selectedDate = target === 'Junho' ? '01/06/2026' : '02/08/2026';
        }, 20);
        return Promise.reject(new Error('Execution context was destroyed by navigation'));
      }
      if (method === '__carometroSelectRegisteredDay') {
        if (month === 'Junho' && args[0] === 2) clickedDayTwoInJune = true;
        return Promise.resolve(serialized(true));
      }
      throw new Error(`Método inesperado: ${method}`);
    }
  }
};

vm.runInNewContext(source, { chrome, setTimeout, clearTimeout, Date, URL, Map, Set, Math, String, Error, Promise });
const response = new Promise(resolve => {
  listener(
    {
      type:'CM_ATTENDANCE_REQUEST',
      request:{
        composition:'Ensino Fundamental de 6º ao 9º Ano', grade:'6º Ano', className:'6D',
        shift:'Vespertino', subject:'Educação Física', term:'3º Bimestre', months:['Junho']
      }
    },
    { tab:{ url:'https://sistemacarometro.com.br/' } },
    resolve
  );
});

response.then(result => {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(clickedDayTwoInJune, false, 'não pode reutilizar o dia 2 do calendário de agosto como 02/06');
  assert.equal(juneAttempts, 2, 'deve repetir a troca de mês quando o SIAP ignora a primeira tentativa');
  assert.equal(result.result.months[0], 'Junho');
  console.log('Troca de mês: estado intermediário descartado e calendário novo confirmado.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
