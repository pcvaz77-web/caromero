const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'siap-grades.js'), 'utf8');
const normalizer = source.match(/const normalizeStudentName = [\s\S]*?\.toLowerCase\(\);/)?.[0];
const start = source.indexOf('  function previewRows(');
const end = source.indexOf('  function renderPreview()', start);
assert.ok(normalizer && start >= 0 && end > start);

function preview(entries, students) {
  const sandbox = { students };
  vm.runInNewContext(`${normalizer}\n${source.slice(start, end)}\nglobalThis.preview = previewRows;`, sandbox);
  return sandbox.preview({ entries }, 'class-a');
}

test('vincula pelo nome completo na turma, independente de maiusculas', () => {
  const rows = preview([{ name:'1. ANA MARIA SILVA', score:8 }], [
    { id:'student-a', classId:'class-a', name:'Ana Maria Silva' },
    { id:'student-b', classId:'class-a', name:'Ana Maria Silveira' },
    { id:'student-c', classId:'class-b', name:'Ana Maria Silva' }
  ]);
  assert.equal(rows[0].studentId, 'student-a');
  assert.equal(preview([{ name:'ANA MARIA', score:8 }], [
    { id:'student-a', classId:'class-a', name:'Ana Maria Silva' }
  ])[0].studentId, null);
});

test('nao importa quando o nome completo nao identifica um unico aluno', () => {
  const students = [{ id:'student-a', classId:'class-a', name:'Ana Maria Silva' }];
  const duplicateSource = preview([
    { name:'ANA MARIA SILVA', score:8 },
    { name:'Ana Maria Silva', score:7 }
  ], students);
  assert.equal(duplicateSource[0].studentId, null);
  assert.equal(duplicateSource[1].studentId, null);
  assert.equal(duplicateSource[0].sourceDuplicate, true);

  const duplicateLocal = preview([{ name:'ANA MARIA SILVA', score:8 }], [
    ...students,
    { id:'student-b', classId:'class-a', name:'ana maria silva' }
  ]);
  assert.equal(duplicateLocal[0].studentId, null);
  assert.equal(duplicateLocal[0].matchCount, 2);
});
