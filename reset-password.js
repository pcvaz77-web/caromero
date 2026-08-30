// Redefinição de senha do ambiente comercial. Este arquivo só é carregado
// quando carometro-config.js confirma um backend comercial autorizado.
const db = window.createCarometroSupabaseClient();
let recoveryAuthorized = false;
const loginUrl = new URL('./', location.href).href;
const returnUrl = (() => {
  const next = new URLSearchParams(location.search).get('next');
  if (!next) return loginUrl;
  try {
    const target = new URL(next, location.href);
    const invitationPath = new URL('accept-invite.html', location.href).pathname;
    return target.origin === location.origin && target.pathname === invitationPath
      ? target.href
      : loginUrl;
  } catch { return loginUrl; }
})();
const error = document.getElementById('error');
const form = document.getElementById('resetForm');
const status = document.getElementById('resetStatus');
const backToLogin = document.getElementById('backToLogin');
const message = text => { error.textContent = text; error.classList.remove('hidden'); };
const goToLogin = async () => { await db.auth.signOut(); location.replace(returnUrl); };
const unlockRecoveryForm = () => {
  recoveryAuthorized = true;
  status.classList.add('hidden');
  backToLogin.classList.add('hidden');
  form.classList.remove('hidden');
};

// Uma sessão comum já aberta no navegador não autoriza esta tela. Somente o
// evento PASSWORD_RECOVERY, emitido pelo Supabase após validar o token do link,
// pode liberar a troca sem a senha atual. O parâmetro type=recovery da URL não
// é usado como prova porque pode ser digitado manualmente por qualquer pessoa.
db.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') unlockRecoveryForm();
});

setTimeout(() => {
  if (recoveryAuthorized) return;
  status.textContent = 'Este link expirou, já foi usado ou não é um link válido de recuperação.';
}, 1500);

document.getElementById('cancel').onclick = goToLogin;
backToLogin.onclick = goToLogin;
document.getElementById('resetForm').onsubmit = async event => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  const confirmation = document.getElementById('confirmation').value;
  if (password !== confirmation) { message('As duas senhas precisam ser iguais.'); return; }
  const save = document.getElementById('save');
  save.disabled = true; error.classList.add('hidden');
  const { data: { session } } = await db.auth.getSession();
  if (!session || !recoveryAuthorized) {
    save.disabled = false;
    message('Este link expirou ou já foi usado. Solicite uma nova recuperação de senha.');
    return;
  }
  const { error: updateError } = await db.auth.updateUser({ password });
  if (updateError) { save.disabled = false; message(updateError.message); return; }
  // updateUser({password}) bem-sucedido é prova real de senha própria.
  // Melhor esforço, e precisa rodar antes do goToLogin (que faz signOut).
  await db.rpc('mark_current_user_password_set').catch(() => {});
  save.textContent = 'Senha atualizada';
  await goToLogin();
};
