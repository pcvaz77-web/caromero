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

  // Deduplica getUser() sem mudar autenticação/autorização nenhuma: cada
  // chamada real continua validando contra o servidor exatamente como
  // antes — isto só evita repetir, em rajada, uma chamada que acabou de
  // sair ou que já voltou há poucos segundos. Nenhuma regra de RLS/sessão
  // depende de quantas vezes o cliente chama getUser(); a autorização de
  // verdade é sempre revalidada no servidor a cada operação real.
  function withDedupedGetUser(client) {
    const CACHE_TTL_MS = 2000; // curto de propósito — não é um cache de sessão
    const originalGetUser = client.auth.getUser.bind(client.auth);
    let inFlight = null;
    let cached = null; // { value, expiresAt }

    const invalidate = () => { inFlight = null; cached = null; };

    client.auth.getUser = function (...args) {
      // Só deduplica a forma mais comum (sem argumento, usa a sessão
      // atual). Qualquer chamada com JWT explícito passa direto, sem cache.
      if (args.length > 0) return originalGetUser(...args);

      if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.value);
      }
      if (inFlight) return inFlight;

      inFlight = originalGetUser()
        .then(result => {
          inFlight = null;
          // Erro nunca fica em cache — próxima chamada tenta de novo de verdade.
          if (!result?.error) cached = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
          return result;
        })
        .catch(error => { invalidate(); throw error; });
      return inFlight;
    };

    // Qualquer mudança real de sessão invalida na hora — nunca entrega o
    // usuário de uma conta anterior depois de logout/login/troca na mesma aba.
    client.auth.onAuthStateChange(event => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) invalidate();
    });

    return client;
  }

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
    // window.supabase.createClient já está interceptado por protect() (abaixo),
    // que já devolve o cliente com getUser() deduplicado — nada extra a fazer aqui.
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
      // Este é o único lugar por onde toda criação de cliente comercial passa
      // (direto via window.supabase.createClient(...), como o app principal
      // faz, ou via window.createCarometroSupabaseClient() acima) — por isso
      // é aqui, e só aqui, que o getUser() é deduplicado, para valer para
      // qualquer um dos dois caminhos sem duplicar a lógica.
      const client = originalCreateClient(url, key, options);
      return withDedupedGetUser(client);
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
