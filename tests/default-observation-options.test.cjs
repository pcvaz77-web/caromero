const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '115_default_observation_options.sql'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'student-edit-improvements.js'), 'utf8');
const filters = fs.readFileSync(path.join(root, 'student-search-filters.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const defaults = ['Laudo (DI)', 'Laudo (TEA)', 'Não alfabetizado', 'Ocorrência'];

test('existing and future schools receive the four standard observations', () => {
  defaults.forEach(label => assert.match(migration, new RegExp(label.replace(/[()]/g, '\\$&'))));
  assert.match(migration, /select public\.seed_default_observation_options\(id\)\s+from public\.schools/i);
  assert.match(migration, /after insert on public\.schools/i);
});

test('standard observations can be pinned but cannot be deleted or renamed', () => {
  assert.match(migration, /before update or delete on public\.observation_options/i);
  assert.match(migration, /observação padrão e não pode ser excluída/i);
  assert.match(editor, /option\.standard \? '' :/);
  assert.match(editor, /data-pin-id/);
});

test('standard labels stay out of More filters and mobile uses the same catalog', () => {
  defaults.forEach(label => assert.match(filters, new RegExp(label.replace(/[()]/g, '\\$&'))));
  assert.match(index, /student-edit-improvements\.js\?v=100/);
  assert.match(index, /student-search-filters\.js\?v=\d+/);
  assert.match(editor, /@media\(max-width:800px\)/);
});
