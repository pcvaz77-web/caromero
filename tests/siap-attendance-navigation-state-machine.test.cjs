const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'background.js'),
  'utf8'
);

let listener;
let currentDate = '03/08/2026';
let pageToken = 'page-1';
let returnTransientNull = true;
const snapshots = {
  '03/08/2026': [
    { date:'03/08/2026', lesson:'1', registration:'A1', name:'ALUNA UM', absent:false, blocked:false },
    { date:'03/08/2026', lesson:'1', registration:'A2', name:'ALUNO DOIS', absent:true, blocked:false }
  ],
  '05/08/2026': [
    { date:'05/08/2026', lesson:'1', registration:'A1', name:'ALUNA UM', absent:false, blocked:false },
    { date:'05/08/2026', lesson:'1', registration:'A2', name:'ALUNO DOIS', absent:false, blocked:false }
  ]
};

const snapshot = () => ({
  pageToken,
  context:{ year:'2026', className:'6D', shift:'Vespertino', subject:'Educação Física', term:'3º Bimestre' },
  month:'Agosto',
  monthNumber:8,
  registeredDays:[3, 5],
  selectedDate:currentDate,
  entries:snapshots[currentDate]
});
const serialized = value => [{ result:JSON.stringify({ value }) }];

const chrome = {
  runtime:{
    onMessage:{ addListener(callback) { listener = callback; } }
  },
  tabs:{
    query(_query, callback) {
      callback([{ id:7, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx' }]);
    },
    get() { return Promise.resolve({ id:7, url:'https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx', status:'complete' }); }
  },
  scripting:{
    executeScript(details) {
      if (details.files) return Promise.resolve([{ result:true }]);
      const [method, args] = details.args;
      if (method === '__carometroAttendanceSnapshot' || method === '__carometroAttendancePosition') {
        if (returnTransientNull) {
          returnTransientNull = false;
          return Promise.resolve(serialized(null));
        }
        return Promise.resolve(serialized(snapshot()));
      }
      if (method === '__carometroPageToken') return Promise.resolve(serialized(pageToken));
      if (method === '__carometroSelectRegisteredDay') {
        setTimeout(() => {
          currentDate = `${String(args[0]).padStart(2, '0')}/08/2026`;
          pageToken = `page-${Number(pageToken.slice(5)) + 1}`;
        }, 20);
        return Promise.reject(new Error('Execution context was destroyed by navigation'));
      }
      if (method === '__carometroSelectMonth') return Promise.resolve(serialized(true));
      throw new Error(`Método inesperado: ${method}`);
    }
  }
};

vm.runInNewContext(source, { chrome, setTimeout, clearTimeout, Date, URL, Map, Set, Math, String, Error, Promise });
assert.equal(typeof listener, 'function');

const response = new Promise(resolve => {
  const keptOpen = listener(
    {
      type:'CM_ATTENDANCE_REQUEST',
      request:{
        composition:'Ensino Fundamental de 6º ao 9º Ano',
        grade:'6º Ano',
        className:'6D',
        shift:'Vespertino',
        subject:'Educação Física',
        term:'3º Bimestre',
        months:['Agosto']
      }
    },
    { tab:{ url:'https://sistemacarometro.com.br/' } },
    resolve
  );
  assert.equal(keptOpen, true);
});

response.then(result => {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.result.lessons, 2);
  assert.equal(result.result.students.length, 2);
  assert.equal(result.result.students.find(student => student.registration === 'A1').percentage, 100);
  assert.equal(result.result.students.find(student => student.registration === 'A2').percentage, 50);
  assert.equal(currentDate, '03/08/2026', 'a data original deve ser restaurada');
  console.log('Máquina de estados: postback, retomada, agregação e restauração aprovados.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
