document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const card = form.closest('.card');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const hint = card.querySelector('.hint');

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

  // Cadastro público espontâneo removido: novos usuários só entram pelo
  // fluxo de convite (accept-invite.html), que mantém seu próprio signUp().
  hint.textContent = 'Precisa de acesso? Solicite um convite ao administrador da sua escola.';

  form.onsubmit = async event => {
    event.preventDefault();
    const errorBox = document.getElementById('loginError');
    const emailValue = email.value.trim();
    const { error } = await db.auth.signInWithPassword({ email: emailValue, password: password.value });
    errorBox.textContent = error?.message || '';
    errorBox.classList.toggle('hidden', !error);
    if (!error) {
      // Login normal bem-sucedido é prova real de senha própria — regulariza
      // o marcador para quem já tinha senha antes de ele existir. Melhor
      // esforço: uma falha aqui nunca pode bloquear quem já provou a senha.
      db.rpc('mark_current_user_password_set').catch(() => {});
      showApp();
    }
  };
});
