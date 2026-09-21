importScripts("exam-config.js", "exam-worker.js");
const AI_ENDPOINT = "https://ppkndfwmqdmomkjoemre.supabase.co/functions/v1/generate-siap-ai-draft";
const SUPABASE_ANON_KEY = "sb_publishable_i9jmKG8G71dlwz_K-Eg3sA_StMOS1Jn";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

async function callAssistantApi(session, payload) {
  const accessToken = typeof session === "string" ? session : session?.accessToken;
  const deviceToken = typeof session === "object" ? session?.deviceToken : "";
  const response = await fetch(AI_ENDPOINT, {
    method:"POST",
    headers:{
      "Authorization":`Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      ...(deviceToken ? { "X-Assistant-Session":deviceToken } : {}),
      "apikey":SUPABASE_ANON_KEY,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function readConnectedSession() {
  const { carometroAiDeviceSession } = await chrome.storage.local.get("carometroAiDeviceSession");
  const deviceExpiresAt = Number(carometroAiDeviceSession?.expiresAt || 0);
  if (typeof carometroAiDeviceSession?.deviceToken === "string" && deviceExpiresAt > Date.now() + 30000) return carometroAiDeviceSession;
  const { carometroAiSession } = await chrome.storage.session.get("carometroAiSession");
  const expiresAt = Number(carometroAiSession?.expiresAt || 0);
  return typeof carometroAiSession?.accessToken === "string" && expiresAt > Date.now() + 30000
    ? carometroAiSession
    : null;
}

async function renewLocalDeviceSession(session, data) {
  if (!session?.deviceToken) return;
  const expiresAt = Date.parse(data?.deviceExpiresAt || "");
  if (Number.isFinite(expiresAt)) await chrome.storage.local.set({ carometroAiDeviceSession:{ deviceToken:session.deviceToken, expiresAt } });
}

async function broadcastLicense(license) {
  const tabs = await chrome.tabs.query({ url:"https://siap.educacao.go.gov.br/*" });
  await Promise.allSettled(tabs.filter(tab => tab.id).map(tab => chrome.tabs.sendMessage(tab.id, {
    type:"ASSISTENTE_SIAP_LICENSE_UPDATED", license
  })));
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "CAROMETRO_SIAP_CONNECT_INTERNAL") {
    let origin = "";
    try { origin = new URL(sender.tab?.url || sender.url || "").origin; } catch { origin = ""; }
    const accessToken = typeof message.accessToken === "string" ? message.accessToken.trim() : "";
    const expiresAt = Number(message.expiresAt || 0);
    if (origin !== "https://sistemacarometro.com.br" || !accessToken || expiresAt <= Date.now() + 30000) {
      respond({ ok:false, code:"INVALID_SESSION" });
      return;
    }
    chrome.storage.session.set({ carometroAiSession:{ accessToken, expiresAt } }).then(async () => {
      try {
        const { response, data } = await callAssistantApi(accessToken, { action:"create_device_session" });
        if (!response.ok || data?.ok !== true) {
          if (data?.code === "persistent_session_not_allowed" && data?.license?.mode === "external" && data.license.active === true) {
            if (!(await readConnectedSession())?.deviceToken) await broadcastLicense(data.license);
            respond({ ok:true, expiresAt, temporary:true, license:data.license, extensionVersion:EXTENSION_VERSION });
            return;
          }
          respond({ ok:false, code:data?.code || "LICENSE_REQUEST_FAILED" });
          return;
        }
        const deviceExpiresAt = Date.parse(data.expiresAt || "");
        if (typeof data.deviceToken !== "string" || !Number.isFinite(deviceExpiresAt)) return respond({ ok:false, code:"DEVICE_SESSION_INVALID" });
        await chrome.storage.local.set({ carometroAiDeviceSession:{ deviceToken:data.deviceToken, expiresAt:deviceExpiresAt } });
        await broadcastLicense(data.license || null);
        respond({ ok:true, expiresAt:deviceExpiresAt, license:data.license || null, extensionVersion:EXTENSION_VERSION });
      } catch {
        respond({ ok:false, code:"LICENSE_CONNECTION_FAILED" });
      }
    });
    return true;
  }

  if (message?.type === "ASSISTENTE_SIAP_AI_STATUS") {
    readConnectedSession().then((session) => respond({ ok:true, connected:!!session, extensionVersion:EXTENSION_VERSION }));
    return true;
  }

  if (message?.type === "ASSISTENTE_SIAP_LICENSE_STATUS") {
    readConnectedSession().then(async (session) => {
      if (!session) return respond({ ok:false, code:"ASSISTANT_SESSION_REQUIRED" });
      try {
        const { response, data } = await callAssistantApi(session, { action:"license_status" });
        if (response.status === 401 && session.deviceToken) await chrome.storage.local.remove("carometroAiDeviceSession");
        if (response.ok) await renewLocalDeviceSession(session, data);
        respond(response.ok && data?.ok === true
          ? { ok:true, license:data.license || null, extensionVersion:EXTENSION_VERSION }
          : { ok:false, code:data?.code || "LICENSE_REQUEST_FAILED", license:data?.license || null });
      } catch {
        respond({ ok:false, code:"LICENSE_CONNECTION_FAILED" });
      }
    });
    return true;
  }

  if (message?.type === "ASSISTENTE_SIAP_CONSUME_FEATURE") {
    readConnectedSession().then(async (session) => {
      if (!session) return respond({ ok:false, code:"ASSISTANT_SESSION_REQUIRED", message:"A sessão do Assistente SIAP não está disponível neste navegador. As prévias foram preservadas; reative o acesso à extensão e tente novamente." });
      const feature = String(message.feature || "");
      if (!["planning", "content", "attendance", "pei"].includes(feature)) return respond({ ok:false, code:"INVALID_FEATURE" });
      try {
        const payload = session.deviceToken ? { action:"license_status" } : { action:"consume_feature", feature };
        const { response, data } = await callAssistantApi(session, payload);
        if (response.status === 401 && session.deviceToken) await chrome.storage.local.remove("carometroAiDeviceSession");
        if (response.ok) await renewLocalDeviceSession(session, data);
        const license = data?.license || null;
        if (license) await broadcastLicense(license);
        if (!response.ok || data?.ok !== true) {
          respond({ ok:false, code:data?.code || "FEATURE_ACCESS_FAILED", license, message:data?.code === "free_limit_reached" ? "O limite gratuito desta função terminou. Assine para continuar." : "Não foi possível validar o uso desta função." });
          return;
        }
        respond({ ok:true, license, usage:data?.usage || { allowed:true, unlimited:true } });
      } catch {
        respond({ ok:false, code:"FEATURE_ACCESS_CONNECTION_FAILED", message:"Não foi possível validar o acesso ao Assistente SIAP. Tente novamente." });
      }
    });
    return true;
  }

  if (message?.type === "ASSISTENTE_SIAP_AI_DRAFT") {
    readConnectedSession().then(async (session) => {
      if (!session) {
        respond({ ok:false, code:"ASSISTANT_SESSION_REQUIRED", message:"A sessão do Assistente SIAP não está disponível neste navegador. As prévias foram preservadas; reative o acesso à extensão e tente novamente." });
        return;
      }
      try {
        const { response, data } = await callAssistantApi(session, message.payload || {});
        if (response.status === 401 && session.deviceToken) await chrome.storage.local.remove("carometroAiDeviceSession");
        if (response.ok) await renewLocalDeviceSession(session, data);
        if (!response.ok || data?.ok !== true) {
          respond({ ok:false, code:data?.code || "AI_REQUEST_FAILED", license:data?.license || null, message:data?.code === "free_limit_reached" ? "O limite gratuito desta função terminou. Assine para continuar." : data?.code === "license_expired" ? "Seu acesso ao Assistente SIAP terminou. Assine para continuar utilizando o assistente." : "Não foi possível gerar o texto com IA agora." });
          return;
        }
        if (data?.license) await broadcastLicense(data.license);
        respond({ ok:true, fields:Array.isArray(data.fields) ? data.fields : [], license:data.license || null });
      } catch {
        respond({ ok:false, code:"AI_CONNECTION_FAILED", message:"O servidor de IA não respondeu. Tente novamente." });
      }
    });
    return true;
  }

  if (message?.type === "GET_TAB_STATUS") {
    chrome.tabs.query({ active:true, currentWindow:true }).then(async ([tab]) => {
      if (!tab?.id || !String(tab.url || "").startsWith("https://siap.educacao.go.gov.br/")) {
        respond({ ok:false, supported:false });
        return;
      }
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type:"ASSISTENTE_SIAP_STATUS" });
        respond({ ok:true, supported:true, status });
      } catch {
        respond({ ok:false, supported:true });
      }
    });
    return true;
  }

  if (message?.type === "TOGGLE_PANEL") {
    chrome.tabs.query({ active:true, currentWindow:true }).then(async ([tab]) => {
      if (!tab?.id) return respond({ ok:false });
      try {
        await chrome.tabs.sendMessage(tab.id, { type:"ASSISTENTE_SIAP_TOGGLE" });
        respond({ ok:true });
      } catch {
        respond({ ok:false });
      }
    });
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  let origin = "";
  try { origin = new URL(sender.url || "").origin; } catch { origin = ""; }
  if (origin !== "https://sistemacarometro.com.br" || message?.type !== "CAROMETRO_SIAP_CONNECT") {
    respond({ ok:false });
    return;
  }
  const accessToken = typeof message.accessToken === "string" ? message.accessToken.trim() : "";
  const expiresAt = Number(message.expiresAt || 0);
  if (!accessToken || expiresAt <= Date.now() + 30000) {
    respond({ ok:false, code:"INVALID_SESSION" });
    return;
  }
  chrome.storage.session.set({ carometroAiSession:{ accessToken, expiresAt } }).then(async () => {
    try {
      const { response, data } = await callAssistantApi(accessToken, { action:"create_device_session" });
      if (!response.ok || data?.ok !== true) {
        if (data?.code === "persistent_session_not_allowed" && data?.license?.mode === "external" && data.license.active === true) {
          if (!(await readConnectedSession())?.deviceToken) await broadcastLicense(data.license);
          respond({ ok:true, expiresAt, temporary:true, license:data.license, extensionVersion:EXTENSION_VERSION });
          return;
        }
        respond({ ok:false, code:data?.code || "LICENSE_REQUEST_FAILED" });
        return;
      }
      const deviceExpiresAt = Date.parse(data.expiresAt || "");
      if (typeof data.deviceToken !== "string" || !Number.isFinite(deviceExpiresAt)) return respond({ ok:false, code:"DEVICE_SESSION_INVALID" });
      await chrome.storage.local.set({ carometroAiDeviceSession:{ deviceToken:data.deviceToken, expiresAt:deviceExpiresAt } });
      await broadcastLicense(data.license || null);
      respond({ ok:true, expiresAt:deviceExpiresAt, license:data.license || null, extensionVersion:EXTENSION_VERSION });
    } catch {
      respond({ ok:false, code:"LICENSE_CONNECTION_FAILED" });
    }
  });
  return true;
});
