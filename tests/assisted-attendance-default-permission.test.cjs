const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/108_default_assisted_attendance_for_new_members.sql'),
  'utf8'
);

test('novos membros recebem Frequencia Assistida sem alterar membros existentes', () => {
  assert.match(
    migration,
    /alter column can_import_siap_attendance set default true/i
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.school_member_permissions/i
  );
});
