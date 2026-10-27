const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'cepi-workspace.js'), 'utf8');
const blocksContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'cepi-blocks.js'), 'utf8'), blocksContext);
const helperStart = source.indexOf('  const schoolHeaderExtra =');
const helperEnd = source.indexOf('  const legacyRich =', helperStart);
const lockStart = source.indexOf('  async function lockQuestionEditingForPrint(test,popup) {');
const start = source.indexOf('  async function printTest(id) {');
const end = source.indexOf('  function renderHeader()', start);
assert.ok(helperStart >= 0 && helperEnd > helperStart && lockStart >= 0 && start > lockStart && end > start, 'Rotina de impressão não encontrada');

function setup({coordinator = true, complete = true, header = true, mixedSubjects = false, applicationDate = null, headerSubtitle = '', headerInstructions = null} = {}) {
  let printed = false;
  let html = '';
  let message = '';
  let popupCount = 0;
  let headerFormOpened = false;
  const printButton = {};
  const exam = {id:'prova-1',title:'BLOCO 1 - PORTUGUÊS',kind:'simulado',question_count:2,scheduled_on:applicationDate};
  const rows = [
    {test_id:exam.id,number:1,subject:'Português',statement:'Leia o texto.',alternatives:{A:'Casa',B:'Escola'},correct_answer:'RESPOSTA_SIGILOSA_1'},
    {test_id:exam.id,number:2,subject:mixedSubjects?'Ciências':'Português',statement:'Escolha a ideia principal.',alternatives:{A:'Ideia A',B:'Ideia B'},correct_answer:'RESPOSTA_SIGILOSA_2'}
  ];
  const popup = {
    document:{images:[],write(value){html=value;},close(){},getElementById:()=>printButton},
    focus(){},close(){},print(){printed=true;}
  };
  const context = {
    manager:()=>coordinator,ensureContext:()=>true,tests:[exam],questions:complete?rows:rows.slice(0,1),
    examHeader:header?{school_name:'Escola Exemplo',state_name:'Estado Exemplo',subtitle:headerSubtitle,instructions:headerInstructions,school_logo_data:'data:image/png;base64,ESCOLA',state_logo_data:'data:image/png;base64,ESTADO'}:null,schoolId:'escola-1',
    headerForm:()=>{headerFormOpened=true;},
    message:value=>{message=value;},esc:value=>String(value ?? ''),displayTitle:value=>value,
    rich:()=>({render:value=>`<p>${value}</p>`,hydrate:async()=>{}}),db:{},
    window:{CepiAnswerSheets:require('../cepi-answer-sheets.js'),CepiBlocks:blocksContext.window.CepiBlocks,open:()=>{popupCount++;return popup;}},Promise
  };
  vm.runInNewContext(source.slice(helperStart,helperEnd)+source.slice(lockStart,source.indexOf('  async function printAnswerSheet(',lockStart))+source.slice(start,end)+'\nglobalThis.printTest = printTest;',context);
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
  assert.match(result.html,/<strong class="question-number">QUESTÃO 1<\/strong>/);
  assert.match(result.html,/<strong class="question-number">QUESTÃO 2<\/strong>/);
  assert.doesNotMatch(result.html,/class="question-subject"/);
  assert.doesNotMatch(result.html,/<b>\d+\. Português<\/b>/);
  assert.match(result.html,/\.logo-school\{width:26mm;height:26mm/);
  assert.match(result.html,/\.logo-state\{width:55mm;height:26mm/);
  assert.match(result.html,/@page\{margin:18mm\}@media print\{body\{margin:0\}/);
  assert.match(result.html,/<main class="questions">[\s\S]*<\/main>/);
  assert.doesNotMatch(result.html,/\.brand-row\{[^}]*padding-right/);
  assert.ok(result.html.indexOf('base64,ESCOLA') < result.html.indexOf('base64,ESTADO'));
  assert.ok(result.html.indexOf('base64,ESTADO') < result.html.indexOf('Escola Exemplo'));
  assert.doesNotMatch(result.html,/RESPOSTA_SIGILOSA|Gabarito interno|correct_answer/);
  assert.doesNotMatch(result.html,/Data:/);
  assert.match(result.html,/Esta avaliação é composta por 2 questões, assim distribuídas: 2 questões de Português/);
});

test('texto antigo com quantidade fixa não contamina outras provas',async()=>{
  const fixture=setup({headerSubtitle:'Esta avaliação é composta por 15 questões de Língua Portuguesa.'});
  await fixture.print();
  assert.doesNotMatch(fixture.result().html,/15 questões de Língua Portuguesa/);
  assert.match(fixture.result().html,/2 questões de Português/);
});

test('a orientação final editada aparece após a composição automática',async()=>{
  const fixture=setup({headerInstructions:'Confira suas respostas antes de entregar.'});
  await fixture.print();
  assert.match(fixture.result().html,/2 questões de Português\. Confira suas respostas antes de entregar\./);
  assert.doesNotMatch(fixture.result().html,/Boa prova!/);
});

test('a data escolhida fica impressa no cabeçalho da prova',async()=>{
  const fixture=setup({applicationDate:'2026-10-26'});
  await fixture.print();
  assert.match(fixture.result().html,/<span class="meta-field date-fixed">Data: 26\/10\/2026<\/span>/);
});

test('bloco com disciplinas diferentes mostra cada componente só no início da seção',async()=>{
  const fixture=setup({mixedSubjects:true});
  await fixture.print();
  const html=fixture.result().html;
  assert.equal((html.match(/class="question-subject"/g)||[]).length,2);
  assert.match(html,/<div class="question-subject">Português<\/div><strong class="question-number">QUESTÃO 1<\/strong>/);
  assert.match(html,/<div class="question-subject">Ciências<\/div><strong class="question-number">QUESTÃO 2<\/strong>/);
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
