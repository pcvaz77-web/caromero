const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const permissions = fs.readFileSync(path.join(root, 'permissions-and-details.js'), 'utf8');
const attendance = fs.readFileSync(path.join(root, 'assisted-attendance.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/107_delegate_assisted_attendance_permission.sql'), 'utf8');

test('professor autorizado recebe o botão de Frequência Assistida', () => {
  assert.match(permissions, /Usar Frequência Assistida/);
  assert.match(permissions, /setAttendancePermission/);
  assert.match(permissions, /permission_name:'can_import_siap_attendance'/);
  assert.match(permissions, /sessionPermissionFields = \[\.\.\.permissionFields, 'can_import_siap_attendance'\]/);
  assert.match(attendance, /permission\?\.can_import_siap_attendance/);
});

test('delegação do coordenador é limitada a professores e à frequência assistida', () => {
  assert.match(migration, /v_actor\.role = 'coordinator' and v_actor_can_manage/);
  assert.match(migration, /v_target\.role <> 'teacher'/);
  assert.match(migration, /permission_name = 'can_import_siap_attendance'/);
  assert.match(migration, /permission_name = 'can_use_siap_assistant'[\s\S]*v_actor\.role <> 'school_admin'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
});

console.log('Frequência Assistida pode ser delegada com isolamento por escola e por papel.');
