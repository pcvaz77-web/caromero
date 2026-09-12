(() => {
  'use strict';

  // A interface pertence ao Carômetro. A extensão mantém somente esta ponte
  // silenciosa entre a página autenticada e o leitor da chamada aberta no SIAP.
  window.addEventListener('message', event => {
    const message = event.data;
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      message?.source !== 'CAROMETRO_WEB' ||
      message?.type !== 'CAROMETRO_ASSISTED_CAPTURE_REQUEST'
    ) return;

    chrome.runtime.sendMessage({ type:'CM_ASSISTED_CAPTURE' }, response => {
      window.postMessage({
        source:'CAROMETRO_FREQUENCY_EXTENSION',
        type:'CAROMETRO_ASSISTED_CAPTURE_RESULT',
        requestId:message.requestId,
        response:chrome.runtime.lastError
          ? { ok:false, message:'A extensão não respondeu. Recarregue-a e tente novamente.' }
          : response
      }, location.origin);
    });
  });
})();
