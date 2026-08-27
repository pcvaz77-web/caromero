// Runtime seguro da branch comercial. Até existir um Supabase comercial
// aprovado, o destino é deliberadamente inválido para impedir que testes ou
// previews consultem ou alterem o projeto atualmente publicado.
(function () {
  const config = Object.freeze({
    environment: 'commercial-development',
    backendConfigured: true,
    supabaseProjectRef: 'ppkndfwmqdmomkjoemre',
    supabaseUrl: 'https://ppkndfwmqdmomkjoemre.supabase.co',
    supabasePublishableKey: 'sb_publishable_i9jmKG8G71dlwz_K-Eg3sA_StMOS1Jn',
    vapidPublicKey: 'BDLdmN6b1fg7AQeIVLx1oQ5qJxEWN2vX-MpBFo_0iw3NUAR2bpLCt3iYduD7KZRpqnostep-Iq68xzvTBmLKewU'
  });
  window.CAROMETRO_RUNTIME_CONFIG = config;

  window.createCarometroSupabaseClient = function () {
    if (!config.backendConfigured) {
      throw new Error('O backend comercial ainda não foi configurado.');
    }
    const projectRef = (() => {
      try { return new URL(config.supabaseUrl).hostname.split('.')[0]; }
      catch { return ''; }
    })();
    if (!projectRef || projectRef === 'ftigviorsuqucxwxqpua' || projectRef !== config.supabaseProjectRef) {
      throw new Error('Projeto Supabase comercial não autorizado.');
    }
    if (!config.supabasePublishableKey || config.supabasePublishableKey.includes('not_configured')) {
      throw new Error('A chave pública do backend comercial ainda não foi configurada.');
    }
    if (!window.supabase?.createClient) {
      throw new Error('A biblioteca de conexão não foi carregada.');
    }
    return window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  };

  function protect(clientLibrary) {
    if (!clientLibrary?.createClient || clientLibrary.__carometroProtected) return clientLibrary;
    const originalCreateClient = clientLibrary.createClient.bind(clientLibrary);
    clientLibrary.createClient = function (url, key, options) {
      if (!config.backendConfigured) {
        throw new Error('O backend comercial ainda não foi configurado.');
      }
      const requestedRef = (() => {
        try { return new URL(url).hostname.split('.')[0]; }
        catch { return ''; }
      })();
      const requestedOrigin = (() => {
        try { return new URL(url).origin; }
        catch { return ''; }
      })();
      const configuredOrigin = (() => {
        try { return new URL(config.supabaseUrl).origin; }
        catch { return ''; }
      })();
      if (requestedRef === 'ftigviorsuqucxwxqpua'
          || requestedRef !== config.supabaseProjectRef
          || !requestedOrigin
          || requestedOrigin !== configuredOrigin) {
        throw new Error('Conexão Supabase não autorizada para esta configuração comercial.');
      }
      return originalCreateClient(url, key, options);
    };
    Object.defineProperty(clientLibrary, '__carometroProtected', { value:true });
    return clientLibrary;
  }

  if (window.supabase) { protect(window.supabase); return; }
  let pending;
  Object.defineProperty(window, 'supabase', {
    configurable:true,
    get() { return pending; },
    set(value) {
      pending = protect(value);
      Object.defineProperty(window, 'supabase', { configurable:true, writable:true, value:pending });
    }
  });
})();
