const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'cepi-workspace.js'), 'utf8');
const start = source.indexOf('  async function printTest(id) {');
const end = source.indexOf('  function renderHeader()', start);
assert.ok(start >= 0 && end > start, 'Rotina de impressão não encontrada');

function setup({coordinator = true, complete = true, header = true} = {}) {
  let printed = false;
  let html = '';
  let message = '';
  let popupCount = 0;
  let headerFormOpened = false;
  const printButton = {};
  const exam = {id:'prova-1',title:'BLOCO 1 - PORTUGUÊS',question_count:2};
  const rows = [
    {test_id:exam.id,number:1,subject:'Português',statement:'Leia o texto.',alternatives:{A:'Casa',B:'Escola'},correct_answer:'RESPOSTA_SIGILOSA_1'},
    {test_id:exam.id,number:2,subject:'Português',statement:'Escolha a ideia principal.',alternatives:{A:'Ideia A',B:'Ideia B'},correct_answer:'RESPOSTA_SIGILOSA_2'}
  ];
  const popup = {
    document:{images:[],write(value){html=value;},close(){},getElementById:()=>printButton},
    focus(){},print(){printed=true;}
  };
  const context = {
    manager:()=>coordinator,ensureContext:()=>true,tests:[exam],questions:complete?rows:rows.slice(0,1),
    examHeader:header?{school_name:'Escola Exemplo',state_name:'Estado Exemplo',school_logo_data:'data:image/png;base64,ESCOLA',state_logo_data:'data:image/png;base64,ESTADO'}:null,schoolId:'escola-1',
    headerForm:()=>{headerFormOpened=true;},
    message:value=>{message=value;},esc:value=>String(value ?? ''),
    rich:()=>({render:value=>`<p>${value}</p>`,hydrate:async()=>{}}),db:{},
    window:{open:()=>{popupCount++;return popup;}},Promise
  };
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.printTest = printTest;',context);
  return {print:()=>context.printTest(exam.id),clickPrint:()=>printButton.onclick(),result:()=>({printed,html,message,popupCount,headerFormOpened})};
}

test('a prova do aluno inclui questões e alternativas sem o gabarito interno',async()=>{
  const fixture=setup();
  await fixture.print();
  const result=fixture.result();
  assert.equal(result.popupCount,1);
  assert.equal(result.printed,true);
  assert.match(result.html,/Prévia da prova do aluno/);
  fixture.clickPrint();
  assert.equal(fixture.result().printed,true);
  assert.match(result.html,/Leia o texto/);
  assert.match(result.html,/A\) Casa/);
  assert.match(result.html,/B\) Escola/);
  assert.match(result.html,/\.logo-school\{width:26mm;height:26mm/);
  assert.match(result.html,/\.logo-state\{width:55mm;height:26mm/);
  assert.match(result.html,/@page\{margin:18mm\}@media print\{body\{margin:0\}/);
  assert.doesNotMatch(result.html,/\.question\{break-inside:avoid/);
  assert.doesNotMatch(result.html,/\.brand-row\{[^}]*padding-right/);
  assert.ok(result.html.indexOf('base64,ESCOLA') < result.html.indexOf('base64,ESTADO'));
  assert.ok(result.html.indexOf('base64,ESTADO') < result.html.indexOf('Escola Exemplo'));
  assert.doesNotMatch(result.html,/RESPOSTA_SIGILOSA|Gabarito interno|correct_answer/);
});

test('a impressão fica restrita à coordenação e à prova completa',async()=>{
  const professor=setup({coordinator:false});
  await professor.print();
  assert.equal(professor.result().popupCount,0);

  const incompleta=setup({complete:false});
  await incompleta.print();
  assert.equal(incompleta.result().popupCount,0);
  assert.match(incompleta.result().message,/Complete a quantidade/);
});

test('sem cabeçalho, o botão abre a configuração antes da impressão',async()=>{
  const fixture=setup({header:false});
  await fixture.print();
  assert.equal(fixture.result().popupCount,0);
  assert.equal(fixture.result().headerFormOpened,true);
  assert.match(fixture.result().message,/Configure o cabeçalho/);
});
