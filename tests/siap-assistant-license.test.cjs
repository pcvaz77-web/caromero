const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/083_siap_assistant_individual_licenses.sql'), 'utf8');
const edgeFunction = fs.readFileSync(path.join(root, 'supabase/functions/generate-siap-ai-draft/index.ts'), 'utf8');

test('mantem a licença do Assistente SIAP separada das assinaturas escolares', () => {
  assert.match(migration, /create table if not exists public\.siap_assistant_licenses/);
  assert.match(migration, /user_id uuid primary key/);
  assert.match(migration, /trial_ends_at = trial_started_at \+ interval '30 days'/);
  assert.match(migration, /on conflict \(user_id\) do nothing/);
  assert.doesNotMatch(migration, /school_subscriptions|commercial_subscriptions/);
});

test('bloqueia a geração com IA quando a licença estiver encerrada', () => {
  assert.match(edgeFunction, /rpc\('get_siap_assistant_access_status'\)/);
  assert.match(edgeFunction, /action === 'license_status'/);
  assert.match(edgeFunction, /code: 'license_expired'/);
  assert.match(edgeFunction, /code: 'license_expired', license \}, 402/);
});
