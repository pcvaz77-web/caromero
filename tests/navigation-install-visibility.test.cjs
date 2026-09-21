const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');

test('menu responsivo preserva permissao delegada e bloqueia professor e revogacao', () => {
  const context = { window: {}, permission: {}, document: {} };
  vm.createContext(context);
  vm.runInContext(read('permissions-and-details.js').match(/window.canAccessPermissionsNav = \(\) => \{[\s\S]*?\n  \};/)[0], context);
  let hidden;
  const button = { hidden: true, classList: { contains: () => hidden, toggle: (_, value) => { hidden = value; } }, style: { setProperty() {}, removeProperty() {} }, setAttribute() {} };
  context.document.getElementById = id => id === 'permissionsNav' ? button : null;
  context.window.matchMedia = () => ({ matches: true });
  vm.runInContext(read('mobile-layout.js').match(/const syncAdminOnlyNavigation = \(\) => \{[\s\S]*?\n  \};/)[0] + '\nwindow.sync = syncAdminOnlyNavigation;', context);
  for (const [permission, counselors, expected] of [
    [{ role: 'admin' }, false, true],
    [{ is_coordinator: true, can_manage_member_permissions: true }, false, true],
    [{ is_coordinator: true }, true, true],
    [{ is_secretary: true, can_manage_member_permissions: true }, false, true],
    [{ is_coordinator: true }, false, false],
    [{ role: 'viewer', can_manage_member_permissions: true }, true, false],
    [{ role: 'viewer' }, false, false],
  ]) {
    context.permission = permission;
    context.window.counselorCanManage = () => counselors;
    context.window.sync();
    assert.equal(button.hidden, !expected);
    assert.equal(hidden, !expected);
  }
});

test('instalacao oferece ajuda sem evento, continua apos recusa e oculta instalada', async () => {
  const events = {};
  let hidden, standalone = false, help = 0, prompts = 0, modeChange;
  const context = {
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    pwaButton: { classList: { toggle: (_, value) => { hidden = value; } } },
    pushButton: {}, installPrompt: null, isIos: () => false, isStandalone: () => standalone,
    alert: () => { help++; }, toast() {},
    matchMedia: () => ({ addEventListener: (_, fn) => { modeChange = fn; } }),
  };
  vm.createContext(context);
  const source = read('pwa-notifications.js');
  vm.runInContext(source.slice(source.indexOf('  let installedThisSession='), source.indexOf('  pushButton.onclick=', source.indexOf('  let installedThisSession='))), context);
  assert.equal(hidden, false);
  await context.pwaButton.onclick();
  assert.equal(help, 1);
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await context.pwaButton.onclick();
  assert.equal(prompts, 1);
  assert.equal(hidden, false);
  await context.pwaButton.onclick();
  assert.equal(help, 2);
  standalone = true; modeChange(); assert.equal(hidden, true);
  standalone = false; modeChange(); assert.equal(hidden, false);
  events.appinstalled(); assert.equal(hidden, true);
});
