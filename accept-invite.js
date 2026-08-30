// Fluxo comercial de aceite. A autorização definitiva continua no banco;
// esta validação antecipada evita criar ou recuperar uma conta diferente do
// e-mail associado ao convite.
const db = window.createCarometroSupabaseClient();
const $ = id => document.getElementById(id);
let preview;

function invitationToken() {
  try { return sessionStorage.getItem('carometroInviteToken'); }
  catch { return null; }
}

const token = invitationToken();
const normalizeEmail = value => String(value || '').trim().toLowerCase();

function showError(id, message) {
  $(id).textContent = message;
  $(id).classList.remove('hidden');
}

function clearErrors() {
  ['fatal', 'formError', 'sessionError'].forEach(id => {
    $(id).textContent = '';
    $(id).classList.add('hidden');
  });
}

function busy(value) {
  ['signupSubmit', 'loginSubmit', 'continueBtn', 'switchBtn', 'forgotBtn', 'onboardingSubmit', 'retryStatusBtn']
    .forEach(id => { $(id).disabled = value; });
}

// Nome funcionalmente válido para identificar professor/coordenador em
// ocorrências e demais registros: sem exagerar na regra, só evita valores
// obviamente inválidos (vazio, só espaços, 1 caractere). Preserva acentos e
// nomes brasileiros normalmente — nenhuma outra restrição é aplicada.
const validName = value => String(value || '').trim().length >= 2;

// Estados do primeiro acesso, sempre recalculados a partir do servidor
// (current_user_onboarding_status), nunca assumidos a partir do sucesso
// aparente de uma escrita anterior nem guardados como flag local que
// sobreviva a um reload.
async function loadOnboardingStatus() {
  const { data, error } = await db.rpc('current_user_onboarding_status');
  if (
    error ||
    !Array.isArray(data) ||
    !data[0] ||
    typeof data[0].has_password !== 'boolean' ||
    typeof data[0].has_name !== 'boolean'
  ) {
    return 'unknown';
  }
  const { has_password, has_name } = data[0];
  if (!has_password && !has_name) return 'needs_both';
  if (!has_password && has_name) return 'needs_password';
  if (has_password && !has_name) return 'needs_name';
  return 'ready';
}

function renderOnboarding(state) {
  $('sessionStatusError').classList.toggle('hidden', state !== 'unknown');
  $('onboardingForm').classList.toggle('hidden', state === 'unknown' || state === 'ready');
  $('continueBtn').classList.toggle('hidden', state !== 'ready');
  const needsName = state === 'needs_both' || state === 'needs_name';
  const needsPassword = state === 'needs_both' || state === 'needs_password';
  $('onboardingNameField').classList.toggle('hidden', !needsName);
  $('onboardingName').required = needsName;
  $('onboardingPasswordField').classList.toggle('hidden', !needsPassword);
  $('onboardingPasswordConfirmField').classList.toggle('hidden', !needsPassword);
  $('onboardingPassword').required = needsPassword;
  $('onboardingPasswordConfirm').required = needsPassword;
  if (state === 'needs_both') {
    $('onboardingNote').textContent = 'Antes de continuar, informe seu nome e defina a senha desta conta.';
  } else if (state === 'needs_password') {
    $('onboardingNote').textContent = 'Antes de continuar, defina a senha desta conta.';
  } else if (state === 'needs_name') {
    $('onboardingNote').textContent = 'Antes de continuar, confirme seu nome completo.';
  }
}

async function refreshOnboarding() {
  const state = await loadOnboardingStatus();
  renderOnboarding(state);
  return state;
}

function showAuth() {
  $('sessionBox').classList.add('hidden');
  $('authBox').classList.remove('hidden');
}

function showSession(email) {
  $('authBox').classList.add('hidden');
  $('sessionEmail').textContent = email || '';
  $('sessionBox').classList.remove('hidden');
}

async function emailMatchesInvitation(email) {
  const normalized = normalizeEmail(email);
  if (!token || !normalized) return false;
  const { data, error } = await db.rpc('invitation_email_matches', {
    invitation_token:token,
    candidate_email:normalized
  });
  if (error) throw error;
  return data === true;
}

async function requireInvitedEmail(email) {
  if (await emailMatchesInvitation(email)) return true;
  showError('formError', 'Use exatamente o e-mail que recebeu este convite.');
  return false;
}

async function acceptInvitation() {
  clearErrors();
  busy(true);
  try {
    const { error } = await db.rpc('accept_school_invitation', { invitation_token:token });
    if (error) {
      const target = $('sessionBox').classList.contains('hidden') ? 'formError' : 'sessionError';
      showError(target, error.message === 'Este convite pertence a outro usuário.'
        ? 'Este convite pertence a outra conta. Entre com o e-mail exato do convite.'
        : error.message);
      return;
    }
    try { sessionStorage.removeItem('carometroInviteToken'); } catch {}
    $('sessionBox').classList.add('hidden');
    $('authBox').classList.add('hidden');
    $('success').classList.remove('hidden');
    setTimeout(() => location.replace(new URL('./', location.href).href), 1500);
  } finally {
    busy(false);
  }
}

// Invariante central: NENHUM caminho deste arquivo pode chamar
// acceptInvitation() sem, imediatamente antes, reconsultar
// current_user_onboarding_status() e obter READY. Todos os handlers abaixo
// (onboarding, "Continuar com esta conta", login e cadastro dentro do
// convite) passam por aqui em vez de chamar acceptInvitation() direto —
// assim a regra não depende de cada handler lembrar dela individualmente.
async function acceptInvitationIfReady() {
  const state = await refreshOnboarding();
  if (state === 'unknown') {
    showError('sessionError', 'Não foi possível confirmar o estado da sua conta. Tente novamente.');
    return;
  }
  if (state !== 'ready') return; // renderOnboarding já mostrou o formulário certo (nome e/ou senha)
  await acceptInvitation();
}

async function boot() {
  if (!token) { showError('fatal', 'Link inválido. Peça um novo convite.'); return; }
  const { data, error } = await db.rpc('get_invitation_preview', { invitation_token:token });
  if (error || !data?.length) {
    showError('fatal', 'Este convite é inválido, expirou, foi cancelado ou já foi utilizado.');
    return;
  }
  preview = data[0];
  $('school').textContent = preview.school_name || '';
  $('role').textContent = `Papel: ${preview.role === 'coordinator' ? 'Coordenador(a)' : preview.role === 'school_admin' ? 'Administrador(a)' : 'Professor(a)'}`;
  $('email').textContent = `E-mail: ${preview.masked_email || ''}`;
  $('content').classList.remove('hidden');
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    showSession(session.user.email);
    // Qualquer papel (school_admin, coordinator ou teacher) pode chegar
    // aqui autenticado pelo convite nativo do Supabase, sem nunca ter
    // definido senha nem nome próprios — o mecanismo é o mesmo para os
    // três. O estado exato (senha? nome?) é sempre consultado ao vivo no
    // servidor, nunca assumido a partir do papel do convite.
    await refreshOnboarding();
  }
  else showAuth();
  if (preview.email_has_account) {
    $('loginTab').click();
    $('existing').classList.remove('hidden');
  }
}

$('continueBtn').onclick = acceptInvitationIfReady;
$('retryStatusBtn').onclick = async () => {
  busy(true);
  await refreshOnboarding();
  busy(false);
};
$('onboardingForm').onsubmit = async event => {
  event.preventDefault();
  clearErrors();
  // Reconfirma o estado real antes de decidir o que gravar — nunca reusa um
  // estado calculado antes deste clique (pode ter mudado, ex.: outra aba).
  const state = await loadOnboardingStatus();
  renderOnboarding(state);
  if (state === 'unknown') {
    showError('sessionError', 'Não foi possível confirmar o estado da sua conta. Tente novamente.');
    return;
  }
  if (state === 'ready') return;

  const needsName = state === 'needs_both' || state === 'needs_name';
  const needsPassword = state === 'needs_both' || state === 'needs_password';
  const name = $('onboardingName').value;
  if (needsName && !validName(name)) {
    showError('sessionError', 'Informe um nome completo válido.');
    return;
  }
  if (needsPassword) {
    const password = $('onboardingPassword').value;
    if (password !== $('onboardingPasswordConfirm').value) {
      showError('sessionError', 'As duas senhas precisam ser iguais.');
      return;
    }
  }

  const trimmedName = needsName ? name.trim() : '';

  busy(true);
  try {
    // 1) Auth (senha e/ou metadata.full_name, conforme o que este estado
    // exige) — mesmo padrão já usado em "Meu Perfil"
    // (student-edit-improvements.js): auth.updateUser({password?, data:
    // {full_name}}) antes do upsert em profiles, para as duas fontes nunca
    // ficarem dessincronizadas (profiles com nome novo e user_metadata
    // vazio/antigo). NEEDS_PASSWORD não inclui full_name aqui — a conta já
    // tem nome válido, que não deve ser reescrito nem pedido de novo.
    if (needsPassword && needsName) {
      const password = $('onboardingPassword').value;
      const { error: authError } = await db.auth.updateUser({ password, data: { full_name: trimmedName } });
      if (authError) { showError('sessionError', authError.message); return; }
    } else if (needsPassword) {
      const password = $('onboardingPassword').value;
      const { error: authError } = await db.auth.updateUser({ password });
      if (authError) { showError('sessionError', authError.message); return; }
    } else if (needsName) {
      const { error: authError } = await db.auth.updateUser({ data: { full_name: trimmedName } });
      if (authError) { showError('sessionError', authError.message); return; }
    }

    // 1b) Marcador de senha — só gravado depois de uma prova real
    // (updateUser({password}) bem-sucedido nesta mesma submissão).
    // Bloqueante: se a gravação falhar, o convite NÃO pode ser aceito,
    // mesmo que a senha já exista no GoTrue — sem o marcador,
    // current_user_onboarding_status() continua reportando has_password
    // falso, então a reconfirmação final (passo 3) não deixa aceitar.
    if (needsPassword) {
      const { error: markError } = await db.rpc('mark_current_user_password_set');
      if (markError) {
        showError('sessionError', 'Não foi possível confirmar sua senha agora. Tente novamente.');
        await refreshOnboarding();
        return;
      }
    }

    // 2) profiles.full_name continua sendo a ÚNICA fonte que
    // current_user_onboarding_status() lê para decidir has_name — por isso
    // esta escrita é obrigatória sempre que needsName, mesmo que o passo
    // acima já tenha sincronizado o metadata: uma atualização bem-sucedida
    // só do metadata nunca pode, sozinha, produzir READY.
    if (needsName) {
      const { data: { user } } = await db.auth.getUser();
      const { error: profileError } = await db.from('profiles')
        .upsert({ id: user.id, full_name: trimmedName, email: user.email }, { onConflict: 'id' });
      if (profileError) {
        showError('sessionError', 'Não foi possível salvar seu nome. Tente novamente.');
        await refreshOnboarding();
        return;
      }
    }

    // 3) Só aceita o convite através da guarda central, que reconsulta o
    // servidor e só prossegue quando ele confirmar READY.
    await acceptInvitationIfReady();
  } finally {
    busy(false);
  }
};
$('switchBtn').onclick = async () => {
  busy(true);
  await db.auth.signOut();
  busy(false);
  showAuth();
};
$('signupTab').onclick = () => {
  clearErrors();
  $('signupTab').classList.add('active');
  $('loginTab').classList.remove('active');
  $('signupForm').classList.remove('hidden');
  $('loginForm').classList.add('hidden');
};
$('loginTab').onclick = () => {
  clearErrors();
  $('loginTab').classList.add('active');
  $('signupTab').classList.remove('active');
  $('loginForm').classList.remove('hidden');
  $('signupForm').classList.add('hidden');
};

$('signupForm').onsubmit = async event => {
  event.preventDefault();
  clearErrors();
  const name = $('signupName').value.trim();
  const email = normalizeEmail($('signupEmail').value);
  const password = $('signupPassword').value;
  if (password !== $('signupConfirm').value) {
    showError('formError', 'As senhas precisam ser iguais.');
    return;
  }
  busy(true);
  try {
    if (!await requireInvitedEmail(email)) return;
    const redirectTo = new URL(`${location.pathname}?token=${encodeURIComponent(token)}`, location.origin).href;
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options:{ emailRedirectTo:redirectTo, data:{ full_name:name } }
    });
    if (error) { showError('formError', error.message); return; }
    if (data.session) {
      // signUp com sessão imediata é prova real de senha própria escolhida
      // agora mesmo pelo usuário — grava o marcador. has_name continua
      // vindo exclusivamente de profiles.full_name (nunca de
      // auth.user_metadata, mesmo que o próprio signUp já tenha colocado o
      // nome lá via options.data), por isso gravamos em profiles aqui de
      // forma explícita, não confiamos só no metadata do signUp.
      await db.rpc('mark_current_user_password_set');
      const { error: profileError } = await db.from('profiles')
        .upsert({ id: data.user.id, full_name: name, email: data.user.email }, { onConflict: 'id' });
      if (profileError) { showError('formError', 'Não foi possível salvar seu nome. Tente novamente.'); return; }
      showSession(email);
      await acceptInvitationIfReady();
      return;
    }
    $('authBox').classList.add('hidden');
    $('confirm').classList.remove('hidden');
  } catch (error) {
    showError('formError', error.message || 'Não foi possível validar o convite.');
  } finally {
    busy(false);
  }
};

$('loginForm').onsubmit = async event => {
  event.preventDefault();
  clearErrors();
  const email = normalizeEmail($('loginEmail').value);
  busy(true);
  try {
    if (!await requireInvitedEmail(email)) return;
    const { error } = await db.auth.signInWithPassword({ email, password:$('loginPassword').value });
    if (error) { showError('formError', error.message); return; }
    // signInWithPassword bem-sucedido é prova real de que a senha existe.
    // Não bloqueia aqui em caso de falha do marcador: a guarda central
    // (acceptInvitationIfReady) reconsulta o estado real do servidor antes
    // de aceitar, então uma falha nesta gravação naturalmente impede o
    // aceite mesmo sem tratamento especial neste handler.
    await db.rpc('mark_current_user_password_set');
    showSession(email);
    await acceptInvitationIfReady();
  } catch (error) {
    showError('formError', error.message || 'Não foi possível validar o convite.');
  } finally {
    busy(false);
  }
};

$('forgotBtn').onclick = async () => {
  clearErrors();
  const email = normalizeEmail($('loginEmail').value);
  if (!email) { showError('formError', 'Informe seu e-mail.'); return; }
  busy(true);
  try {
    if (!await requireInvitedEmail(email)) return;
    const next = `accept-invite.html?token=${encodeURIComponent(token)}`;
    const resetUrl = new URL(`reset-password.html?next=${encodeURIComponent(next)}`, location.href).href;
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo:resetUrl });
    if (error) { showError('formError', error.message); return; }
    $('recovery').classList.remove('hidden');
  } catch (error) {
    showError('formError', error.message || 'Não foi possível validar o convite.');
  } finally {
    busy(false);
  }
};

boot();
