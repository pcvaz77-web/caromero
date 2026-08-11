document.addEventListener('DOMContentLoaded', () => {
  const paymentUrl = 'https://mpago.la/299qqyC';
  const app = document.getElementById('app');
  const side = document.querySelector('.side');
  const originalShowApp = window.showApp;

  const style = document.createElement('style');
  style.textContent = `
    .settings-nav { margin-top:10px; text-align:left; background:transparent; color:#c9d3e8; padding:12px; font-weight:650; }
    .settings-nav:hover { color:#fff; background:#2b3c5d; border-radius:8px; }
    .subscription-login-link { margin-top:12px; text-decoration:none; }
    .subscription-summary { display:flex; justify-content:space-between; gap:16px; align-items:center; background:#f4f7ff; border:1px solid #dbe5ff; border-radius:10px; padding:16px; margin-bottom:20px; }
    .subscription-summary b { font-size:17px; display:block; }
    .access-users { display:grid; gap:10px; }
    .access-user { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--line); border-radius:10px; padding:14px; }
    .access-user .access-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .access-active { color:#08784b; font-weight:700; }
    .access-suspended { color:#b42318; font-weight:700; }
    @media(max-width:800px) { .subscription-summary,.access-user { align-items:flex-start; flex-direction:column; } .access-user .access-actions { justify-content:flex-start; } }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('button');
  nav.id = 'settingsNav';
  nav.className = 'settings-nav hidden';
  nav.innerHTML = '⚙ &nbsp; Configurações';
  side.insertBefore(nav, document.getElementById('signOut'));

  const loginCard = document.querySelector('#login .card');
  const subscribe = document.createElement('a');
  subscribe.className = 'btn secondary full subscription-login-link';
  subscribe.href = paymentUrl;
  subscribe.target = '_blank';
  subscribe.rel = 'noopener';
  subscribe.textContent = 'Assinar CARÔMETRO — R$ 97/mês';
  loginCard.querySelector('.hint').insertAdjacentElement('afterend', subscribe);

  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h3>Configurações da plataforma</h3><button class="close" type="button">×</button></div><div class="form"><div class="subscription-summary"><div><b>Assinatura CARÔMETRO — R$ 97,00/mês</b><span class="meta">A liberação é feita pelo administrador após confirmar o pagamento.</span></div><a class="btn primary" href="${paymentUrl}" target="_blank" rel="noopener">Abrir assinatura</a></div><h4 style="margin:0 0 7px">Acesso dos usuários</h4><p class="sub" style="margin:0 0 15px">Suspenda quem não deve acessar. Você pode reativar a qualquer momento.</p><div id="accessUsers" class="access-users"></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };

  const isAdmin = () => permission?.role === 'admin';
  function displayAccessProblem(message) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
    const error = document.getElementById('loginError');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  window.showApp = async function () {
    await originalShowApp();
    if (!user) return;
    if (permission?.access_status === 'suspended' && !isAdmin()) {
      await db.auth.signOut();
      displayAccessProblem('Seu acesso está suspenso. Fale com o administrador da plataforma.');
      return;
    }
    nav.classList.toggle('hidden', !isAdmin());
  };

  async function openSettings() {
    const target = document.getElementById('accessUsers');
    target.innerHTML = '<div class="meta">Carregando usuários...</div>';
    modal.classList.remove('hidden');
    const { data, error } = await db.from('user_permissions')
      .select('user_id,role,access_status,profiles(email,full_name)')
      .order('updated_at');
    if (error) {
      target.innerHTML = '<div class="error">Execute primeiro o arquivo de configuração de acesso no Supabase.</div>';
      return;
    }
    target.innerHTML = (data || []).map(item => {
      const admin = item.role === 'admin';
      const active = admin || item.access_status !== 'suspended';
      const name = item.profiles?.full_name?.trim() || 'Nome não informado';
      const email = item.profiles?.email || 'Usuário';
      return `<article class="access-user"><div><b>${esc(name)}</b><div class="meta">${esc(email)}</div><div class="${active ? 'access-active' : 'access-suspended'}">${active ? 'Acesso ativo' : 'Acesso suspenso'}</div></div><div class="access-actions">${admin ? '<span class="meta">Administrador principal</span>' : `<button class="btn secondary" onclick="setPlatformAccess('${item.user_id}','${active ? 'suspended' : 'active'}')">${active ? 'Suspender acesso' : 'Reativar acesso'}</button>`}</div></article>`;
    }).join('') || '<div class="empty">Nenhum usuário encontrado.</div>';
  }

  window.setPlatformAccess = async (id, status) => {
    const { error } = await db.from('user_permissions').update({ access_status:status, updated_at:new Date().toISOString() }).eq('user_id', id);
    if (error) { toast(error.message); return; }
    toast(status === 'active' ? 'Acesso liberado.' : 'Acesso suspenso.');
    openSettings();
  };
  nav.onclick = openSettings;
  new MutationObserver(() => {
    if (!app.classList.contains('hidden')) nav.classList.toggle('hidden', !isAdmin());
  }).observe(app, { attributes:true, attributeFilter:['class'] });
});
