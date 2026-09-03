const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../commercial-login-fix.js'), 'utf8');
const guard = source.slice(source.indexOf('  let endingSession = false;'), source.indexOf('  async function ensureSchoolSwitcherVisibility()'));

function harness(result) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { classList:{ add:c => classes.add(c), remove:c => classes.delete(c), contains:c => classes.has(c) } });
    }
    return nodes.get(id);
  };
  let signOuts = 0;
  let authCallback;
  const context = {
    window:{ addEventListener() {} },
    document:{ hidden:false, getElementById:node, querySelectorAll:() => [], addEventListener() {} },
    db:{ auth:{ getUser:async () => result, signOut:async options => {
      assert.equal(options.scope, 'local'); signOuts++; authCallback('SIGNED_OUT'); return { error:null };
    }, onAuthStateChange:callback => { authCallback = callback; } } },
    clearCommercialLoginState() {}, setInterval() {},
    user:{ id:'existing' }, students:[1], classes:[1], selectedClassId:'class', selectedShift:'shift', detailStudentId:'student', permission:{ role:'admin' }
  };
  vm.createContext(context);
  vm.runInContext(guard, context);
  return { context, node, signOuts:() => signOuts, signOutEvent:() => authCallback('SIGNED_OUT') };
}

(async () => {
  const valid = harness({ data:{ user:{ id:'existing' } }, error:null });
  assert.equal(await valid.context.window.verifyCarometroSession(), true);
  assert.equal(valid.signOuts(), 0);
  for (const error of [{ status:401 }, { code:'user_not_found', status:403 }, { name:'AuthSessionMissingError' }]) {
    const deleted = harness({ data:{ user:null }, error });
    assert.equal(await deleted.context.window.verifyCarometroSession(), false);
    assert.equal(deleted.signOuts(), 1);
    assert.equal(deleted.context.user, null);
    assert.equal(deleted.context.students.length, 0);
    assert.equal(deleted.node('app').classList.contains('hidden'), true);
    assert.equal(deleted.node('login').classList.contains('hidden'), false);
  }
  for (const error of [{ status:503 }, { name:'AuthRetryableFetchError', status:0 }]) {
    const offline = harness({ data:{ user:null }, error });
    assert.equal(await offline.context.window.verifyCarometroSession(), false);
    assert.equal(offline.signOuts(), 0);
    assert.equal(offline.context.user.id, 'existing');
  }
  valid.signOutEvent();
  assert.equal(valid.context.user, null);
  assert.equal(valid.node('app').classList.contains('hidden'), true);
  assert.match(source, /if \(!user \|\| endingSession\)/);
  console.log('PASS: valid session, deleted user, missing session, offline, server error, SIGNED_OUT and UI guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
