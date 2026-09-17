(() => {
  'use strict';

  // A interface pertence ao Carômetro. A extensão mantém somente esta ponte
  // silenciosa entre a página autenticada e o leitor da chamada aberta no SIAP.
  window.addEventListener('message', event => {
    const message = event.data;
    const assistedRequest = message?.type === 'CAROMETRO_ASSISTED_CAPTURE_REQUEST';
    const schoolDailyRequest = message?.type === 'CAROMETRO_SCHOOL_DAILY_REQUEST';
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      message?.source !== 'CAROMETRO_WEB' ||
      (!assistedRequest && !schoolDailyRequest)
    ) return;

    const sendResult = response => {
      window.postMessage({
        source:schoolDailyRequest ? 'CAROMETRO_SCHOOL_DAILY_EXTENSION' : 'CAROMETRO_FREQUENCY_EXTENSION',
        type:schoolDailyRequest ? 'CAROMETRO_SCHOOL_DAILY_RESULT' : 'CAROMETRO_ASSISTED_CAPTURE_RESULT',
        requestId:message.requestId,
        response
      }, location.origin);
    };
    try {
      if (!chrome.runtime?.id) throw new Error('Extension context invalidated');
      chrome.runtime.sendMessage(schoolDailyRequest
        ? { type:'CM_SCHOOL_DAILY_COLLECT', request:{ months:Array.isArray(message.months) ? message.months : [] } }
        : { type:'CM_ASSISTED_CAPTURE' }, response => {
        sendResult(chrome.runtime.lastError
          ? { ok:false, message:'A extensão não respondeu. Recarregue-a e atualize esta página.' }
          : response);
      });
    } catch (_) {
      sendResult({ ok:false, message:'A extensão foi recarregada. Atualize a página do Carômetro e tente novamente.' });
    }
  });
})();
