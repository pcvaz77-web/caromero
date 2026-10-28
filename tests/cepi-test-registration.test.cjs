const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {JSDOM, VirtualConsole} = require('../services/siap-exam/node_modules/jsdom');

async function fixture(query, formExpected = true) {
  const file = path.join(__dirname, 'cepi-question-flow-browser.html');
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = await JSDOM.fromFile(file, {
    url: `${pathToFileURL(file).href}?${formExpected?'form=1&':''}${query}`,
    runScripts: 'dangerously', resources: 'usable', virtualConsole: console
  });
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 80 && !predicate(); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(predicate(), `O fluxo não avançou. Erros: ${errors.join('; ')}`);
  };
  await waitFor(() => formExpected ? dom.window.document.getElementById('cepiTestForm') : dom.window.document.querySelector('.cepi-workspace-list'));
  return {dom, waitFor, errors};
}

test('coordenação cadastra a prova e a deixa disponível para os professores', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1');
  try {
    assert.equal(dom.window.document.querySelector('#cepiTestForm [name="status"]'), null);
    dom.window.document.querySelector('#cepiTestForm [data-cepi-person-id]').click();
    dom.window.document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => dom.window.document.querySelectorAll('.cepi-workspace-list > article').length === 2);
    assert.match(dom.window.document.getElementById('cepiWorkspaceMessage').textContent, /Prova cadastrada/);
    assert.equal(dom.window.document.getElementById('cepiQuestionForm'), null);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('lista suspensa permite escolher professor e coordenador da escola', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1');
  try {
    const document=dom.window.document;
    const picker=document.querySelector('#cepiTestForm .cepi-person-picker');
    assert.ok(picker);
    assert.equal(document.querySelector('#cepiTestForm [name="teachers"]'),null);
    picker.open=true;
    const search=picker.querySelector('input[type="search"]');
    search.value='Coordenação';
    search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(picker.querySelectorAll('[data-cepi-person-id]:not([hidden])').length,1);
    picker.querySelector('[data-cepi-person-id]:not([hidden])').click();
    search.value='';
    search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    picker.querySelector('[data-cepi-person-id]').click();
    assert.match(picker.querySelector('summary').textContent,/2 selecionada/);
    document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(()=>document.querySelectorAll('.cepi-workspace-list > article').length===2);
    const records=dom.window.eval('rows.cepi_tests');
    assert.equal(records[1].assigned_teacher_ids.length,2);
    assert.deepEqual(errors,[]);
  } finally { dom.window.close(); }
});

test('etapa sugere o formato das alternativas e permite escolha manual', async () => {
  const {dom, errors} = await fixture('manager=1');
  try {
    const form=dom.window.document.getElementById('cepiTestForm');
    assert.equal(form.elements.answer_format.value,'ABCD');
    form.elements.stage.value='medio';
    form.elements.stage.dispatchEvent(new dom.window.Event('change'));
    assert.equal(form.elements.answer_format.value,'ABCDE');
    form.elements.answer_format.value='VF';
    assert.equal(form.elements.answer_format.value,'VF');
    form.elements.stage.value='fundamental_ii';
    form.elements.stage.dispatchEvent(new dom.window.Event('change'));
    assert.equal(form.elements.answer_format.value,'ABCD');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('cadastro ENEM usa 3ª série, 45 questões e ano atual sem alterar o simulado comum', async () => {
  const {dom,waitFor,errors}=await fixture('manager=1');
  try{
    const document=dom.window.document,form=document.getElementById('cepiTestForm');
    dom.window.eval("rows.classes.push({id:'55555555-5555-4555-8555-555555555555',school_id:school,name:'3A'})");
    form.elements.kind.value='enem';
    form.elements.kind.dispatchEvent(new dom.window.Event('change'));
    assert.equal(dom.window.document.getElementById('cepiEnemModelField').hidden,false);
    assert.equal(form.elements.question_count.readOnly,false);
    form.elements.enem_model.value='caderno_1';
    form.elements.enem_model.dispatchEvent(new dom.window.Event('change'));
    assert.equal(form.elements.stage.value,'medio');
    assert.equal(form.elements.question_count.value,'45');
    assert.equal(form.elements.answer_format.value,'ABCDE');
    assert.equal(document.querySelectorAll('#cepiClassOptions input').length,1);
    assert.match(document.getElementById('cepiTestIdentity').textContent,/CADERNO 1/);
    form.querySelector('[data-cepi-person-id]').click();
    form.requestSubmit();
    await waitFor(()=>document.querySelectorAll('.cepi-workspace-list > article').length===2);
    const saved=dom.window.eval('rows.cepi_tests[1]');
    assert.equal(saved.question_count,45);
    assert.equal(saved.title,'SIMULADO ENEM - CADERNO 1 - 4º BIM');
    assert.deepEqual(JSON.parse(JSON.stringify(saved.subjects)),['Química','Física','Biologia','História','Geografia','Filosofia','Sociologia']);
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

test('prova bimestral não aparece como opção para novos cadastros', async () => {
  const {dom,errors}=await fixture('manager=1');
  try{
    const options=[...dom.window.document.querySelectorAll('#cepiTestForm [name="kind"] option')];
    assert.deepEqual(options.map(option=>option.textContent),['Prova de Bloco','Simulado comum','Simulado do ENEM']);
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

test('cabeçalho mostra apenas dados fixos e a frase escolhida', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1');
  try {
    const document=dom.window.document;
    document.querySelector('[data-cepi-workspace="cabecalho"]').click();
    await waitFor(()=>document.querySelector('[data-action="edit-header"]'));
    assert.equal(document.getElementById('cepiHeaderPreviewTest'),null);
    document.querySelector('[data-action="edit-header"]').click();
    assert.equal(document.getElementById('cepiHeaderPreviewTest'),null);
    assert.match(document.getElementById('cepiHeaderForm').textContent,/não informe aqui disciplinas nem quantidade/i);
    assert.match(document.getElementById('cepiHeaderForm').textContent,/frase escolhida/i);
    const message=document.getElementById('cepiHeaderInstructions');
    assert.match(message.value,/Leia atentamente cada questão/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('falha do serviço aparece junto ao botão e permite nova tentativa', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1&testSaveError=1');
  try {
    dom.window.document.querySelector('#cepiTestForm [data-cepi-person-id]').click();
    dom.window.document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => /Falha simulada/.test(dom.window.document.getElementById('cepiTestSaveStatus')?.textContent || ''));
    assert.equal(dom.window.document.getElementById('cepiTestSaveStatus').dataset.state, 'error');
    assert.equal(dom.window.document.getElementById('cepiTestSaveButton').disabled, false);
    assert.ok(dom.window.document.getElementById('cepiTestForm'));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('prova sem turma mostra a causa junto ao botão', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1');
  try {
    const document = dom.window.document;
    document.querySelectorAll('#cepiClassOptions input').forEach(input => { input.checked = false; });
    document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => /Selecione ao menos uma turma ativa/.test(document.getElementById('cepiTestSaveStatus')?.textContent || ''));
    assert.ok(document.getElementById('cepiTestForm'));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('professor vê a prova cadastrada e adiciona questões sem cadastrar outra prova', async () => {
  const {dom, errors} = await fixture('', false);
  try {
    const document=dom.window.document;
    assert.ok(document.getElementById('cepiWorkspaceNew').classList.contains('hidden'));
    assert.equal(document.getElementById('cepiImportExam'),null);
    assert.equal(document.querySelector('[data-action="duplicate-test"]'),null);
    assert.equal(document.querySelector('[data-action="edit-test"]'),null);
    document.querySelector('[data-action="questions"]').click();
    assert.ok(document.querySelector('[data-action="new-question"]'));
    assert.ok(document.getElementById('cepiWorkspaceNew').classList.contains('hidden'));
    assert.deepEqual(errors,[]);
  } finally { dom.window.close(); }
});

test('formulário mostra QUESTÃO com o número sem impedir a edição da ordem', async () => {
  const {dom, errors}=await fixture('', false);
  try {
    const document=dom.window.document;
    document.querySelector('[data-action="questions"]').click();
    document.querySelector('[data-action="new-question"]').click();
    const label=document.querySelector('#cepiQuestionForm .cepi-question-number-label');
    assert.equal(label.textContent.trim(),'QUESTÃO');
    assert.equal(label.querySelector('[name="number"]').value,'1');
    assert.deepEqual(errors,[]);
  } finally {dom.window.close();}
});

test('salvar questão da prova também a registra no banco com a disciplina', async () => {
  const {dom,waitFor,errors}=await fixture('',false);
  try {
    const document=dom.window.document;
    document.querySelector('[data-action="questions"]').click();
    document.querySelector('[data-action="new-question"]').click();
    document.getElementById('cepiQuestionEditor').innerHTML='<p>Quanto é 2 + 2?</p><p>A) 3<br>B) 4</p>';
    document.querySelector('#cepiQuestionForm [name="correct_answer"]').value='B';
    document.getElementById('cepiQuestionForm').requestSubmit();
    await waitFor(()=>dom.window.eval('rows.cepi_test_questions.length')===1);
    const bank=dom.window.eval('rows.cepi_question_bank[0]');
    const saved=dom.window.eval('rows.cepi_test_questions[0]');
    assert.equal(bank.subject,'Língua Portuguesa');
    assert.equal(bank.stage,'fundamental_ii');
    assert.equal(bank.correct_answer,'B');
    assert.deepEqual(JSON.parse(JSON.stringify(bank.target_grades)),['6']);
    assert.equal(saved.bank_question_id,bank.id);
    assert.deepEqual(errors,[]);
  } finally {dom.window.close();}
});

test('banco oferece somente anos e séries presentes na escola, sem repetir turmas', async () => {
  const {dom,waitFor,errors}=await fixture('manager=1');
  try{
    const document=dom.window.document;
    document.querySelector('[data-cepi-workspace="banco"]').click();
    await waitFor(()=>!!document.getElementById('cepiWorkspaceNew'));
    document.getElementById('cepiWorkspaceNew').click();
    const form=document.getElementById('cepiBankForm');
    const options=()=>[...form.querySelectorAll('[name="target_grades"]')];
    assert.deepEqual(options().map(input=>input.value),['6','7','8','9']);
    assert.equal(options().filter(input=>input.value==='6').length,1);
    form.elements.stage.value='medio';form.elements.stage.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(options().map(input=>input.value),['medio_1','medio_2','medio_3']);
    form.elements.stage.value='fundamental_ii';form.elements.stage.dispatchEvent(new dom.window.Event('change'));
    options().filter(input=>['6','7'].includes(input.value)).forEach(input=>{input.checked=true;input.dispatchEvent(new dom.window.Event('change'));});
    form.elements.subject.value='Educação Física';
    document.getElementById('cepiBankEditor').innerHTML='<p>Qual é o movimento?</p>';
    form.elements.correct_answer.value='A';
    form.requestSubmit();
    await waitFor(()=>dom.window.eval('rows.cepi_question_bank.length')===1);
    await waitFor(()=>!!document.querySelector('.cepi-question-card'));
    const saved=dom.window.eval('rows.cepi_question_bank[0]');
    assert.deepEqual(JSON.parse(JSON.stringify(saved.target_grades)),['6','7']);
    assert.match(document.querySelector('.cepi-question-card').textContent,/6º ano, 7º ano/);
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
});

test('prova do aluno imprime QUESTÃO 1 e QUESTÃO 2 acima dos enunciados', async () => {
  const {dom, waitFor, errors}=await fixture('manager=1&review=1',false);
  const popup=new JSDOM('',{url:'https://example.test/'});
  try {
    dom.window.open=()=>({document:popup.window.document,focus(){},print(){},close(){},closed:false});
    const document=dom.window.document;
    document.querySelector('[data-action="questions"]').click();
    document.querySelector('[data-action="print-student"]').click();
    await waitFor(()=>popup.window.document.querySelectorAll('.question-number').length===2);
    assert.deepEqual([...popup.window.document.querySelectorAll('.question-number')].map(node=>node.textContent),['QUESTÃO 1','QUESTÃO 2']);
    assert.match(popup.window.document.querySelector('.question').textContent,/QUESTÃO 1Leia o texto/);
    assert.deepEqual(errors,[]);
  } finally {popup.window.close();dom.window.close();}
});

test('questões completas liberam impressão e correção sem confirmação manual', async () => {
  const file = path.join(__dirname, 'cepi-question-flow-browser.html');
  const dom = await JSDOM.fromFile(file, {
    url: `${pathToFileURL(file).href}?review=1&workflow=1`,
    runScripts:'dangerously',resources:'usable'
  });
  try {
    for(let i=0;i<80&&!dom.window.document.body.dataset.workflowResult;i++)
      await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(dom.window.document.body.dataset.workflowResult,'PASS');
  } finally { dom.window.close(); }
});

test('professor pode abrir a correção de uma prova com questões completas', async () => {
  const file = path.join(__dirname, 'cepi-question-flow-browser.html');
  const dom = await JSDOM.fromFile(file, {
    url: `${pathToFileURL(file).href}?correction=1`,
    runScripts:'dangerously',resources:'usable'
  });
  try {
    for(let i=0;i<80&&!dom.window.document.getElementById('cepiCorrectionClass');i++)
      await new Promise(resolve=>setTimeout(resolve,25));
    assert.ok(dom.window.document.getElementById('cepiCorrectionClass'));
    assert.equal(dom.window.document.querySelector('[data-action="print-cards"]'),null);
  } finally { dom.window.close(); }
});

test('coordenação pode excluir e restaurar prova sem perder questões', async () => {
  const {dom,waitFor,errors}=await fixture('manager=1&review=1',false);
  try {
    const document=dom.window.document;
    dom.window.confirm=()=>true;
    document.querySelector('[data-action="delete-test"]').click();
    await waitFor(()=>document.querySelector('[data-action="restore-test"]'));
    assert.equal(document.querySelector('[data-action="questions"]'),null);
    assert.equal(dom.window.eval('rows.cepi_test_questions.length'),2);
    document.querySelector('[data-action="restore-test"]').click();
    await waitFor(()=>document.querySelector('[data-action="questions"]'));
    assert.equal(dom.window.eval('rows.cepi_test_questions.length'),2);
    assert.deepEqual(errors,[]);
  } finally {dom.window.close();}
});

test('questões completas podem ser editadas até a abertura da impressão', async () => {
  const {dom,errors}=await fixture('manager=1&review=1',false);
  try {
    const document=dom.window.document;
    document.querySelector('[data-action="questions"]').click();
    assert.equal(document.querySelector('[data-action="new-question"]'),null);
    assert.ok(document.querySelector('[data-action="edit-question"]'));
    assert.equal(document.querySelector('[data-action="remove-question"]'),null);
    dom.window.eval('rows.cepi_tests[0].print_opened_at="2026-10-13T12:00:00Z"');
    document.getElementById('cepiQuestionBack').click();
    document.querySelector('[data-action="questions"]').click();
    assert.equal(document.querySelector('[data-action="edit-question"]'),null);
    assert.deepEqual(errors,[]);
  } finally {dom.window.close();}
});
