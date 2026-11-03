(() => {
  let mounted = false;
  let current = null;
  let planPrices = {};
  const root = () => document.getElementById('platformSiapHeaderCampaignRoot');
  const form = () => document.getElementById('platformSiapHeaderCampaignForm');
  const status = (message, error=false) => {
    const node = document.getElementById('platformSiapHeaderCampaignStatus');
    node.textContent = message;
    node.classList.toggle('error',error);
  };
  const money = amount => Number.isFinite(Number(amount)) && Number(amount)>0
    ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(amount)) : 'Preço indisponível';
  const imageUrl = value => { try { const url=new URL(value); return url.protocol==='https:' ? url.href : null; } catch { return null; } };
  function row(index) {
    return `<section class="platform-siap-campaign-button" data-campaign-button="${index}" aria-label="Botão ${index+1}">
      <div class="platform-siap-campaign-button-top"><div class="platform-siap-campaign-button-title"><span>${String(index+1).padStart(2,'0')}</span><div><strong>Botão ${index+1}</strong><small>Checkout direto</small></div></div>
      <label class="platform-siap-button-toggle"><input type="checkbox" name="button_enabled_${index}" aria-label="Exibir botão ${index+1}"><span class="platform-siap-toggle-track" aria-hidden="true"></span><span>Exibir</span></label></div>
      <div class="platform-siap-campaign-button-grid"><label>Plano<select name="button_plan_${index}"><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option><option value="annual">Anual</option></select></label>
      <label>Texto do botão<input name="button_label_${index}" maxlength="30" placeholder="Ex.: Semestral"></label></div>
      <div class="platform-siap-campaign-button-grid"><label>Cor do botão<input type="color" name="button_color_${index}" value="#e7c46f"></label><label>Cor do texto<input type="color" name="button_text_color_${index}" value="#0b1930"></label></div>
      <small>Abre diretamente o checkout Hotmart vinculado ao plano. O preço vem dos planos de venda.</small>
      <p class="platform-siap-campaign-button-inactive">Ative para configurar mais um plano.</p>
    </section>`;
  }
  function read() {
    const fields=form().elements;
    return {
      active:fields.active.checked,
      eyebrow:fields.eyebrow.value.trim(),headline:fields.headline.value.trim(),
      background_color:fields.background_color.value,text_color:fields.text_color.value,
      background_image_url:fields.background_image_url.value.trim() || null,
      buttons:[0,1,2].filter(index => fields[`button_enabled_${index}`].checked).map(index => ({
        plan_key:fields[`button_plan_${index}`].value,
        label:fields[`button_label_${index}`].value.trim(),
        color:fields[`button_color_${index}`].value,
        text_color:fields[`button_text_color_${index}`].value
      }))
    };
  }
  function preview() {
    const item=read();
    const activeLabel=document.getElementById('platformSiapCampaignActiveLabel');
    const activeDescription=document.getElementById('platformSiapCampaignActiveDescription');
    if (activeLabel) activeLabel.textContent=item.active ? 'Campanha ativa' : 'Cabeçalho padrão';
    if (activeDescription) activeDescription.textContent=item.active ? 'A publicidade aparece para os professores.' : 'A campanha está guardada, mas não aparece.';
    const node=document.getElementById('platformSiapHeaderCampaignPreview');
    node.replaceChildren();
    node.style.backgroundColor=item.active ? item.background_color : '#17345d';
    node.style.color=item.active ? item.text_color : '#fff';
    const image=item.active && imageUrl(item.background_image_url);
    node.style.backgroundImage=image ? `linear-gradient(90deg,#061024df,#06102478),url(${JSON.stringify(image)})` : '';
    const heading=document.createElement('div');
    heading.className='platform-siap-campaign-preview-head';
    heading.innerHTML='<strong>Assistente SIAP</strong><small>Professor · Planejamento da aula</small><span>Concessão permanente</span>';
    node.append(heading);
    if (!item.active) { const note=document.createElement('p'); note.textContent='Cabeçalho padrão, sem campanha.'; node.append(note); return; }
    const title=document.createElement('div'); title.className='platform-siap-campaign-preview-title';
    const eyebrow=document.createElement('small'); eyebrow.textContent=item.eyebrow || 'Chamada da campanha';
    const headline=document.createElement('strong'); headline.textContent=item.headline || 'Título da campanha';
    title.append(eyebrow,headline); node.append(title);
    const buttons=document.createElement('div'); buttons.className='platform-siap-campaign-preview-buttons';
    for (const entry of item.buttons) {
      const button=document.createElement('div'); button.style.background=entry.color; button.style.color=entry.text_color;
      const label=document.createElement('small'); label.textContent=entry.label || 'Texto do botão';
      const amount=document.createElement('strong'); amount.textContent=money(planPrices[entry.plan_key]);
      button.append(label,amount); buttons.append(button);
    }
    node.append(buttons);
  }
  function fill(item) {
    const fields=form().elements;
    fields.active.checked=item.active===true;
    for (const name of ['eyebrow','headline','background_color','text_color']) fields[name].value=item[name] || '';
    fields.background_image_url.value=item.background_image_url || '';
    fields.background_file.value='';
    for (let index=0;index<3;index++) {
      const button=item.buttons?.[index];
      fields[`button_enabled_${index}`].checked=Boolean(button);
      fields[`button_plan_${index}`].value=button?.plan_key || ['semiannual','annual','monthly'][index];
      fields[`button_label_${index}`].value=button?.label || '';
      fields[`button_color_${index}`].value=button?.color || '#e7c46f';
      fields[`button_text_color_${index}`].value=button?.text_color || '#0b1930';
    }
    preview();
  }
  async function load() {
    const [campaign,plans]=await Promise.all([
      db.rpc('platform_get_siap_header_campaign'),
      db.from('siap_assistant_plans').select('plan_key,amount').eq('active',true)
    ]);
    if (campaign.error) { status(`Não foi possível carregar a campanha: ${campaign.error.message}`,true); return; }
    current=campaign.data;
    planPrices=Object.fromEntries((plans.data || []).map(plan=>[plan.plan_key,plan.amount]));
    fill(current);
    status(current.active ? 'Campanha ativa no cabeçalho.' : 'Cabeçalho padrão ativo. Campanha guardada para reutilização.');
  }
  function valid(item) {
    if (!item.eyebrow || !item.headline) return 'Preencha as duas frases da campanha.';
    if (item.active && !item.buttons.length) return 'Escolha pelo menos um botão para ativar a campanha.';
    if (new Set(item.buttons.map(button=>button.plan_key)).size !== item.buttons.length) return 'Escolha planos diferentes nos botões.';
    if (item.buttons.some(button=>!button.label)) return 'Preencha o texto de cada botão exibido.';
    if (item.background_image_url && !imageUrl(item.background_image_url)) return 'Use um link HTTPS válido para o fundo.';
    return null;
  }
  async function persist(item) {
    const errorMessage=valid(item);
    if (errorMessage) { status(errorMessage,true); return; }
    const saveButton=document.getElementById('platformSiapHeaderCampaignSave');
    const resetButton=document.getElementById('platformSiapHeaderCampaignReset');
    saveButton.disabled=resetButton.disabled=true;
    let uploadedPath=null;
    try {
      const file=form().elements.background_file.files?.[0];
      if (file && item.active) {
        const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
        if (!extensions[file.type] || !file.size || file.size>10*1024*1024) throw Error('Escolha JPG, PNG ou WebP de até 10 MB.');
        uploadedPath=`themes/${crypto.randomUUID()}.${extensions[file.type]}`;
        const {error}=await db.storage.from('siap-announcement-media').upload(uploadedPath,file,{contentType:file.type,upsert:false});
        if (error) throw error;
        item.background_image_url=db.storage.from('siap-announcement-media').getPublicUrl(uploadedPath).data.publicUrl;
      }
      const {error}=await db.rpc('platform_set_siap_header_campaign',{
        p_active:item.active,p_eyebrow:item.eyebrow,p_headline:item.headline,
        p_background_color:item.background_color,p_text_color:item.text_color,
        p_background_image_url:item.background_image_url,p_buttons:item.buttons
      });
      if (error) throw error;
      await load();
      status(item.active ? 'Campanha publicada no cabeçalho.' : 'Cabeçalho padrão restaurado. Campanha guardada no painel.');
    } catch (error) {
      if (uploadedPath) await db.storage.from('siap-announcement-media').remove([uploadedPath]);
      status(error.message || 'Não foi possível salvar a campanha.',true);
    } finally { saveButton.disabled=resetButton.disabled=false; }
  }
  function mount() {
    if (mounted || !root()) return;
    mounted=true;
    root().innerHTML=`<section class="platform-panel platform-siap-header-campaign"><div class="platform-panel-head"><div><h4>Campanha no cabeçalho</h4><p>Publicidade fixa até você voltar ao padrão. É independente do aviso que cada usuário pode fechar.</p></div></div>
      <div class="platform-siap-campaign-grid"><form id="platformSiapHeaderCampaignForm">
        <label class="platform-siap-campaign-active"><span class="platform-siap-campaign-state"><span class="platform-siap-campaign-state-dot" aria-hidden="true"></span><span><strong id="platformSiapCampaignActiveLabel">Campanha ativa</strong><small id="platformSiapCampaignActiveDescription">A publicidade aparece para os professores.</small></span></span><input type="checkbox" name="active" aria-label="Mostrar campanha no cabeçalho"><span class="platform-siap-toggle-track" aria-hidden="true"></span></label>
        <div class="platform-siap-campaign-button-grid"><label>Frase superior<input name="eyebrow" maxlength="30" placeholder="Ex.: PROMOÇÃO"></label><label>Chamada principal<input name="headline" maxlength="60" placeholder="Ex.: BLACK FRIDAY"></label></div>
        <details class="platform-communication-details"><summary><span><strong>Fundo e cores</strong><small>Personalize o visual da campanha.</small></span></summary><div class="platform-communication-details-body">
        <div class="platform-siap-campaign-button-grid"><label>Cor de fundo<input name="background_color" type="color" value="#080e1b"></label><label>Cor do texto<input name="text_color" type="color" value="#fff5d4"></label></div>
        <label>Imagem de fundo (link HTTPS, opcional)<input name="background_image_url" type="url" maxlength="2048" placeholder="https://..."></label>
        <label>Ou enviar imagem de fundo<input name="background_file" type="file" accept="image/jpeg,image/png,image/webp"></label>
        </div></details>
        <details class="platform-communication-details" open><summary><span><strong>Botões de compra</strong><small>Até três planos com acesso direto ao checkout Hotmart.</small></span></summary><div class="platform-communication-details-body platform-siap-campaign-buttons-layout">
        ${[0,1,2].map(row).join('')}
        </div></details>
        <div class="platform-siap-announcement-actions"><button id="platformSiapHeaderCampaignSave" type="submit" class="btn primary">Salvar campanha</button><button id="platformSiapHeaderCampaignReset" type="button" class="btn secondary">Voltar ao cabeçalho padrão</button></div>
        <p id="platformSiapHeaderCampaignStatus" class="meta" role="status">Carregando…</p>
      </form><div><strong>Prévia do cabeçalho</strong><div id="platformSiapHeaderCampaignPreview" class="platform-siap-campaign-preview"></div></div></div>
    </section>`;
    form().addEventListener('input',preview);
    form().addEventListener('change',preview);
    form().onsubmit=event=>{event.preventDefault();persist(read());};
    document.getElementById('platformSiapHeaderCampaignReset').onclick=()=>{
      if (current) persist({...current,active:false});
    };
  }
  window.openPlatformSiapHeaderCampaign=()=>{mount();return load();};
})();
