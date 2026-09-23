const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('etiquetas de conselheiro usam RPC escolar restrita, sem abrir a tabela', () => {
  const migration = read('supabase/migrations/144_list_school_class_counselor_labels.sql');
  const source = read('class-counselors.js');
  const index = read('index.html');

  assert.match(migration, /returns table\(class_id uuid, counselor_user_id uuid, counselor_name text\)/);
  assert.match(migration, /public\.is_active_school_member\(target_school_id\)/);
  assert.match(migration, /public\.school_has_feature_strict\(target_school_id, 'class_counselors'\)/);
  assert.match(migration, /grant execute on function public\.list_school_class_counselor_labels\(uuid\) to authenticated/);
  assert.match(source, /db\.rpc\('list_school_class_counselor_labels', \{ target_school_id: counselorMembership\.school_id \}\)/);
  assert.match(source, /item\.counselor_name \|\| counselorDisplayName/);
  assert.match(index, /class-counselors\.js\?v=36/);
});
