const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('gestão do catálogo exige escola ativa, cargo e permissão', () => {
  const migration = read('supabase/migrations/201_secretary_observations_coordinator_invitations.sql');
  assert.match(migration, /sm\.school_id = observation_options\.school_id/);
  assert.match(migration, /sm\.user_id = auth\.uid\(\) and sm\.status = 'active'/);
  assert.match(migration, /sm\.role in \('coordinator', 'secretary'\)/);
  assert.match(migration, /p\.can_manage_observation_options = true/);
  assert.match(migration, /with check \(/);
});

test('secretaria não vê nem abre os fluxos de prova', () => {
  const correction = read('regular-exam.js');
  const cepi = read('cepi-workspace.js');
  const classExams = read('class-exams.js');
  assert.match(correction, /getActiveSchoolRole\?\.\(\) !== 'secretary'/);
  assert.match(cepi, /new Set\(\['provas','correcao','ranking','banco','cabecalho'\]\)/);
  assert.match(cepi, /getActiveSchoolRole\?\.\(\) === 'secretary' && examSections\.has\(key\)/);
  assert.match(cepi, /memberRole === 'secretary' && examSections\.has\(key\)/);
  assert.match(classExams, /new Set\(\['teacher','coordinator','school_admin'\]\)/);
});
