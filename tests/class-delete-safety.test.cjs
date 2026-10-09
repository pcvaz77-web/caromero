const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'class-delete-fix.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/165_archive_class_and_students.sql'), 'utf8');

function setup({ count = 37, countError = null, rpcError = null, role = 'admin', confirm = true } = {}) {
  const messages = [];
  const calls = [];
  const button = { disabled: false };
  let onReady;
  const query = () => {
    const filters = {};
    return {
      eq(key, value) { filters[key] = value; return this; },
      then(resolve, reject) {
        calls.push({ operation: 'count', filters });
        return Promise.resolve({ count, error: countError }).then(resolve, reject);
      }
    };
  };
  const context = {
    document: { addEventListener: (_event, callback) => { onReady = callback; }, getElementById: () => button },
    window: { getActiveSchoolId: () => 'school-1' },
    classes: [{ id: 'class-1', name: '7A' }],
    students: [{ id: 'student-1', classId: 'class-1' }],
    selectedClassId: 'class-1', detailStudentId: null,
    permission: { role },
    db: {
      from: table => ({ select: () => { assert.equal(table, 'students'); return query(); } }),
      rpc: (name, args) => {
        calls.push({ operation: 'rpc', name, args });
        return Promise.resolve({
          data: rpcError ? null : { class_id: 'class-1', students_archived: count },
          error: rpcError
        });
      }
    },
    confirm: message => { calls.push({ operation: 'confirm', message }); return confirm; },
    prompt: () => '7A',
    toast: message => messages.push(message),
    render: () => {}, load: () => {}
  };
  vm.runInNewContext(source, context);
  onReady();
  return { context, button, messages, calls };
}

async function run() {
  const populated = setup();
  await populated.button.onclick();
  assert.equal(populated.calls.find(call => call.operation === 'count').filters.school_id, 'school-1');
  assert.equal(populated.calls.find(call => call.operation === 'count').filters.enrollment_status, 'active');
  assert.match(populated.calls.find(call => call.operation === 'confirm').message, /37 alunos/);
  assert.match(populated.calls.find(call => call.operation === 'confirm').message, /Ninguém será remanejado/);
  assert.equal(populated.calls.find(call => call.operation === 'rpc').name, 'archive_class_and_students');
  assert.equal(populated.calls.find(call => call.operation === 'rpc').args.p_school_id, 'school-1');
  assert.equal(populated.context.selectedClassId, null);
  assert.equal(populated.context.students.length, 0);
  assert.match(populated.messages[0], /Histórico preservado/);
  assert.equal(populated.button.disabled, false);

  const canceled = setup({ confirm: false });
  await canceled.button.onclick();
  assert.equal(canceled.calls.some(call => call.operation === 'rpc'), false);

  const failed = setup({ rpcError: { message: 'Banco indisponível' } });
  await failed.button.onclick();
  assert.equal(failed.context.students.length, 1);
  assert.equal(failed.messages[0], 'Banco indisponível');

  const denied = setup({ role: 'teacher' });
  await denied.button.onclick();
  assert.equal(denied.calls.length, 0);

  const uncertain = setup({ count: null });
  await uncertain.button.onclick();
  assert.equal(uncertain.calls.some(call => call.operation === 'rpc'), false);

  assert.match(sql, /public\.is_school_admin\(p_school_id\)/);
  assert.match(sql, /school_id is distinct from p_school_id/);
  assert.match(sql, /school_id = p_school_id and class_id = p_class_id and enrollment_status = 'active'/);
  assert.match(sql, /set archived_at = now\(\)/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\./i);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
