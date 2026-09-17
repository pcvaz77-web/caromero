const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '126_school_secretary_daily_attendance.sql'), 'utf8');
const invitations = fs.readFileSync(path.join(root, 'school-invitations.js'), 'utf8');
const permissions = fs.readFileSync(path.join(root, 'permissions-and-details.js'), 'utf8');
const sender = fs.readFileSync(path.join(root, 'supabase', 'functions', 'send-school-invitation', 'index.ts'), 'utf8');

assert.match(migration, /role in \('school_admin', 'coordinator', 'teacher', 'secretary'\)/);
assert.match(migration, /school_invitations_role_check[\s\S]*role in \('school_admin', 'coordinator', 'teacher', 'secretary'\)/);
assert.match(migration, /can_import_school_daily_attendance boolean not null default false/);
assert.match(migration, /enforce_secretary_restricted_permissions/);
assert.match(migration, /new\.can_view_occurrences:=false/);
assert.match(migration, /new\.can_register_occurrences:=false/);
assert.match(migration, /restrict_secretary_member_role/);
assert.match(migration, /v_invitation\.role = 'secretary'/);
assert.match(migration, /can_import_school_daily_attendance=true/);
assert.match(migration, /sm\.role in \('teacher', 'coordinator', 'secretary'\)/);
assert.match(migration, /create table public\.siap_school_daily_attendance_history/);
assert.match(migration, /create table public\.siap_school_daily_attendance_current/);
assert.match(migration, /using \(public\.is_active_school_member\(school_id\)\)/);
assert.match(migration, /item_percentage := round/);
assert.match(migration, /sm\.role='school_admin' or \(sm\.role='secretary' and coalesce\(p\.can_import_school_daily_attendance,false\)\)/);
assert.match(migration, /v_target\.role<>'secretary'/);
assert.doesNotMatch(migration, /Secretaria ou Coordenação/);
assert.match(invitations, /option value="secretary">Secretário\(a\)/);
assert.match(invitations, /Coordenadores só podem convidar professores/);
assert.match(permissions, /Acesso somente à consulta de alunos e à frequência diária/);
assert.doesNotMatch(permissions, /admin\?'':schoolDailyAttendanceCheck/);
assert.match(sender, /\['coordinator', 'teacher', 'secretary'\]\.includes\(invitation\.role\)/);
assert.match(sender, /callerMember\.role === 'coordinator'[\s\S]*invitation\.role !== 'teacher'/);

console.log('Papel Secretaria: restrição, convite, vaga e importação isolada aprovados.');
