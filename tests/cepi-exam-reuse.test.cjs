const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {JSDOM, VirtualConsole} = require('../services/siap-exam/node_modules/jsdom');
const {splitQuestions} = require('../cepi-exam-import.js');

async function openFixture() {
  const file=path.join(__dirname,'cepi-question-flow-browser.html');
  const errors=[],console=new VirtualConsole();
  console.on('jsdomError',error=>errors.push(error.message));
  const dom=await JSDOM.fromFile(file,{url:`${pathToFileURL(file).href}?reuse=1`,runScripts:'dangerously',resources:'usable',virtualConsole:console});
  const waitFor=async predicate=>{
    for(let attempt=0;attempt<80&&!predicate();attempt++)await new Promise(resolve=>setTimeout(resolve,25));
    assert.ok(predicate(),`Fluxo não avançou: ${errors.join('; ')}`);
  };
  await waitFor(()=>dom.window.document.querySelector('[data-action="duplicate-test"]'));
  return {dom,waitFor,errors};
}

test('separa questões cuja numeração original começa em 21',()=>{
  const result=splitQuestions('Questão 21. Primeiro enunciado\nA) Uma opção\nB) Outra opção\nQuestão 22. Segundo enunciado\nA) Sim\nB) Não\nGABARITO\n21 A\n22 B');
  assert.deepEqual(result.map(item=>[item.number,item.printedNumber]),[[1,21],[2,22]]);
  assert.match(result[1].statement,/Segundo enunciado/);
  assert.doesNotMatch(result[1].statement,/GABARITO/);
});

test('aceita uma prova curta com uma questão identificada',()=>{
  const result=splitQuestions('Questão 8. Qual alternativa está correta?\nA) Sim\nB) Não');
  assert.deepEqual(result.map(item=>[item.number,item.printedNumber]),[[1,8]]);
});

test('reutilizar prova cria rascunho editável sem alterar a origem',async()=>{
  const {dom,waitFor,errors}=await openFixture();
  try{
    const document=dom.window.document;
    document.querySelector('[data-action="duplicate-test"]').click();
    await waitFor(()=>document.getElementById('cepiDuplicateForm'));
    document.getElementById('cepiDuplicateForm').requestSubmit();
    await waitFor(()=>/Cópia criada/.test(document.getElementById('cepiWorkspaceMessage').textContent));
    assert.match(document.getElementById('cepiWorkspaceMessage').textContent,/Cópia criada/);
    assert.ok(document.getElementById('cepiQuestionBack'));
    const records=dom.window.eval('rows.cepi_tests');
    assert.equal(records.length,2);
    assert.equal(records[0].id,'33333333-3333-4333-8333-333333333333');
    assert.equal(records[0].title,'BLOCO 1 - PORTUGUÊS - FUNDAMENTAL - 3º BIM');
    assert.equal(records[1].status,'draft');
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

test('importar texto revisado cria a prova com gabarito informado',async()=>{
  const {dom,waitFor,errors}=await openFixture();
  try{
    const document=dom.window.document;
    assert.ok(document.querySelector('.cepi-import-entry #cepiImportExam'));
    document.getElementById('cepiImportExam').click();
    await waitFor(()=>document.getElementById('cepiExamImportForm'));
    const importForm=document.getElementById('cepiExamImportForm');
    assert.equal(importForm.elements.answer_format.value,'ABCD');
    importForm.elements.stage.value='medio';
    importForm.elements.stage.dispatchEvent(new dom.window.Event('change'));
    assert.equal(importForm.elements.answer_format.value,'ABCDE');
    importForm.elements.stage.value='fundamental_ii';
    importForm.elements.stage.dispatchEvent(new dom.window.Event('change'));
    assert.equal(importForm.elements.answer_format.value,'ABCD');
    document.getElementById('cepiExamImportRaw').value='1. Qual alternativa está correta?\nA) Primeira\nB) Segunda\n2. Escolha a resposta.\nA) Sim\nB) Não';
    document.getElementById('cepiExamImportParse').click();
    assert.equal(document.querySelectorAll('[data-import-question]').length,2);
    document.querySelector('[name="default_subject"]').value='Arte';
    document.getElementById('cepiImportApplySubject').click();
    document.querySelectorAll('[data-answer]')[0].value='B';
    document.querySelectorAll('[data-answer]')[1].value='A';
    document.getElementById('cepiExamImportForm').requestSubmit();
    await waitFor(()=>/Prova importada/.test(document.getElementById('cepiWorkspaceMessage').textContent));
    assert.ok(document.getElementById('cepiQuestionBack'));
    assert.deepEqual(dom.window.eval('rows.cepi_test_questions.filter(item=>item.test_id==="33333333-3333-4333-8333-333333333336").map(item=>item.correct_answer)').join(''),'BA');
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

test('remove arquivo selecionado, limpa a extração e aceita outro arquivo',async()=>{
  const {dom,waitFor,errors}=await openFixture();
  try{
    const document=dom.window.document;
    document.getElementById('cepiImportExam').click();
    const input=document.getElementById('cepiExamImportFile');
    let selected=[];
    Object.defineProperty(input,'files',{configurable:true,get:()=>selected});
    Object.defineProperty(input,'value',{configurable:true,get:()=>selected[0]?.name||'',set:value=>{if(!value)selected=[];}});
    dom.window.CepiExamImport.extractText=async file=>`1. Texto de ${file.name}\nA) Sim\nB) Não`;
    selected=[new dom.window.File(['a'],'primeira.txt',{type:'text/plain'})];
    input.dispatchEvent(new dom.window.Event('change'));
    await waitFor(()=>document.getElementById('cepiExamImportRaw').value.includes('primeira.txt'));
    document.getElementById('cepiExamImportParse').click();
    assert.equal(document.querySelectorAll('[data-import-question]').length,1);
    document.getElementById('cepiImportRemoveFile').click();
    assert.equal(document.getElementById('cepiExamImportRaw').value,'');
    assert.equal(document.querySelectorAll('[data-import-question]').length,0);
    assert.equal(document.getElementById('cepiImportFileName').textContent,'Nenhum arquivo selecionado');
    selected=[new dom.window.File(['b'],'segunda.txt',{type:'text/plain'})];
    input.dispatchEvent(new dom.window.Event('change'));
    await waitFor(()=>document.getElementById('cepiExamImportRaw').value.includes('segunda.txt'));
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});
