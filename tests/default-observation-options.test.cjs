const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const correctionMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '116_remove_occurrence_observation_option.sql'), 'utf8');
const removalMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '132_remove_default_observation_status.sql'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'student-edit-improvements.js'), 'utf8');
const filters = fs.readFileSync(path.join(root, 'student-search-filters.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
test('observações deixam de ser criadas ou protegidas como padrão', () => {
  assert.match(removalMigration, /drop trigger if exists seed_default_observation_options_after_school_insert/i);
  assert.match(removalMigration, /drop function if exists public\.seed_default_observation_options\(uuid\)/i);
  assert.match(removalMigration, /drop trigger if exists protect_default_observation_options_before_change/i);
  assert.match(removalMigration, /drop function if exists public\.protect_default_observation_options\(\)/i);
  assert.doesNotMatch(editor, /defaultObservationLabels|default-observation-mark|>Padrão</);
});

test('toda opção cadastrada pode ser fixada, priorizada ou excluída', () => {
  assert.match(editor, /data-pin-id/);
  assert.match(editor, /data-top-id/);
  assert.match(editor, /delete-custom-observation/);
  assert.doesNotMatch(editor, /option\.standard \? '' :/);
});

test('occurrence stays outside observation management and keeps its automatic filter', () => {
  assert.match(correctionMigration, /delete from public\.observation_options[\s\S]*lower\(btrim\(label\)\) = lower\('Ocorrência'\)/i);
  assert.match(correctionMigration, /não pode ser cadastrada como observação/i);
  assert.doesNotMatch(editor.match(/const fallbackObservations = \[[\s\S]*?\];/)?.[0] || '', /Ocorrência/);
  assert.match(filters, /if \(key === 'ocorrencia'\) return !!window\.occurrenceStudentIds/);
  assert.match(index, /student-edit-improvements\.js\?v=113/);
  assert.match(index, /student-search-filters\.js\?v=\d+/);
  assert.match(editor, /@media\(max-width:800px\)/);
});
