(() => {
  'use strict';
  const allowedOrigin = 'https://sistemacarometro.com.br';

  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || event.origin !== allowedOrigin || message?.source !== 'CAROMETRO_WEB' || message?.type !== 'CAROMETRO_SIAP_CONNECT_BRIDGE') return;
    const requestId = String(message.requestId || '');
    if (!requestId) return;
    chrome.runtime.sendMessage({
      type: 'CAROMETRO_SIAP_CONNECT_INTERNAL',
      accessToken: message.accessToken,
      expiresAt: message.expiresAt
    }).then(response => {
      window.postMessage({ source:'CAROMETRO_EXTENSION', type:'CAROMETRO_SIAP_CONNECT_RESULT', requestId, response }, allowedOrigin);
    }).catch(() => {
      window.postMessage({ source:'CAROMETRO_EXTENSION', type:'CAROMETRO_SIAP_CONNECT_RESULT', requestId, response:null }, allowedOrigin);
    });
  });
})();
