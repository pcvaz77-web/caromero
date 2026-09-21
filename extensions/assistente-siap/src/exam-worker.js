// Loaded in the existing extension worker; does not change planning/PEI API requests.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!String(message?.type || '').startsWith('SIAP_EXAM_')) return;
  let source;
  try { source = new URL(sender.tab?.url || ''); } catch { respond({ error: 'Origem inválida.' }); return; }
  if (source.origin !== 'https://siap.educacao.go.gov.br' || !['/LancamentoNotasModeloEdicao.aspx', '/LancamentoNotasModeloListagem.aspx'].includes(source.pathname) || !Number.isInteger(sender.tab?.id)) { respond({ error: 'Abra a avaliação no SIAP.' }); return; }
  const key = `siapExamTab:${sender.tab.id}`;
  (async () => {
    if (message.type === 'SIAP_EXAM_STATE_GET') return { ok: true, value: (await chrome.storage.session.get(key))[key] || null };
    if (message.type === 'SIAP_EXAM_STATE_PUT') { await chrome.storage.session.set({ [key]: message.value }); return { ok: true }; }
    if(message.type==='SIAP_EXAM_BUY') {
      if(!['exam_one','exam_four'].includes(message.offerKey)||message.legalAccepted!==true) throw new Error('Compra inválida');
      const session=await readConnectedSession();
      if(!session) return {ok:false,loginRequired:true};
      const response=await fetch(AI_ENDPOINT.replace('generate-siap-ai-draft','siap-exam-commerce'),{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${session.accessToken||SUPABASE_ANON_KEY}`,...(session.deviceToken?{'X-Assistant-Session':session.deviceToken}:{})},body:JSON.stringify({action:'checkout',offerKey:message.offerKey,legalAccepted:true}),signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(response.ok&&data.ok&&new URL(data.checkoutUrl).origin==='https://pay.hotmart.com') {await chrome.tabs.create({url:data.checkoutUrl});return {ok:true};}
      return {ok:false,error:'Pagamento ainda indisponível. Tente novamente em instantes.'};
    }
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
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`siapExamTab:${tabId}`));
