document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const card = form.closest('.card');
  const title = card.querySelector('h2');
  const subtitle = card.querySelector('.sub');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const submit = form.querySelector('button[type="submit"], .primary');
  const hint = card.querySelector('.hint');
  let creatingAccount = false;

  const nameField = document.createElement('div');
  nameField.className = 'field hidden';
  nameField.id = 'nameField';
  nameField.innerHTML = '<label for="accountName">Nome do professor</label><input id="accountName" autocomplete="name" placeholder="Preencha seu nome aqui, Professor">';
  form.prepend(nameField);

  function updateMode() {
    nameField.classList.toggle('hidden', !creatingAccount);
    document.getElementById('accountName').required = creatingAccount;
    title.textContent = creatingAccount ? 'Crie sua conta' : 'Acesse sua conta';
    subtitle.textContent = creatingAccount ? 'Informe seus dados para solicitar acesso ao CARÔMETRO.' : 'Entre com seu e-mail e senha para continuar.';
    submit.textContent = creatingAccount ? 'Criar minha conta' : 'Entrar';
    hint.innerHTML = creatingAccount
      ? 'Já possui uma conta? <button id="toggleAccountMode" type="button" class="link">Entrar</button>'
      : '<b>Primeiro acesso?</b> Crie sua conta e informe seu nome para facilitar a identificação nas permissões. <button id="toggleAccountMode" type="button" class="link">Criar conta</button>';
    document.getElementById('toggleAccountMode').onclick = () => { creatingAccount = !creatingAccount; updateMode(); };
  }

  form.onsubmit = async event => {
    event.preventDefault();
    const errorBox = document.getElementById('loginError');
    const emailValue = email.value.trim();
    if (creatingAccount) {
      const fullName = document.getElementById('accountName').value.trim();
      const { error } = await db.auth.signUp({
        email: emailValue,
        password: password.value,
        options: { emailRedirectTo: location.href, data: { full_name: fullName } }
      });
      if (error) { errorBox.textContent = error.message; errorBox.classList.remove('hidden'); return; }
      toast('Conta criada. Confirme o e-mail recebido para entrar.');
      creatingAccount = false;
      form.reset();
      updateMode();
      return;
    }
    const { error } = await db.auth.signInWithPassword({ email: emailValue, password: password.value });
    errorBox.textContent = error?.message || '';
    errorBox.classList.toggle('hidden', !error);
    if (!error) showApp();
  };

  updateMode();
});
