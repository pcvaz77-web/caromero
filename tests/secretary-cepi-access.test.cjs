const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '134_secretary_cepi_management.sql'),
  'utf8'
);
const frontend = fs.readFileSync(path.join(root, 'cepi-tutoring.js'), 'utf8');

test('secretaria gerencia a Tutoria somente em escola com CEPI ativo', () => {
  assert.match(migration, /sm\.role = 'secretary'[\s\S]*public\.cepi_school_enabled\(p_school_id\)/);
  assert.match(migration, /sm\.role in \('school_admin', 'coordinator'\)/);
  assert.match(frontend, /access\.can_manage/);
  assert.match(frontend, /if \(access\.enabled\) await loadTutorLabels\(\)/);
});

test('etiquetas de tutor usam as mesmas tabelas liberadas ao gestor CEPI', () => {
  assert.match(frontend, /cepi_tutors'\)\.select\('id,display_name'\)/);
  assert.match(frontend, /cepi_tutor_students'\)\.select\('id,tutor_id,student_id'\)/);
  assert.match(frontend, /Tutor\(a\): \$\{tutorName\}/);
});

test('acesso CEPI não concede ocorrências implicitamente à secretaria', () => {
  assert.match(migration, /permissions\.can_view_occurrences/);
  assert.match(migration, /permissions\.can_edit_all/);
  assert.match(migration, /sm\.role <> 'secretary'/);
  assert.match(migration, /else '\[\]'::jsonb/);
});

test('funções permanecem restritas a usuários autenticados', () => {
  assert.match(migration, /revoke all on function public\.is_cepi_manager\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.is_cepi_manager\(uuid\) to authenticated/);
  assert.match(migration, /revoke all on function public\.get_cepi_tutored_student_activity\(uuid, uuid\[\]\) from public, anon/);
  assert.match(migration, /grant execute on function public\.get_cepi_tutored_student_activity\(uuid, uuid\[\]\) to authenticated/);
});
