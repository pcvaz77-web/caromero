const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('ocorrencia nasce oculta e permanece fechada sem permissao', () => {
  const source = read('occurrence-management.js');
  assert.match(source, /occurrenceButton\.className = 'hidden'/);
  assert.match(source, /occurrenceButton\.hidden = true/);
  assert.match(source, /style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(source, /setAttribute\('aria-hidden', String\(!allowed\)\)/);
});

test('secretaria recebe somente a frequencia como acesso inicial', () => {
  const migration = read('supabase/migrations/128_secretary_default_daily_attendance.sql');
  assert.match(migration, /can_import_school_daily_attendance=true/);
  assert.match(migration, /can_view_occurrences=false/);
  assert.match(migration, /can_register_occurrences=false/);
  assert.match(migration, /can_receive_notifications=false/);
  assert.match(migration, /sm\.role='secretary'/);
});

test('versoes publicas invalidam o cache dos dois menus', () => {
  const index = read('index.html');
  assert.match(index, /occurrence-management\.js\?v=33/);
  assert.match(index, /school-daily-attendance\.js\?v=7/);
});
