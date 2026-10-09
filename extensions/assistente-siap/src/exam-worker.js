// Loaded in the existing extension worker; does not change planning/PEI API requests.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!String(message?.type || '').startsWith('SIAP_EXAM_')) return;
  let source;
  try { source = new URL(sender.tab?.url || ''); } catch { respond({ error: 'Origem inválida.' }); return; }
  if (source.origin !== 'https://siap.educacao.go.gov.br' || !['/LancamentoNotasModeloEdicao.aspx', '/LancamentoNotasModeloListagem.aspx'].includes(source.pathname) || !Number.isInteger(sender.tab?.id)) { respond({ error: 'Abra a avaliação no SIAP.' }); return; }
  const key = `siapExamTab:${sender.tab.id}`;
  // The SIAP can save or leave the assessment page while the phone is still
  // sending cards. Keep only the short-lived pairing state for this browser
  // session: images remain exclusively in the correction service.
  const resumeKey = 'siapExamResume';
  const validState = value => value && value.room && Number(value.room.expires) > Date.now();
  (async () => {
    if (message.type === 'SIAP_EXAM_STATE_GET') {
      const stored = await chrome.storage.session.get([key, resumeKey]);
      const value = validState(stored[key]) ? stored[key] : validState(stored[resumeKey]) ? stored[resumeKey] : null;
      if (!value && (stored[key] || stored[resumeKey])) await chrome.storage.session.remove([key, resumeKey]);
      return { ok: true, value };
    }
    if (message.type === 'SIAP_EXAM_STATE_PUT') {
      if (validState(message.value)) await chrome.storage.session.set({ [key]: message.value, [resumeKey]: message.value });
      else await chrome.storage.session.remove([key, resumeKey]);
      return { ok: true };
    }
    if(message.type==='SIAP_EXAM_BUY') return {ok:false,error:'A Correção de Provas agora integra o Carômetro.'};
    if (message.type !== 'SIAP_EXAM_API') throw new Error('Operação desconhecida.');
    const { action, room, token, body = {} } = message;
    if (!['create', 'heartbeat', 'finish-block', 'status', 'image', 'key', 'review', 'pause', 'close', 'retry', 'discard', 'roster'].includes(action)) throw new Error('Operação inválida.');
    if (action !== 'create' && (!/^[0-9a-f-]{36}$/.test(room || '') || !/^[0-9a-f]{64}$/.test(token || ''))) throw new Error('Sessão inválida.');
    const headers = { 'Content-Type': 'application/json', 'X-Exam-Token': token || '' };
    if (['create', 'heartbeat','finish-block'].includes(action)) {
      const session = await readConnectedSession();
      if (!session) throw new Error('Reconecte sua licença do Assistente.');
      headers.Authorization = `Bearer ${session.accessToken || SUPABASE_ANON_KEY}`;
      if (session.deviceToken) headers['X-Assistant-Session'] = session.deviceToken;
    }
    const path = action === 'create' ? '/api/create' : `/api/${room}/${action}`;
    const response = await fetch(SiapExamConfig.origin + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const data = await response.json();
    if (!response.ok) return { error: data.error || 'Serviço indisponível.', status: response.status };
    return data;
  })().then(respond).catch(() => respond({ error: 'Não foi possível conectar ao serviço de correção. Confira a ativação do serviço e a conexão.' }));
  return true;
});
// Closing the SIAP tab must not discard a correction that is still being
// captured on the phone. The resume record expires with the remote session.
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`siapExamTab:${tabId}`));
