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
  const extensionIds = ['fgpjjlikinpcjpmmjehbgbfonnbfibnc', 'mohcmojnkjjkphgjaogcbokjmnijmggl'];

  const money = value => Number(value).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const message = (id, text, error=false) => {
    const target = document.getElementById(id);
    target.textContent = text;
    target.classList.toggle('error', error);
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
    if (!currentSession?.access_token || !globalThis.chrome?.runtime?.sendMessage) {
      message('checkoutMessage', 'Use o Google Chrome com a extensão instalada para conectar.', true);
      return;
    }
    message('checkoutMessage', 'Conectando extensão…');
    for (const extensionId of extensionIds) {
      const response = await new Promise(resolve => chrome.runtime.sendMessage(extensionId, {
        type:'CAROMETRO_SIAP_CONNECT', accessToken:currentSession.access_token, expiresAt:Number(currentSession.expires_at) * 1000
      }, result => resolve(chrome.runtime.lastError ? null : result)));
      if (response?.ok) {
        message('checkoutMessage', 'Extensão conectada. Abra o SIAP para continuar.');
        return;
      }
    }
    message('checkoutMessage', 'A extensão não respondeu. Instale ou atualize o Assistente SIAP e tente novamente.', true);
  };
  document.getElementById('signOutAssistant').onclick = async () => { await db.auth.signOut(); await refresh(); };
  db.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
