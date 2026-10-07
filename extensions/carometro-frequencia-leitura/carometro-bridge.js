(() => {
  'use strict';

  // A interface pertence ao Carômetro. A extensão mantém somente esta ponte
  // silenciosa entre a página autenticada e o leitor da chamada aberta no SIAP.
  window.addEventListener('message', event => {
    const message = event.data;
    const assistedRequest = message?.type === 'CAROMETRO_ASSISTED_CAPTURE_REQUEST';
    const schoolDailyRequest = message?.type === 'CAROMETRO_SCHOOL_DAILY_REQUEST';
    const gradesRequest = message?.type === 'CAROMETRO_GRADES_CAPTURE_REQUEST';
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      message?.source !== 'CAROMETRO_WEB' ||
      (!assistedRequest && !schoolDailyRequest && !gradesRequest)
    ) return;

    const sendResult = response => {
      window.postMessage({
        source:gradesRequest ? 'CAROMETRO_GRADES_EXTENSION' : schoolDailyRequest ? 'CAROMETRO_SCHOOL_DAILY_EXTENSION' : 'CAROMETRO_FREQUENCY_EXTENSION',
        type:gradesRequest ? 'CAROMETRO_GRADES_CAPTURE_RESULT' : schoolDailyRequest ? 'CAROMETRO_SCHOOL_DAILY_RESULT' : 'CAROMETRO_ASSISTED_CAPTURE_RESULT',
        requestId:message.requestId,
        response
      }, location.origin);
    };
    try {
      if (!chrome.runtime?.id) throw new Error('Extension context invalidated');
      chrome.runtime.sendMessage(gradesRequest
        ? { type:'CM_GRADES_CAPTURE' }
        : schoolDailyRequest
        ? { type:'CM_SCHOOL_DAILY_COLLECT', request:{ months:Array.isArray(message.months) ? message.months : [] } }
        : { type:'CM_ASSISTED_CAPTURE', request:{ tabId:Number.isInteger(message.tabId) ? message.tabId : null } }, response => {
        sendResult(chrome.runtime.lastError
          ? { ok:false, message:'A extensão não respondeu. Recarregue-a e atualize esta página.' }
          : response);
      });
    } catch (_) {
      sendResult({ ok:false, message:'A extensão foi recarregada. Atualize a página do Carômetro e tente novamente.' });
    }
  });
})();
