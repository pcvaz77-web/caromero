(() => {
  // Somente o evento PASSWORD_RECOVERY, emitido depois que o Supabase valida o
  // token do link, autoriza a troca. Parâmetros da URL não são prova de acesso.
  let recoveryActive = false;
  let showRecoveryScreen = null;

  window.isCarometroPasswordRecovery = () => recoveryActive;
  window.openCarometroPasswordReset = () => {
    if (!recoveryActive) return;
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
    const recoveryPageUrl = (() => {
      const basePath = location.pathname.endsWith('/')
        ? location.pathname
        : location.pathname.replace(/\/[^/]*$/, '/');
      return `${location.origin}${basePath}reset-password.html`;
    })();

    document.getElementById('recoveryForm').onsubmit = async event => {
      event.preventDefault();
      const email = document.getElementById('recoveryEmail').value.trim();
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryPageUrl
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
      const { data: { session } } = await db.auth.getSession();
      if (!session || !recoveryActive) {
        save.disabled = false;
        error.textContent = 'Este link expirou ou já foi usado. Solicite uma nova recuperação de senha.';
        error.classList.remove('hidden');
        return;
      }
      const { error: updateError } = await db.auth.updateUser({ password });
      save.disabled = false;
      if (updateError) {
        error.textContent = updateError.message;
        error.classList.remove('hidden');
        return;
      }
      // updateUser({password}) bem-sucedido é prova real de senha própria.
      // Melhor esforço: precisa rodar antes do signOut (a RPC exige sessão
      // ativa) e uma falha aqui não pode impedir a recuperação, que já
      // funcionou do ponto de vista do GoTrue.
      await db.rpc('mark_current_user_password_set').catch(() => {});
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
