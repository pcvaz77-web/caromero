(() => {
  'use strict';
  const config = window.CAROMETRO_RUNTIME_CONFIG;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const catalogDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
  });
  // O retorno do link de autenticação pode chegar sem a query string.
  // Nessa situação, nunca presumimos uma compra: o backend decide se a
  // conta ainda pode experimentar, já possui assinatura ou tem concessão.
  const requestedPlan = new URLSearchParams(location.search).get('plano') || 'account';
  const planKey = ['exam_one','exam_four','monthly_exam','quarterly_exam','semiannual_exam'].includes(requestedPlan) ? 'account' : requestedPlan;
  const accountFlow = planKey === 'account';
  const trialFlow = planKey === 'trial';
  const examFlow = ['exam_one','exam_four','monthly_exam','quarterly_exam','semiannual_exam'].includes(planKey);
  const loading = document.getElementById('accountLoading');
  const loginForm = document.getElementById('loginForm');
  const checkoutPanel = document.getElementById('checkoutPanel');
  const legal = document.getElementById('acceptLegal');
  const checkoutButton = document.getElementById('startCheckout');
  const connectButton = document.getElementById('connectAssistantAccount');
  const accessSummary = document.getElementById('assistantAccessSummary');
  const installSteps = document.getElementById('assistantInstallSteps');
  const installLink = document.getElementById('installAssistantExtension');
  const paymentReturnHint = document.getElementById('paymentReturnHint');
  const refreshAccessButton = document.getElementById('refreshAssistantAccess');
  const resumePaymentLink = document.getElementById('resumeAssistantPayment');
  const cancelPendingPaymentButton = document.getElementById('cancelPendingAssistantPayment');
  const panelTitle = document.getElementById('accountPanelTitle');
  const selectedPlanTarget = document.getElementById('selectedPlan');
  const trialEndedLink = document.getElementById('trialEndedLink');
  let selectedPlan = null;
  let currentSession = null;
  let accessStatus = null;
  let examStatus = null;
  let paymentPollTimer = null;
  let paymentPollCount = 0;
  let checkingPayment = false;
  const extensionIds = [
    'bfbjocbablljmknahhlkjhllpjmihibe',
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
    document.getElementById('accountPageIntro').textContent = 'Confirme seu e-mail pelo link enviado à sua caixa de entrada. Depois, instale a extensão e conheça o Assistente SIAP com 2 usos por recurso.';
    loginForm.querySelector('h2').textContent = 'Confirme seu e-mail';
    loginForm.querySelector('p').textContent = 'Enviaremos um link de acesso para este e-mail. Abra a mensagem e clique no link para liberar a instalação.';
    loginForm.querySelectorAll('p')[1].hidden = true;
    loginForm.querySelector('button[type="submit"]').textContent = 'Enviar link de acesso';
  }

  if (accountFlow) {
    document.querySelector('.site-header .brand small').textContent='MINHA CONTA';
    document.querySelector('.account-copy .eyebrow').textContent='ACESSO AO ASSISTENTE';
    document.querySelector('.account-copy h1').textContent='Entre na sua conta';
    document.getElementById('accountPageIntro').textContent='Se você já entrou no Carômetro, sua conta será reconhecida aqui. Caso contrário, confirme o e-mail da compra pelo link enviado à sua caixa de entrada. Depois verificaremos suas licenças e créditos.';
    document.querySelector('.payment-methods').hidden=true;
    document.querySelector('.account-copy ul').hidden=true;
  }
  const emailHint = new URLSearchParams(location.hash.slice(1)).get('email');
  if (emailHint) {document.getElementById('accountEmail').value=emailHint;history.replaceState(null,'',location.pathname+location.search);}
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
      : examStatus?.active ? 'Correção de Provas' : 'Demonstração gratuita';
    message('checkoutMessage', installedVersion && recommendedVersion && compareVersions(installedVersion, recommendedVersion) < 0
      ? `Extensão ${installedVersion} conectada. Há uma atualização recomendada na Chrome Web Store.`
      : `${accessLabel} conectada${installedVersion ? ` à extensão ${installedVersion}` : ' à extensão'}. Abra o SIAP para continuar.`);
  };

  const renderAccessStatus = status => {
    accessStatus = status;
    resumePaymentLink.hidden = true;
    cancelPendingPaymentButton.hidden = true;
    const paidAccess = status?.mode === 'subscription' && status.active === true;
    paymentReturnHint.hidden = paidAccess || trialFlow || examFlow || accountFlow;
    refreshAccessButton.hidden = paidAccess || trialFlow || examFlow;
    if (paidAccess && paymentPollTimer) {
      clearInterval(paymentPollTimer);
      paymentPollTimer = null;
    }
    accessSummary.hidden = false;
    accessSummary.dataset.mode = status?.mode || '';
    connectButton.disabled = false;
    installSteps.hidden = false;
    if(examFlow) {
      panelTitle.textContent='Correção de Provas';selectedPlanTarget.hidden=false;legal.hidden=false;checkoutButton.hidden=false;trialEndedLink.hidden=true;
      accessSummary.textContent=examStatus?.active?`Correção disponível · ${examStatus.credits||0} crédito(s) livre(s) · ${examStatus.openBlocks||0} bloco(s) em andamento. Use o mesmo e-mail desta conta em novas compras.`:'Após a confirmação do pagamento, conecte a extensão a esta conta.';
      connectButton.hidden=false;installSteps.hidden=false;connectButton.textContent='Conectar extensão a esta conta';return;
    }
    if (status?.mode === 'subscription' && status.active === true) {
      panelTitle.textContent = 'Sua assinatura';
      document.getElementById('selectedPlan').hidden = true;
      legal.hidden = true;
      checkoutButton.hidden = true;
      trialEndedLink.hidden = true;
      connectButton.hidden = false;
      accessSummary.textContent = `Assinatura ativa${status.daysRemaining != null && Number.isFinite(Number(status.daysRemaining)) ? ` · ${Number(status.daysRemaining)} dia(s) restante(s)` : ''}.`;
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
      accessSummary.textContent = `Acesso institucional autorizado pelo Carômetro · ${status.permanent === true || status.daysRemaining == null ? 'concessão permanente' : `${Number(status.daysRemaining)} dia(s) restante(s)`}.`;
      connectButton.textContent = '2. Conectar extensão a esta conta';
      return;
    }
    if(examStatus?.active) {
      panelTitle.textContent='Sua Correção de Provas';selectedPlanTarget.hidden=true;legal.hidden=true;checkoutButton.hidden=true;trialEndedLink.hidden=true;
      accessSummary.textContent=`Correção disponível · ${examStatus.credits||0} crédito(s) livre(s) · ${examStatus.openBlocks||0} bloco(s) em andamento.`;
      connectButton.hidden=false;installSteps.hidden=false;connectButton.textContent='Conectar extensão a esta conta';return;
    }
    if (accountFlow) {
      panelTitle.textContent='Acesso não disponível'; selectedPlanTarget.hidden=true;legal.hidden=true;checkoutButton.hidden=true;
      accessSummary.textContent='Esta conta não possui assinatura, concessão ou créditos ativos. Escolha um plano para usar o Assistente.';
      installSteps.hidden=true;connectButton.hidden=true;trialEndedLink.hidden=false;return;
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
    try {const {data}=await db.functions.invoke('siap-exam-commerce',{body:{action:'status'}});examStatus=data?.ok?data.access:null;} catch {examStatus=null;}
    const { data, error } = await db.rpc('get_siap_assistant_access_status');
    if (error || !data) {
      accessStatus = null;
      resumePaymentLink.hidden = true;
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

  const refreshPaymentAccess = async (knownStatus = null) => {
    if (checkingPayment || !currentSession || trialFlow || examFlow) return;
    checkingPayment = true;
    try {
      const status = knownStatus || await loadAccessStatus();
      if (status?.mode === 'subscription' && status.active === true) return;
      cancelPendingPaymentButton.hidden = true;
      const { data:payment } = await db.from('siap_assistant_payment_subscriptions')
        .select('status,created_at,provider,plan_key,checkout_url').in('provider',['hotmart','mercado_pago']).eq('status','pending')
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      const recent = payment && Date.now() - new Date(payment.created_at).getTime() < 48 * 60 * 60 * 1000;
      if (!recent) return;
      panelTitle.textContent = 'Pagamento em confirmação';
      accessSummary.hidden = false;
      const planLabel = {monthly:'mensal',quarterly:'trimestral',semiannual:'semestral',annual:'anual'}[payment.plan_key] || 'selecionado';
      accessSummary.textContent = `Há um pagamento ${planLabel} iniciado e ainda pendente. A licença será vinculada a esta conta após a aprovação.`;
      resumePaymentLink.hidden = true;
      cancelPendingPaymentButton.hidden = payment.provider !== 'mercado_pago';
      try {
        const checkoutUrl = new URL(payment.checkout_url);
        if (checkoutUrl.protocol === 'https:' &&
          ((payment.provider === 'mercado_pago' && checkoutUrl.hostname === 'www.mercadopago.com.br') ||
          (payment.provider === 'hotmart' && checkoutUrl.hostname === 'pay.hotmart.com'))) {
          resumePaymentLink.href = checkoutUrl.href;
          resumePaymentLink.hidden = false;
        }
      } catch { /* O pagamento continua pendente, mas sem link reutilizável. */ }
      selectedPlanTarget.hidden = true;
      legal.hidden = true;
      checkoutButton.hidden = true;
      trialEndedLink.hidden = true;
      paymentReturnHint.hidden = true;
      refreshAccessButton.hidden = false;
      installSteps.hidden = false;
      connectButton.hidden = true;
      if (!paymentPollTimer) {
        paymentPollCount = 0;
        paymentPollTimer = setInterval(() => {
          if (++paymentPollCount > 30) { clearInterval(paymentPollTimer); paymentPollTimer = null; return; }
          if (document.visibilityState === 'visible') refreshPaymentAccess();
        }, 12000);
      }
    } finally {
      checkingPayment = false;
    }
  };

  const connectCurrentSession = async (silent = false) => {
    if (!currentSession?.access_token || !currentSession?.expires_at) {
      if (!silent) message('checkoutMessage', 'Sua sessão expirou. Entre novamente para conectar a extensão.', true);
      return null;
    }
    if (!silent) message('checkoutMessage', 'Validando licença…');
    const payload = {
      type:'CAROMETRO_SIAP_CONNECT', explicit:!silent, accessToken:currentSession.access_token, expiresAt:Number(currentSession.expires_at) * 1000
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
    if (trialFlow || accountFlow) {
      selectedPlan = null;
      selectedPlanTarget.hidden = true;
      checkoutButton.disabled = true;
      return;
    }
    if(examFlow) {
      const {data,error}=await db.from('siap_exam_offers').select('offer_key,display_name,amount,credits,months').eq('offer_key',planKey).eq('active',true).maybeSingle();
      selectedPlan=error?null:data;
      selectedPlanTarget.textContent=data?`${data.display_name} · ${money(data.amount)} · ${data.credits?data.credits+' crédito(s) por bloco, em todas as turmas':data.months+' meses com correção incluída'}`:'Oferta ainda em preparação.';
      checkoutButton.disabled=!selectedPlan||!legal.checked;return;
    }
    const { data, error } = await catalogDb.from('siap_assistant_plans').select('plan_key,display_name,description,amount,billing_months')
      .eq('plan_key', planKey).eq('active', true).maybeSingle();
    selectedPlan = error ? null : data;
    selectedPlanTarget.innerHTML = selectedPlan
      ? `<strong>${selectedPlan.display_name} · ${money(selectedPlan.amount)}</strong><span>${selectedPlan.description}</span>`
      : '<strong>Plano ainda indisponível</strong><span>Os valores ainda precisam ser definidos antes da abertura das vendas.</span>';
    checkoutButton.disabled = !selectedPlan || !legal.checked;
  }

  async function validSession() {
    const { data:{ session:stored } } = await db.auth.getSession();
    if (!stored) return null;
    const { data:{ user }, error } = await db.auth.getUser();
    if (!error && user) return (await db.auth.getSession()).data.session;
    const renewed = await db.auth.refreshSession();
    if (!renewed.error && renewed.data.session) return renewed.data.session;
    await db.auth.signOut({ scope:'local' });
    return null;
  }

  async function refresh() {
    const session = await validSession();
    currentSession = session;
    loading.hidden = true;
    loginForm.hidden = !!session;
    checkoutPanel.hidden = !session;
    if (!session) resumePaymentLink.hidden = true;
    if (session) {
      document.getElementById('accountIdentity').textContent = `Conta: ${session.user.email}`;
      document.getElementById('paymentEmailHint').textContent = `A licença do Assistente será vinculada à conta ${session.user.email}. Você pode pagar no Mercado Pago sem criar uma conta lá.`;
      await loadPlan();
      const status = await loadAccessStatus();
      if (status?.mode !== 'subscription' || status.active !== true) await refreshPaymentAccess(status);
      if (!accountFlow && status?.active === true && ['subscription','carometro'].includes(status.mode)) await connectCurrentSession(true);
      if (new URLSearchParams(location.search).get('pagamento') === 'retorno') {
        message('checkoutMessage', 'Recebemos seu retorno. A licença será atualizada após a confirmação do pagamento.');
      }
    }
  }

  loginForm.onsubmit = async event => {
    event.preventDefault();
    const email = document.getElementById('accountEmail').value.trim();
    const redirectPath = trialFlow ? location.pathname.replace(/\.html$/, '') : location.pathname;
    const redirectTo = `${location.origin}${redirectPath}?plano=${encodeURIComponent(planKey)}`;
    const { error } = await db.auth.signInWithOtp({ email, options:{ emailRedirectTo:redirectTo } });
    message('loginMessage', error ? 'Não foi possível enviar o link. Tente novamente.' : 'Link enviado. Confira sua caixa de entrada e o spam; abra a mensagem e clique no link para continuar.', !!error);
  };
  legal.onchange = () => { checkoutButton.disabled = !selectedPlan || !legal.checked; };
  refreshAccessButton.onclick = () => refreshPaymentAccess();
  cancelPendingPaymentButton.onclick = async () => {
    if (!currentSession || cancelPendingPaymentButton.disabled) return;
    cancelPendingPaymentButton.disabled = true;
    cancelPendingPaymentButton.textContent = 'Cancelando compra…';
    try {
      let { data, error } = await db.functions.invoke('cancel-siap-assistant-pending', { body:{} });
      if (!data && error?.context?.json) { try { data = await error.context.json(); } catch {} }
      if (error || !data?.cancelled) {
        message('checkoutMessage', data?.code === 'payment_in_progress'
          ? 'Há um pagamento em processamento. Aguarde a confirmação antes de iniciar outra compra.'
          : data?.code === 'pending_payment_not_found'
            ? 'A compra pendente já foi encerrada. Atualize a página para conferir.'
            : 'Não foi possível cancelar a compra pendente. Tente novamente ou fale com o suporte.', true);
      } else {
        if (paymentPollTimer) { clearInterval(paymentPollTimer); paymentPollTimer = null; }
        await refresh();
        message('checkoutMessage', 'Compra pendente cancelada. Você já pode escolher outro plano.');
      }
    } catch {
      message('checkoutMessage', 'Não foi possível cancelar a compra pendente. Tente novamente ou fale com o suporte.', true);
    } finally {
      cancelPendingPaymentButton.disabled = false;
      cancelPendingPaymentButton.textContent = 'Cancelar compra pendente';
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentSession && !refreshAccessButton.hidden) refreshPaymentAccess();
  });
  checkoutButton.onclick = async () => {
    if (!selectedPlan || !legal.checked) return;
    currentSession = await validSession();
    if (!currentSession) {
      message('checkoutMessage', 'Sua sessão expirou. Confirme seu e-mail novamente para continuar.', true);
      await refresh();
      return;
    }
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Abrindo pagamento…';
    const checkoutFunction=examFlow?'siap-exam-commerce':selectedPlan.plan_key==='monthly'
      ? 'create-siap-assistant-subscription' : 'create-mercado-pago-assistant-once';
    let { data, error } = await db.functions.invoke(checkoutFunction, { body:examFlow?{action:'checkout',offerKey:planKey,legalAccepted:true}:{ planKey:selectedPlan.plan_key, legalAccepted:true } });
    if(!data && error?.context?.json) {try {data=await error.context.json();} catch {}}
    if (error || !data?.checkoutUrl) {
      message('checkoutMessage', data?.code === 'existing_subscription_upgrade_required' ? 'Você já possui um plano. Fale com o suporte para incluir a correção sem criar uma segunda cobrança. A compra de créditos avulsos continua disponível.' : data?.code === 'other_checkout_pending' ? 'Já existe um pagamento iniciado para esta conta. Conclua-o ou fale com o suporte antes de escolher outro plano.' : data?.code === 'plan_not_available' ? 'Este plano ainda não está disponível.' : 'Não foi possível iniciar o pagamento.', true);
      checkoutButton.disabled = false;
    checkoutButton.textContent = 'Ir para o pagamento seguro';
      return;
    }
    location.assign(data.checkoutUrl);
  };
  connectButton.onclick = () => connectCurrentSession(false);
  document.getElementById('signOutAssistant').onclick = async () => { await db.auth.signOut(); await refresh(); };
  let accountReady = false;
  db.auth.onAuthStateChange(() => { if (accountReady) setTimeout(refresh, 0); });
  (async () => {
    const {data:{session}} = await db.auth.getSession();
    if (emailHint && session && session.user.email?.toLowerCase() !== emailHint.trim().toLowerCase()) await db.auth.signOut({scope:'local'});
    accountReady = true;
    await refresh();
  })();
})();
