document.addEventListener('DOMContentLoaded', () => {
  const paymentUrl = 'https://mpago.la/299qqyC';
  const app = document.getElementById('app');
  const side = document.querySelector('.side');
  const originalShowApp = window.showApp;
  let accessChannel;
  let platformOwner = false;

  const style = document.createElement('style');
  style.textContent = `
    .settings-nav { margin-top:10px; text-align:left; background:transparent; color:#c9d3e8; padding:12px; font-weight:650; }
    .settings-nav:hover { color:#fff; background:#2b3c5d; border-radius:8px; }
    .subscription-login-link { margin-top:12px; text-decoration:none; }
    .subscription-summary { display:flex; justify-content:space-between; gap:16px; align-items:center; background:#f4f7ff; border:1px solid #dbe5ff; border-radius:10px; padding:16px; margin-bottom:20px; }
    .subscription-summary b { font-size:17px; display:block; }
    .subscription-visibility { padding:12px; border:1px solid #dbe5ff; border-radius:9px; background:#f8faff; }
    .access-users { display:grid; gap:10px; }
    .access-user { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--line); border-radius:10px; padding:14px; }
    .access-user .access-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .access-user .access-actions .btn { min-height:38px; }
    .access-active { color:#08784b; font-weight:700; }
    .access-suspended { color:#b42318; font-weight:700; }
    .access-pending { color:#9a6b00; font-weight:700; }
    .access-unknown { color:#6b5bd6; font-weight:700; }
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

  async function refreshSubscriptionButton() {
    const { data, error } = await db.from('platform_settings').select('show_subscription').eq('id', true).maybeSingle();
    // Enquanto a configuração ainda não existir, mantém a venda disponível.
    subscribe.classList.toggle('hidden', !error && data?.show_subscription === false);
    return !error && data ? data.show_subscription : true;
  }
  refreshSubscriptionButton();

  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h3>Configurações da plataforma</h3><button class="close" type="button">×</button></div><div class="form"><div class="subscription-summary"><div><b>Assinatura CARÔMETRO — R$ 97,00/mês</b><span class="meta">A liberação é feita pelo administrador após confirmar o pagamento.</span></div><a class="btn primary" href="${paymentUrl}" target="_blank" rel="noopener">Abrir assinatura</a></div><h4 style="margin:0 0 7px">Acesso dos usuários</h4><p class="sub" style="margin:0 0 15px">Suspenda quem não deve acessar. Você pode reativar a qualquer momento.</p><div id="accessUsers" class="access-users"></div></div></div>`;
  document.body.appendChild(modal);
  const subscriptionVisibility = document.createElement('label');
  subscriptionVisibility.className = 'check subscription-visibility';
  subscriptionVisibility.innerHTML = '<input id="showSubscriptionButton" type="checkbox"> Exibir botão de assinatura na página de login';
  modal.querySelector('h4').before(subscriptionVisibility);
  modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };

  async function refreshPlatformOwner() {
    if (!user) {
      platformOwner = false;
      return false;
    }
    const { data, error } = await db.rpc('is_platform_owner');
    platformOwner = !error && data === true;
    return platformOwner;
  }
  const isPlatformOwner = () => platformOwner;
  function displayAccessProblem(message) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
    const error = document.getElementById('loginError');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  async function suspendCurrentSession() {
    if (!user || isPlatformOwner()) return;
    window.prepareCarometroSignOut?.();
    await window.clearCarometroNotificationChannel?.();
    await db.auth.signOut();
    displayAccessProblem('Seu acesso está suspenso. Fale com o administrador da plataforma.');
  }

  function watchAccessStatus() {
    if (accessChannel) db.removeChannel(accessChannel);
    accessChannel = db.channel(`platform-access-${user.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'platform_account_access', filter:`user_id=eq.${user.id}` }, payload => {
        if (payload.new?.status === 'suspended') suspendCurrentSession();
      })
      .subscribe();
  }

  async function currentAccountIsSuspended() {
    if (!user || isPlatformOwner()) return false;
    const { data, error } = await db.from('platform_account_access').select('status').eq('user_id', user.id).maybeSingle();
    if (error) {
      console.error('Não foi possível verificar o status global da conta:', error.message);
      return false;
    }
    return data?.status === 'suspended';
  }

  window.showApp = async function () {
    // Não checa "user" aqui: essa variável global legada só é atribuída
    // dentro de originalShowApp() (algumas linhas abaixo), então na
    // primeiríssima execução desta função numa aba (sem login anterior no
    // mesmo contexto) ela ainda é undefined — um retorno antecipado aqui
    // pulava originalShowApp() por completo, e com ele profile/schoolMembership/
    // load/permissão nunca rodavam. originalShowApp() já faz sua própria
    // checagem, com o usuário buscado de verdade.
    await refreshPlatformOwner();
    if (await currentAccountIsSuspended()) {
      await suspendCurrentSession();
      return;
    }
    // Verifica o bloqueio antes de carregar alunos, fotos, turmas e demais
    // dados. A autorização definitiva continua sendo feita pelo banco.
    await originalShowApp();
    if (!user) return;
    nav.classList.toggle('hidden', !isPlatformOwner());
    watchAccessStatus();
  };

  async function openSettings() {
    if (!await refreshPlatformOwner()) {
      modal.classList.add('hidden');
      toast('Somente o proprietário da plataforma pode abrir estas configurações.');
      return;
    }
    const target = document.getElementById('accessUsers');
    const showSubscription = await refreshSubscriptionButton();
    document.getElementById('showSubscriptionButton').checked = showSubscription;
    target.innerHTML = '<div class="meta">Carregando usuários...</div>';
    modal.classList.remove('hidden');
    const { data, error } = await db.rpc('admin_list_accounts');
    if (error) {
      target.innerHTML = '<div class="error">Execute primeiro o arquivo de configuração de acesso no Supabase.</div>';
      return;
    }
    function accountStatus(item) {
      if (item.role === 'platform_owner') return { cls:'access-active', label:'Acesso ativo', toggle:null };
      if (!item.email_confirmed) return { cls:'access-pending', label:'Aguardando confirmação de e-mail', toggle:null };
      if (item.access_status === 'active') return { cls:'access-active', label:'Acesso ativo', toggle:'suspended' };
      if (item.access_status === 'suspended') return { cls:'access-suspended', label:'Acesso suspenso', toggle:'active' };
      // E-mail confirmado mas sem access_status definido (sem linha em user_permissions,
      // ou valor inesperado): não deve ser classificado como ativo nem como suspenso.
      return { cls:'access-unknown', label:'Acesso sem permissão configurada', toggle:null };
    }
    target.innerHTML = (data || []).map(item => {
      const owner = item.role === 'platform_owner';
      const status = accountStatus(item);
      const name = item.full_name?.trim() || 'Nome não informado';
      const email = item.email || 'Usuário';
      const toggleButton = status.toggle
        ? `<button class="btn secondary" onclick="setPlatformAccess('${item.user_id}','${status.toggle}')">${status.toggle === 'suspended' ? 'Suspender acesso' : 'Reativar acesso'}</button>`
        : '';
      return `<article class="access-user"><div><b>${esc(name)}</b><div class="meta">${esc(email)}</div><div class="${status.cls}">${status.label}</div></div><div class="access-actions">${owner ? '<span class="meta">Proprietário da plataforma</span>' : toggleButton}</div></article>`;
    }).join('') || '<div class="empty">Nenhum usuário encontrado.</div>';
    (data || []).forEach((item, index) => {
      if (item.role === 'platform_owner') return;
      const email = item.email || '';
      const controls = target.querySelectorAll('.access-actions')[index];
      if (!controls) return;
      const cancel = document.createElement('button');
      cancel.className = 'btn secondary';
      cancel.textContent = 'Cancelar login';
      cancel.onclick = () => window.manageUserAccount('cancel_login', item.user_id, email);
      const remove = document.createElement('button');
      remove.className = 'btn danger-outline';
      remove.textContent = 'Excluir permanentemente';
      remove.onclick = () => window.manageUserAccount('permanent_delete', item.user_id, email);
      controls.append(cancel, remove);
    });
  }

  window.setPlatformAccess = async (id, status) => {
    if (!await refreshPlatformOwner()) { toast('Acesso negado.'); return; }
    const { error } = await db.rpc('platform_set_account_access', {
      target_user_id: id,
      target_status: status
    });
    if (error) { toast(error.message); return; }
    toast(status === 'active' ? 'Acesso liberado.' : 'Acesso suspenso.');
    openSettings();
  };
  const pendingAccountActions = new Set();
  window.manageUserAccount = async (action, id, email) => {
    const actionKey = `${action}:${id}`;
    if (pendingAccountActions.has(actionKey)) {
      toast('Esta ação já está em andamento.');
      return;
    }
    if (!await refreshPlatformOwner()) { toast('Acesso negado.'); return; }
    if (action === 'cancel_login') {
      if (!confirm(`Cancelar o login de ${email}? A pessoa poderá criar outra conta usando este mesmo e-mail.`)) return;
    } else {
      const confirmation = prompt(`Para excluir permanentemente ${email}, digite o e-mail completo:`);
      if (confirmation !== email) { toast('O e-mail não confere. A exclusão foi cancelada.'); return; }
    }
    pendingAccountActions.add(actionKey);
    try {
      const { data, error } = await db.functions.invoke('manage-user', { body:{ action, userId:id } });
      if (error || data?.error) { toast(data?.error || error?.message || 'Não foi possível concluir a ação.'); return; }
      toast(action === 'cancel_login' ? 'Login cancelado. O e-mail está liberado para novo cadastro.' : 'Usuário excluído permanentemente.');
      openSettings();
    } finally {
      pendingAccountActions.delete(actionKey);
    }
  };
  document.getElementById('showSubscriptionButton').onchange = async event => {
    const show = event.target.checked;
    if (!await refreshPlatformOwner()) {
      event.target.checked = !show;
      toast('Acesso negado.');
      return;
    }
    const { error } = await db.rpc('platform_set_subscription_visibility', {
      p_show_subscription: show
    });
    if (error) {
      event.target.checked = !show;
      toast('Execute primeiro a configuração de assinatura no Supabase.');
      return;
    }
    await refreshSubscriptionButton();
    toast(show ? 'Botão de assinatura exibido no login.' : 'Botão de assinatura ocultado do login.');
  };
  document.addEventListener('carometro:platform-settings-changed', () => {
    refreshSubscriptionButton();
  });
  document.addEventListener('carometro:profiles-changed', () => {
    if (!modal.classList.contains('hidden') && isPlatformOwner()) openSettings();
  });
  document.addEventListener('carometro:permissions-changed', () => {
    if (!modal.classList.contains('hidden') && isPlatformOwner()) openSettings();
  });
  nav.onclick = openSettings;
  new MutationObserver(() => {
    if (!app.classList.contains('hidden')) nav.classList.toggle('hidden', !isPlatformOwner());
  }).observe(app, { attributes:true, attributeFilter:['class'] });
});
