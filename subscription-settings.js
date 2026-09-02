document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  const side = document.querySelector('.side');
  const originalShowApp = window.showApp;
  let accessChannel;
  let platformOwner = false;
  let publicPlans = [];
  let publicPlanFeatures = [];

  if (new URLSearchParams(location.search).get('pagamento') === 'retorno') {
    setTimeout(() => toast('Pagamento recebido pelo Mercado Pago. Estamos aguardando a confirmação segura para enviar o convite.'), 400);
    history.replaceState({}, document.title, location.pathname + location.hash);
  }

  const style = document.createElement('style');
  style.textContent = `
    .settings-nav { margin-top:10px; text-align:left; background:transparent; color:#c9d3e8; padding:12px; font-weight:650; }
    .settings-nav:hover { color:#fff; background:#2b3c5d; border-radius:8px; }
    .subscription-visibility { padding:12px; border:1px solid #dbe5ff; border-radius:9px; background:#f8faff; }
    .access-users { display:grid; gap:10px; }
    .access-user { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--line); border-radius:10px; padding:14px; }
    .access-user .access-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .access-user .access-actions .btn { min-height:38px; }
    .access-active { color:#08784b; font-weight:700; }
    .access-suspended { color:#b42318; font-weight:700; }
    .access-pending { color:#9a6b00; font-weight:700; }
    .access-unknown { color:#6b5bd6; font-weight:700; }
    @media(max-width:800px) { .access-user { align-items:flex-start; flex-direction:column; } .access-user .access-actions { justify-content:flex-start; } }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('button');
  nav.id = 'settingsNav';
  nav.className = 'settings-nav hidden';
  nav.innerHTML = '⚙ &nbsp; Configurações';
  side.insertBefore(nav, document.getElementById('signOut'));


  const loginCard = document.querySelector('#login .card');
  const plansButton = document.createElement('button');
  plansButton.id = 'openPublicPlans';
  plansButton.type = 'button';
  plansButton.className = 'btn secondary full public-plans-login-button hidden';
  plansButton.textContent = 'Conheça os planos do CARÔMETRO';
  loginCard.querySelector('.hint').insertAdjacentElement('afterend', plansButton);

  const publicPlansModal = document.createElement('div');
  publicPlansModal.id = 'publicPlansModal';
  publicPlansModal.className = 'public-plans-modal hidden';
  publicPlansModal.innerHTML = `
    <header class="public-plans-header">
      <div class="public-plans-brand"><span>C</span><b>CARÔMETRO</b></div>
      <button class="public-plans-close" type="button" aria-label="Voltar ao login">×</button>
    </header>
    <main class="public-plans-content">
      <div class="public-plans-hero">
        <span class="public-plans-eyebrow">PLANOS CARÔMETRO</span>
        <h1>Escolha o plano ideal<br>para sua escola</h1>
        <p>Planos flexíveis para escolas de todos os tamanhos. Comece com a estrutura adequada e evolua quando precisar.</p>
      </div>
      <div id="publicPlansGrid" class="public-plans-grid"></div>
      <div class="public-plans-trust"><span>◇ Dados protegidos</span><span>☁ Acesso de qualquer lugar</span><span>♧ Suporte humano</span><span>↗ Evolução sem complicação</span></div>
      <nav class="public-plans-legal" aria-label="Informações legais"><a href="legal.html#privacidade">Privacidade</a><a href="legal.html#cookies">Cookies</a><a href="legal.html#termos">Termos de Uso</a><a href="legal.html#suporte">Suporte</a></nav>
      <footer class="public-plans-rights">© 2026 CARÔMETRO® · Todos os direitos reservados · Marca registrada</footer>
    </main>`;
  document.body.appendChild(publicPlansModal);
  publicPlansModal.querySelector('.public-plans-close').onclick = () => publicPlansModal.classList.add('hidden');

  const applicationModal = document.createElement('div');
  applicationModal.id = 'schoolApplicationModal';
  applicationModal.className = 'modal-bg school-application-bg hidden';
  applicationModal.innerHTML = `<div class="modal school-application-modal">
    <div class="modal-head"><div><h3>Comece com o CARÔMETRO</h3><p id="schoolApplicationPlanLabel" class="meta"></p></div><button class="close" type="button" aria-label="Fechar">×</button></div>
    <form id="schoolApplicationForm" class="form">
      <input id="schoolApplicationPlan" type="hidden">
      <div class="application-honeypot" aria-hidden="true"><label>Website<input id="schoolApplicationWebsite" tabindex="-1" autocomplete="off"></label></div>
      <p class="sub">Preencha os dados para solicitar a entrada da sua escola. Após a aprovação, o responsável receberá por e-mail o convite seguro para criar o acesso.</p>
      <div class="grid">
        <div class="field span"><label for="schoolApplicationName">Nome da escola</label><input id="schoolApplicationName" maxlength="160" required></div>
        <div class="field span"><label for="schoolApplicationResponsible">Nome do responsável</label><input id="schoolApplicationResponsible" maxlength="160" autocomplete="name" required></div>
        <div class="field"><label for="schoolApplicationEmail">E-mail</label><input id="schoolApplicationEmail" type="email" maxlength="320" autocomplete="email" required></div>
        <div class="field"><label for="schoolApplicationPhone">Telefone / WhatsApp</label><input id="schoolApplicationPhone" type="tel" maxlength="40" autocomplete="tel" required></div>
        <div class="field"><label for="schoolApplicationCity">Cidade</label><input id="schoolApplicationCity" maxlength="120" autocomplete="address-level2" required></div>
        <div class="field"><label for="schoolApplicationState">UF</label><input id="schoolApplicationState" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="address-level1" placeholder="GO" required></div>
        <div class="field span"><label for="schoolApplicationStudents">Quantidade estimada de alunos</label><input id="schoolApplicationStudents" type="number" min="0" max="1000000" step="1" required></div>
      </div>
      <label class="check school-application-legal"><input id="schoolApplicationLegal" type="checkbox" required> Li e aceito os <a href="legal.html#termos" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="legal.html#privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</label>
      <p id="schoolApplicationError" class="error hidden"></p>
      <div class="actions"><button class="btn secondary" type="button" data-cancel-application>Voltar</button><button class="btn primary" type="submit">Enviar solicitação</button></div>
    </form>
  </div>`;
  document.body.appendChild(applicationModal);

  function closeApplication() { applicationModal.classList.add('hidden'); }
  applicationModal.querySelector('.close').onclick = closeApplication;
  applicationModal.querySelector('[data-cancel-application]').onclick = closeApplication;
  applicationModal.onclick = event => { if (event.target === applicationModal) closeApplication(); };

  function openApplication(planKey) {
    const plan = publicPlans.find(item => item.plan_key === planKey);
    if (!plan) return;
    const form = document.getElementById('schoolApplicationForm');
    form.reset();
    document.getElementById('schoolApplicationPlan').value = plan.plan_key;
    document.getElementById('schoolApplicationPlanLabel').textContent = `Plano escolhido: ${plan.display_name} · ${formatPlanPrice(plan)}${plan.contact_only ? '' : '/mês'}`;
    document.getElementById('schoolApplicationError').classList.add('hidden');
    applicationModal.classList.remove('hidden');
    document.getElementById('schoolApplicationName').focus();
  }

  document.getElementById('schoolApplicationForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const errorTarget = document.getElementById('schoolApplicationError');
    button.disabled = true;
    button.textContent = 'Enviando…';
    errorTarget.classList.add('hidden');
    try {
      const studentsValue = document.getElementById('schoolApplicationStudents').value;
      const planKey = document.getElementById('schoolApplicationPlan').value;
      const { data:applicationId, error } = await db.rpc('submit_school_application', {
        p_plan_key:planKey,
        p_school_name:document.getElementById('schoolApplicationName').value.trim(),
        p_responsible_name:document.getElementById('schoolApplicationResponsible').value.trim(),
        p_email:document.getElementById('schoolApplicationEmail').value.trim(),
        p_phone:document.getElementById('schoolApplicationPhone').value.trim(),
        p_city:document.getElementById('schoolApplicationCity').value.trim(),
        p_state:document.getElementById('schoolApplicationState').value.trim().toUpperCase(),
        p_estimated_students:studentsValue === '' ? null : Number(studentsValue),
        p_legal_accepted:document.getElementById('schoolApplicationLegal').checked,
        p_website:document.getElementById('schoolApplicationWebsite').value
      });
      if (error) throw error;
      if (['basic','professional'].includes(planKey)) {
        button.textContent = 'Abrindo Mercado Pago…';
        const { data:payment, error:paymentError } = await db.functions.invoke('create-mercado-pago-subscription', {
          body:{ applicationId }
        });
        if (paymentError || payment?.error || !payment?.checkout_url) {
          throw new Error(payment?.error || paymentError?.message || 'Não foi possível abrir o pagamento.');
        }
        location.assign(payment.checkout_url);
        return;
      }
      closeApplication();
      publicPlansModal.classList.add('hidden');
      toast('Solicitação gratuita enviada. Após a aprovação, você receberá o convite por e-mail.');
    } catch (error) {
      errorTarget.textContent = error.message || 'Não foi possível enviar a solicitação.';
      errorTarget.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar solicitação';
    }
  };

  function formatPlanPrice(plan) {
    if (plan.contact_only || plan.price === null || plan.price === undefined) return 'Sob consulta';
    return Number(plan.price).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function formatLimit(value, label) {
    return value === null || value === undefined
      ? `${label} ilimitados`
      : `Até ${Number(value).toLocaleString('pt-BR')} ${label}`;
  }

  function renderPublicPlans() {
    const grid = document.getElementById('publicPlansGrid');
    if (!grid) return;
    grid.innerHTML = publicPlans.map(plan => {
      const features = publicPlanFeatures
        .filter(item => item.plan_key === plan.plan_key && item.enabled)
        .map(item => item.platform_features?.label || item.feature_key);
      const benefits = [
        formatLimit(plan.max_students, 'alunos'),
        formatLimit(plan.max_staff, 'profissionais'),
        formatLimit(plan.max_classes, 'turmas'),
        ...features
      ];
      return `<article class="public-plan-card ${plan.highlighted ? 'highlighted' : ''}">
        ${plan.highlighted ? '<span class="public-plan-highlight">MAIS ESCOLHIDO</span>' : ''}
        <div class="public-plan-icon">${plan.plan_key === 'free' ? '◇' : plan.plan_key === 'basic' ? '♢' : plan.plan_key === 'professional' ? '★' : '▦'}</div>
        <h2>${esc(plan.display_name)}</h2>
        <p class="public-plan-description">${esc(plan.description || 'Uma opção flexível para sua escola.')}</p>
        <strong class="public-plan-price">${esc(formatPlanPrice(plan))}${plan.price !== null && !plan.contact_only ? '<small>/mês</small>' : ''}</strong>
        <button class="btn ${plan.highlighted ? 'primary' : 'secondary'} full" type="button" data-public-plan-cta="${esc(plan.plan_key)}">${esc(plan.cta_label || (plan.contact_only ? 'Fale conosco' : 'Começar'))}</button>
        <ul>${benefits.map(item => `<li>✓ ${esc(item)}</li>`).join('')}</ul>
      </article>`;
    }).join('') || '<div class="empty">Os planos estão temporariamente indisponíveis.</div>';
    grid.querySelectorAll('[data-public-plan-cta]').forEach(button => {
      button.onclick = () => {
        const planKey = button.dataset.publicPlanCta;
        const plan = publicPlans.find(item => item.plan_key === planKey);
        if (plan?.contact_only) {
          window.location.href = 'mailto:contato@sistemacarometro.com.br?subject=Plano%20Empresarial%20-%20CAR%C3%94METRO';
          return;
        }
        openApplication(planKey);
      };
    });
  }

  async function loadPublicPlans() {
    const [plansResult, featuresResult] = await Promise.all([
      db.from('platform_plans').select('*').eq('publicly_available', true).order('display_order'),
      db.from('platform_plan_features').select('plan_key, feature_key, enabled, platform_features(label)')
    ]);
    if (plansResult.error) return false;
    publicPlans = plansResult.data || [];
    publicPlanFeatures = featuresResult.error ? [] : (featuresResult.data || []);
    renderPublicPlans();
    return publicPlans.length > 0;
  }

  plansButton.onclick = async () => {
    plansButton.disabled = true;
    try {
      if (!publicPlans.length && !await loadPublicPlans()) {
        toast('Não foi possível carregar os planos agora.');
        return;
      }
      publicPlansModal.classList.remove('hidden');
    } finally {
      plansButton.disabled = false;
    }
  };

  // platform_settings.show_subscription representa a visibilidade da
  // OFERTA PÚBLICA de planos do Carômetro. O link legado de preço único
  // foi removido: esta flag será consumida pela vitrine baseada em
  // platform_plans (Grátis / Básico / Profissional / Empresarial).
  //
  // Fail-closed deliberado: só mostra a oferta quando a leitura confirma
  // show_subscription === true. Erro de leitura e linha ausente também
  // escondem a oferta — não existe mais um "mostrar por padrão" nesses
  // casos. Esse padrão antigo foi exatamente a causa de um bug real: um
  // GRANT SELECT ausente para o papel anon fazia toda leitura da tela de
  // login falhar, e o fallback então mostrava a oferta mesmo com
  // show_subscription=false. Uma falha de banco/permissão/rede nunca deve
  // fazer uma oferta comercial aparecer indevidamente.
  async function readSubscriptionVisibility() {
    const { data, error } = await db.from('platform_settings').select('show_subscription').eq('id', true).maybeSingle();
    const visible = !error && data?.show_subscription === true;
    plansButton.classList.toggle('hidden', !visible);
    if (!visible) publicPlansModal.classList.add('hidden');
    return visible;
  }
  readSubscriptionVisibility();

  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h3>Configurações da plataforma</h3><button class="close" type="button">×</button></div><div class="form"><h4 style="margin:0 0 7px">Acesso dos usuários</h4><p class="sub" style="margin:0 0 15px">Suspenda quem não deve acessar. Você pode reativar a qualquer momento.</p><div id="accessUsers" class="access-users"></div></div></div>`;
  document.body.appendChild(modal);
  const subscriptionVisibility = document.createElement('label');
  subscriptionVisibility.className = 'check subscription-visibility';
  subscriptionVisibility.innerHTML = '<input id="showSubscriptionButton" type="checkbox"> Disponibilizar a oferta pública de planos';
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
    // O acesso foi centralizado em Plataforma → Configurações. O botão
    // continua existindo como acionador interno da função, mas não aparece
    // mais isolado na barra lateral.
    nav.classList.add('hidden');
    watchAccessStatus();
  };

  async function openSettings() {
    if (!await refreshPlatformOwner()) {
      modal.classList.add('hidden');
      toast('Somente o proprietário da plataforma pode abrir estas configurações.');
      return;
    }
    const target = document.getElementById('accessUsers');
    const showSubscription = await readSubscriptionVisibility();
    document.getElementById('showSubscriptionButton').checked = showSubscription;
    target.innerHTML = '<div class="meta">Carregando usuários...</div>';
    modal.classList.remove('hidden');
    const { data, error } = await db.rpc('admin_list_accounts_v2');
    if (error) {
      target.innerHTML = '<div class="error">Execute primeiro o arquivo de configuração de acesso no Supabase.</div>';
      return;
    }
    function accountStatus(item) {
      if (item.role === 'platform_owner') return { cls:'access-active', label:'Acesso ativo', toggle:null };
      if (Number(item.pending_invitations || 0) > 0 && Number(item.active_memberships || 0) === 0) {
        return { cls:'access-pending', label:'Convite pendente de aceite', toggle:null };
      }
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

  // Acionador público usado por Plataforma → Configurações. Evita depender
  // de um clique sintético no botão legado oculto da barra lateral.
  window.openPlatformAccountSettings = openSettings;

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
      if (error || data?.error) {
        let message = data?.error || error?.message || 'Não foi possível concluir a ação.';
        try {
          const payload = await error?.context?.json();
          if (payload?.error) message = payload.error;
        } catch {}
        toast(message);
        return;
      }
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
    toast(show ? 'Oferta pública de planos habilitada.' : 'Oferta pública de planos desabilitada.');
  };
  document.addEventListener('carometro:platform-settings-changed', () => {
    readSubscriptionVisibility();
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
