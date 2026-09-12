const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const initialMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '115_default_observation_options.sql'), 'utf8');
const correctionMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '116_remove_occurrence_observation_option.sql'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'student-edit-improvements.js'), 'utf8');
const filters = fs.readFileSync(path.join(root, 'student-search-filters.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const defaults = ['Laudo (DI)', 'Laudo (TEA)', 'Não alfabetizado'];

test('existing and future schools receive only the three standard observations', () => {
  defaults.forEach(label => assert.match(correctionMigration, new RegExp(label.replace(/[()]/g, '\\$&'))));
  assert.match(initialMigration, /after insert on public\.schools/i);
  assert.doesNotMatch(correctionMigration.match(/create or replace function public\.seed_default_observation_options[\s\S]*?\$\$;/i)?.[0] || '', /'Ocorrência'/);
});

test('standard observations can be pinned but cannot be deleted or renamed', () => {
  assert.match(initialMigration, /before update or delete on public\.observation_options/i);
  assert.match(correctionMigration, /observação padrão e não pode ser excluída/i);
  assert.match(editor, /option\.standard \? '' :/);
  assert.match(editor, /data-pin-id/);
});

test('occurrence stays outside observation management and keeps its automatic filter', () => {
  defaults.forEach(label => assert.match(filters, new RegExp(label.replace(/[()]/g, '\\$&'))));
  assert.match(correctionMigration, /delete from public\.observation_options[\s\S]*lower\(btrim\(label\)\) = lower\('Ocorrência'\)/i);
  assert.match(correctionMigration, /não pode ser cadastrada como observação/i);
  assert.doesNotMatch(editor.match(/const fallbackObservations = \[[\s\S]*?\];/)?.[0] || '', /Ocorrência/);
  assert.match(filters, /if \(key === 'ocorrencia'\) return !!window\.occurrenceStudentIds/);
  assert.match(index, /student-edit-improvements\.js\?v=102/);
  assert.match(index, /student-search-filters\.js\?v=\d+/);
  assert.match(editor, /@media\(max-width:800px\)/);
});
