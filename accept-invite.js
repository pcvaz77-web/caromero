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
  ['signupSubmit', 'loginSubmit', 'continueBtn', 'switchBtn', 'forgotBtn', 'sessionPasswordSubmit']
    .forEach(id => { $(id).disabled = value; });
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
    // Administrador principal chega autenticado pelo convite nativo do
    // Supabase, sem nunca ter definido uma senha própria. Exige isso antes
    // de aceitar. Coordenador/professor não passam por aqui — continuam
    // exatamente como já estavam aprovados.
    if (preview.role === 'school_admin') {
      $('continueBtn').classList.add('hidden');
      $('sessionPasswordForm').classList.remove('hidden');
    }
  }
  else showAuth();
  if (preview.email_has_account) {
    $('loginTab').click();
    $('existing').classList.remove('hidden');
  }
}

$('continueBtn').onclick = acceptInvitation;
$('sessionPasswordForm').onsubmit = async event => {
  event.preventDefault();
  clearErrors();
  const password = $('sessionPassword').value;
  if (password !== $('sessionPasswordConfirm').value) {
    showError('sessionError', 'As duas senhas precisam ser iguais.');
    return;
  }
  busy(true);
  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) { showError('sessionError', error.message); return; }
    // Só aceita o convite depois que a senha foi definida com sucesso.
    await acceptInvitation();
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
    if (data.session) { await acceptInvitation(); return; }
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
    await acceptInvitation();
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
