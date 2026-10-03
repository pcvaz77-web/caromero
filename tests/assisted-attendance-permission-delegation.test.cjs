const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const permissions = fs.readFileSync(path.join(root, 'permissions-and-details.js'), 'utf8');
const attendance = fs.readFileSync(path.join(root, 'assisted-attendance.js'), 'utf8');
const classroom = fs.readFileSync(path.join(root, 'classroom-mapping.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/130_counselor_attendance_priority.sql'), 'utf8');
const teacherAccessMigration = fs.readFileSync(path.join(root, 'supabase/migrations/156_teacher_siap_any_class.sql'), 'utf8');
const grades = fs.readFileSync(path.join(root, 'siap-grades.js'), 'utf8');

test('Frequência Assistida sai das permissões gerais e entra no Painel da Turma', () => {
  assert.doesNotMatch(permissions, /> Usar Frequência Assistida</);
  assert.doesNotMatch(permissions, /setAttendancePermission/);
  assert.doesNotMatch(attendance, /assistedAttendanceNav/);
  assert.match(attendance, /getAssistedAttendancePanelAction/);
  assert.match(attendance, /id="openCounselorAssistedAttendance"[^>]+class="btn primary">Frequência Assistida/);
  assert.match(classroom, /getAssistedAttendancePanelAction/);
  assert.match(classroom, /bindAssistedAttendancePanelAction/);
  assert.match(classroom, /canViewPanel = .*getActiveSchoolRole\?\.\(\) === 'teacher'/);
});

test('professor ativo da escola pode capturar em qualquer turma, sem vinculo de conselheiro', () => {
  assert.match(attendance, /isGeneralTeacher/);
  assert.match(attendance, /getActiveSchoolRole\?\.\(\) === 'teacher'/);
  assert.doesNotMatch(attendance, /counselorRightsForClass\?\.\(classId\)/);
  assert.match(attendance, /isGeneralTeacher\(\) && !!classId && !!window\.getActiveSchoolId\?\.\(\)/);
  assert.match(grades, /getActiveSchoolRole\?\.\(\) === 'teacher' && !!classId && !!window\.getActiveSchoolId\?\.\(\)/);
  assert.doesNotMatch(grades, /counselorRightsForClass/);
  assert.match(attendance, /captureClassId/);
  assert.match(attendance, /não pertence à turma/);
  assert.match(teacherAccessMigration, /sm\.role = 'teacher'/);
  assert.match(teacherAccessMigration, /sm\.status = 'active'/);
  assert.match(teacherAccessMigration, /c\.id = target_class_id/);
  assert.match(teacherAccessMigration, /c\.school_id = sm\.school_id/);
  assert.match(teacherAccessMigration, /sm\.school_id = target_school_id/);
  assert.doesNotMatch(teacherAccessMigration, /join public\.class_counselors/);
  assert.match(migration, /can_import_counselor_attendance\(item_school,item_class\)/);
  assert.match(teacherAccessMigration, /security definer/);
  assert.match(teacherAccessMigration, /set search_path = ''/);
  assert.match(migration, /revoke all privileges on public\.siap_attendance_history from authenticated/);
  assert.match(migration, /revoke all privileges on public\.siap_attendance_current from authenticated/);
  assert.match(migration, /grant select on public\.siap_attendance_status_events to authenticated/);
});

test('gestão configura percentuais sem receber acesso à captura', () => {
  assert.match(attendance, /\['school_admin','coordinator'\]\.includes\(window\.getActiveSchoolRole\?\.\(\)\)/);
  assert.match(attendance, /openAttendanceSettings/);
  assert.match(attendance, />Configurar frequência<\/button>/);
  assert.match(attendance, /settings-only/);
});

test('professor vê os critérios sem controles de configuração', () => {
  assert.match(attendance, /\.aa-threshold-fields'\)\.classList\.toggle\('hidden',!canConfigure\)/);
  assert.match(attendance, /control\.disabled=!canConfigure/);
});

console.log('Frequência Assistida e notas: acesso do professor por escola e turma validado.');
