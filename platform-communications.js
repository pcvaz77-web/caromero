// Campanhas do proprietário. Todo envio exige clique explícito após a prévia.
(() => {
  const roleLabels = {
    school_admin:'Administradores', coordinator:'Coordenação',
    teacher:'Professores', secretary:'Secretaria'
  };
  const safe = value => {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };
  let selectedId = null;
  let selectedStatus = 'draft';
  let previewedFingerprint = null;
  let initialized = false;

  function root() { return document.getElementById('platformCommunicationsRoot'); }
  function fields() {
    const form = document.getElementById('platformCampaignForm');
    const roles = [...form.querySelectorAll('[name="campaignRole"]:checked')].map(input => input.value);
    return {
      title:form.elements.title.value.trim(),
      email_subject:form.elements.email_subject.value.trim() || form.elements.title.value.trim(),
      message_body:form.elements.message_body.value.trim(),
      // Coluna legada da primeira migration; aceita qualquer link HTTPS da comunicação.
      video_url:form.elements.video_url.value.trim() || null,
      cover_url:form.elements.cover_url.value.trim() || null,
      target_roles:roles,
      target_school_id:null
    };
  }
  const fingerprint = item => JSON.stringify(item);
  function feedback(message, danger=false) {
    const node = document.getElementById('platformCampaignFeedback');
    node.textContent = message;
    node.classList.toggle('error', danger);
  }
  function clearWhatsAppList() {
    const list = document.getElementById('platformCampaignWhatsAppList');
    if (list) list.replaceChildren();
  }
  function whatsAppMessage(item) {
    return [item.message_body, item.video_url ? `Saiba mais: ${item.video_url}` : '',
      'Para parar de receber comunicados pelo WhatsApp, responda SAIR.'].filter(Boolean).join('\n\n');
  }
  function showPreview(data) {
    const box = document.getElementById('platformCampaignPreview');
    box.innerHTML = `<div><strong>${safe(data?.emailEligible ?? 0)}</strong><span>aceitaram e-mail</span></div>
      <div><strong>${safe(data?.whatsappEligible ?? 0)}</strong><span>aceitaram WhatsApp</span></div>
      <div><strong>${safe(data?.excluded ?? 0)}</strong><span>fora do público</span></div>`;
  }
  function renderMessagePreview() {
    const item = fields();
    const box = document.getElementById('platformCampaignMessagePreview');
    if (!box) return;
    box.innerHTML = `<div class="platform-message-brand">CARÔMETRO</div>
      ${item.cover_url ? `<img src="${safe(item.cover_url)}" alt="Capa da campanha" loading="lazy">` : ''}
      <div class="platform-message-content"><small>${safe(item.email_subject || 'Assunto do e-mail')}</small>
      <h4>${safe(item.title || 'Título da novidade')}</h4>
      <p>${safe(item.message_body || 'Sua mensagem aparecerá aqui.').replace(/\n/g,'<br>')}</p>
      ${item.video_url ? `<a href="${safe(item.video_url)}" target="_blank" rel="noopener">Abrir link</a>` : ''}</div>`;
  }
  async function loadCampaigns() {
    const list = document.getElementById('platformCampaignList');
    const { data, error } = await db.from('platform_communication_campaigns')
      .select('id,title,status,created_at,submitted_at,provider_campaign_id')
      .order('created_at',{ascending:false}).limit(30);
    if (error) { list.innerHTML = '<p class="error">Não foi possível carregar as campanhas.</p>'; return; }
    list.innerHTML = data?.length ? data.map(item => `<article class="platform-campaign-row">
      <div><strong>${safe(item.title)}</strong><small>${safe(new Date(item.created_at).toLocaleDateString('pt-BR'))} · ${safe(item.status)}</small></div>
      <button class="btn secondary" type="button" data-campaign-open="${safe(item.id)}">Ver campanha</button>
    </article>`).join('') : '<p class="meta">Nenhuma campanha criada ainda.</p>';
    list.querySelectorAll('[data-campaign-open]').forEach(button => button.onclick = () => openCampaign(button.dataset.campaignOpen));
  }
  async function loadDeliverySummary(id) {
    const box = document.getElementById('platformCampaignDeliverySummary');
    const {data,error} = await db.from('platform_communication_deliveries')
      .select('channel,status').eq('campaign_id',id).limit(1000);
    if (error) { box.textContent = 'Histórico de entregas indisponível.'; return; }
    const counts = {submitted:0,failed:0,skipped:0,queued:0,delivered:0};
    for (const row of data || []) if (row.channel === 'email' && row.status in counts) counts[row.status]++;
    box.textContent = `E-mail: ${counts.submitted} aceitos pelo provedor, ${counts.failed} falhas, ${counts.skipped} ignorados, ${counts.queued} pendentes. A entrega final ainda não é acompanhada. Abrir uma conversa de WhatsApp não confirma o envio.`;
  }
  async function openCampaign(id, preserveFeedback=false) {
    const { data, error } = await db.from('platform_communication_campaigns')
      .select('*').eq('id',id).single();
    if (error || !data) { feedback('Não foi possível abrir a campanha.',true); return; }
    selectedId = data.id;
    selectedStatus = data.status;
    previewedFingerprint = null;
    const form = document.getElementById('platformCampaignForm');
    for (const field of ['title','email_subject','message_body','video_url','cover_url']) {
      form.elements[field].value = data[field] || '';
    }
    form.querySelectorAll('[name="campaignRole"]').forEach(input => {
      input.checked = data.target_roles?.includes(input.value) || false;
    });
    const draft = data.status === 'draft';
    form.querySelectorAll('input,textarea').forEach(input => { input.disabled = !draft; });
    document.getElementById('platformCampaignSave').disabled = !draft;
    document.getElementById('platformCampaignSendEmail').disabled = !draft;
    document.getElementById('platformCampaignPreviewButton').disabled = !draft;
    if (!preserveFeedback) feedback(draft ? 'Rascunho carregado. Confira e faça a prévia antes de enviar.' : 'Esta campanha já foi submetida e não pode ser editada.');
    showPreview(null);
    clearWhatsAppList();
    renderMessagePreview();
    await loadDeliverySummary(id);
    root()?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function saveDraft() {
    const item = fields();
    if (item.title.length < 3 || item.message_body.length < 10 || !item.target_roles.length) {
      feedback('Informe título, mensagem e ao menos um grupo.',true); return false;
    }
    if ((item.video_url && !item.video_url.startsWith('https://')) || (item.cover_url && !item.cover_url.startsWith('https://'))) {
      feedback('Os links de conteúdo e imagem precisam começar com https://.',true); return false;
    }
    const { data:{ user } } = await db.auth.getUser();
    if (!user) { feedback('Sua sessão expirou.',true); return false; }
    const query = selectedId
      ? db.from('platform_communication_campaigns').update(item).eq('id',selectedId)
      : db.from('platform_communication_campaigns').insert({...item,created_by:user.id});
    const { data, error } = await query.select('id').single();
    if (error || !data) { feedback('Não foi possível salvar o rascunho.',true); return false; }
    selectedId = data.id;
    selectedStatus = 'draft';
    previewedFingerprint = null;
    feedback('Rascunho salvo.');
    await loadCampaigns();
    return true;
  }
  async function requestPreview() {
    const item = fields();
    if (!item.target_roles.length) { feedback('Selecione ao menos um grupo.',true); return; }
    const save = await saveDraft();
    if (!save) return;
    const { data, error } = await db.functions.invoke('platform-campaign-dispatch',{
      body:{ action:'preview', campaignId:selectedId }
    });
    if (error || !data?.ok) { feedback('Não foi possível calcular o público. Nenhum envio foi feito.',true); return; }
    showPreview(data);
    previewedFingerprint = fingerprint(fields());
    feedback('Prévia pronta. Contas repetidas em mais de uma escola são contadas uma vez.');
  }
  async function sendEmail() {
    if (!selectedId || previewedFingerprint !== fingerprint(fields())) {
      feedback('Salve e atualize a prévia antes de enviar.',true); return;
    }
    const count = Number(document.querySelector('#platformCampaignPreview div strong')?.textContent || 0);
    if (!count) { feedback('Não há destinatários de e-mail com aceite para este público.',true); return; }
    if (count > 100) { feedback('Este público supera o limite de 100 e-mails por campanha desta versão.',true); return; }
    if (!confirm(`Enviar esta novidade por e-mail para até ${count} conta(s) que aceitaram receber? Esta ação não pode ser desfeita.`)) return;
    const button = document.getElementById('platformCampaignSendEmail');
    button.disabled = true;
    const { data, error } = await db.functions.invoke('platform-campaign-dispatch',{
      body:{ action:'send_email', campaignId:selectedId }
    });
    if (error || !data?.ok) {
      feedback('O envio não foi confirmado. Consulte o histórico antes de tentar novamente.',true);
    } else {
      feedback(`Campanha processada: ${data.submitted || 0} submetidos, ${data.failed || 0} falhas.`);
    }
    await loadCampaigns();
    if (selectedId) await openCampaign(selectedId,true);
  }
  async function copyWhatsApp() {
    const item = fields();
    if (!item.message_body) { feedback('Escreva a mensagem antes de copiar.',true); return; }
    const message = whatsAppMessage(item);
    try {
      await navigator.clipboard.writeText(message);
      feedback('Mensagem copiada. Envie somente a contatos que aceitaram novidades por WhatsApp. Respostas SAIR precisam ser registradas nas preferências.');
    } catch { feedback('Não foi possível copiar. Verifique a permissão da área de transferência.',true); }
  }
  async function listWhatsAppRecipients() {
    if (selectedStatus === 'draft' && !await saveDraft()) return;
    if (!selectedId) { feedback('Abra uma campanha para consultar os contatos.',true); return; }
    const {data,error} = await db.functions.invoke('platform-campaign-dispatch',{
      body:{action:'whatsapp_recipients',campaignId:selectedId}
    });
    if (error || !data?.ok) { feedback('Não foi possível consultar os contatos com aceite para WhatsApp.',true); return; }
    const list = document.getElementById('platformCampaignWhatsAppList');
    const recipients = data.recipients || [];
    list.innerHTML = recipients.length ? recipients.map((person,index) => `<div class="platform-campaign-row">
      <div><strong>${safe(person.name || 'Usuário do Carômetro')}</strong><small>${safe(person.phone)}</small></div>
      <div class="platform-campaign-actions"><button type="button" class="btn secondary" data-wa-recipient="${index}">Abrir conversa</button><button type="button" class="btn secondary" data-wa-optout="${index}">Registrar SAIR</button></div>
    </div>`).join('') : '<p class="meta">Nenhum contato aceitou novidades por WhatsApp neste público.</p>';
    list.querySelectorAll('[data-wa-recipient]').forEach(button => {
      button.onclick = () => {
        const person = recipients[Number(button.dataset.waRecipient)];
        const digits = String(person?.phone || '').replace(/\D/g,'');
        if (!digits) return;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(whatsAppMessage(fields()))}`,'_blank','noopener');
      };
    });
    list.querySelectorAll('[data-wa-optout]').forEach(button => {
      button.onclick = async () => {
        const person = recipients[Number(button.dataset.waOptout)];
        if (!person || !confirm(`Registrar que ${person.name || person.phone} pediu para parar de receber novidades por WhatsApp?`)) return;
        button.disabled = true;
        const {data:result,error:optoutError} = await db.functions.invoke('platform-campaign-dispatch',{
          body:{action:'optout_whatsapp',campaignId:selectedId,userId:person.userId}
        });
        if (optoutError || !result?.ok) {
          button.disabled = false;
          feedback('Não foi possível registrar o pedido de SAIR.',true);
          return;
        }
        button.closest('.platform-campaign-row')?.remove();
        feedback('Pedido de SAIR registrado. Este contato não será incluído em novas campanhas de WhatsApp.');
      };
    });
    feedback(`Contatos com aceite: ${data.total || 0}. Exibindo até 100 para abertura individual no WhatsApp Business. Registre manualmente pedidos de SAIR.`);
  }
  function newDraft() {
    selectedId = null;
    selectedStatus = 'draft';
    previewedFingerprint = null;
    const form = document.getElementById('platformCampaignForm');
    form.reset();
    form.querySelectorAll('input,textarea').forEach(input => { input.disabled = false; });
    ['platformCampaignSave','platformCampaignSendEmail','platformCampaignPreviewButton'].forEach(id => document.getElementById(id).disabled = false);
    showPreview(null);
    clearWhatsAppList();
    renderMessagePreview();
    document.getElementById('platformCampaignDeliverySummary').textContent = 'Abra uma campanha para ver o histórico.';
    feedback('Novo rascunho.');
  }
  function mount() {
    if (initialized || !root()) return;
    initialized = true;
    root().innerHTML = `<div class="platform-communications-grid">
      <section class="platform-panel"><div class="platform-panel-head"><div><h4>Criar comunicação</h4><p>Use para novidades, avisos, tutoriais, convites ou outros assuntos. O envio só começa após sua confirmação.</p></div><button id="platformCampaignNew" type="button" class="btn secondary">Novo rascunho</button></div>
        <form id="platformCampaignForm" class="platform-campaign-form">
          <div class="field"><label for="platformCampaignTitle">Título da comunicação</label><input id="platformCampaignTitle" name="title" maxlength="120" required placeholder="Escreva o assunto da comunicação"></div>
          <div class="field"><label for="platformCampaignSubject">Assunto do e-mail (opcional)</label><input id="platformCampaignSubject" name="email_subject" maxlength="180" placeholder="Se vazio, será usado o título"></div>
          <div class="field"><label for="platformCampaignBody">Mensagem</label><textarea id="platformCampaignBody" name="message_body" rows="7" maxlength="3000" required placeholder="Escreva livremente o que deseja comunicar."></textarea></div>
          <div class="field"><label for="platformCampaignVideo">Link público (opcional): página, vídeo ou tutorial</label><input id="platformCampaignVideo" name="video_url" type="url" placeholder="https://..."></div>
          <div class="field"><label for="platformCampaignCover">Imagem de capa pública (opcional)</label><input id="platformCampaignCover" name="cover_url" type="url" placeholder="https://..."></div>
          <fieldset class="platform-campaign-roles"><legend>Destinatários com conta ativa</legend>
            ${Object.entries(roleLabels).map(([key,label]) => `<label><input name="campaignRole" type="checkbox" value="${key}" checked> ${label}</label>`).join('')}
          </fieldset>
          <div class="platform-campaign-actions"><button id="platformCampaignSave" class="btn secondary" type="submit">Salvar rascunho</button><button id="platformCampaignPreviewButton" class="btn secondary" type="button">Ver público</button><button id="platformCampaignSendEmail" class="btn primary" type="button">Enviar por e-mail</button><button id="platformCampaignListWhatsApp" class="btn secondary" type="button">Contatos para WhatsApp</button><button id="platformCampaignCopyWhatsApp" class="btn secondary" type="button">Copiar mensagem</button></div>
          <p id="platformCampaignFeedback" class="meta" role="status">Crie uma campanha para começar.</p>
        </form>
      </section>
      <div><section class="platform-panel"><div class="platform-panel-head"><h4>Prévia do público</h4></div><div id="platformCampaignPreview" class="platform-campaign-preview"></div><p class="meta" style="padding:0 18px 18px">Somente pessoas com aceite para cada canal entram na contagem. Cada campanha por e-mail aceita até 100 destinatários nesta versão. O WhatsApp pelo aplicativo não é disparado pelo painel.</p></section>
      <section class="platform-panel" style="margin-top:16px"><div class="platform-panel-head"><h4>Como ficará o e-mail</h4></div><div id="platformCampaignMessagePreview" class="platform-message-preview"></div></section>
      <section class="platform-panel" style="margin-top:16px"><div class="platform-panel-head"><h4>WhatsApp Business</h4></div><p class="meta" style="padding:0 18px">Abra cada conversa com o texto pronto e confirme o envio no aplicativo. Somente contatos com aceite aparecem aqui. Botões e disparo automático dependem da API oficial da Meta.</p><div id="platformCampaignWhatsAppList" class="platform-campaign-list"></div></section>
      <section class="platform-panel" style="margin-top:16px"><div class="platform-panel-head"><h4>Histórico de envio</h4></div><p id="platformCampaignDeliverySummary" class="meta" style="padding:0 18px 18px">Abra uma campanha para ver o histórico.</p></section>
      <section class="platform-panel" style="margin-top:16px"><div class="platform-panel-head"><h4>Campanhas</h4></div><div id="platformCampaignList" class="platform-campaign-list"></div></section></div>
    </div>`;
    const css = document.createElement('style');
    css.textContent = '.platform-communications-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr);gap:18px}.platform-campaign-form{padding:20px;display:grid;gap:12px}.platform-campaign-form .field{display:grid;gap:5px}.platform-campaign-form input:not([type=checkbox]),.platform-campaign-form textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px;font:inherit}.platform-campaign-roles{display:flex;flex-wrap:wrap;gap:10px;padding:12px;border:1px solid #dbe3ef;border-radius:10px}.platform-campaign-roles legend{font-weight:750}.platform-campaign-roles label{display:flex;align-items:center;gap:5px}.platform-campaign-actions{display:flex;flex-wrap:wrap;gap:9px}.platform-campaign-preview{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:18px}.platform-campaign-preview div{padding:14px;background:#f3f6fb;border-radius:10px}.platform-campaign-preview strong{display:block;font-size:25px}.platform-campaign-preview span{font-size:12px}.platform-message-preview{margin:18px;background:#eef2f8;border-radius:12px;padding:16px}.platform-message-brand{background:#17233a;color:white;font-weight:800;padding:18px}.platform-message-preview img{display:block;width:100%;height:auto}.platform-message-content{background:white;padding:20px}.platform-message-content small{color:#64748b}.platform-message-content h4{font-size:22px;margin:12px 0}.platform-message-content p{line-height:1.55;white-space:normal}.platform-message-content a{display:inline-block;background:#4b43d9;color:white;text-decoration:none;border-radius:8px;padding:11px 16px}.platform-campaign-list{padding:10px 18px}.platform-campaign-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-top:1px solid #e4e9f0}.platform-campaign-row small{display:block;color:#667085;margin-top:3px}@media(max-width:1000px){.platform-communications-grid{grid-template-columns:1fr}}@media(max-width:530px){.platform-campaign-preview{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(css);
    document.getElementById('platformCampaignForm').onsubmit = async event => { event.preventDefault(); await saveDraft(); };
    document.getElementById('platformCampaignNew').onclick = newDraft;
    document.getElementById('platformCampaignForm').addEventListener('input', () => { previewedFingerprint = null; clearWhatsAppList(); renderMessagePreview(); });
    document.getElementById('platformCampaignPreviewButton').onclick = requestPreview;
    document.getElementById('platformCampaignSendEmail').onclick = sendEmail;
    document.getElementById('platformCampaignCopyWhatsApp').onclick = copyWhatsApp;
    document.getElementById('platformCampaignListWhatsApp').onclick = listWhatsAppRecipients;
    showPreview(null);
    renderMessagePreview();
  }
  window.openPlatformCommunications = async () => {
    mount();
    await loadCampaigns();
  };
})();
