const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const filters = fs.readFileSync(path.join(root, 'student-search-filters.js'), 'utf8');
const attendance = fs.readFileSync(path.join(root, 'assisted-attendance.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCore = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');

test('filtros rápidos usam a classificação automática atual da frequência', () => {
  assert.match(filters, /key:'attendance:absent', status:'absent', label:'Faltoso'/);
  assert.match(filters, /key:'attendance:active_search', status:'active_search', label:'Necessita de Busca Ativa'/);
  assert.match(filters, /getSiapAttendanceStatus\?\.\(student\.id\)/);
  assert.match(filters, /carometro:attendance-status-changed/);
  assert.match(attendance, /window\.getSiapAttendanceStatus=studentId=>currentBadges\.get\(studentId\)\|\|null/);
  assert.match(attendance, /new CustomEvent\('carometro:attendance-status-changed'\)/);
  assert.match(index, /assisted-attendance\.js\?v=14/);
  assert.match(index, /student-search-filters\.js\?v=6/);
});

test('etiqueta automática também aparece no card lateral aberto', () => {
  assert.match(index, /detail-attendance-row/);
  assert.match(index, /<b>Frequência<\/b><div class="detail-observation-tags">\$\{detailAttendance\}/);
  assert.match(appCore, /detail-attendance-row/);
  assert.doesNotMatch(index, /Perfil do aluno<\/div>\$\{window\.getSiapAttendanceBadge/);
});

console.log('Filtros Faltoso e Busca Ativa usam os estados automáticos e atualizam os contadores.');
