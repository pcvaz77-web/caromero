const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('secretaria inicia apenas com a frequencia e nunca pode ser conselheiro', () => {
  const base = read('supabase/migrations/127_secretary_configurable_permissions.sql');
  const defaultAttendance = read('supabase/migrations/128_secretary_default_daily_attendance.sql');
  assert.match(base, /reset_secretary_permissions/);
  assert.match(defaultAttendance, /can_import_school_daily_attendance=true/);
  assert.match(defaultAttendance, /can_receive_notifications=false/);
  assert.match(base, /new\.can_manage_counselors := false/);
  assert.match(base, /sm\.role<>'secretary'/);
  assert.match(base, /delete from public\.class_counselors/);
});

test('administrador pode liberar opcoes individualmente ou em lote', () => {
  const sql = read('supabase/migrations/127_secretary_configurable_permissions.sql');
  const ui = read('permissions-and-details.js');
  assert.match(sql, /create or replace function public\.set_school_member_permission/);
  assert.match(sql, /can_import_school_daily_attendance','can_receive_notifications/);
  assert.match(sql, /create or replace function public\.set_school_member_permissions_batch/);
  assert.match(ui, /secretaryPermissionFields/);
  assert.match(ui, /Liberar todas as permissões disponíveis/);
  assert.doesNotMatch(ui.match(/if \(item\.is_secretary\)[^;]+;/)?.[0] || '', /can_manage_counselors/);
});

test('coordenador autorizado controla somente a frequencia da Secretaria', () => {
  const boundary = read('supabase/migrations/133_secretary_attendance_role_boundary.sql');
  const ui = read('permissions-and-details.js');
  assert.match(boundary, /v_target\.role<>'secretary'/);
  assert.match(boundary, /actor\.role='coordinator'[\s\S]*can_manage_member_permissions/);
  assert.match(ui, /canManageSecretaryAttendance = !!permission\.is_coordinator && !!permission\.can_manage_member_permissions/);
  assert.match(ui, /set_secretary_daily_attendance_permission/);
});

test('notificacoes e ocorrencias do tutor respeitam as permissoes da secretaria', () => {
  const sql = read('supabase/migrations/127_secretary_configurable_permissions.sql');
  const center = read('notification-center.js');
  const preferences = read('notification-preferences.js');
  const push = read('pwa-notifications.js');
  assert.match(sql, /actor\.role<>'secretary' or coalesce\(ap\.can_view_occurrences,false\)/);
  assert.match(sql, /sm\.role<>'secretary' or coalesce\(p\.can_receive_notifications,false\)/);
  assert.match(center, /canUseNotifications/);
  assert.match(preferences, /canUseNotifications/);
  assert.match(push, /canUseNotifications/);
});

test('secretaria continua disponivel para Tutor CEPI', () => {
  const sql = read('supabase/migrations/127_secretary_configurable_permissions.sql');
  assert.doesNotMatch(sql, /create or replace function public\.list_cepi_tutor_candidates[\s\S]*role\s*<>\s*'secretary'/);
});
