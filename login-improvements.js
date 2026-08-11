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

  const credit = document.createElement('footer');
  credit.className = 'brand-credit';
  credit.innerHTML = '<span>Criado por: Professor Paulo Passos</span><span>Todos os direitos reservados</span>';
  document.querySelector('.brand').appendChild(credit);

  const creditStyle = document.createElement('style');
  creditStyle.textContent = `
    .brand { position:relative; }
    .brand-credit { position:absolute; right:9vw; bottom:34px; left:9vw; display:flex; justify-content:space-between; gap:16px; color:#cbd9f4; font-size:12px; }
    @media (max-width:800px) { .brand-credit { display:none; } }
  `;
  document.head.appendChild(creditStyle);

  const passwordField = password.closest('.field');
  passwordField.classList.add('password-field');
  const passwordToggle = document.createElement('button');
  passwordToggle.type = 'button';
  passwordToggle.className = 'password-toggle';
  passwordToggle.setAttribute('aria-label', 'Mostrar senha');
  passwordToggle.setAttribute('aria-pressed', 'false');
  passwordToggle.innerHTML = '&#128065;';
  passwordField.appendChild(passwordToggle);

  const passwordStyle = document.createElement('style');
  passwordStyle.textContent = `
    .password-field { position:relative; }
    .password-field input { padding-right:50px; }
    .password-toggle { position:absolute; right:8px; bottom:7px; width:34px; height:34px; border-radius:7px; color:#475467; background:transparent; font-size:19px; line-height:1; }
    .password-toggle:hover, .password-toggle:focus { background:#eef3ff; color:var(--blue); }
  `;
  document.head.appendChild(passwordStyle);
  passwordToggle.onclick = () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    passwordToggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
    passwordToggle.setAttribute('aria-pressed', String(!visible));
  };

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
