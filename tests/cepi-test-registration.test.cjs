const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {JSDOM, VirtualConsole} = require('../services/siap-exam/node_modules/jsdom');

async function fixture(query) {
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
  await waitFor(() => dom.window.document.getElementById('cepiTestForm'));
  return {dom, waitFor, errors};
}

test('cadastrar prova abre o cadastro de questões e confirma o salvamento', async () => {
  const {dom, waitFor, errors} = await fixture('manager=1');
  try {
    assert.equal(dom.window.document.querySelector('#cepiTestForm [name="status"]'), null);
    dom.window.document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => dom.window.document.getElementById('cepiQuestionForm'));
    assert.match(dom.window.document.getElementById('cepiWorkspaceMessage').textContent, /Prova cadastrada/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('etapa sugere o formato das alternativas e permite escolha manual', async () => {
  const {dom, errors} = await fixture('');
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

test('falha do serviço aparece junto ao botão e permite nova tentativa', async () => {
  const {dom, waitFor, errors} = await fixture('testSaveError=1');
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
  const {dom, waitFor, errors} = await fixture('');
  try {
    const document = dom.window.document;
    document.querySelectorAll('#cepiClassOptions input').forEach(input => { input.checked = false; });
    document.getElementById('cepiTestForm').requestSubmit();
    await waitFor(() => /Selecione ao menos uma turma ativa/.test(document.getElementById('cepiTestSaveStatus')?.textContent || ''));
    assert.ok(document.getElementById('cepiTestForm'));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
