const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/130_counselor_attendance_priority.sql'), 'utf8');
const daily = fs.readFileSync(path.join(root, 'school-daily-attendance.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');

test('etiqueta usa o período mais recente e prioriza professor no mesmo período', () => {
  assert.match(migration, /get_effective_siap_attendance_labels/);
  assert.match(migration, /order by row_student_id,row_year desc,period_month_rank desc,row_updated_at desc/);
  assert.match(migration, /case when teacher\.id is not null then 'teacher' else 'secretary' end/);
  assert.match(migration, /left join teacher_period teacher/);
  assert.match(migration, /left join secretary_period secretary/);
  assert.match(migration, /a\.percentage >= coalesce\(cfg\.frequent_minimum,75\)/);
  assert.match(migration, /a\.percentage >= coalesce\(cfg\.absent_minimum,60\)/);
});

test('card fechado mostra somente a etiqueta e perfil aberto informa origem, período e atualização', () => {
  assert.match(daily, /getSiapAttendanceBadge/);
  assert.match(daily, /effectiveBadges\.get\(studentId\)/);
  assert.match(daily, /<span class="attendance-badge \$\{status\.className\}">\$\{status\.label\}<\/span>/);
  assert.doesNotMatch(daily, /shortPeriod/);
  assert.doesNotMatch(daily, /\[\s*\{ source:'Secretaria'[\s\S]*\{ source:'Professor'/);
  assert.match(core, /<strong>Fonte:<\/strong>/);
  assert.match(core, /<strong>Período:<\/strong>/);
  assert.match(core, /<strong>Atualizado em:<\/strong>/);
});

console.log('Prioridade da etiqueta e metadados da origem aprovados.');
