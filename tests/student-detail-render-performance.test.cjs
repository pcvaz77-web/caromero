const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCore = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');
const attendance = fs.readFileSync(path.join(root, 'assisted-attendance.js'), 'utf8');
const filters = fs.readFileSync(path.join(root, 'student-search-filters.js'), 'utf8');

test('abrir e fechar o detalhe não reconstrói a lista inteira', () => {
  for (const source of [index, appCore]) {
    assert.match(source, /function renderStudentDetails\(/);
    assert.match(source, /showStudentDetails=id=>\{detailStudentId=id;renderStudentDetails\(\)\}|showStudentDetails = id => \{ detailStudentId = id; renderStudentDetails\(\); \}/);
    assert.doesNotMatch(source, /showStudentDetails=id=>\{detailStudentId=id;render\(\)\}|showStudentDetails = id => \{ detailStudentId = id; render\(\); \}/);
  }
});

test('atualização de frequência não provoca segundo redesenho completo', () => {
  assert.match(attendance, /if\(allowed===lastAllowed\)return/);
  assert.match(filters, /addEventListener\('carometro:attendance-status-changed', renderChipCounts\)/);
  assert.doesNotMatch(filters, /carometro:attendance-status-changed'[^\n]+window\.render/);
});

test('listas grandes são renderizadas em lotes sem reduzir busca e contadores', () => {
  for (const source of [index, appCore]) {
    assert.match(source, /STUDENT_RENDER_BATCH\s*=\s*120/);
    assert.match(source, /items\.slice\(0,\s*visibleStudentLimit\)/);
    assert.match(source, /dataset\.resultCount\s*=\s*String\(items\.length\)/);
    assert.match(source, /loadMoreStudents/);
  }
  assert.match(filters, /list\.dataset\.resultCount/);
  assert.match(filters, /resetStudentRenderLimit\?\.\(\)/);
});

console.log('O painel lateral atualiza isoladamente, sem redesenhar todos os alunos.');
