const db = window.createCarometroSupabaseClient();
const $ = id => document.getElementById(id);
const bootData = window.CAROMETRO_INVITE_BOOT || {};
let authTokenHash = typeof bootData.authTokenHash === 'string' ? bootData.authTokenHash : null;
const authTokenType = bootData.type === 'email' ? 'email' : null;

function invitationToken() {
  if (typeof bootData.token === 'string' && bootData.token) return bootData.token;
  try { return sessionStorage.getItem('carometroInviteToken'); } catch { return null; }
}

const token = invitationToken();
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validName = value => String(value || '').trim().length >= 2;

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
  ['emailContinueBtn', 'loginSubmit', 'continueBtn', 'switchBtn', 'forgotBtn', 'onboardingSubmit', 'retryStatusBtn']
    .forEach(id => { $(id).disabled = value; });
}

function roleLabel(role) {
  if (role === 'coordinator') return 'Coordenador(a)';
  if (role === 'school_admin') return 'Administrador(a)';
  return 'Professor(a)';
}

async function loadOnboardingStatus() {
  const { data, error } = await db.rpc('current_user_onboarding_status');
  if (error || !Array.isArray(data) || !data[0]
      || typeof data[0].has_password !== 'boolean'
      || typeof data[0].has_name !== 'boolean') return 'unknown';
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
  if (state === 'needs_both') $('onboardingNote').textContent = 'Antes de continuar, informe seu nome e defina a senha desta conta.';
  else if (state === 'needs_password') $('onboardingNote').textContent = 'Antes de continuar, defina a senha desta conta.';
  else if (state === 'needs_name') $('onboardingNote').textContent = 'Antes de continuar, confirme seu nome completo.';
}

async function refreshOnboarding() {
  const state = await loadOnboardingStatus();
  renderOnboarding(state);
  return state;
}

function showAuth() {
  $('sessionBox').classList.add('hidden');
  $('authBox').classList.remove('hidden');
  $('emailContinueBtn').textContent = authTokenHash && authTokenType
    ? 'Confirmar meu e-mail e continuar'
    : 'Continuar com meu e-mail';
}

function showSession(email, matches) {
  $('authBox').classList.add('hidden');
  $('sessionEmail').textContent = email || '';
  $('sessionMismatch').classList.toggle('hidden', matches);
  $('sessionActions').classList.toggle('hidden', !matches);
  $('sessionBox').classList.remove('hidden');
}

async function emailMatchesInvitation(email) {
  const normalized = normalizeEmail(email);
  if (!token || !normalized) return false;
  const { data, error } = await db.rpc('invitation_email_matches', {
    invitation_token: token,
    candidate_email: normalized
  });
  if (error) throw error;
  return data === true;
}

async function requireInvitedEmail(email) {
  if (await emailMatchesInvitation(email)) return true;
  showError('formError', 'Use exatamente o e-mail que recebeu este convite.');
  return false;
}

async function showCurrentSession(user) {
  const matches = await emailMatchesInvitation(user?.email);
  showSession(user?.email, matches);
  if (matches) await refreshOnboarding();
  return matches;
}

async function acceptInvitation() {
  clearErrors();
  busy(true);
  try {
    const { error } = await db.rpc('accept_school_invitation', { invitation_token: token });
    if (error) {
      showError('sessionError', error.message === 'Este convite pertence a outro usuário.'
        ? 'Este convite pertence a outra conta. Entre com o e-mail exato do convite.'
        : error.message);
      return;
    }
    try { sessionStorage.removeItem('carometroInviteToken'); } catch {}
    $('sessionBox').classList.add('hidden');
    $('authBox').classList.add('hidden');
    $('success').classList.remove('hidden');
    setTimeout(() => location.replace(new URL('./', location.href).href), 1500);
  } finally { busy(false); }
}

async function acceptInvitationIfReady() {
  const state = await refreshOnboarding();
  if (state === 'unknown') {
    showError('sessionError', 'Não foi possível confirmar o estado da sua conta. Tente novamente.');
    return;
  }
  if (state !== 'ready') return;
  await acceptInvitation();
}

async function parseFunctionError(error) {
  try {
    const body = await error?.context?.json();
    if (body && typeof body === 'object') return body;
  } catch {}
  return null;
}

async function requestAuthenticationEmail() {
  const { data, error } = await db.functions.invoke('send-school-invitation', {
    body: { mode: 'resume', token }
  });
  if (!error && data?.ok) return;
  const body = data || await parseFunctionError(error);
  const failure = new Error(body?.error || 'Não foi possível enviar o e-mail agora. Tente novamente.');
  failure.code = body?.code;
  failure.retryAfter = body?.retry_after_seconds;
  throw failure;
}

async function verifyAuthenticationEmail() {
  // O hash one-time é consumido somente após este clique e nunca é persistido.
  const tokenHash = authTokenHash;
  authTokenHash = null;
  $('emailContinueBtn').textContent = 'Continuar com meu e-mail';
  if (!tokenHash || !authTokenType) throw new Error('Este link de autenticação não está mais disponível. Solicite um novo envio.');
  const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: authTokenType });
  if (error) throw new Error('Este link de autenticação expirou ou já foi utilizado. Solicite um novo envio.');
  return data.user;
}

async function boot() {
  if (!token) { showError('fatal', 'Link inválido. Peça um novo convite.'); return; }
  const { data, error } = await db.rpc('get_invitation_preview_v2', { p_token: token });
  const invitation = Array.isArray(data) ? data[0] : data;
  if (error || !invitation || invitation.status !== 'pending') {
    showError('fatal', 'Este convite é inválido, expirou, foi cancelado ou já foi utilizado.');
    return;
  }
  $('school').textContent = invitation.school_name || '';
  $('role').textContent = `Papel: ${roleLabel(invitation.role)}`;
  $('email').textContent = `E-mail: ${invitation.masked_email || ''}`;
  $('content').classList.remove('hidden');
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) await showCurrentSession(session.user);
  else showAuth();
}

$('emailContinueBtn').onclick = async () => {
  clearErrors(); busy(true);
  try {
    if (authTokenHash && authTokenType) {
      const user = await verifyAuthenticationEmail();
      if (await showCurrentSession(user)) await acceptInvitationIfReady();
      return;
    }
    await requestAuthenticationEmail();
    $('authMessage').textContent = 'Enviamos um link de acesso para o e-mail deste convite. Abra a mensagem para continuar.';
    $('authMessage').classList.remove('hidden');
  } catch (error) {
    if (error.code === 'rate_limited' && error.retryAfter) showError('formError', `Aguarde ${error.retryAfter} segundos antes de solicitar um novo envio.`);
    else showError('formError', error.message || 'Não foi possível continuar. Tente novamente.');
  } finally { busy(false); }
};

$('passwordLoginBtn').onclick = () => {
  clearErrors();
  $('loginForm').classList.toggle('hidden');
  if (!$('loginForm').classList.contains('hidden')) $('loginEmail').focus();
};

$('loginForm').onsubmit = async event => {
  event.preventDefault(); clearErrors();
  const email = normalizeEmail($('loginEmail').value); busy(true);
  try {
    if (!await requireInvitedEmail(email)) return;
    const { data, error } = await db.auth.signInWithPassword({ email, password: $('loginPassword').value });
    if (error) { showError('formError', 'Não foi possível entrar. Confira o e-mail e a senha.'); return; }
    const { error: markError } = await db.rpc('mark_current_user_password_set');
    if (markError) { showError('formError', 'Não foi possível confirmar o estado da sua conta. Tente novamente.'); return; }
    await showCurrentSession(data.user);
    await acceptInvitationIfReady();
  } catch (error) { showError('formError', error.message || 'Não foi possível validar o convite.'); }
  finally { busy(false); }
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
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
    if (error) throw error;
    $('recovery').classList.remove('hidden');
  } catch (error) { showError('formError', error.message || 'Não foi possível solicitar a recuperação.'); }
  finally { busy(false); }
};

$('continueBtn').onclick = acceptInvitationIfReady;
$('retryStatusBtn').onclick = async () => { busy(true); try { await refreshOnboarding(); } finally { busy(false); } };

$('onboardingForm').onsubmit = async event => {
  event.preventDefault(); clearErrors();
  const state = await loadOnboardingStatus();
  renderOnboarding(state);
  if (state === 'unknown') { showError('sessionError', 'Não foi possível confirmar o estado da sua conta. Tente novamente.'); return; }
  if (state === 'ready') return;
  const needsName = state === 'needs_both' || state === 'needs_name';
  const needsPassword = state === 'needs_both' || state === 'needs_password';
  const name = $('onboardingName').value.trim();
  if (needsName && !validName(name)) { showError('sessionError', 'Informe um nome completo válido.'); return; }
  if (needsPassword && $('onboardingPassword').value !== $('onboardingPasswordConfirm').value) {
    showError('sessionError', 'As duas senhas precisam ser iguais.'); return;
  }
  busy(true);
  try {
    const update = {};
    if (needsPassword) update.password = $('onboardingPassword').value;
    if (needsName) update.data = { full_name: name };
    const { error: authError } = await db.auth.updateUser(update);
    if (authError) { showError('sessionError', authError.message); return; }
    if (needsPassword) {
      const { error: markError } = await db.rpc('mark_current_user_password_set');
      if (markError) { showError('sessionError', 'Não foi possível confirmar sua senha agora. Tente novamente.'); await refreshOnboarding(); return; }
    }
    if (needsName) {
      const { data: { user } } = await db.auth.getUser();
      const { error: profileError } = await db.from('profiles')
        .upsert({ id: user.id, full_name: name, email: user.email }, { onConflict: 'id' });
      if (profileError) { showError('sessionError', 'Não foi possível salvar seu nome. Tente novamente.'); await refreshOnboarding(); return; }
    }
    await acceptInvitationIfReady();
  } finally { busy(false); }
};

$('switchBtn').onclick = async () => {
  busy(true);
  try { await db.auth.signOut(); showAuth(); }
  finally { busy(false); }
};

boot().catch(() => showError('fatal', 'Não foi possível abrir este convite agora. Tente novamente.'));
