const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/exam-worker.js'), 'utf8');

function worker() {
  const store = {};
  let messageListener, removedListener;
  const chrome = {
    runtime: { onMessage: { addListener(listener) { messageListener = listener; } } },
    tabs: { onRemoved: { addListener(listener) { removedListener = listener; } } },
    storage: { session: {
      async get(keys) { const names = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(names.filter(key => key in store).map(key => [key, store[key]])); },
      async set(values) { Object.assign(store, values); },
      async remove(keys) { for (const key of [].concat(keys)) delete store[key]; }
    } }
  };
  vm.runInNewContext(source, { chrome, URL, Date, Number, String, Promise, setTimeout, clearTimeout, readConnectedSession: async () => null, AI_ENDPOINT: '', SUPABASE_ANON_KEY: '' });
  const sender = id => ({ tab: { id, url: 'https://siap.educacao.go.gov.br/LancamentoNotasModeloEdicao.aspx' } });
  const send = (message, id) => new Promise(resolve => messageListener(message, sender(id), resolve));
  return { store, send, remove: id => removedListener(id) };
}

test('sair da aba do SIAP preserva a sessão de correção até o vencimento', async () => {
  const app = worker();
  const state = { room: { id: '11111111-1111-4111-8111-111111111111', desktop: 'a'.repeat(64), mobile: 'b'.repeat(64), expires: Date.now() + 60_000 }, signature: 'mesma-avaliacao' };
  assert.equal((await app.send({ type: 'SIAP_EXAM_STATE_PUT', value: state }, 10)).ok, true);
  await app.remove(10);
  assert.equal(app.store['siapExamTab:10'], undefined);
  const restored = await app.send({ type: 'SIAP_EXAM_STATE_GET' }, 11);
  assert.deepEqual(restored.value, state);
});
