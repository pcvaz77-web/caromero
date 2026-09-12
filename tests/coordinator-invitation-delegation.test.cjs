const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const frontend = fs.readFileSync(path.join(__dirname, '../school-invitations.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/109_allow_authorized_coordinator_invitations.sql'), 'utf8');

test('coordenador autorizado pode selecionar convite de coordenador', () => {
  assert.match(frontend, /canInviteCoordinator/);
  assert.match(frontend, /permission\.can_invite_teachers && permission\.can_manage_member_permissions/);
  assert.doesNotMatch(frontend, /disabled = coordinator/);
});

test('banco exige convite e gestao de professores para coordenador convidar coordenador', () => {
  assert.match(migration, /target_role = 'coordinator'/);
  assert.match(migration, /v_can_invite_teachers and v_can_manage_members/);
  assert.match(migration, /sm\.school_id = target_school_id/);
  assert.match(migration, /sm\.status = 'active'/);
  assert.match(migration, /revoke all[\s\S]*from anon/);
});
