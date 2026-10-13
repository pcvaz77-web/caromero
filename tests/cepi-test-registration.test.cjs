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
    url: `${pathToFileURL(file).href}?form=1${query ? `&${query}` : ''}`,
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
    dom.window.document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => dom.window.document.querySelectorAll('.cepi-workspace-list > article').length === 2);
    assert.match(dom.window.document.getElementById('cepiWorkspaceMessage').textContent, /Prova cadastrada/);
    assert.equal(dom.window.document.getElementById('cepiQuestionForm'), null);
    assert.deepEqual(errors, []);
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
