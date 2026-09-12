const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'background.js'),
  'utf8'
);
let listener;
const loginTab = { id:13, url:'https://siap.educacao.go.gov.br/Login.aspx', status:'complete' };
const chrome = {
  runtime:{ onMessage:{ addListener(callback) { listener = callback; } } },
  tabs:{
    query(_query, callback) { callback([loginTab]); },
    get() { return Promise.resolve(loginTab); }
  },
  scripting:{ executeScript() { throw new Error('não deve injetar código na página de login'); } }
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
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SIAP_LOGIN_REQUIRED');
  assert.match(result.message, /Faça login novamente no SIAP/);
  assert.match(result.message, /Diário do Professor/);
  console.log('Sessão expirada: orientação específica para novo login aprovada.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
