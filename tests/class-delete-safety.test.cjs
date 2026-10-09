const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'class-delete-fix.js'), 'utf8');

function setup({ count = 0, countError = null, deleteError = null, deleted = [{ id: 'class-1' }], role = 'admin' } = {}) {
  const messages = [];
  const calls = [];
  const button = { disabled: false };
  let onReady;
  let confirmed = 0;
  const query = (table, action) => {
    const filters = {};
    return {
      select(...args) {
        if (action === 'delete') {
          calls.push({ table, action, filters, args });
          return Promise.resolve({ data: deleted, error: deleteError });
        }
        calls.push({ table, action, filters, args });
        return this;
      },
      eq(key, value) { filters[key] = value; return this; },
      then(resolve, reject) { return Promise.resolve({ count, error: countError }).then(resolve, reject); }
    };
  };
  const context = {
    document: { addEventListener: (_event, callback) => { onReady = callback; }, getElementById: () => button },
    window: { getActiveSchoolId: () => 'school-1' },
    classes: [{ id: 'class-1', name: '6A' }],
    students: [{ id: 'student-1', classId: 'class-1' }],
    selectedClassId: 'class-1', detailStudentId: null,
    permission: { role },
    db: { from: table => ({
      select: (...args) => query(table, 'select').select(...args),
      delete: () => query(table, 'delete')
    }) },
    confirm: () => { confirmed++; return true; },
    prompt: () => '6A',
    toast: message => messages.push(message),
    render: () => {}, load: () => {}
  };
  vm.runInNewContext(source, context);
  onReady();
  return { context, button, messages, calls, confirmations: () => confirmed };
}

async function run() {
  const populated = setup({ count: 1 });
  await populated.button.onclick();
  assert.equal(populated.calls.some(call => call.action === 'delete'), false);
  assert.equal(populated.confirmations(), 0);
  assert.match(populated.messages[0], /Remaneje os alunos/);
  assert.equal(populated.button.disabled, false);

  const linked = setup({ deleteError: { code: '23503' } });
  await linked.button.onclick();
  assert.match(linked.messages[0], /registros escolares/);
  assert.equal(linked.calls.find(call => call.action === 'delete').filters.school_id, 'school-1');

  const empty = setup();
  await empty.button.onclick();
  assert.equal(empty.confirmations(), 1);
  assert.equal(empty.context.selectedClassId, null);
  assert.equal(empty.context.students.length, 1);
  assert.equal(empty.messages[0], 'Turma vazia excluída.');

  const denied = setup({ role: 'teacher' });
  await denied.button.onclick();
  assert.equal(denied.calls.length, 0);
  assert.match(denied.messages[0], /Somente administradores/);

  const uncertain = setup({ count: null });
  await uncertain.button.onclick();
  assert.equal(uncertain.calls.some(call => call.action === 'delete'), false);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
