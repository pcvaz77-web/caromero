const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'student-edit-improvements.js'), 'utf8');
const tutoring = fs.readFileSync(path.join(root, 'cepi-tutoring.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/131_observation_top_priority.sql'), 'utf8');

test('cada escola escolhe quais etiquetas colocam alunos no topo', () => {
  assert.match(migration, /add column if not exists is_top_priority boolean not null default false/);
  assert.match(migration, /lower\(btrim\(label\)\) = 'representante de turma'/);
  assert.match(migration, /lider\( \|\$\)/);
  assert.match(source, /id="newObservationTopPriority"/);
  assert.match(source, /data-top-id=/);
  assert.match(source, /select\('id,label,is_pinned,is_top_priority'\)/);
  assert.match(source, /is_top_priority:isTopPriority/);
  assert.match(source, /update\(\{ is_top_priority:topToggle\.checked \}\)/);
});

test('a prioridade configurada ordena antes da paginacao visual', () => {
  assert.match(source, /topPriorityObservationLabels = new Set/);
  assert.match(source, /window\.studentHasTopPriorityObservation = value/);
  assert.match(source, /window\.compareStudentsForList = \(left,right\)/);
  assert.match(source, /if \(topLeft !== topRight\) return topLeft \? -1 : 1/);
  assert.match(core, /sort\(\(left, right\) => typeof window\.compareStudentsForList === 'function'/);
  assert.match(index, /sort\(\(a,b\)=>typeof window\.compareStudentsForList==='function'/);
  assert.doesNotMatch(source, /prepend\(\.\.\.leadershipStudents\)/);
});

test('a mesma prioridade configurada e usada nas listas do Meu CEPI', () => {
  assert.match(tutoring, /window\.studentHasTopPriorityObservation\?\.\(studentA\?\.report \?\? a\.students\?\.has_report\)/);
  assert.match(tutoring, /window\.studentTopPriorityObservations\?\.\(observationSource\)/);
  assert.match(tutoring, /window\.compareStudentsForList\?\.\(a,b\)/);
  assert.match(tutoring, /if \(priorityA !== priorityB\) return priorityA \? -1 : 1/);
});

test('versoes publicas invalidam o cache da regra de prioridade', () => {
  assert.match(index, /student-edit-improvements\.js\?v=112/);
  assert.match(index, /cepi-tutoring\.js\?v=15/);
});

test('gerenciador apresenta opcoes compactas e checkboxes modernos', () => {
  assert.match(source, /class="observation-toggle-grid"/);
  assert.match(source, /Fixar no card/);
  assert.match(source, /Topo das listas/);
  assert.match(source, /input\[type="checkbox"\][\s\S]*?width:18px !important/);
  assert.match(source, /appearance:none/);
});
