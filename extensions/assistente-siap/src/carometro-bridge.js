(() => {
  'use strict';
  const allowedOrigin = 'https://sistemacarometro.com.br';

  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source === window && event.origin === allowedOrigin && message?.source === 'CAROMETRO_WEB' && message?.type === 'CAROMETRO_CEPI_EXAM_REQUEST') {
      const requestId = String(message.requestId || '');
      if (!requestId) return;
      chrome.runtime.sendMessage({type:'CAROMETRO_CEPI_EXAM_INTERNAL',action:message.action,room:message.room,token:message.token,body:message.body,accessToken:message.accessToken})
        .then(response => window.postMessage({source:'CAROMETRO_EXTENSION',type:'CAROMETRO_CEPI_EXAM_RESULT',requestId,response},allowedOrigin))
        .catch(() => window.postMessage({source:'CAROMETRO_EXTENSION',type:'CAROMETRO_CEPI_EXAM_RESULT',requestId,response:{ok:false,error:'Extensão indisponível.'}},allowedOrigin));
      return;
    }
    if (event.source !== window || event.origin !== allowedOrigin || message?.source !== 'CAROMETRO_WEB' || message?.type !== 'CAROMETRO_SIAP_CONNECT_BRIDGE') return;
    const requestId = String(message.requestId || '');
    if (!requestId) return;
    chrome.runtime.sendMessage({
      type: 'CAROMETRO_SIAP_CONNECT_INTERNAL', explicit: message.explicit === true,
      accessToken: message.accessToken,
      expiresAt: message.expiresAt
    }).then(response => {
      window.postMessage({ source:'CAROMETRO_EXTENSION', type:'CAROMETRO_SIAP_CONNECT_RESULT', requestId, response }, allowedOrigin);
    }).catch(() => {
      window.postMessage({ source:'CAROMETRO_EXTENSION', type:'CAROMETRO_SIAP_CONNECT_RESULT', requestId, response:null }, allowedOrigin);
    });
  });
})();
