// Extensão da área de Comunicações para modelos aprovados da API oficial da Meta.
(() => {
  const originalOpen = window.openPlatformCommunications;
  if (typeof originalOpen !== 'function') return;
  let templates = [];
  let previewFingerprint = null;
  let eligible = 0;
  let metaReady = false;
  const byId = id => document.getElementById(id);
  const safe = value => {
    const span = document.createElement('span');
    span.textContent = String(value ?? '');
    return span.innerHTML;
  };
  const attrSafe = value => safe(value).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const form = () => byId('platformCampaignForm');
  const campaignId = () => byId('platformCommunicationsRoot')?.dataset.campaignId || '';
  const currentTemplate = () => {
    const value=byId('platformMetaTemplate')?.value;
    return value === '' || value == null ? null : templates[Number(value)] || null;
  };
  const fieldValue = name => form()?.elements[name]?.value?.trim() || '';
  const buttonLinks = () => Object.fromEntries([...document.querySelectorAll('[data-meta-button-url]')]
    .map(input=>[input.dataset.metaButtonUrl,input.value.trim()]).filter(([,value])=>value));
  const roles = () => [...form().querySelectorAll('[name="campaignRole"]:checked')].map(input=>input.value).sort();
  const fingerprint = () => JSON.stringify({campaignId:campaignId(),body:fieldValue('message_body'),
    link:fieldValue('video_url'),cover:fieldValue('cover_url'),roles:roles(),
    template:byId('platformMetaTemplate')?.value,buttonLinks:buttonLinks()});
  function status(message,danger=false) {
    const node=byId('platformMetaStatus');
    node.textContent=message;
    node.style.color=danger?'#b42318':'';
  }
  function invalidate() {
    previewFingerprint=null;
    eligible=0;
    byId('platformMetaAudience').textContent='Faça a prévia antes de enviar.';
  }
  function renderTemplate() {
    const template=currentTemplate();
    const box=byId('platformMetaTemplatePreview');
    if (!template) { box.textContent='Selecione um modelo aprovado da Meta.'; return; }
    const existing=buttonLinks();
    const firstDynamic=(template.buttons||[]).findIndex(b=>b.type==='URL' && /\{\{1\}\}$/.test(b.url||''));
    const buttons=(template.buttons||[]).map((b,index)=>{
      const dynamic=b.type==='URL' && /\{\{1\}\}$/.test(b.url||'');
      const destination=existing[String(index)] || (index===firstDynamic?fieldValue('video_url'):'');
      return `<li><strong>${safe(b.text||b.type)}</strong> · ${safe(b.type)}
        ${dynamic?`<label style="display:block;margin-top:5px">Destino deste botão<br><input data-meta-button-url="${index}" type="url" value="${attrSafe(destination)}" placeholder="${attrSafe(String(b.url).replace('{{1}}','...'))}" style="width:100%;padding:8px"></label>`:
        b.type==='URL'?`<small style="display:block">${safe(b.url)}</small>`:''}</li>`;
    }).join('');
    box.innerHTML=`<strong>${safe(template.category)} · ${safe(template.language)}</strong>
      <p style="white-space:pre-wrap">${safe(template.body.replaceAll('{{1}}',fieldValue('message_body')||'[sua mensagem]'))}</p>
      ${template.imageRequired?'<p>Este modelo exige uma imagem de capa HTTPS.</p>':''}
      ${buttons?`<p>Botões aprovados:</p><ul>${buttons}</ul>`:'<p>Este modelo não possui botões.</p>'}`;
    box.querySelectorAll('[data-meta-button-url]').forEach(input=>input.addEventListener('input',invalidate));
  }
  async function loadTemplates() {
    const select=byId('platformMetaTemplate');
    select.innerHTML='<option value="">Carregando modelos...</option>';
    const {data,error}=await db.functions.invoke('platform-whatsapp-campaign',{body:{action:'templates'}});
    if (error || !data?.ok) {
      metaReady=false;
      select.innerHTML='<option value="">API da Meta não conectada</option>';
      status('A conexão com a Meta ou um modelo aprovado ainda está pendente. O envio automático está desativado.',true);
      return;
    }
    templates=data.templates||[];
    metaReady=true;
    select.innerHTML='<option value="">Selecione um modelo aprovado</option>' + templates.map((t,i)=>
      `<option value="${i}">${safe(t.name)} · ${safe(t.language)} · ${safe(t.category)}</option>`).join('');
    status(templates.length?'Selecione um modelo. O texto livre entra no campo variável {{1}} aprovado pela Meta.':'A Meta não retornou modelos aprovados compatíveis.',!templates.length);
    renderTemplate();
    const toggle=byId('platformBotEnabled');
    if (toggle) toggle.disabled=false;
  }
  function botStatus(message,danger=false) {
    const node=byId('platformBotStatus');
    if (!node) return;
    node.textContent=message;
    node.style.color=danger?'#b42318':'';
  }
  async function loadBotSettings() {
    const {data,error}=await db.from('platform_whatsapp_bot_settings').select('*').eq('id',true).maybeSingle();
    if (error || !data) {
      botStatus('Configuração do atendimento ainda não foi ativada no banco. Nenhum menu automático será enviado.',true);
      return;
    }
    const bot=byId('platformBotForm');
    for (const name of ['greeting','link1_label','link1_url','link2_label','link2_url','attendant_label'])
      bot.elements[name].value=data[name]||'';
    bot.elements.enabled.checked=Boolean(data.enabled);
    bot.elements.enabled.disabled=!metaReady && !data.enabled;
    botStatus(data.enabled?'Menu ativado. Respostas do cliente permanecem neste mesmo número.':
      'Menu desativado. Salve os textos e links; ative após conectar a API ao número de atendimento.');
    const history=byId('platformBotHistory');
    const result=await db.from('platform_whatsapp_bot_events')
      .select('action,status,created_at').order('created_at',{ascending:false}).limit(10);
    if (!result.error) history.textContent=result.data?.length
      ?result.data.map(item=>`${new Date(item.created_at).toLocaleString('pt-BR')}: ${item.action} · ${item.status}`).join('\n')
      :'Nenhuma interação automática ainda.';
  }
  async function saveBotSettings(event) {
    event.preventDefault();
    const bot=byId('platformBotForm');
    const value=Object.fromEntries(new FormData(bot).entries());
    value.enabled=bot.elements.enabled.checked;
    if (value.enabled && !metaReady) {
      botStatus('Conecte a API da Meta antes de ativar as respostas automáticas.',true);
      return;
    }
    for (const key of ['link1_url','link2_url']) {
      try {
        const link=new URL(value[key]);
        if (link.protocol!=='https:' || link.username || link.password) throw new Error();
      } catch { botStatus('Os dois destinos precisam ser links HTTPS válidos.',true); return; }
    }
    const button=byId('platformBotSave');
    button.disabled=true;
    const {data,error}=await db.from('platform_whatsapp_bot_settings')
      .update({...value,updated_at:new Date().toISOString()}).eq('id',true).select('id').single();
    button.disabled=false;
    if (error || !data) { botStatus('Não foi possível salvar o menu de atendimento.',true); return; }
    botStatus(value.enabled?'Menu de atendimento ativado no painel.':'Menu salvo e desativado.');
  }
  async function savedCampaignMatchesForm() {
    const id=campaignId();
    if (!id) return false;
    const {data,error}=await db.from('platform_communication_campaigns')
      .select('message_body,video_url,cover_url,target_roles').eq('id',id).single();
    return !error && data?.message_body===fieldValue('message_body') &&
      (data?.video_url||'')===fieldValue('video_url') && (data?.cover_url||'')===fieldValue('cover_url') &&
      JSON.stringify([...(data?.target_roles||[])].sort())===JSON.stringify(roles());
  }
  async function preview() {
    const template=currentTemplate();
    if (!template) { status('Selecione um modelo aprovado.',true); return; }
    if (fieldValue('message_body').length>500) { status('Reduza o texto do WhatsApp a até 500 caracteres.',true); return; }
    if (!await savedCampaignMatchesForm()) { status('Salve o rascunho após as alterações e tente de novo.',true); return; }
    const {data,error}=await db.functions.invoke('platform-whatsapp-campaign',{
      body:{action:'preview',campaignId:campaignId(),templateName:template.name,language:template.language,buttonLinks:buttonLinks()}
    });
    if (error || !data?.ok) { status(`Não foi possível preparar o envio (${data?.code||'confira imagem, link e modelo'}). Nenhuma mensagem foi enviada.`,true); return; }
    eligible=Number(data.eligible||0);
    previewFingerprint=fingerprint();
    byId('platformMetaAudience').textContent=`${eligible} pessoa(s) aceitaram WhatsApp. Categoria: ${template.category}. A Meta cobra conforme a categoria e o país do destinatário.`;
    status('Prévia pronta. Confira o conteúdo, os botões, o público e a tarifa antes de enviar.');
  }
  async function send() {
    const template=currentTemplate();
    if (!template || previewFingerprint!==fingerprint()) { status('Atualize a prévia antes de enviar.',true); return; }
    if (!await savedCampaignMatchesForm()) { status('O rascunho mudou. Salve e atualize a prévia.',true); return; }
    if (eligible<1 || eligible>100) { status('Nesta versão, envie para 1 a 100 pessoas por campanha.',true); return; }
    if (!confirm(`Enviar pelo WhatsApp o modelo ${template.name} (${template.category}) para até ${eligible} pessoa(s)? A Meta pode cobrar por mensagem entregue. O envio não pode ser desfeito.`)) return;
    const button=byId('platformMetaSend');
    button.disabled=true;
    const {data,error}=await db.functions.invoke('platform-whatsapp-campaign',{
      body:{action:'send',campaignId:campaignId(),templateName:template.name,language:template.language,buttonLinks:buttonLinks()}
    });
    invalidate();
    if (error || !data?.ok) status(`Envio não confirmado (${data?.code||'consulte o histórico antes de tentar novamente'}).`,true);
    else status(`${data.submitted||0} mensagem(ns) aceitas pela Meta; ${data.failed||0} falhas; ${data.skipped||0} ignoradas. Aceite não comprova entrega.`);
    button.disabled=false;
  }
  async function uploadCover() {
    const input=byId('platformMetaCoverFile');
    const file=input.files?.[0];
    if (!file) { status('Escolha uma imagem de capa.',true); return; }
    const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    const extension=extensions[file.type];
    if (!extension || file.size>5*1024*1024) { status('Use JPG, PNG ou WebP com até 5 MB.',true); return; }
    const {data:{user}}=await db.auth.getUser();
    if (!user) { status('Sua sessão expirou.',true); return; }
    const button=byId('platformMetaUploadCover');
    button.disabled=true;
    const path=`campaigns/${crypto.randomUUID()}.${extension}`;
    const {error}=await db.storage.from('communication-covers').upload(path,file,{
      contentType:file.type,upsert:false
    });
    if (error) { status('Não foi possível enviar a capa. A área de imagens precisa estar ativada.',true); button.disabled=false; return; }
    const {data}=db.storage.from('communication-covers').getPublicUrl(path);
    form().elements.cover_url.value=data.publicUrl;
    form().elements.cover_url.dispatchEvent(new Event('input',{bubbles:true}));
    input.value='';
    button.disabled=false;
    status('Capa carregada. Salve o rascunho para associá-la à campanha.');
  }
  function mount() {
    if (byId('platformMetaPanel')) return;
    const panel=document.createElement('section');
    panel.id='platformMetaPanel';
    panel.className='platform-panel';
    panel.style.marginTop='16px';
    panel.innerHTML=`<div class="platform-panel-head"><h4>Envio automático pelo WhatsApp oficial</h4></div>
      <div class="platform-campaign-form">
        <p>Escreva sua mensagem no rascunho, escolha a capa e o link. A Meta só permite iniciar o envio usando um modelo aprovado; seus botões aparecem conforme esse modelo.</p>
        <div class="field"><label for="platformMetaTemplate">Modelo da Meta</label><select id="platformMetaTemplate" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:9px"><option value="">Verificando conexão...</option></select></div>
        <div id="platformMetaTemplatePreview" class="platform-message-preview" style="white-space:normal"></div>
        <p id="platformMetaAudience">Faça a prévia antes de enviar.</p>
        <div class="platform-campaign-actions"><button id="platformMetaPreview" class="btn secondary" type="button">Ver público e modelo</button><button id="platformMetaSend" class="btn primary" type="button">Enviar pelo WhatsApp</button></div>
        <a href="https://whatsappbusiness.com/pt-br/products/platform-pricing/" target="_blank" rel="noopener">Ver tarifas oficiais da Meta</a>
        <p id="platformMetaStatus" role="status">Aguardando conexão.</p>
      </div>`;
    const history=byId('platformCampaignDeliverySummary')?.closest('.platform-panel');
    history?.parentNode.insertBefore(panel,history);
    const botPanel=document.createElement('section');
    botPanel.className='platform-panel';
    botPanel.style.marginTop='16px';
    botPanel.innerHTML=`<div class="platform-panel-head"><h4>Atendimento automático no mesmo número</h4></div>
      <form id="platformBotForm" class="platform-campaign-form">
        <p>Quando alguém escrever para o WhatsApp do Carômetro, o menu aparece uma vez por dia. Os botões de opção respondem com um botão de link; “Falar com atendente” libera a conversa para resposta humana neste mesmo número.</p>
        <label><input id="platformBotEnabled" name="enabled" type="checkbox" disabled> Ativar menu automático</label>
        <div class="field"><label for="platformBotGreeting">Mensagem inicial</label><textarea id="platformBotGreeting" name="greeting" rows="3" minlength="10" maxlength="900" required></textarea></div>
        <div class="field"><label for="platformBotLink1Label">Primeira opção</label><input id="platformBotLink1Label" name="link1_label" maxlength="20" required><label for="platformBotLink1Url">Link da primeira opção</label><input id="platformBotLink1Url" name="link1_url" type="url" placeholder="https://..." maxlength="500" required></div>
        <div class="field"><label for="platformBotLink2Label">Segunda opção</label><input id="platformBotLink2Label" name="link2_label" maxlength="20" required><label for="platformBotLink2Url">Link da segunda opção</label><input id="platformBotLink2Url" name="link2_url" type="url" placeholder="https://..." maxlength="500" required></div>
        <div class="field"><label for="platformBotAttendant">Opção para falar com você</label><input id="platformBotAttendant" name="attendant_label" maxlength="20" required></div>
        <div><button id="platformBotSave" class="btn secondary" type="submit">Salvar menu</button></div>
        <p id="platformBotStatus" role="status">Carregando configuração...</p>
        <small id="platformBotHistory" style="white-space:pre-line"></small>
      </form>`;
    panel.after(botPanel);
    const coverInput=form().elements.cover_url;
    const upload=document.createElement('div');
    upload.className='field';
    upload.innerHTML='<label for="platformMetaCoverFile">Ou envie uma capa do computador (JPG, PNG ou WebP, até 5 MB)</label><input id="platformMetaCoverFile" type="file" accept="image/jpeg,image/png,image/webp"><button id="platformMetaUploadCover" type="button" class="btn secondary">Carregar capa</button><small>Esta imagem ficará pública para aparecer no e-mail e no WhatsApp. Não use fotos ou dados de alunos.</small>';
    coverInput.closest('.field')?.after(upload);
    byId('platformMetaTemplate').onchange=()=>{invalidate();renderTemplate();};
    byId('platformMetaPreview').onclick=preview;
    byId('platformMetaSend').onclick=send;
    byId('platformMetaUploadCover').onclick=uploadCover;
    byId('platformBotForm').onsubmit=saveBotSettings;
    form().addEventListener('input',()=>{invalidate();renderTemplate();});
    byId('platformCampaignNew').addEventListener('click',invalidate);
    new MutationObserver(invalidate).observe(byId('platformCommunicationsRoot'),{
      attributes:true,attributeFilter:['data-campaign-id']
    });
    loadTemplates();
    loadBotSettings();
  }
  window.openPlatformCommunications=async (...args)=>{
    await originalOpen(...args);
    mount();
  };
})();
