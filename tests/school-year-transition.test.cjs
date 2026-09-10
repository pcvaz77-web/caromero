const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/097_school_year_transition.sql'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'school-year-transition.js'), 'utf8');
const permissions = fs.readFileSync(path.join(root, 'permissions-and-details.js'), 'utf8');
const reports = fs.readFileSync(path.join(root, 'reports.js'), 'utf8');

assert.match(sql, /can_prepare_school_year boolean not null default false/);
assert.match(sql, /sm\.role = 'school_admin'.*sm\.role = 'coordinator'/s);
assert.match(sql, /Todos os alunos ativos precisam ter um destino/);
assert.match(sql, /insert into public\.student_class_history/);
assert.match(sql, /transition_result in \('remapped', 'repeated', 'transferred'\)/);
assert.match(sql, /student_snapshot jsonb/);
assert.match(sql, /removed_photo_paths/);
assert.match(sql, /enrollment_status = 'active'/);
assert.match(sql, /archived_at is null/);
assert.match(sql, /s\.enrollment_status = 'active' or p_student_id = s\.id/);
assert.match(sql, /update public\.classes set archived_at = now\(\)/);
assert.doesNotMatch(sql, /delete from public\.(students|classes|student_occurrences)/i);
assert.doesNotMatch(ui, /from\(['"](?:students|classes|student_occurrences)['"]\)\.delete\(\)/i);
assert.match(ui, /Prévia — nenhuma alteração realizada/);
assert.match(ui, /Situação ainda não definida/);
assert.doesNotMatch(ui, /Deixou a escola/);
assert.match(permissions, /set_school_year_transition_permission/);
assert.match(reports, /enrollment_status', 'transferred'/);
assert.match(reports, /\(transferido\)/);

console.log('school-year-transition: estrutura, permissão e preservação validadas');
