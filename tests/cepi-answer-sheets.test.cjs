const {test} = require('node:test');
const assert = require('node:assert/strict');
const sheets = require('../cepi-answer-sheets.js');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');

function fixture(count=15, alphabet='ABCDE') {
  const exam={id:'exam-1',title:'BLOCO 1 - PORTUGUÊS',question_count:count,answer_format:alphabet};
  const questions=Array.from({length:count},(_,i)=>({test_id:exam.id,number:i+1,correct_answer:alphabet[i%alphabet.length]}));
  return {exam,questions};
}

for (const count of [15,20,30]) test(`cartão do aluno imprime exatamente ${count} questões sem revelar o gabarito`,()=>{
  const {exam,questions}=fixture(count);
  const html=sheets.studentHtml(sheets.prepare(exam,questions),'Escola Exemplo',4);
  assert.equal((html.match(/class="student-card"/g)||[]).length,4);
  assert.equal((html.match(/class="answer-row"/g)||[]).length,count*4);
  assert.equal((html.match(/class="bubble"/g)||[]).length,count*5*4);
  assert.doesNotMatch(html,/bubble filled|GABARITO OFICIAL/);
  assert.match(html,/Assinatura:/);
  assert.match(html,/@page\{size:A4;margin:0/);
});

test('quantidade solicitada é exata e ocupa até quatro cartões por folha',()=>{
  const {exam,questions}=fixture(20);
  const html=sheets.studentHtml(sheets.prepare(exam,questions),'Escola Exemplo',7);
  assert.equal((html.match(/class="card-page"/g)||[]).length,2);
  assert.equal((html.match(/class="student-card"/g)||[]).length,7);
});

test('gabarito oficial usa as respostas salvas, na ordem, com acesso separado',()=>{
  const {exam,questions}=fixture(15);
  const html=sheets.officialHtml(sheets.prepare(exam,questions),'Escola Exemplo');
  assert.equal((html.match(/bubble filled/g)||[]).length,15);
  assert.match(html,/GABARITO OFICIAL/);
});

test('cartão não é impresso com questão ausente, repetida ou gabarito inválido',()=>{
  const {exam,questions}=fixture();
  assert.throws(()=>sheets.prepare(exam,questions.slice(1)),/Complete/);
  assert.throws(()=>sheets.prepare(exam,questions.map((q,i)=>({...q,number:i===1?1:q.number}))),/Complete/);
  assert.throws(()=>sheets.prepare(exam,questions.map((q,i)=>({...q,correct_answer:i===0?'Z':q.correct_answer}))),/Complete/);
});
test('todos os doze blocos usam as matérias e quantidades já configuradas no Carômetro',()=>{
  const context=vm.createContext({window:{}});
  vm.runInContext(readFileSync(require('node:path').join(__dirname,'..','cepi-blocks.js'),'utf8'),context);
  for(const stage of ['fundamental_ii','medio'])for(let block=1;block<=6;block++){
    const plan=context.window.CepiBlocks.plan(stage,block);
    const count=plan.reduce((sum,item)=>sum+item.count,0);
    const exam={id:`${stage}-${block}`,title:`BLOCO ${block}`,kind:'bloco',stage,block_number:block,question_count:count,subject_plan:plan,answer_format:'ABCDE'};
    const questions=plan.flatMap(item=>Array.from({length:item.count},()=>({test_id:exam.id,subject:item.subject,correct_answer:'A'}))).map((item,index)=>({...item,number:index+1}));
    const prepared=sheets.prepare(exam,questions),card=sheets.studentHtml(prepared,'Escola Exemplo',4);
    assert.equal(prepared.answers.length,count);
    assert.equal((card.match(/class="answer-row"/g)||[]).length,count*4);
    for(const item of plan)assert.match(card,new RegExp(`${item.subject}: ${item.count}`));
  }
});

test('bloco 5 do Ensino Médio usa as 15 questões de Física e 15 de Química configuradas',()=>{
  const context=vm.createContext({window:{}});
  vm.runInContext(readFileSync(require('node:path').join(__dirname,'..','cepi-blocks.js'),'utf8'),context);
  const plan=context.window.CepiBlocks.plan('medio',5);
  assert.deepEqual(Array.from(plan, item=>[item.subject,item.count]),[['Física',15],['Química',15]]);
  const exam={id:'medio-5',title:'BLOCO 5',kind:'bloco',question_count:30,subject_plan:plan,answer_format:'ABCDE'};
  const questions=plan.flatMap(item=>Array.from({length:item.count},()=>({test_id:exam.id,subject:item.subject,correct_answer:'A'}))).map((item,index)=>({...item,number:index+1}));
  const card=sheets.studentHtml(sheets.prepare(exam,questions),'Escola Exemplo',4);
  assert.match(card,/Física: 15 · Química: 15/);
  assert.throws(()=>sheets.prepare(exam,questions.map((item,index)=>index===29?{...item,subject:'Física'}:item)),/divisão/);
  assert.throws(()=>sheets.prepare({...exam,subject_plan:[]},questions),/divisão/);
});
