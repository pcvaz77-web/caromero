const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('menu de convites usa a mesma permissão específica exigida pelo servidor', () => {
  const index = read('index.html');
  const frontend = read('school-invitations.js');
  const edge = read('supabase/functions/send-school-invitation/index.ts');

  assert.match(index, /school-invitations\.js\?v=8/);
  assert.match(frontend, /\['coordinator', 'secretary'\][\s\S]{0,180}permission\.can_invite_teachers === true/);
  assert.doesNotMatch(frontend, /permission\.can_edit_all\s*\|\|\s*permission\.can_invite_teachers/);
  assert.match(edge, /callerPermissions\?\.can_invite_teachers/);
});

test('aceite remove o token persistido depois do sucesso e exige e-mail convidado', () => {
  const acceptance = read('accept-invite.js');

  assert.match(acceptance, /rpc\('invitation_email_matches'/);
  assert.match(acceptance, /rpc\('accept_school_invitation'/);
  assert.match(acceptance, /sessionStorage\.removeItem\('carometroInviteToken'\)/);
});

test('push repete somente falhas transitórias e remove assinaturas encerradas', () => {
  const push = read('supabase/functions/send-web-push/index.ts');

  assert.match(push, /MAX_TRANSIENT_ATTEMPTS = 3/);
  assert.match(push, /status === 429 \|\| status >= 500/);
  assert.match(push, /\[404, 410\]\.includes/);
  assert.match(push, /push_subscriptions'[\s\S]*\.delete\(\)/);
  assert.match(push, /push_sent_at:new Date\(\)\.toISOString\(\)/);
});

test('service worker não guarda páginas sensíveis e restringe o destino do clique', () => {
  const worker = read('sw.js');

  assert.match(worker, /SENSITIVE_PAGE_NAMES = new Set\(\['accept-invite\.html', 'reset-password\.html'\]\)/);
  assert.match(worker, /requested\.origin === scope\.origin/);
  assert.match(worker, /requested\.pathname\.startsWith\(scope\.pathname\)/);
});
