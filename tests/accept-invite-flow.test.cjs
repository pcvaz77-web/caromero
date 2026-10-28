const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'accept-invite.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'accept-invite.html'), 'utf8');

async function start(options = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(['hidden']);
      elements.set(id, {
        textContent: '', value: '', checked: false, disabled: false, required: false,
        classList: {
          add: value => classes.add(value),
          remove: value => classes.delete(value),
          contains: value => classes.has(value),
          toggle: (value, force) => {
            if (force === undefined ? !classes.has(value) : force) classes.add(value);
            else classes.delete(value);
          }
        },
        focus() {}
      });
    }
    return elements.get(id);
  };
  const user = { id: 'user-1', email: 'professor@example.com', email_confirmed_at: options.confirmed === false ? null : '2026-10-28T00:00:00Z' };
  const state = { hasPassword: false, hasName: false, accepted: false, redirected: null, updates: 0, preferenceAttempts: 0, otpAttempts: 0 };
  const db = {
    rpc: async name => {
      if (name === 'get_invitation_preview_v2') return { data: [{ status: 'pending', school_name: 'Escola', role: 'teacher', masked_email: 'p***@example.com' }] };
      if (name === 'invitation_email_matches') return { data: true };
      if (name === 'current_user_onboarding_status') return { data: [{ has_password: state.hasPassword, has_name: state.hasName }] };
      if (name === 'mark_current_user_password_set') { state.hasPassword = true; return { error: null }; }
      if (name === 'accept_school_invitation') { state.accepted = true; return { error: null }; }
      throw new Error(`RPC inesperada: ${name}`);
    },
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async () => ({ error: null }),
      verifyOtp: async () => {
        state.otpAttempts++;
        if (options.otpThrowsOnce && state.otpAttempts === 1) throw new Error('rede indisponível');
        return { data: { user }, error: null };
      },
      updateUser: async () => {
        state.updates++;
        if (options.updateThrows) throw new Error('rede indisponível');
        return { error: null };
      }
    },
    from: table => ({ upsert: async () => {
      if (table === 'profiles') state.hasName = true;
      if (table === 'platform_communication_preferences') {
        state.preferenceAttempts++;
        return { error: options.preferencesFail ? new Error('falha nas preferências') : null };
      }
      return { error: null };
    } })
  };
  const context = {
    window: { createCarometroSupabaseClient: () => db, CAROMETRO_INVITE_BOOT: {
      token: 'invite-token', authTokenHash: options.otpThrowsOnce ? 'hash-ficticio' : null,
      type: options.otpThrowsOnce ? 'email' : null
    } },
    document: { getElementById: element },
    localStorage: { setItem() {} },
    sessionStorage: { removeItem() {} },
    location: { href: 'https://sistemacarometro.com.br/accept-invite.html', replace: value => { state.redirected = value; } },
    URL, setTimeout: callback => callback()
  };
  vm.runInNewContext(source, context, { filename: 'accept-invite.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { element, state };
}

function fillForm(element) {
  element('onboardingName').value = 'Maria Silva';
  element('onboardingPassword').value = 'senha-ficticia-123';
  element('onboardingPasswordConfirm').value = 'senha-ficticia-123';
}

test('conta confirmada salva nome e senha, aceita o convite e entra na escola', async () => {
  const { element, state } = await start();
  fillForm(element);
  await element('onboardingForm').onsubmit({ preventDefault() {} });
  assert.equal(state.updates, 1);
  assert.equal(state.accepted, true);
  assert.equal(state.redirected, 'https://sistemacarometro.com.br/');
  assert.equal(element('success').classList.contains('hidden'), false);
});

test('sessão com e-mail não confirmado não libera o formulário de nome e senha', async () => {
  const { element } = await start({ confirmed: false });
  assert.equal(element('authBox').classList.contains('hidden'), false);
  assert.equal(element('onboardingForm').classList.contains('hidden'), true);
  assert.match(element('formError').textContent, /Confirme seu e-mail/);
});

test('login com e-mail não confirmado não aceita o convite', async () => {
  const { element, state } = await start({ confirmed: false });
  element('loginEmail').value = 'professor@example.com';
  element('loginPassword').value = 'senha-ficticia-123';
  await element('loginForm').onsubmit({ preventDefault() {} });
  assert.equal(state.accepted, false);
  assert.match(element('formError').textContent, /Confirme seu e-mail/);
});

test('falha inesperada ao salvar conta mostra erro e libera nova tentativa', async () => {
  const { element, state } = await start({ updateThrows: true });
  fillForm(element);
  await element('onboardingForm').onsubmit({ preventDefault() {} });
  assert.equal(state.accepted, false);
  assert.match(element('sessionError').textContent, /Não foi possível concluir o cadastro/);
  assert.equal(element('onboardingSubmit').disabled, false);
});

test('preferências opcionais com erro não bloqueiam a entrada na escola', async () => {
  const { element, state } = await start({ preferencesFail: true });
  fillForm(element);
  element('onboardingEmailUpdates').checked = true;
  await element('onboardingForm').onsubmit({ preventDefault() {} });
  assert.equal(state.preferenceAttempts, 1);
  assert.equal(state.accepted, true);
  assert.match(element('success').textContent, /preferências de comunicação não foram salvas/);
});

test('estado incompleto após salvar mostra o motivo em vez de parar silenciosamente', async () => {
  const { element, state } = await start();
  fillForm(element);
  state.hasName = false;
  await element('continueBtn').onclick();
  assert.equal(state.accepted, false);
  assert.match(element('sessionError').textContent, /nome e sua senha ainda não foram confirmados/);
});

test('estado já concluído ao enviar o formulário aceita o convite', async () => {
  const { element, state } = await start();
  state.hasPassword = true;
  state.hasName = true;
  await element('onboardingForm').onsubmit({ preventDefault() {} });
  assert.equal(state.accepted, true);
  assert.equal(state.updates, 0);
});

test('erro temporário de rede não descarta o link de confirmação', async () => {
  const { element, state } = await start({ otpThrowsOnce: true });
  await element('emailContinueBtn').onclick();
  assert.match(element('formError').textContent, /Confira sua conexão e tente novamente/);
  assert.equal(element('emailContinueBtn').textContent, 'Confirmar meu e-mail e continuar');
  await element('emailContinueBtn').onclick();
  assert.equal(state.otpAttempts, 2);
  assert.equal(element('onboardingForm').classList.contains('hidden'), false);
});

test('link com hash de confirmação preserva o convite e remove o segredo da URL', () => {
  const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript);
  const storage = new Map();
  let sanitizedUrl;
  const context = {
    window: {}, URL, URLSearchParams,
    location: { href: 'https://sistemacarometro.com.br/accept-invite.html?token=convite-ficticio#auth_token_hash=hash-ficticio&type=email' },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { replaceState: (_a, _b, value) => { sanitizedUrl = value; } }
  };
  vm.runInNewContext(inlineScript, context);
  assert.equal(context.window.CAROMETRO_INVITE_BOOT.token, 'convite-ficticio');
  assert.equal(context.window.CAROMETRO_INVITE_BOOT.authTokenHash, 'hash-ficticio');
  assert.equal(context.window.CAROMETRO_INVITE_BOOT.type, 'email');
  assert.equal(sanitizedUrl, '/accept-invite.html');
});
