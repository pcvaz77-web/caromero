(() => {
  'use strict';
  const config = window.CAROMETRO_RUNTIME_CONFIG;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  // O retorno do link de autenticação pode chegar sem a query string.
  // Nessa situação, nunca presumimos uma compra: o backend decide se a
  // conta ainda pode experimentar, já possui assinatura ou tem concessão.
  const planKey = new URLSearchParams(location.search).get('plano') || 'trial';
  const trialFlow = planKey === 'trial';
  const loading = document.getElementById('accountLoading');
  const loginForm = document.getElementById('loginForm');
  const checkoutPanel = document.getElementById('checkoutPanel');
  const legal = document.getElementById('acceptLegal');
  const checkoutButton = document.getElementById('startCheckout');
  const connectButton = document.getElementById('connectAssistantAccount');
  const accessSummary = document.getElementById('assistantAccessSummary');
  const installSteps = document.getElementById('assistantInstallSteps');
  const installLink = document.getElementById('installAssistantExtension');
  const panelTitle = document.getElementById('accountPanelTitle');
  const selectedPlanTarget = document.getElementById('selectedPlan');
  const trialEndedLink = document.getElementById('trialEndedLink');
  let selectedPlan = null;
  let currentSession = null;
  let accessStatus = null;
  const extensionIds = [
    'fgpjjlikinpcjpmmjehbgbfonnbfibnc',
    'mohcmojnkjjkphgjaogcbokjmnijmggl',
    'iobkgohpoeoimlhlgdeiojlghbhcijli'
  ];
  installLink.href = config.siapAssistantStoreUrl;
  if (trialFlow) {
    document.body.classList.add('trial-flow');
    document.querySelector('.site-header .brand small').textContent = 'DEMONSTRAÇÃO GRATUITA';
    document.querySelector('.account-copy .eyebrow').textContent = 'DEMONSTRAÇÃO GRATUITA';
    document.querySelector('.account-copy h1').textContent = 'Experimente antes de contratar';
    document.getElementById('accountPageIntro').textContent = 'Entre com seu e-mail, instale a extensão e conheça o Assistente SIAP com 2 usos por recurso.';
  }

  const money = value => Number(value).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const compareVersions = (left, right) => {
    const a = String(left || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    const b = String(right || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
    }
    return 0;
  };
  const message = (id, text, error=false) => {
    const target = document.getElementById(id);
    target.textContent = text;
    target.classList.toggle('error', error);
  };

  const connectThroughPageBridge = payload => new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => { window.removeEventListener('message', receive); resolve(null); }, 2500);
    function receive(event) {
      const result = event.data;
      if (event.source !== window || event.origin !== location.origin || result?.source !== 'CAROMETRO_EXTENSION' || result?.type !== 'CAROMETRO_SIAP_CONNECT_RESULT' || result?.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
      resolve(result.response || null);
    }
    window.addEventListener('message', receive);
    window.postMessage({ source:'CAROMETRO_WEB', type:'CAROMETRO_SIAP_CONNECT_BRIDGE', requestId, ...payload }, location.origin);
  });
  const showExtensionStatus = response => {
    const installedVersion = String(response.extensionVersion || '').trim();
    const minimumVersion = String(config.siapAssistantMinimumVersion || '').trim();
    const recommendedVersion = String(config.siapAssistantRecommendedVersion || '').trim();
    if (installedVersion && minimumVersion && compareVersions(installedVersion, minimumVersion) < 0) {
      message('checkoutMessage', `Extensão ${installedVersion} conectada, mas precisa ser atualizada antes do uso. Abra a Chrome Web Store.`, true);
      return;
    }
    const accessLabel = accessStatus?.mode === 'subscription' ? 'Assinatura ativa'
      : accessStatus?.mode === 'carometro' ? 'Acesso institucional'
      : 'Demonstração gratuita';
    message('checkoutMessage', installedVersion && recommendedVersion && compareVersions(installedVersion, recommendedVersion) < 0
      ? `Extensão ${installedVersion} conectada. Há uma atualização recomendada na Chrome Web Store.`
      : `${accessLabel} conectada${installedVersion ? ` à extensão ${installedVersion}` : ' à extensão'}. Abra o SIAP para continuar.`);
  };

  const renderAccessStatus = status => {
    accessStatus = status;
    accessSummary.hidden = false;
    accessSummary.dataset.mode = status?.mode || '';
    connectButton.disabled = false;
    installSteps.hidden = false;
    if (status?.mode === 'subscription' && status.active === true) {
      panelTitle.textContent = 'Sua assinatura';
      document.getElementById('selectedPlan').hidden = true;
      legal.hidden = true;
      checkoutButton.hidden = true;
      trialEndedLink.hidden = true;
      connectButton.hidden = false;
      accessSummary.textContent = `Assinatura ativa${Number.isFinite(Number(status.daysRemaining)) ? ` · ${Number(status.daysRemaining)} dia(s) restante(s)` : ''}.`;
      connectButton.textContent = '2. Conectar extensão a esta conta';
      return;
    }
    if (status?.mode === 'carometro' && status.active === true) {
      panelTitle.textContent = 'Seu acesso institucional';
      document.getElementById('selectedPlan').hidden = true;
      legal.hidden = true;
      checkoutButton.hidden = true;
      trialEndedLink.hidden = true;
      connectButton.hidden = false;
      accessSummary.textContent = `Acesso institucional autorizado pelo Carômetro${Number.isFinite(Number(status.daysRemaining)) ? ` · ${Number(status.daysRemaining)} dia(s) restante(s)` : ''}.`;
      connectButton.textContent = '2. Conectar extensão a esta conta';
      return;
    }
    const uses = status?.freeUses || {};
    const remaining = ['planning','content','attendance','pei'].map(key => Math.max(0, Number(uses[key] || 0)));
    const available = remaining.some(value => value > 0);
    panelTitle.textContent = trialFlow ? 'Sua demonstração gratuita' : 'Confirme a assinatura';
    selectedPlanTarget.hidden = trialFlow;
    legal.hidden = trialFlow;
    checkoutButton.hidden = trialFlow;
    accessSummary.hidden = !trialFlow;
    installSteps.hidden = !trialFlow || !available;
    connectButton.hidden = !trialFlow || !available;
    trialEndedLink.hidden = !trialFlow || available;
    accessSummary.textContent = available
      ? `Demonstração gratuita — usos restantes: planejamento ${remaining[0]}, conteúdo ${remaining[1]}, frequência ${remaining[2]} e PEI ${remaining[3]}. O limite inicial é de 2 usos por recurso.`
      : 'Demonstração gratuita encerrada. Escolha um plano para continuar usando o Assistente SIAP.';
    connectButton.textContent = available ? '2. Conectar e experimentar' : 'Demonstração gratuita encerrada';
    connectButton.disabled = !available;
  };

  const loadAccessStatus = async () => {
    const { data, error } = await db.rpc('get_siap_assistant_access_status');
    if (error || !data) {
      accessStatus = null;
      panelTitle.textContent = trialFlow ? 'Sua demonstração gratuita' : 'Confirme a assinatura';
      selectedPlanTarget.hidden = trialFlow;
      legal.hidden = trialFlow;
      checkoutButton.hidden = trialFlow;
      accessSummary.hidden = false;
      installSteps.hidden = true;
      connectButton.hidden = true;
      trialEndedLink.hidden = true;
      accessSummary.removeAttribute('data-mode');
      accessSummary.textContent = 'Não foi possível verificar seu acesso agora. Tente novamente.';
      connectButton.textContent = 'Acesso não verificado';
      connectButton.disabled = true;
      return null;
    }
    renderAccessStatus(data);
    return data;
  };

  const connectCurrentSession = async (silent = false) => {
    if (!currentSession?.access_token || !currentSession?.expires_at) {
      if (!silent) message('checkoutMessage', 'Sua sessão expirou. Entre novamente para conectar a extensão.', true);
      return null;
    }
    if (!silent) message('checkoutMessage', 'Validando licença…');
    const payload = {
      type:'CAROMETRO_SIAP_CONNECT', accessToken:currentSession.access_token, expiresAt:Number(currentSession.expires_at) * 1000
    };
    if (globalThis.chrome?.runtime?.sendMessage) {
      for (const extensionId of extensionIds) {
        const response = await new Promise(resolve => chrome.runtime.sendMessage(extensionId, {
          ...payload
        }, result => resolve(chrome.runtime.lastError ? null : result)));
        if (response?.ok) {
          if (!silent) showExtensionStatus(response);
          return response;
        }
      }
    }
    const bridgedResponse = await connectThroughPageBridge(payload);
    if (bridgedResponse?.ok) {
      if (!silent) showExtensionStatus(bridgedResponse);
      return bridgedResponse;
    }
    if (!silent) message('checkoutMessage', 'A extensão ainda não respondeu. Use o botão “1. Instalar o Assistente SIAP”, conclua a instalação e depois clique novamente em “2. Conectar”.', true);
    return null;
  };

  async function loadPlan() {
    if (trialFlow) {
      selectedPlan = null;
      selectedPlanTarget.hidden = true;
      checkoutButton.disabled = true;
      return;
    }
    const { data, error } = await db.from('siap_assistant_plans').select('plan_key,display_name,description,amount,billing_months')
      .eq('plan_key', planKey).eq('active', true).maybeSingle();
    selectedPlan = error ? null : data;
    selectedPlanTarget.innerHTML = selectedPlan
      ? `<strong>${selectedPlan.display_name} · ${money(selectedPlan.amount)}</strong><span>${selectedPlan.description}</span>`
      : '<strong>Plano ainda indisponível</strong><span>Os valores ainda precisam ser definidos antes da abertura das vendas.</span>';
    checkoutButton.disabled = !selectedPlan || !legal.checked;
  }

  async function refresh() {
    const { data:{ session } } = await db.auth.getSession();
    currentSession = session;
    loading.hidden = true;
    loginForm.hidden = !!session;
    checkoutPanel.hidden = !session;
    if (session) {
      document.getElementById('accountIdentity').textContent = `Conta: ${session.user.email}`;
      await loadPlan();
      const status = await loadAccessStatus();
      if (status?.active === true && ['subscription','carometro'].includes(status.mode)) await connectCurrentSession(true);
      if (new URLSearchParams(location.search).get('pagamento') === 'retorno') {
        message('checkoutMessage', 'Recebemos seu retorno. A licença será atualizada após a confirmação do pagamento.');
      }
    }
  }

  loginForm.onsubmit = async event => {
    event.preventDefault();
    const email = document.getElementById('accountEmail').value.trim();
    const redirectTo = `${location.origin}${location.pathname}?plano=${encodeURIComponent(planKey)}`;
    const { error } = await db.auth.signInWithOtp({ email, options:{ emailRedirectTo:redirectTo } });
    message('loginMessage', error ? 'Não foi possível enviar o link. Tente novamente.' : 'Link enviado. Confira seu e-mail para continuar.', !!error);
  };
  legal.onchange = () => { checkoutButton.disabled = !selectedPlan || !legal.checked; };
  checkoutButton.onclick = async () => {
    if (!selectedPlan || !legal.checked) return;
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Abrindo pagamento…';
    const { data, error } = await db.functions.invoke('create-hotmart-assistant-checkout', { body:{ planKey:selectedPlan.plan_key, legalAccepted:true } });
    if (error || !data?.checkoutUrl) {
      message('checkoutMessage', data?.code === 'plan_not_available' ? 'Este plano ainda não está disponível.' : 'Não foi possível iniciar o pagamento.', true);
      checkoutButton.disabled = false;
    checkoutButton.textContent = 'Ir para o pagamento seguro';
      return;
    }
    location.assign(data.checkoutUrl);
  };
  connectButton.onclick = () => connectCurrentSession(false);
  document.getElementById('signOutAssistant').onclick = async () => { await db.auth.signOut(); await refresh(); };
  db.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
