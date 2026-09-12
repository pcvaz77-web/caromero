document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const modal = document.createElement('div');
  modal.id = 'siapIntegrationModal';
  modal.className = 'modal-bg siap-integration-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'siapIntegrationTitle');
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3 id="siapIntegrationTitle">Assistente SIAP</h3><div id="siapIntegrationMeta" class="meta"></div></div><button class="close" type="button" aria-label="Fechar" data-siap-close>×</button></div><div id="siapIntegrationContent" class="siap-integration-content"></div></div>`;
  document.body.appendChild(modal);
  const style = document.createElement('style');
  style.textContent = `body.carometro-modal-open{overflow:hidden!important}.modal-bg{overscroll-behavior:contain}.siap-integration-modal{z-index:340!important;overscroll-behavior:contain}.siap-integration-modal .modal{width:min(780px,100%);overscroll-behavior:contain}.siap-integration-content{padding:24px}.siap-brand-card{display:grid;grid-template-columns:58px 1fr;gap:15px;align-items:center;padding:18px;border:1px solid #cbd9f6;border-radius:16px;background:linear-gradient(145deg,#f8faff,#edf3ff)}.siap-brand-mark{width:58px;height:58px;border-radius:17px;display:grid;place-items:center;background:#17233a;color:#82aeff;font-size:30px;font-weight:900}.siap-brand-card h4{margin:0 0 5px;font-size:18px}.siap-brand-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}.siap-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.siap-feature{padding:15px;border:1px solid var(--line);border-radius:13px;background:#fff}.siap-feature strong{display:block;margin-bottom:4px}.siap-feature span{color:var(--muted);font-size:12px;line-height:1.45}.siap-integration-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.siap-integration-note{margin-top:14px;padding:12px 14px;border-radius:11px;background:#fff8e8;color:#7a5313;font-size:12px;line-height:1.5}.siap-integration-note.license-validated{border:1px solid #e2b93f;background:#fff1a8;color:#604300;font-size:16px;font-weight:800;line-height:1.45;box-shadow:0 4px 12px rgba(183,137,37,.18)}.welcome-notification-row #openSiapAssistant{flex:0 0 auto;margin-left:auto;min-height:38px;padding:8px 13px;border-radius:10px;font-size:12px;white-space:nowrap;box-shadow:0 4px 12px rgba(76,51,193,.14)}@media(max-width:640px){.siap-feature-grid{grid-template-columns:1fr}.siap-integration-actions .btn{width:100%}.welcome-notification-row #openSiapAssistant{min-height:36px;padding:7px 10px;font-size:11px}.siap-integration-note.license-validated{font-size:15px}}`;
  document.head.appendChild(style);
  let returnModal = null;
  let returnFocus = null;
  const syncModalLock = () => document.body.classList.toggle('carometro-modal-open', !!document.querySelector('.modal-bg:not(.hidden)'));
  new MutationObserver(syncModalLock).observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] });
  syncModalLock();
  const closeModal = () => {
    modal.classList.add('hidden');
    if (returnModal?.isConnected) returnModal.classList.remove('hidden');
    returnModal = null;
    returnFocus?.focus?.();
    returnFocus = null;
  };
  modal.querySelector('[data-siap-close]').onclick = closeModal;
  modal.onclick = event => { if (event.target === modal) closeModal(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  const safe = value => esc(String(value || ''));
  const assistantExtensionIds = [
    'fgpjjlikinpcjpmmjehbgbfonnbfibnc',
    'mohcmojnkjjkphgjaogcbokjmnijmggl',
    'iobkgohpoeoimlhlgdeiojlghbhcijli'
  ];
  const assistantInstallUrl = () => String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantInstallUrl || '').trim();
  const assistantStoreUrl = () => String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantStoreUrl || '').trim();
  const compareVersions = (left, right) => {
    const a = String(left || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    const b = String(right || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
    }
    return 0;
  };
  const assistantPresentationUrl = () => new URL('assistente-siap.html?origem=carometro', window.location.href).href;
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
  const deliverSessionToAssistant = async payload => {
    if (globalThis.chrome?.runtime?.sendMessage) {
      for (const extensionId of assistantExtensionIds) {
        const result = await new Promise(resolve => {
          chrome.runtime.sendMessage(extensionId, payload, response => {
            const failed = Boolean(chrome.runtime.lastError) || response?.ok !== true;
            resolve(failed ? null : response);
          });
        });
        if (result) return result;
      }
    }
    const bridgedResult = await connectThroughPageBridge(payload);
    return bridgedResult?.ok ? bridgedResult : null;
  };
  const connectAssistantAi = async (statusElement, silent = false) => {
    if (statusElement && !silent) {
      statusElement.classList.remove('license-validated');
      statusElement.textContent = 'Validando licença com segurança…';
    }
    const { data, error } = await db.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session?.expires_at) {
      if (statusElement && !silent) statusElement.textContent = 'Sua sessão do Carômetro expirou. Entre novamente.';
      return null;
    }
    const payload = {
      type:'CAROMETRO_SIAP_CONNECT',
      accessToken:session.access_token,
      expiresAt:Number(session.expires_at) * 1000
    };
    const result = await deliverSessionToAssistant(payload);
    if (result) {
      if (statusElement) showConnectedStatus(statusElement, result);
      return result;
    }
    if (statusElement && !silent) statusElement.textContent = 'A extensão não respondeu. Atualize-a e recarregue o Carômetro.';
    return null;
  };
  const showConnectedStatus = (statusElement, result) => {
    statusElement.classList.add('license-validated');
    const installedVersion = String(result.extensionVersion || '').trim();
    const minimumVersion = String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantMinimumVersion || '').trim();
    const recommendedVersion = String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantRecommendedVersion || '').trim();
    if (installedVersion && minimumVersion && compareVersions(installedVersion, minimumVersion) < 0) {
      const storeUrl = assistantStoreUrl();
      statusElement.innerHTML = `Atualização obrigatória: sua extensão é a versão ${safe(installedVersion)}. <a href="${safe(storeUrl)}" target="_blank" rel="noopener noreferrer">Atualize pela Chrome Web Store</a> para continuar com segurança.`;
      return;
    }
    const days = Number(result.license?.daysRemaining);
    const connectedText = Number.isFinite(days)
      ? `Licença validada pelo Carômetro. Seu acesso tem ${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}. Nenhuma senha foi compartilhada.`
      : 'Licença validada pelo Carômetro. Nenhuma senha foi compartilhada.';
    if (installedVersion && recommendedVersion && compareVersions(installedVersion, recommendedVersion) < 0) {
      const storeUrl = assistantStoreUrl();
      statusElement.innerHTML = `${safe(connectedText)} Atualização recomendada: versão ${safe(installedVersion)} instalada. <a href="${safe(storeUrl)}" target="_blank" rel="noopener noreferrer">Ver atualização na Chrome Web Store</a>.`;
      return;
    }
    statusElement.textContent = installedVersion ? `${connectedText} Versão ${installedVersion}.` : connectedText;
  };
  const openAssistantModal = className => {
    returnFocus = document.activeElement;
    const classroomModal = document.getElementById('classroomMapModal');
    if (classroomModal && !classroomModal.classList.contains('hidden')) {
      returnModal = classroomModal;
      classroomModal.classList.add('hidden');
    }
    document.getElementById('siapIntegrationTitle').textContent = 'Assistente SIAP';
    document.getElementById('siapIntegrationMeta').textContent = className || 'Turma selecionada';
    const installUrl = assistantInstallUrl();
    const presentationUrl = assistantPresentationUrl();
    document.getElementById('siapIntegrationContent').innerHTML = `<section class="siap-brand-card"><div class="siap-brand-mark">✦</div><div><h4>Assistente SIAP do Professor</h4><p>Planejamento, conteúdo, frequência e PEI com revisão do professor e sem captura de credenciais.</p></div></section><div class="siap-feature-grid"><div class="siap-feature"><strong>Instalação controlada</strong><span>O acesso aparece somente para usuários autorizados pelo proprietário da plataforma ou com assinatura válida.</span></div><div class="siap-feature"><strong>Privacidade</strong><span>Login e senha do SIAP nunca passam pelo Carômetro.</span></div></div><div class="siap-integration-actions"><a class="btn primary" href="${safe(presentationUrl)}" target="_blank" rel="noopener noreferrer">Conhecer e instalar</a><button id="connectSiapAi" class="btn primary" type="button">Validar novamente</button><button id="closeSiapAssistant" class="btn secondary" type="button">Voltar</button></div><div id="siapAiConnectionStatus" class="siap-integration-note">A licença será validada automaticamente pelo Carômetro. Nome, matrícula e senha do SIAP não são enviados.</div>${installUrl ? '' : '<div class="siap-integration-note">A instalação será concluída pela Chrome Web Store depois da publicação oficial.</div>'}`;
    modal.classList.remove('hidden');
    document.getElementById('connectSiapAi').onclick = () => connectAssistantAi(document.getElementById('siapAiConnectionStatus'));
    document.getElementById('closeSiapAssistant').onclick = closeModal;
    modal.querySelector('[data-siap-close]')?.focus();
    connectAssistantAi(document.getElementById('siapAiConnectionStatus'), true);
  };
  let assistantAccessVisible = false;
  const syncMainAssistantButton = () => {
    const greetingRow = document.querySelector('.welcome-notification-row');
    const bell = document.getElementById('notificationBell');
    if (!greetingRow || !bell) return;
    const onMainPage = !selectedClassId && document.getElementById('pageTitle')?.textContent.trim() === 'CARÔMETRO';
    let button = document.getElementById('openSiapAssistant');
    if (!assistantAccessVisible) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.id = 'openSiapAssistant';
      button.type = 'button';
      button.className = 'btn primary';
      button.textContent = 'Assistente SIAP';
      greetingRow.insertBefore(button, bell);
    }
    button.classList.toggle('hidden', !onMainPage);
    button.onclick = () => {
      openAssistantModal('Página principal');
    };
  };
  const refreshAssistantButtonAccess = async () => {
    const { data, error } = await db.rpc('get_siap_assistant_button_visibility');
    assistantAccessVisible = !error && data?.visible === true;
    syncMainAssistantButton();
  };
  const app = document.getElementById('app');
  if (app) new MutationObserver(syncMainAssistantButton).observe(app, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });
  refreshAssistantButtonAccess();
  let lastAutomaticValidation = 0;
  const renewAssistantAuthorization = async force => {
    if (!force && Date.now() - lastAutomaticValidation < 10 * 60 * 1000) return;
    const result = await connectAssistantAi(null, true);
    if (result) lastAutomaticValidation = Date.now();
  };
  setTimeout(() => renewAssistantAuthorization(true), 800);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renewAssistantAuthorization(false); });
  setInterval(() => renewAssistantAuthorization(false), 10 * 60 * 1000);
  db.auth.onAuthStateChange((event, session) => {
    if (session?.access_token && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
      setTimeout(() => renewAssistantAuthorization(true), 0);
      setTimeout(refreshAssistantButtonAccess, 0);
    }
  });
  window.syncMainSiapAssistantButton = syncMainAssistantButton;
  window.refreshSiapAssistantButtonAccess = refreshAssistantButtonAccess;
  window.getSiapAttendanceBadge ||= () => '';
  window.getSiapPanelActions = () => '';
  window.bindSiapPanelActions = () => {};
});
