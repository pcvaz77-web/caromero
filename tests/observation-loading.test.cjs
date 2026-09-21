const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../student-edit-improvements.js'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const option = (label = 'Líder de turma') => ({ id: label, label, is_pinned: true, is_top_priority: true });

function harness() {
  let school = null;
  const requests = [];
  const list = { innerHTML: '' };
  const listeners = {};
  const context = vm.createContext({
    window: { getActiveSchoolId: () => school },
    document: {
      getElementById: () => list,
      querySelectorAll: () => [],
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    db: { from(table) {
      assert.equal(table, 'observation_options');
      return {
        select() { return this; }, order() { return this; },
        eq(key, schoolId) {
          assert.equal(key, 'school_id');
          return new Promise((resolve, reject) => requests.push({ schoolId, resolve, reject }));
        },
      };
    } },
    escapeHtml: value => value,
    renderObservationChoices() {}, selectedObservationValues: () => [],
    configureObservationField() {}, syncStudentCardLaudoLabels() {}, paintObservation() {},
    render() { context.renderCount++; }, renderCount: 0,
  });
  vm.runInContext(
    between('  const fallbackObservations =', '  const encodeObservationValues =') +
    between('  const renderCustomObservations =', '  const observationColorClass =') +
    '\nthis.load = loadObservationOptions; this.state = () => ({ loaded:observationOptionsLoaded, labels:observations.map(o=>o.label), pinned:[...pinnedObservationLabels] });', context);
  return { context, requests, list, listeners, school(value) { school = value; } };
}

test('sem escola não memoriza catálogo vazio; carrega e aplica prioridade quando a escola chega', async () => {
  const h = harness();
  assert.equal(await h.context.load(), false);
  assert.equal(h.context.state().loaded, false);
  h.school('A');
  const loading = h.context.load();
  h.requests[0].resolve({ data: [option()] });
  assert.equal(await loading, true);
  assert.match(h.list.innerHTML, /Líder de turma/);
  assert.equal(h.context.state().pinned[0], 'Líder de turma');
  const win = h.context.window;
  assert.equal(win.studentHasTopPriorityObservation('["Líder de turma"]'), true);
  const students = [{ name: 'Ana', report: '' }, { name: 'Zélia', report: '["Líder de turma"]' }];
  students.sort(win.compareStudentsForList);
  assert.equal(students[0].name, 'Zélia');
  assert.equal(h.context.renderCount, 1);
});

test('cargas concorrentes aguardam o mesmo catálogo antes de desenhar alunos', async () => {
  const h = harness(); h.school('A');
  const first = h.context.load(); const second = h.context.load();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ data: [option()] });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  await h.context.load();
  assert.equal(h.requests.length, 1);
});

test('troca de escola descarta resposta atrasada e limpa as etiquetas anteriores', async () => {
  const h = harness(); h.school('A');
  const first = h.context.load();
  h.school('B'); const second = h.context.load();
  h.requests[1].resolve({ data: [option('Etiqueta B')] }); await second;
  h.requests[0].resolve({ data: [option('Etiqueta A')] });
  assert.equal(await first, false);
  assert.match(h.list.innerHTML, /Etiqueta B/);
  assert.doesNotMatch(h.list.innerHTML, /Etiqueta A/);
  assert.equal(h.context.window.studentHasTopPriorityObservation('Etiqueta A'), false);
  h.school(null); await h.context.load();
  assert.equal(h.context.state().pinned.length, 0);
});

test('atualização forçada vence resposta antiga da mesma escola', async () => {
  const h = harness(); h.school('A');
  const old = h.context.load(); const fresh = h.context.load({ force: true });
  h.requests[1].resolve({ data: [option('Atual')] }); await fresh;
  h.requests[0].resolve({ data: [] }); await old;
  assert.match(h.list.innerHTML, /Atual/);
});

for (const failure of ['response', 'network']) {
  test(`erro ${failure} não aparece como lista vazia e permite nova tentativa`, async () => {
    const h = harness(); h.school('A');
    const first = h.context.load();
    if (failure === 'network') h.requests[0].reject(new Error('offline'));
    else h.requests[0].resolve({ error: { message: 'denied' } });
    assert.equal(await first, false);
    assert.match(h.list.innerHTML, /Não foi possível carregar/);
    assert.doesNotMatch(h.list.innerHTML, /Nenhuma observação cadastrada/);
    const retry = h.context.load(); h.requests[1].resolve({ data: [option()] }); await retry;
    assert.match(h.list.innerHTML, /Líder de turma/);
  });
}

test('abrir gerenciador atualiza catálogo mesmo após resposta vazia anterior', async () => {
  const h = harness(); h.school('A');
  const first = h.context.load(); h.requests[0].resolve({ data: [] }); await first;
  assert.match(h.list.innerHTML, /Nenhuma observação cadastrada/);
  assert.match(between('  manageObservations.onclick =', "  document.getElementById('closeObservationManager')"), /loadObservationOptions\(\{ force:true \}\)/);
  const fresh = h.context.load({ force: true }); h.requests[1].resolve({ data: [option()] }); await fresh;
  assert.match(h.list.innerHTML, /Líder de turma/);
});
