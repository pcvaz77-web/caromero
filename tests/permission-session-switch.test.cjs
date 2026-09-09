const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('professor nao herda o botao de permissoes da conta anterior', () => {
  const permissions = fs.readFileSync(path.join(__dirname, '../permissions-and-details.js'), 'utf8');
  const core = fs.readFileSync(path.join(__dirname, '../app-core.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert.match(permissions, /const canManageCounselors = !!permission\.is_coordinator && !!window\.counselorCanManage\?\.\(\)/);
  assert.match(permissions, /membership && \(!user \|\| membership\.user_id !== user\.id\)/);
  assert.match(permissions, /permissionsNav\.hidden = !showPermissions/);
  assert.match(core, /permissionsNav\.hidden = true/);
  assert.match(core, /permissionsNav\.style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(core, /window\.prepareCarometroSignOut\?\.\(\);[\s\S]*?user = null;[\s\S]*?window\.resetCarometroSchoolState\?\.\(\);[\s\S]*?await window\.disableCarometroPush/);
  assert.match(index, /permissionsNav\.classList\.add\('hidden'\);permissionsNav\.hidden=true/);
});
