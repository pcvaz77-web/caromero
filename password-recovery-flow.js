(() => {
  // Guarda o tipo do link antes que o Supabase processe a URL e crie a sessão
  // temporária de recuperação. Assim a aplicação nunca abre o painel nesse fluxo.
  const initialHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const initialSearch = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search;
  const isRecoveryParameters = value => new URLSearchParams(value).get('type') === 'recovery';
  const recoveryLink = isRecoveryParameters(initialHash) || isRecoveryParameters(initialSearch);
  let recoveryActive = recoveryLink;
  let showRecoveryScreen = null;

  window.isCarometroPasswordRecovery = () => recoveryActive;
  window.openCarometroPasswordReset = () => {
    recoveryActive = true;
    showRecoveryScreen?.();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const login = document.getElementById('login');
    const app = document.getElementById('app');
    const modal = document.createElement('div');
    modal.id = 'passwordResetModal';
    modal.className = 'modal-bg hidden password-reset-modal';
    modal.innerHTML = `
      <div class="modal small" role="dialog" aria-modal="true" aria-labelledby="passwordResetTitle">
        <div class="modal-head"><h3 id="passwordResetTitle">Criar nova senha</h3></div>
        <form id="passwordResetForm" class="form">
          <p class="sub">Defina sua nova senha para concluir a recuperação. Em seguida, entre novamente pelo navegador.</p>
          <div class="field"><label for="newRecoveryPassword">Nova senha</label><input id="newRecoveryPassword" type="password" autocomplete="new-password" minlength="6" required></div>
          <div class="field"><label for="confirmRecoveryPassword">Confirme a nova senha</label><input id="confirmRecoveryPassword" type="password" autocomplete="new-password" minlength="6" required></div>
          <p id="passwordResetError" class="error hidden"></p>
          <div class="actions"><button class="btn secondary" type="button" id="cancelPasswordReset">Cancelar e voltar ao login</button><button class="btn primary" type="submit" id="saveRecoveryPassword">Salvar nova senha</button></div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const clearRecoveryUrl = () => history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    const resetToLogin = async message => {
      recoveryActive = false;
      clearRecoveryUrl();
      modal.classList.add('hidden');
      app.classList.add('hidden');
      login.classList.remove('hidden');
      document.getElementById('password').value = '';
      if (message) toast(message);
    };

    showRecoveryScreen = () => {
      recoveryActive = true;
      app.classList.add('hidden');
      login.classList.remove('hidden');
      modal.classList.remove('hidden');
      document.getElementById('newRecoveryPassword').focus();
    };
    if (recoveryActive) showRecoveryScreen();

    // O link aponta para a página principal. A etapa de senha é exibida por
    // cima dela e, ao terminar, a pessoa volta ao login normal do navegador.
    document.getElementById('recoveryForm').onsubmit = async event => {
      event.preventDefault();
      const email = document.getElementById('recoveryEmail').value.trim();
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}`
      });
      if (error) { toast(error.message); return; }
      document.getElementById('recoveryModal').classList.add('hidden');
      toast('Link de recuperação enviado. Abra-o no navegador para criar a nova senha.');
    };

    document.getElementById('cancelPasswordReset').onclick = async () => {
      await db.auth.signOut();
      await resetToLogin('Recuperação cancelada. Faça login quando estiver pronto.');
    };

    document.getElementById('passwordResetForm').onsubmit = async event => {
      event.preventDefault();
      const password = document.getElementById('newRecoveryPassword').value;
      const confirmation = document.getElementById('confirmRecoveryPassword').value;
      const error = document.getElementById('passwordResetError');
      if (password !== confirmation) {
        error.textContent = 'As duas senhas precisam ser iguais.';
        error.classList.remove('hidden');
        return;
      }
      const save = document.getElementById('saveRecoveryPassword');
      save.disabled = true;
      error.classList.add('hidden');
      const { error: updateError } = await db.auth.updateUser({ password });
      save.disabled = false;
      if (updateError) {
        error.textContent = updateError.message;
        error.classList.remove('hidden');
        return;
      }
      await db.auth.signOut();
      document.getElementById('passwordResetForm').reset();
      await resetToLogin('Senha atualizada. Entre novamente com a nova senha.');
    };

    db.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryActive = true;
        showRecoveryScreen();
      }
    });
  });
})();
