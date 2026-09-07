(() => {
  'use strict';
  const config = window.CAROMETRO_RUNTIME_CONFIG;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const planKey = new URLSearchParams(location.search).get('plano') || 'monthly';
  const loading = document.getElementById('accountLoading');
  const loginForm = document.getElementById('loginForm');
  const checkoutPanel = document.getElementById('checkoutPanel');
  const legal = document.getElementById('acceptLegal');
  const checkoutButton = document.getElementById('startCheckout');
  let selectedPlan = null;
  let currentSession = null;
  const extensionIds = [
    'fgpjjlikinpcjpmmjehbgbfonnbfibnc',
    'mohcmojnkjjkphgjaogcbokjmnijmggl',
    'iobkgohpoeoimlhlgdeiojlghbhcijli'
  ];

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
    message('checkoutMessage', installedVersion && recommendedVersion && compareVersions(installedVersion, recommendedVersion) < 0
      ? `Extensão ${installedVersion} conectada. Há uma atualização recomendada na Chrome Web Store.`
      : `Extensão conectada${installedVersion ? ` na versão ${installedVersion}` : ''}. Abra o SIAP para continuar.`);
  };

  async function loadPlan() {
    const { data, error } = await db.from('siap_assistant_plans').select('plan_key,display_name,description,amount,billing_months')
      .eq('plan_key', planKey).eq('active', true).maybeSingle();
    selectedPlan = error ? null : data;
    document.getElementById('selectedPlan').innerHTML = selectedPlan
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
      if (new URLSearchParams(location.search).get('pagamento') === 'retorno') {
        message('checkoutMessage', 'Recebemos seu retorno. A licença será atualizada após a confirmação da Hotmart.');
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
  document.getElementById('connectAssistantAccount').onclick = async () => {
    if (!currentSession?.access_token) {
      message('checkoutMessage', 'Sua sessão expirou. Entre novamente para conectar a extensão.', true);
      return;
    }
    message('checkoutMessage', 'Conectando extensão…');
    const payload = {
      type:'CAROMETRO_SIAP_CONNECT', accessToken:currentSession.access_token, expiresAt:Number(currentSession.expires_at) * 1000
    };
    if (globalThis.chrome?.runtime?.sendMessage) {
      for (const extensionId of extensionIds) {
        const response = await new Promise(resolve => chrome.runtime.sendMessage(extensionId, {
          ...payload
        }, result => resolve(chrome.runtime.lastError ? null : result)));
        if (response?.ok) {
          showExtensionStatus(response);
          return;
        }
      }
    }
    const bridgedResponse = await connectThroughPageBridge(payload);
    if (bridgedResponse?.ok) {
      showExtensionStatus(bridgedResponse);
      return;
    }
    message('checkoutMessage', 'A extensão não respondeu. Instale ou atualize o Assistente SIAP e tente novamente.', true);
  };
  document.getElementById('signOutAssistant').onclick = async () => { await db.auth.signOut(); await refresh(); };
  db.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
