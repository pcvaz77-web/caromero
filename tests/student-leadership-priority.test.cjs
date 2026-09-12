const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'student-edit-improvements.js'), 'utf8');
const tutoring = fs.readFileSync(path.join(root, 'cepi-tutoring.js'), 'utf8');

test('representatives and every Lider label are moved to the top', () => {
  assert.match(source, /value === 'Representante de turma' \|\| \/\\blider\\b\/\.test\(normalized\)/);
  assert.match(source, /normalize\('NFD'\).*replace\(\/\[\\u0300-\\u036f\]\//);
  assert.match(source, /const hasLeadershipRole = values\.some\(isLeadershipObservation\)/);
  assert.match(source, /prepend\(\.\.\.leadershipStudents\)/);
});

test('leadership students are also first inside each tutor group', () => {
  assert.match(source, /window\.studentHasLeadershipObservation = value/);
  assert.match(tutoring, /window\.studentHasLeadershipObservation\?\.\(studentA\?\.report \?\? a\.students\?\.has_report\)/);
  assert.match(tutoring, /if \(leadershipA !== leadershipB\) return leadershipA \? -1 : 1/);
  assert.match(tutoring, /students\(full_name,class_name,class_id,has_report\)/);
});

test('CEPI student selectors sort alphabetically while ignoring list numbers', () => {
  assert.match(tutoring, /const studentSortName = value => normalizeSearch\(value\)\.replace\(\/\^\\d\+/);
  assert.match(tutoring, /sort\(\(a,b\) => compareStudentNames\(a\.name, b\.name\)\)/);
  assert.match(tutoring, /const filtered = assignments\.filter[\s\S]*?\.sort\(\(a,b\) =>/);
  assert.match(tutoring, /return compareStudentNames\(studentA\?\.name \|\| a\.students\?\.full_name, studentB\?\.name \|\| b\.students\?\.full_name\)/);
});
