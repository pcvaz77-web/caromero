(() => {
  "use strict";
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;
  const CONTENT_BATCH_KEY = "assistenteSiapContentBatch";
  const ATTENDANCE_BATCH_KEY = "assistenteSiapAttendanceBatch";
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const SUPPORT_MATERIALS = ["Revisa Goiás", "Ser Goiás/Desafio Crescer", "Goiás TEC", "Goiás English", "Conectando Palavras/Letrus", "Redação Nota 1000", "Outros", "Nenhum material de apoio utilizado"];
  const MAX_SAVE_ATTEMPTS = 5;
  const initialPageType = window.AssistenteSiapCore?.pageType(location.pathname) || "unsupported";
  if (initialPageType === "unsupported") {
    installNavigationBridge();
    return;
  }
  if (window.__ASSISTENTE_SIAP_LOADED__) return;
  window.__ASSISTENTE_SIAP_LOADED__ = true;

  const Core = window.AssistenteSiapCore;
  const IDS = Object.freeze({
    calendar: "cphFuncionalidade_cphCampos_CalendarioMensal",
    month: "selectMesCalendarioMensal",
    date: "cphFuncionalidade_cphCampos_txtDataSelecionada",
    lesson: "cphFuncionalidade_cphCampos_LstAulasDiaSelecionado",
    planned: "cphFuncionalidade_cphCampos_grdPlanejado",
    realized: "cphFuncionalidade_cphCampos_GrdConteudoRealizado",
    save: "cphFuncionalidade_btnAlterar"
  });
  const contextIds = Object.freeze({
    year: "txtAnoLetivo", composition: "txtComposicao", subject: "txtDisciplina",
    grade: "txtSerie", term: "txtBimestre", shift: "txtTurno", classroom: "txtTurma"
  });
  const exactContextIds = Object.freeze({
    year: "cphFuncionalidade_cphCampos_txtAnoLetivo",
    composition: "cphFuncionalidade_cphCampos_txtComposicao",
    subject: "cphFuncionalidade_cphCampos_txtDisciplina",
    grade: "cphFuncionalidade_cphCampos_txtSerie",
    term: "cphFuncionalidade_cphCampos_ddlBimestre",
    shift: "cphFuncionalidade_cphCampos_txtTurno",
    classroom: "cphFuncionalidade_cphCampos_txtTurma"
  });
  let model = { page: initialPageType, days: [], context: {}, busy: false, busyMessage: "", log: [], license: null, accountEmail: null, sessionRequired: false, activitySiteEnabled:false, announcement:null, headerCampaign:null, announcementDismissedAt:null, manualAnalysisCount:0, manualAnalysisPage:"" };
  let panel;
  let contentResumeTimer;
  let attendanceResumeTimer;
  let panelDialogShift;
  let planningDockTarget;
  let planningDockOriginal;
  let planningDockNaturalWidth = 0;
  let planningDockDetached = false;
  let peiFormIdentity = null;
  let planningResumeTimer;
  let planningSaveCheckRun;
  let planningSaveCheckAt = 0;
  let planningAiRun;
  let planningTooltip;
  let consumingFeature = false;

  function hidePlanningTooltip() {
    planningTooltip?.remove();
    planningTooltip = null;
  }

  function showPlanningTooltip(button) {
    hidePlanningTooltip();
    if (button.disabled || !button.dataset.tip) return;
    const tip = document.createElement("div");
    tip.className = "cm-plan-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.textContent = button.dataset.tip;
    document.documentElement.append(tip);
    const buttonRect = button.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const left = Math.max(12, Math.min(buttonRect.left, innerWidth - tipRect.width - 12));
    const below = buttonRect.bottom + 8;
    const above = buttonRect.top - tipRect.height - 8;
    const top = below + tipRect.height <= innerHeight - 12 ? below : Math.max(12, above);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    planningTooltip = tip;
  }

  window.addEventListener("scroll", hidePlanningTooltip, true);
  window.addEventListener("resize", hidePlanningTooltip);

  function installNavigationBridge() {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      const isLogin = location.pathname.toLowerCase().endsWith("/login.aspx");
      if (message?.type === "ASSISTENTE_SIAP_STATUS") {
        respond({ page:"unsupported", pending:0, open:false, authenticated:!isLogin, extensionVersion:EXTENSION_VERSION });
      }
      if (message?.type === "ASSISTENTE_SIAP_RUN_ATTENDANCE_JOB") {
        if (model.license?.active === false) {
          respond({ ok:false, code:"ASSISTANT_ACCESS_EXPIRED", message:"O acesso ao Assistente SIAP terminou. Assine para continuar." });
          return;
        }
        if (isLogin) {
          respond({ ok:false, code:"SIAP_LOGIN_REQUIRED", message:"A sessão do SIAP expirou. Entre novamente e tente de novo." });
          return;
        }
        respond({ pending:true, nextPhase:"locate", retryAfter:1200 });
        location.assign("/DiarioEscolarListagem.aspx");
      }
    });
  }

  install();

  async function install() {
    removeCompetitorOverlap();
    const stored = await chrome.storage.local.get(["panelOpen", "panelClosed", "panelPosition", "dryRun", "maxItems", "announcementDismissedAt"]);
    model.announcementDismissedAt = stored.announcementDismissedAt || null;
    // Uma nova aba inicia com o atalho no canto; postbacks nesta aba preservam a escolha visual.
    const openInThisTab = sessionStorage.getItem("assistenteSiapPanelOpenThisTab") === "true";
    createShell(stored.panelOpen === true && openInThisTab, false, stored);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.announcementDismissedAt) return;
      model.announcementDismissedAt = changes.announcementDismissedAt.newValue || null;
      if (model.announcement?.updated_at === model.announcementDismissedAt) {
        panel?.querySelector('.cm-announcement')?.remove();
        applyAnnouncementTheme();
      }
    });
    window.addEventListener("resize", applyPlanningDockLayout);
    refreshLicenseStatus();
    refreshActivitySiteStatus();
    refreshAnnouncement();
    refreshHeaderCampaign();
    window.addEventListener('focus', () => { if (!document.hidden) refreshActivitySiteStatus(); });
    window.addEventListener('focus', () => { if (!document.hidden) refreshAnnouncement(); });
    window.addEventListener('focus', () => { if (!document.hidden) refreshHeaderCampaign(); });
    if (initialPageType === 'exam') window.addEventListener('focus', () => { if (!document.hidden) refreshLicenseStatus(); });
    if (initialPageType === "exam" && stored.panelOpen === undefined) setOpen(true, false);
    analyze();
    observeSiapUpdates();
    setTimeout(analyze, 700);
    setTimeout(analyze, 1600);
    if (initialPageType === "planning-lesson") {
      document.addEventListener("change", (event) => {
        if (event.isTrusted && event.target?.id === "ddlEixo") {
          sessionStorage.setItem("assistenteSiapManualPlanningAxis", JSON.stringify({ signature:planningSignature(), value:event.target.value }));
        }
      }, true);
      installManualPlanningSaveTracking();
      setTimeout(resumePlanningFlow, 700);
      setTimeout(resumeReplicateAfterSave, 900);
      setTimeout(resumeAfterReplicationCancel, 1000);
    }
    if (["planning-overview", "planning-lesson"].includes(initialPageType)) setTimeout(resumePlanningBatch, 1800);
    if (initialPageType === "content") setTimeout(resumeContentBatch, 2000);
    if (initialPageType === "attendance") setTimeout(resumeAttendanceBatch, 2200);
  }

  async function refreshLicenseStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_LICENSE_STATUS" });
      model.sessionRequired = result?.code === "ASSISTANT_SESSION_REQUIRED" || result?.code === "device_session_expired";
      if (result?.license) {
        model.license = result.license;
        if ('accountEmail' in result.license) model.accountEmail = result.license.accountEmail;
        if (model.license.active !== true && !finishingAuthorizedFreeWork()) lockAssistantAfterExpiry();
        render();
      }
      else if (model.sessionRequired) { model.accountEmail = null; render(); }
    } catch { /* A sessão do Assistente é verificada novamente ao usar a IA. */ }
  }

  async function refreshActivitySiteStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_ACTIVITY_SITE_STATUS" });
      model.activitySiteEnabled = result?.visible === true;
    } catch { model.activitySiteEnabled = false; }
    render();
  }

  async function refreshAnnouncement() {
    try {
      const result = await chrome.runtime.sendMessage({type:'ASSISTENTE_SIAP_GET_ANNOUNCEMENT'});
      if (!result?.ok) return;
      if (JSON.stringify(result.announcement || null) === JSON.stringify(model.announcement)) return;
      const loginEmail = panel?.querySelector('.cm-login-email');
      const typedEmail = loginEmail?.value || '';
      const emailFocused = document.activeElement === loginEmail;
      model.announcement = result.announcement || null;
      if (model.busy) return;
      render();
      const refreshedEmail = panel?.querySelector('.cm-login-email');
      if (refreshedEmail && typedEmail) refreshedEmail.value = typedEmail;
      if (refreshedEmail && emailFocused) refreshedEmail.focus();
    } catch { /* O painel continua utilizável sem o comunicado. */ }
  }

  async function refreshHeaderCampaign() {
    try {
      const result = await chrome.runtime.sendMessage({type:'ASSISTENTE_SIAP_GET_HEADER_CAMPAIGN'});
      if (!result?.ok) return;
      if (JSON.stringify(result.campaign || null) === JSON.stringify(model.headerCampaign)) return;
      model.headerCampaign = result.campaign || null;
      if (!model.busy) render();
    } catch { /* O cabeçalho padrão permanece disponível. */ }
  }

  function announcementCard() {
    const item = model.announcement;
    if (!item || typeof item.title !== 'string' || typeof item.message_body !== 'string') return '';
    if (item.updated_at && item.updated_at === model.announcementDismissedAt) return '';
    let media = '';
    try {
      const url = new URL(item.media_url);
      if (url.protocol === 'https:') {
        const href = escapeHtml(url.href);
        if (item.media_type === 'image') media = `<img src="${href}" alt="Imagem do comunicado" loading="lazy">`;
        if (item.media_type === 'video') {
          media = `<a class="cm-announcement-action cm-announcement-video-link" href="${href}" target="_blank" rel="noopener noreferrer">Ver vídeo</a>`;
        }
      }
    } catch { /* Link ausente ou inválido: exibir somente o texto. */ }
    let action = '';
    if (typeof item.link_label === 'string' && item.link_label.trim() && typeof item.link_url === 'string') {
      try {
        const url = new URL(item.link_url);
        if (url.protocol === 'https:') action = `<a class="cm-announcement-action" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.link_label.trim())}</a>`;
      } catch { /* Sem link válido, o comunicado continua visível. */ }
    }
    return `<section class="cm-card cm-announcement" aria-label="Novidade do Assistente SIAP"><button type="button" class="cm-announcement-close" aria-label="Fechar comunicado" title="Fechar comunicado">×</button><small>${item.theme_key === 'black_friday' ? 'Oferta Black Friday' : 'Novidade do Assistente SIAP'}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message_body).replace(/\n/g,'<br>')}</p>${media}${action}</section>`;
  }

  function applyAnnouncementTheme() {
    if (!panel) return;
    const item = model.announcement;
    const active = item && item.updated_at !== model.announcementDismissedAt && model.page !== 'exam';
    const keys = ['classic','black_friday','teachers','public_servant','black_awareness','students','september_yellow','christmas','new_year','custom'];
    const key = active && keys.includes(item.theme_key) ? item.theme_key : '';
    if (key) panel.dataset.announcementTheme = key;
    else delete panel.dataset.announcementTheme;
    const noticeColor = active && /^#[0-9a-f]{6}$/i.test(item.notice_color || '') ? item.notice_color : '#e8f8ed';
    const noticeText = active && /^#[0-9a-f]{6}$/i.test(item.notice_text_color || '') ? item.notice_text_color : '#14532d';
    const noticeButton = active && /^#[0-9a-f]{6}$/i.test(item.notice_button_color || '') ? item.notice_button_color : '#168553';
    const rgb = [1,3,5].map(i => parseInt(noticeButton.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    panel.style.setProperty('--cm-notice-color',noticeColor);
    panel.style.setProperty('--cm-notice-text',noticeText);
    panel.style.setProperty('--cm-notice-button',noticeButton);
    panel.style.setProperty('--cm-notice-button-text',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722 > .35 ? '#13213a' : '#ffffff');
    panel.dataset.announcementImage = 'false';
  }

  function applyHeaderCampaign() {
    if (!panel) return;
    const campaign=model.headerCampaign;
    const active=campaign?.active === true && model.page !== 'exam';
    panel.dataset.headerCampaign=active ? 'true' : 'false';
    const color = active && /^#[0-9a-f]{6}$/i.test(campaign.background_color || '') ? campaign.background_color : '#17345d';
    const foreground = active && /^#[0-9a-f]{6}$/i.test(campaign.text_color || '') ? campaign.text_color : '#ffffff';
    panel.style.setProperty('--cm-header-color',color);
    panel.style.setProperty('--cm-header-text',foreground);
    let image=null;
    try { const url=new URL(campaign?.background_image_url); if (url.protocol==='https:') image=url.href; } catch {}
    panel.style.setProperty('--cm-header-image',active && image ? `url(${JSON.stringify(image)})` : 'none');
    const promo=panel.querySelector('.cm-bf-promo');
    if (!promo) return;
    promo.hidden=!active;
    promo.replaceChildren();
    if (!active) return;
    const heading=document.createElement('span'); heading.className='cm-bf-headline';
    const eyebrow=document.createElement('small'); eyebrow.textContent=campaign.eyebrow || '';
    const headline=document.createElement('strong'); headline.textContent=campaign.headline || '';
    heading.append(eyebrow,headline); promo.append(heading);
    const buttons=document.createElement('div'); buttons.className='cm-bf-prices';
    const validColors=/^#[0-9a-f]{6}$/i;
    for (const entry of Array.isArray(campaign.buttons) ? campaign.buttons.slice(0,3) : []) {
      let url;
      try { url=new URL(entry.checkout_url); } catch { continue; }
      if (url.protocol!=='https:' || url.hostname!=='pay.hotmart.com') continue;
      const amount=Number(entry.amount);
      if (!Number.isFinite(amount) || amount<=0) continue;
      if (!['monthly','quarterly','semiannual','annual'].includes(entry.plan_key)) continue;
      // A conta precisa existir antes do checkout para que o webhook da
      // Hotmart encontre o pedido e libere a licença na extensão.
      const accountUrl=new URL('https://sistemacarometro.com.br/assistente-siap-conta.html');
      accountUrl.searchParams.set('plano',entry.plan_key);
      if (model.accountEmail) accountUrl.hash=`email=${encodeURIComponent(model.accountEmail)}`;
      const button=document.createElement('a'); button.href=accountUrl.href; button.target='_blank'; button.rel='noopener noreferrer';
      button.style.background=validColors.test(entry.color || '') ? entry.color : '#e7c46f';
      button.style.color=validColors.test(entry.text_color || '') ? entry.text_color : '#0b1930';
      const label=document.createElement('small'); label.textContent=String(entry.label || '').slice(0,30);
      const price=document.createElement('strong'); price.textContent=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount);
      button.append(label,price); buttons.append(button);
    }
    promo.append(buttons);
  }

  function licenseCard() {
    const license = model.license;
    if (!license) return "";
    const days = Math.max(0, Number(license.daysRemaining || 0));
    const plansUrl = new URL("https://sistemacarometro.com.br/assistente-siap.html");
    plansUrl.hash = `planos?email=${encodeURIComponent(model.accountEmail || "")}`;
    const salesButton = `<div class="cm-actions"><a class="cm-btn cm-primary cm-full" href="${plansUrl.href}" target="_blank" rel="noopener noreferrer">Ver planos</a></div>`;
    if (license.status === "grant_ended" || license.status === "expired") return `<section class="cm-card cm-license cm-license-expired"><h3>Licença expirada</h3><p>Sua licença expirou. Clique para continuar usando o Assistente SIAP.</p>${salesButton}</section>`;
    if (license.mode === "external") {
      const uses = license.freeUses || {};
      const rows = [["Planejamento", "planning"], ["Conteúdo", "content"], ["Frequência", "attendance"], ["PEI", "pei"]]
        .map(([label, key]) => `<div class="cm-item"><span><strong>${label}</strong><small>${Math.max(0, Number(uses[key] || 0))} uso(s) restante(s)</small></span></div>`).join("");
      const available = Object.values(uses).some((value) => Number(value) > 0);
      const runningLow = Object.values(uses).some((value) => Number(value) === 1);
      const finishing = !available && finishingAuthorizedFreeWork();
      return `<section class="cm-card cm-license ${available || finishing ? "cm-license-warning" : "cm-license-expired"}"><h3>${finishing ? "Último uso gratuito em andamento" : available ? "Licença de teste" : "Licença expirada"}</h3>${available ? `<p>2 usos de cada recurso para experimentar.</p><div class="cm-list">${rows}</div>${runningLow ? `<p>Seu teste está chegando ao fim. Escolha um plano para continuar usando.</p>${salesButton}` : ""}` : finishing ? `<p>Esta tarefa já foi autorizada e pode ser concluída. Novos usos exigem um plano.</p>` : `<p>Seus usos gratuitos terminaram. Clique para continuar usando.</p>${salesButton}`}</section>`;
    }
    if (license.mode === "carometro" && license.active === true) return `<section class="cm-card cm-license ${days > 0 && days <= 3 ? "cm-license-warning" : ""}"><h3>Acesso concedido pelo Carômetro</h3><span class="cm-badge cm-green">${license.permanent === true || license.daysRemaining == null ? "Concessão permanente" : `${days} dia(s) restante(s)`}</span>${days > 0 && days <= 3 && license.permanent !== true ? `<p>Sua concessão termina em breve. Peça a renovação ao responsável ou escolha um plano individual.</p>${salesButton}` : ""}</section>`;
    if (license.mode === "subscription" && license.active === true) return `<section class="cm-card cm-license ${days > 0 && days <= 3 ? "cm-license-warning" : ""}"><h3>Licença ativa</h3><span class="cm-badge cm-green">${days} dia(s) restante(s)</span>${days > 0 && days <= 3 ? `<p>Sua licença vence em breve. Confira a renovação para continuar usando.</p>${salesButton}` : ""}</section>`;
    return `<section class="cm-card cm-license cm-license-expired"><h3>Seu acesso ao Assistente SIAP terminou</h3><p>Contrate um plano para continuar utilizando os recursos.</p>${salesButton}</section>`;
  }

  function licenseHeaderLabel() {
    const license = model.license;
    if (!license || model.sessionRequired || model.page === "exam") return "";
    if (license.mode === "external" && license.status === "free" && license.active === false) return finishingAuthorizedFreeWork() ? "Teste grátis · último uso em andamento" : "Teste grátis esgotado";
    if (license.status === "grant_ended" || license.status === "expired" || license.active === false) return "Acesso expirado";
    if (license.mode === "carometro") {
      if (license.permanent === true || license.daysRemaining == null) return "Concessão permanente";
      return `Concessão · ${Math.max(0, Number(license.daysRemaining) || 0)} dia(s) restante(s)`;
    }
    if (license.mode === "external") {
      return Object.values(license.freeUses || {}).some((uses) => Number(uses) > 0) ? "Teste grátis" : "Teste grátis esgotado";
    }
    if (license.mode === "subscription") return `Assinatura · ${Math.max(0, Number(license.daysRemaining) || 0)} dia(s) restante(s)`;
    return "Acesso ativo";
  }

  function featureHasFreeUse(feature) {
    return model.license?.mode !== "external" || Number(model.license?.freeUses?.[feature] || 0) > 0;
  }

  function finishingAuthorizedFreeWork() {
    if (model.license?.mode !== "external" || model.license?.status !== "free") return false;
    if (consumingFeature) return true;
    if (model.page === "content") return getContentBatch()?.authorized === true;
    if (model.page === "attendance") return getAttendanceBatch()?.authorized === true;
    if (["planning-overview", "planning-calendar", "planning-lesson"].includes(model.page)) {
      return Boolean(planningAiRun || getPlanningBatch()?.active || readStoredJson("assistenteSiapPlanningFlow"));
    }
    return false;
  }

  async function consumeFeature(feature) {
    if (model.license?.active === false) {
      addLog("Seu acesso ao Assistente SIAP terminou. Confira sua licença antes de continuar.");
      return false;
    }
    if (!featureHasFreeUse(feature)) {
      addLog("O limite gratuito desta função terminou. Use o botão Assinar o Assistente SIAP.");
      return false;
    }
    consumingFeature = true;
    try {
      const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_CONSUME_FEATURE", feature });
      if (result?.license) model.license = result.license;
      if (!result?.ok) {
        render();
        addLog(result?.message || "Não foi possível validar o uso desta função.");
        return false;
      }
      return true;
    } catch {
      addLog("Não foi possível validar o acesso ao Assistente SIAP. Tente novamente.");
      return false;
    } finally {
      consumingFeature = false;
    }
  }

  function removeCompetitorOverlap() {
    // Não altera a outra extensão; apenas desloca visualmente nosso botão se ela estiver presente.
    document.documentElement.classList.toggle("cm-has-other-assistant", !!document.querySelector("#tm-exec-panel, [id^='freq-btn-']"));
  }

  function lockAssistantAfterExpiry() {
    clearTimeout(contentResumeTimer);
    clearTimeout(attendanceResumeTimer);
    ["assistenteSiapPlanningBatch", "assistenteSiapPlanningPreview", "assistenteSiapPlanningFlow", "assistenteSiapPlanningAi", "assistenteSiapAutoSaveReplicate", "assistenteSiapOpenReplicate", "assistenteSiapConfirmReplicate", "assistenteSiapReplicationOpenedAt", "assistenteSiapSaveAfterReplicationCancel", CONTENT_BATCH_KEY, ATTENDANCE_BATCH_KEY].forEach((key) => sessionStorage.removeItem(key));
    model.busyMessage = "";
  }

  function createShell(open, closed, stored) {
    const root = document.createElement("div");
    root.id = "assistente-siap-root";
    root.innerHTML = `<button id="assistente-siap-launcher" title="Abrir Assistente SIAP" aria-label="Abrir Assistente SIAP"><img src="${chrome.runtime.getURL("src/carometro-icon.svg")}" alt=""></button>
      <aside id="assistente-siap-panel" aria-label="Assistente SIAP do Professor" ${open ? "" : "hidden"}></aside>`;
    document.documentElement.append(root);
    panel = root.querySelector("#assistente-siap-panel");
    panel.addEventListener('click', event => {
      const close = event.target.closest('.cm-announcement-close');
      if (!close || !panel.contains(close)) return;
      const updatedAt = model.announcement?.updated_at;
      if (updatedAt) {
        model.announcementDismissedAt = updatedAt;
        chrome.storage.local.set({announcementDismissedAt:updatedAt}).catch(() => {});
      }
      close.closest('.cm-announcement')?.remove();
      applyAnnouncementTheme();
    });
    const launcher = root.querySelector("#assistente-siap-launcher");
    launcher.hidden = open || closed;
    applyStoredPosition(panel, stored.panelPosition);
    // O atalho sempre inicia no canto; ele ainda pode ser arrastado nesta página.
    installDrag(launcher, launcher, "launcherPosition", () => setOpen(true));
    render();
  }

  function applyStoredPosition(element, position) {
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return;
    element.style.left = `${Math.max(8, Math.min(position.left, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(position.top, innerHeight - element.offsetHeight - 8))}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function restorePlanningDockTarget() {
    if (!planningDockTarget || !planningDockOriginal) return;
    for (const [property, previous] of Object.entries(planningDockOriginal)) {
      if (previous.value) planningDockTarget.style.setProperty(property, previous.value, previous.priority);
      else planningDockTarget.style.removeProperty(property);
    }
    planningDockTarget = null;
    planningDockOriginal = null;
    planningDockNaturalWidth = 0;
  }

  function applyPlanningDockLayout() {
    if (!panel) return;
    const pageType = Core.pageType(location.pathname);
    const overlay = pageType === "planning-lesson";
    if (overlay && !panel.classList.contains("cm-planning-overlay")) {
      for (const property of ["left", "top", "right", "bottom"]) panel.style?.removeProperty(property);
    }
    panel.classList.toggle("cm-planning-overlay", overlay);
    const siapPage = pageType !== "unsupported" && pageType !== "planning-overview" && !overlay;
    const main = siapPage && !panel.hidden && !planningDockDetached
      ? document.querySelector("#FormularioPrincipal > .sis") || document.getElementById("FormularioPrincipal") : null;
    const dock = Boolean(main);
    panel.classList.toggle("cm-planning-docked", dock);
    if (!main) return restorePlanningDockTarget();
    if (planningDockTarget !== main) {
      restorePlanningDockTarget();
      planningDockTarget = main;
      planningDockOriginal = Object.fromEntries(["width", "margin-left", "margin-right", "zoom", "overflow-x"].map((property) => [property, {
        value: main.style.getPropertyValue(property), priority: main.style.getPropertyPriority(property)
      }]));
      planningDockNaturalWidth = Math.max(1014, main.scrollWidth);
    }
    planningDockNaturalWidth = Math.max(planningDockNaturalWidth, main.scrollWidth);
    const available = Math.max(1, panel.getBoundingClientRect().left - 20);
    const scale = Math.min(1, available / planningDockNaturalWidth);
    for (const [property, value] of Object.entries({
      width:`${planningDockNaturalWidth}px`, "margin-left":"8px", "margin-right":"0", zoom:String(scale)
    })) {
      if (main.style.getPropertyValue(property) !== value) main.style.setProperty(property, value);
    }
    const overflow = main.scrollWidth > main.clientWidth + 2 ? "auto" : "visible";
    if (main.style.getPropertyValue("overflow-x") !== overflow) main.style.setProperty("overflow-x", overflow);
  }

  function detachPlanningDock() {
    if (!panel?.classList.contains("cm-planning-docked")) return;
    const rect = panel.getBoundingClientRect();
    planningDockDetached = true;
    panel.classList.remove("cm-planning-docked");
    restorePlanningDockTarget();
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function installDrag(element, handle, storageKey, activate) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button,a") && handle !== element) return;
      if (storageKey === "panelPosition") clearPanelDialogShift();
      const rect = element.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      if (storageKey === "panelPosition") detachPlanningDock();
      element.style.left = `${Math.max(8, Math.min(drag.left + dx, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(drag.top + dy, innerHeight - element.offsetHeight - 8))}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    });
    handle.addEventListener("pointerup", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      handle.releasePointerCapture?.(event.pointerId);
      const rect = element.getBoundingClientRect();
      chrome.storage.local.set({ [storageKey]: { left: Math.round(rect.left), top: Math.round(rect.top) } });
      if (!moved) activate?.();
    });
  }

  function analyze() {
    model.page = Core.pageType(location.pathname);
    model.context = readContext();
    if (model.page === "planning-overview") capturePlanningOverviewSlots();
    model.days = model.page === "planning-calendar"
      ? readPlanningCalendarDays()
      : model.page === "planning-overview"
        ? readPlanningOverview()
        : Core.usesMonthlyCalendar(model.page)
          ? readCalendarDays()
          : [];
    render();
    applyPlanningDockLayout();
    syncPanelWithSiapDialog();
  }

  function analyzeOnDemand() {
    model.manualAnalysisCount++;
    model.manualAnalysisPage = Core.pageType(location.pathname);
    analyze();
    panel.querySelector('[data-action="analyze"]')?.focus({ preventScroll:true });
  }

  function clearPanelDialogShift() {
    if (!panelDialogShift || !panel) return;
    panel.style.transform = panelDialogShift.transform;
    panelDialogShift = null;
  }

  function syncPanelWithSiapDialog() {
    if (!panel || panel.hidden) return clearPanelDialogShift();
    const dialog = [...document.querySelectorAll('[role="dialog"], .ui-dialog, .modal-dialog, .modal')].find((element) => {
      if (element === panel || panel.contains(element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width >= 180 && rect.height >= 100;
    });
    if (!dialog) return clearPanelDialogShift();
    clearPanelDialogShift();
    const dialogRect = dialog.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const overlap = panelRect.left < dialogRect.right && panelRect.right > dialogRect.left && panelRect.top < dialogRect.bottom && panelRect.bottom > dialogRect.top;
    if (!overlap) return;
    panelDialogShift = { transform: panel.style.transform };
    const margin = 16;
    let left = dialogRect.left - panelRect.width - margin;
    let top = panelRect.top;
    if (left < 8) {
      left = dialogRect.right + margin;
      if (left + panelRect.width > innerWidth - 8) {
        left = Math.max(8, Math.min(panelRect.left, innerWidth - panelRect.width - 8));
        top = dialogRect.top - panelRect.height - margin;
        if (top < 8) top = Math.min(innerHeight - panelRect.height - 8, dialogRect.bottom + margin);
      }
    }
    panel.style.transform = `translate(${Math.round(left - panelRect.left)}px, ${Math.round(top - panelRect.top)}px)`;
  }

  function readContext() {
    const result = {};
    for (const [key, suffix] of Object.entries(contextIds)) {
      const element = document.getElementById(exactContextIds[key]) || document.querySelector(`[id$="_${suffix}"]`);
      result[key] = element instanceof HTMLSelectElement
        ? element.selectedOptions?.[0]?.textContent || element.value || ""
        : element?.value || element?.getAttribute("value") || "";
    }
    return Core.safeContext(result);
  }

  function readCalendarDays() {
    const calendar = document.getElementById(IDS.calendar);
    const monthSelect = document.getElementById(IDS.month);
    if (!calendar || !monthSelect) return [];
    const year = Number(model.context.year || new Date().getFullYear());
    // O valor interno do SIAP é baseado em 1; selectedIndex já corresponde ao índice 0-11 do Date.
    const month = monthSelect.selectedIndex;

    return [...calendar.querySelectorAll("td.letivo")].map((cell) => {
      const day = Number((cell.textContent || "").trim());
      const date = new Date(year, month, day, 12);
      const color = Core.colorState(getComputedStyle(cell).backgroundColor);
      return {
        day,
        iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        label: `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`,
        state: color === "saved" ? "saved"
          : cell.getAttribute("data-planejado") === "True" && cell.getAttribute("data-executado") === "False" ? "pending" : color,
        eligible: Core.isEligibleDate(date),
        cell
      };
    }).filter((item) => Number.isInteger(item.day) && item.day > 0);
  }

  function readPlanningCalendarDays() {
    const calendar = document.getElementById("cphFuncionalidade_cphCampos_CalendarioPlanejamento");
    const year = Number(model.context.year || new Date().getFullYear());
    if (!calendar) return [];
    return [...calendar.querySelectorAll("table")].flatMap((table, month) =>
      [...table.querySelectorAll("td.aula.letivo")].map((cell) => {
        const day = Number((cell.firstElementChild?.childNodes?.[0]?.textContent || cell.textContent || "").trim());
        const date = new Date(year, month, day, 12);
        return {
          day,
          iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          label: `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`,
          state: cell.querySelector(".planejada") ? "saved" : Core.colorState(getComputedStyle(cell).backgroundColor),
          eligible: Core.isEligibleDate(date),
          cell
        };
      }).filter((item) => Number.isInteger(item.day) && item.day > 0)
    );
  }

  function readPlanningOverview() {
    const root = document.getElementById("cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor");
    if (!root) return [];
    return [...root.querySelectorAll(".aula")].map((block, index) => ({
      day: Number(block.getAttribute("numeroaula")) || index + 1,
      iso: `aula-${block.getAttribute("codigoturma") || "turma"}-${block.getAttribute("numeroaula") || index + 1}`,
      label: `Aula ${block.getAttribute("numeroaula") || index + 1}`,
      state: block.classList.contains("naoPlanejada") ? "pending" : block.classList.contains("planejada") ? "saved" : "unknown",
      eligible: true,
      cell: block
    }));
  }

  function render() {
    if (!panel) return;
    const previousMultiCount = panel.querySelector("#cm-multi-count")?.value;
    const root = document.getElementById("assistente-siap-root");
    if (root) root.style.display = model.page === "planning-overview" ? "none" : "";
    hidePlanningTooltip();
    const peiControls = capturePeiDraftControls();
    const pending = model.days.filter((day) => day.state === "pending" && day.eligible);
    const future = model.days.filter((day) => day.state === "pending" && !day.eligible);
    const saved = model.days.filter((day) => day.state === "saved");
    const supported = ["diary", "content", "attendance", "planning-list", "planning-calendar", "planning-lesson", "planning-overview", "pei-list", "pei-edit"].includes(model.page);
    const pageNames = { exam: "Correção de Provas", diary: "Diário do Professor", content: "Conteúdo", attendance: "Frequência", grades: "Notas", remote: "Acesso Remoto", "planning-list": "Planejamentos", "planning-calendar": "Calendário de planejamento", "planning-lesson": "Planejamento da aula", "planning-overview": "Planejamento rápido", "pei-list": "PEI · Etapa 2", "pei-edit": "PEI · Edição", unsupported: "Página não reconhecida" };

    if (!panel.querySelector(".cm-body")) {
      panel.innerHTML = `<header class="cm-head">
        <div class="cm-logo"><img src="${chrome.runtime.getURL("src/carometro-icon.svg")}" alt=""></div><div class="cm-title"><small>v${EXTENSION_VERSION}</small><h2>Assistente SIAP</h2><p></p><span class="cm-access-summary" hidden></span><span class="cm-account-identity" hidden></span></div><div class="cm-bf-promo" hidden></div>
        <div class="cm-window-actions"><button class="cm-account-toggle" type="button">Entrar</button><button class="cm-minimize" data-action="minimize" aria-label="Minimizar" title="Minimizar">−</button></div>
        <a class="cm-activity-link" href="https://atividades.sistemacarometro.com.br/" target="_blank" rel="noopener noreferrer" aria-label="Atividades para professores (abre em nova guia)" title="Atividades para professores" hidden>Atividades ↗</a>
        <div class="cm-operation-status" role="status" aria-live="polite" hidden><span class="cm-operation-text"></span><div class="cm-operation-actions" hidden><button type="button" data-action="planning-pause">Pausar</button><button type="button" data-action="planning-stop">Parar</button></div></div>
      </header><div class="cm-body"></div>`;
      panel.querySelector('[data-action="minimize"]')?.addEventListener("click", () => setOpen(false, false));
      panel.querySelector('[data-action="planning-pause"]')?.addEventListener("click", togglePlanningOperation);
      panel.querySelector('[data-action="planning-stop"]')?.addEventListener("click", stopPlanningOperation);
      installDrag(panel, panel.querySelector(".cm-head"), "panelPosition");
    }
    applyAnnouncementTheme();
    applyHeaderCampaign();
    const productTitle = panel.querySelector('.cm-title h2');
    if (productTitle) productTitle.textContent = model.page === 'exam' ? 'Carômetro' : 'Assistente SIAP';
    const pageLabel = panel.querySelector(".cm-title p");
    if (pageLabel) pageLabel.textContent = model.page === "exam" ? "Correção de Provas" : `Professor · ${pageNames[model.page]}`;
    const accessSummary = panel.querySelector('.cm-access-summary');
    if (accessSummary) {
      accessSummary.textContent = licenseHeaderLabel();
      accessSummary.hidden = !accessSummary.textContent;
    }
    const activityLink = panel.querySelector('.cm-activity-link');
    if (activityLink) activityLink.hidden = !(model.activitySiteEnabled && model.license?.active === true && !model.sessionRequired);
    const identity = panel.querySelector('.cm-account-identity');
    if (identity) {
      identity.hidden = !model.accountEmail || model.sessionRequired;
      identity.textContent = model.accountEmail ? 'Conectado como ' + model.accountEmail : '';
      identity.title = identity.textContent;
    }
    const accountToggle = panel.querySelector('.cm-account-toggle');
    if (accountToggle) {
      const connected = !!model.accountEmail && !model.sessionRequired;
      accountToggle.disabled = false;
      accountToggle.hidden = model.sessionRequired;
      accountToggle.textContent = connected ? 'Sair' : 'Entrar';
      accountToggle.classList.toggle('cm-sign-out', connected);
      accountToggle.onclick = async () => {
        if (connected) {
          if (model.busy || window.SiapExamPanel?.isBusy?.()) { accountToggle.title='Aguarde a operação terminar para sair.'; return; }
          window.SiapExamPanel?.resetAccount?.();
          accountToggle.disabled = true;
          const result = await chrome.runtime.sendMessage({type:'ASSISTENTE_SIAP_SIGN_OUT'}).catch(() => null);
          if (!result?.ok) { accountToggle.disabled = false; return; }
          model.accountEmail = null; model.license = null; model.sessionRequired = true; model.activitySiteEnabled = false;
          lockAssistantAfterExpiry(); render();
        } else { model.sessionRequired = true; render(); }
      };
    }
    if (model.page === 'exam' && window.CepiSiapPanel?.supports(document)) {
      window.CepiSiapPanel.mount(panel.querySelector('.cm-body'));
      updateOperationStatus();
      return;
    }
    if (model.page === 'exam') {
      const body = panel.querySelector('.cm-body');
      if (model.sessionRequired) {
        const storeUrl = 'https://chromewebstore.google.com/detail/fgpjjlikinpcjpmmjehbgbfonnbfibnc';
        body.innerHTML = `<section class="cm-card"><h3>Correção de Provas do Carômetro</h3><p>Use sua conta do Carômetro para conectar esta extensão. A correção é gratuita e independente da licença do Assistente SIAP.</p><a class="cm-btn cm-primary cm-full" href="https://sistemacarometro.com.br/" target="_blank" rel="noopener noreferrer">Abrir o Carômetro e conectar</a><a class="cm-btn cm-full" href="${storeUrl}" target="_blank" rel="noopener noreferrer">Instalar ou atualizar a extensão</a></section>`;
      } else {
        window.SiapExamPanel?.mount(body);
      }
      updateOperationStatus();
      return;
    }
    if (model.sessionRequired) {
      const plansUrl = new URL("https://sistemacarometro.com.br/assistente-siap.html");
      plansUrl.hash = `planos?email=${encodeURIComponent(model.accountEmail || "")}`;
      panel.querySelector('.cm-body').innerHTML = `${announcementCard()}<section class="cm-card"><h3>Entrar no Assistente</h3><form class="cm-login-form"><label>E-mail<input class="cm-login-email cm-input" type="email" autocomplete="email" required></label><button class="cm-btn cm-primary cm-full" type="submit">Entrar</button><p class="cm-login-message" role="status"></p></form><a class="cm-btn cm-full" href="${plansUrl.href}" target="_blank" rel="noopener noreferrer">Conhecer planos</a></section>`;
      const loginEmailInput=panel.querySelector('.cm-login-email');
      loginEmailInput.oninvalid=()=>loginEmailInput.setCustomValidity(loginEmailInput.validity.valueMissing?'Informe seu e-mail.':'E-mail inválido. Confira o endereço digitado.');
      loginEmailInput.oninput=()=>loginEmailInput.setCustomValidity('');
      panel.querySelector('.cm-login-form').onsubmit=async event=>{
        event.preventDefault();
        const form=event.currentTarget, button=form.querySelector('button'), status=form.querySelector('.cm-login-message');
        button.disabled=true;status.textContent='Verificando acesso…';
        const result=await chrome.runtime.sendMessage({type:'ASSISTENTE_SIAP_EMAIL_SIGN_IN',email:loginEmailInput.value.trim()}).catch(()=>null);
        if(result?.ok){model.license=result.license;model.accountEmail=result.license.accountEmail;model.sessionRequired=false;render();refreshActivitySiteStatus();return;}
        button.disabled=false;
        const messages={invalid_email:'E-mail inválido. Confira o endereço digitado.',no_active_access:'Você não tem permissão para entrar. Conheça os planos abaixo.',forbidden_origin:'Esta instalação do Assistente não está autorizada.',account_check_failed:'Não foi possível consultar seu acesso agora. Tente novamente.',device_session_create_failed:'Não foi possível concluir sua entrada. Tente novamente.'};
        status.textContent=messages[result?.code]||'Não foi possível verificar o acesso. Tente novamente.';
      };
      updateOperationStatus();
      return;
    }
    if (model.license && model.license.active !== true && !finishingAuthorizedFreeWork()) {
      panel.querySelector(".cm-body").innerHTML = `${announcementCard()}${licenseCard()}${logCard()}`;
      updateOperationStatus();
      return;
    }
    panel.querySelector(".cm-body").innerHTML = `
      ${announcementCard()}
      ${contextCard()}
      <section class="cm-card"><h3>Diagnóstico</h3>
        ${supported ? `<span class="cm-badge cm-green">Página reconhecida</span>` : `<span class="cm-badge cm-yellow">Somente leitura</span>`}
        <div class="cm-stats"><div class="cm-stat"><strong>${pending.length}</strong><span>Pendentes</span></div><div class="cm-stat"><strong>${saved.length}</strong><span>Salvos</span></div><div class="cm-stat"><strong>${future.length}</strong><span>Futuros</span></div></div>
        <div class="cm-actions"><button class="cm-btn cm-full" data-action="analyze">Analisar novamente</button></div>
        ${model.manualAnalysisPage === model.page && model.manualAnalysisCount ? `<p class="cm-analysis-feedback" role="status">✓ Análise atualizada · verificação ${model.manualAnalysisCount}.</p>` : ""}
      </section>
      ${workCard(pending, peiControls)}
      ${logCard()}
      ${licenseCard()}`;
    updateOperationStatus();
    bindPanelEvents();
    const multiCount = panel.querySelector("#cm-multi-count");
    if (multiCount && previousMultiCount) multiCount.value = previousMultiCount;
    if (model.lessonMultiProgress && panel.querySelector("#cm-multi-progress")) {
      const { completed, total, state } = model.lessonMultiProgress;
      updateLessonMultiProgress(completed, total, state);
      const generate = panel.querySelector('[data-action="multi-preview-generate"]');
      if (generate) generate.disabled = state === "running";
    }
  }

  function capturePeiDraftControls() {
    if (model.page !== "pei-edit") {
      peiFormIdentity = null;
      return null;
    }
    // A orientação atravessa apenas a reconstrução atual do painel; não é gravada no navegador.
    const formIdentity = document.getElementById("cphFuncionalidade_cphCampos_txtPotencialidadesExpectativas");
    if (formIdentity !== peiFormIdentity) {
      peiFormIdentity = formIdentity;
      return null;
    }
    const guidance = panel.querySelector("#cm-pei-guidance");
    if (!guidance) return null;
    return {
      guidance:guidance.value,
      focuses:[...panel.querySelectorAll("[data-pei-focus]:checked")].map((input) => input.dataset.peiFocus),
      tense:panel.querySelector('[name="cm-pei-tense"]:checked')?.value || "planned",
      useName:panel.querySelector("#cm-pei-use-name")?.checked === true,
      confirmed:panel.querySelector("#cm-pei-confirm")?.checked === true
    };
  }

  function readStoredJson(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
  }

  function operationStatusMessage() {
    if (planningAiRun?.paused) return "Planejamento pausado.";
    if (planningAiRun) return "Gerando planejamento...";
    const planningFlow = readStoredJson("assistenteSiapPlanningFlow");
    if (planningFlow?.paused) return "Planejamento pausado.";
    if (planningFlow) return planningFlow.stage === "wait-skill" ? "Aguardando habilidade no SIAP..." : planningFlow.stage === "wait-content" ? "Aguardando conteúdo no SIAP..." : planningFlow.stage === "wait-saeb" ? "Aguardando Matriz SAEB no SIAP..." : "Preparando planejamento...";
    if (model.busyMessage) return model.busyMessage;
    const planningPreview = getPlanningPreview();
    if (planningPreview?.generationActive) {
      return `Gerando prévia ${Math.min((planningPreview.generationCompleted || 0) + 1, planningPreview.uniquePlans || 1)} de ${planningPreview.uniquePlans || 1}...`;
    }
    const planningBatch = getPlanningBatch();
    if (planningBatch?.active && !planningBatch.paused) {
      if (planningBatch.previewOnly) return `Gerando prévia ${Math.min((planningBatch.completed || 0) + 1, planningBatch.totalPreviewCount || planningBatch.selectedQueue?.length || 1)} de ${planningBatch.totalPreviewCount || planningBatch.selectedQueue?.length || 1}...`;
      return ["saving", "verify"].includes(planningBatch.phase) ? "Salvando planejamento..." : "Processando planejamentos...";
    }
    const contentBatch = getContentBatch();
    if (contentBatch?.active && !contentBatch.paused) return ["saving", "verify"].includes(contentBatch.phase) ? "Salvando conteúdos..." : "Processando conteúdos...";
    const attendanceBatch = getAttendanceBatch();
    if (attendanceBatch?.active && !attendanceBatch.paused) return ["saving", "verify"].includes(attendanceBatch.phase) ? "Salvando frequência..." : "Processando frequência...";
    return "";
  }

  function updateOperationStatus() {
    const status = panel?.querySelector(".cm-operation-status");
    if (!status) return;
    const message = operationStatusMessage();
    status.querySelector(".cm-operation-text").textContent = message;
    status.hidden = !message;
    const batch = getPlanningBatch();
    const flow = readStoredJson("assistenteSiapPlanningFlow");
    const actions = status.querySelector(".cm-operation-actions");
    actions.hidden = !(planningAiRun || flow || batch?.active);
    status.querySelector('[data-action="planning-pause"]').textContent = planningAiRun?.paused || flow?.paused || batch?.paused ? "Continuar" : "Pausar";
  }

  function setOperationStatus(message = "") {
    model.busyMessage = message;
    updateOperationStatus();
  }

  function schedulePlanningResume() {
    clearTimeout(planningResumeTimer);
    planningResumeTimer = setTimeout(resumePlanningFlow, 1000);
  }

  function togglePlanningOperation() {
    const batch = getPlanningBatch();
    if (planningAiRun) {
      planningAiRun.paused = !planningAiRun.paused;
      if (batch?.active) { batch.paused = planningAiRun.paused; setPlanningBatch(batch); }
      if (!planningAiRun.paused) {
        setOperationStatus("Gerando planejamento...");
        planningAiRun.resume?.();
      } else setOperationStatus("");
      updateOperationStatus();
      return;
    }
    const flow = readStoredJson("assistenteSiapPlanningFlow");
    if (!flow) return togglePlanningBatch();
    flow.paused = !flow.paused;
    if (!flow.paused && ["wait-skill", "wait-content"].includes(flow.stage)) flow.waitStartedAt = Date.now();
    if (!flow.paused && flow.stage === "wait-saeb") flow.saebStartedAt = Date.now();
    sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
    if (batch?.active) { batch.paused = flow.paused; setPlanningBatch(batch); }
    if (flow.paused) clearTimeout(planningResumeTimer);
    updateOperationStatus();
    if (!flow.paused) resumePlanningFlow();
  }

  function stopPlanningOperation() {
    if (planningAiRun) {
      planningAiRun.cancelled = true;
      planningAiRun.resume?.();
      planningAiRun = null;
    }
    clearTimeout(planningResumeTimer);
    setOperationStatus("");
    if (getPlanningBatch()?.active) return stopPlanningBatch();
    stopPlanningFlow("Planejamento interrompido. Nenhuma aula foi salva pelo Assistente.");
  }

  function contextCard() {
    const batch = getPlanningBatch();
    const batchContext = batch?.current ? {
      grade: batch.current.grade || "",
      subject: batch.current.subject || "",
      classroom: batch.current.classroom || ""
    } : {};
    const c = { ...batchContext, ...Object.fromEntries(Object.entries(model.context).filter(([, value]) => value)) };
    if (model.page === "planning-overview") {
      const period = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer")?.selectedOptions?.[0]?.textContent?.trim() || "—";
      return `<section class="cm-card"><h3>Visão geral</h3><div class="cm-context">${pair("Abrangência", "Todas as turmas exibidas")}${pair("Período", period)}</div></section>`;
    }
    if (!c.year && !["diary", "pei-edit"].includes(model.page)) return `<section class="cm-card"><div class="cm-alert">Contexto da turma ausente. Volte ao Diário e selecione uma turma.</div></section>`;
    return `<section class="cm-card"><h3>${c.classroom ? "Contexto confirmado" : "Contexto atual"}</h3><div class="cm-context">
      ${pair("Turma", c.classroom || "Selecione no Diário")}${pair("Disciplina", c.subject || "—")}
      ${pair("Série", c.grade || "—")}${pair("Turno", c.shift || "—")}
      ${pair("Bimestre", c.term || "—")}${pair("Ano", c.year || "—")}
    </div></section>`;
  }

  function workCard(pending, peiControls) {
    if (model.page === "diary") return `<section class="cm-card"><h3>Próximo passo</h3><p>Use os filtros, clique em <strong>Listar</strong>, selecione uma única turma e escolha Conteúdo ou Frequência.</p><p class="cm-note">O assistente aguardará cada atualização do SIAP antes de continuar.</p></section>`;
    if (model.page === "grades") return `<section class="cm-card"><h3>Notas protegidas</h3><div class="cm-alert">O MVP não preenche notas nem envia dados ao SIGE.</div></section>`;
    if (model.page === "remote") return `<section class="cm-card"><h3>Fora do escopo</h3><p>Acesso Remoto permanece somente para consulta.</p></section>`;
    if (model.page === "pei-list") return `<section class="cm-card"><h3>PEI · Etapa 2</h3><p>Filtre e liste os registros no SIAP. Selecione um estudante e clique em <strong>Visualizar</strong> para preparar um rascunho individual.</p><p class="cm-note">O assistente não guarda matrícula, nome, laudo ou diagnóstico.</p></section>`;
    if (model.page === "pei-edit") return peiCard(peiControls);
    if (model.page === "planning-list") return `<section class="cm-card"><h3>Planejamentos</h3><p>Filtre a turma, clique em <strong>Listar</strong>, selecione uma linha e abra <strong>Visualizar</strong>.</p><p class="cm-note">Na próxima tela, datas azuis indicam aulas ainda sem planejamento.</p></section>`;
    if (model.page === "planning-overview") return "";
    if (model.page === "planning-calendar") return planningCalendarCard(pending);
    if (model.page === "planning-lesson") return planningLessonCard();
    if (!["content", "attendance"].includes(model.page)) return `<section class="cm-card"><h3>Sem automação</h3><p>Esta página não possui uma receita aprovada.</p></section>`;
    if (model.page === "content") return contentExecutionCard();
    if (model.page === "attendance") return attendanceExecutionCard();

    const items = pending.slice(0, 5).map((day) => `<label class="cm-item"><input type="checkbox" data-day="${day.iso}" checked><span><strong>${day.label}</strong><small>Azul · aula prevista · até hoje</small></span></label>`).join("");
    const description = model.page === "content"
      ? "Executa somente conteúdos previamente planejados, sem materiais, e valida o salvamento."
      : "Abre cada chamada para revisão de ausências. O professor confirma antes de salvar.";
    return `<section class="cm-card"><h3>${model.page === "content" ? "Conteúdos pendentes" : "Chamadas pendentes"}</h3><p>${description}</p>
      ${pending.length ? `<div class="cm-list">${items}</div>` : `<p class="cm-note">Nenhuma data azul elegível no mês visível.</p>`}
      <label class="cm-check"><input id="cm-dry-run" type="checkbox" checked><span><strong>Simular primeiro</strong><br><small>Nenhuma alteração será realizada.</small></span></label>
      <div class="cm-actions"><button class="cm-btn" data-action="select-all" ${pending.length ? "" : "disabled"}>Selecionar</button><button class="cm-btn cm-primary" data-action="start" ${pending.length ? "" : "disabled"}>${model.page === "attendance" ? "Revisar chamadas" : "Revisar execução"}</button></div>
    </section>`;
  }

  function getContentBatch() {
    try { return JSON.parse(sessionStorage.getItem(CONTENT_BATCH_KEY) || "null"); } catch { return null; }
  }

  function setContentBatch(batch) {
    if (batch) sessionStorage.setItem(CONTENT_BATCH_KEY, JSON.stringify(batch));
    else sessionStorage.removeItem(CONTENT_BATCH_KEY);
    updateOperationStatus();
  }

  function contentExecutionCard() {
    const batch = getContentBatch();
    const selectedMonth = document.getElementById(IDS.month)?.selectedIndex ?? new Date().getMonth();
    if (batch) return `<section class="cm-card"><h3>Executar conteúdos</h3>
      <div class="cm-alert"><strong>${batch.paused ? "Lote pausado" : "Lote em andamento"}</strong><br>${batch.completed || 0} aula(s) concluída(s) · ${batch.skipped || 0} data(s) ignorada(s) · ${escapeHtml(SUPPORT_MATERIALS[batch.materialIndex] || "Material não identificado")}</div>
      <p class="cm-note">${escapeHtml(batch.currentLabel || "Procurando a próxima data pendente nos meses escolhidos.")}${batch.lessonValues?.[batch.lessonIndex] ? ` · ${escapeHtml(batch.lessonValues[batch.lessonIndex])}` : ""}</p>
      <div class="cm-actions"><button class="cm-btn" data-action="content-batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="content-batch-stop">Parar</button></div>
    </section>`;
    const monthChecks = MONTHS.map((month, index) => `<label class="cm-check"><input type="checkbox" data-content-month="${index}" ${index === selectedMonth ? "checked" : ""}><span>${month}</span></label>`).join("");
    const materialRadios = SUPPORT_MATERIALS.map((material, index) => `<label class="cm-check"><input type="radio" name="cm-support-material" data-material-index="${index}" ${index === SUPPORT_MATERIALS.length - 1 ? "checked" : ""}><span>${escapeHtml(material)}</span></label>`).join("");
    return `<section class="cm-card"><h3>Executar conteúdos planejados</h3>
      <p>Escolha os meses e um material de apoio. As aulas pendentes até hoje serão processadas, inclusive em datas com evento.</p>
      <h4>Meses</h4><div class="cm-option-grid">${monthChecks}</div>
      <h4>Material de apoio</h4><div class="cm-option-list">${materialRadios}</div>
      <label class="cm-check"><input id="cm-content-confirm" type="checkbox"><span>Autorizo executar os conteúdos planejados e salvar cada aula das datas selecionadas.</span></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="content-batch-start" disabled>Executar conteúdos selecionados</button></div>
    </section>`;
  }

  function getAttendanceBatch() {
    try { return JSON.parse(sessionStorage.getItem(ATTENDANCE_BATCH_KEY) || "null"); } catch { return null; }
  }

  function setAttendanceBatch(batch) {
    if (batch) sessionStorage.setItem(ATTENDANCE_BATCH_KEY, JSON.stringify(batch));
    else sessionStorage.removeItem(ATTENDANCE_BATCH_KEY);
    updateOperationStatus();
  }

  function attendanceExecutionCard() {
    const batch = getAttendanceBatch();
    const selectedMonth = document.getElementById(IDS.month)?.selectedIndex ?? new Date().getMonth();
    if (batch) return `<section class="cm-card"><h3>Salvar frequências</h3>
      <div class="cm-alert"><strong>${batch.paused ? "Lote pausado" : "Lote em andamento"}</strong><br>${batch.completed || 0} chamada(s) salva(s)</div>
      <p class="cm-note">${escapeHtml(batch.currentLabel || "Procurando a próxima data azul nos meses escolhidos.")}</p>
      <div class="cm-actions"><button class="cm-btn" data-action="attendance-batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="attendance-batch-stop">Parar</button></div>
    </section>`;
    const monthChecks = MONTHS.map((month, index) => `<label class="cm-check"><input type="checkbox" data-attendance-month="${index}" ${index === selectedMonth ? "checked" : ""}><span>${month}</span></label>`).join("");
    return `<section class="cm-card"><h3>Salvar chamadas pendentes</h3>
      <p>Escolha os meses. O assistente salvará cada data azul até hoje exatamente como estiver, sem alterar presença ou falta.</p>
      <h4>Meses</h4><div class="cm-option-grid">${monthChecks}</div>
      <div class="cm-alert">Confira antes de iniciar: o lote considera corretos os estados de frequência já exibidos pelo SIAP.</div>
      <label class="cm-check"><input id="cm-attendance-confirm" type="checkbox"><span>Autorizo salvar as chamadas pendentes dos meses selecionados sem alterar os estudantes.</span></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="attendance-batch-start" disabled>Salvar chamadas selecionadas</button></div>
    </section>`;
  }

  function planningOverviewCard(pending) {
    const period = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer")?.selectedOptions?.[0]?.textContent?.trim() || "período atual";
    const batch = getPlanningBatch();
    const overview = planningOverviewOptions();
    let preview = getPlanningPreview();
    if (preview && preview.signature !== planningOverviewSignature()) {
      setPlanningPreview(null);
      preview = null;
      addLog("A quinzena mudou. A prévia anterior foi descartada para proteger os planejamentos existentes.");
    }
    return `<section class="cm-card"><h3>Planejamento rápido</h3>
      <p><strong>Período:</strong> ${escapeHtml(period)}</p>
      <p><strong>${pending.length}</strong> aula(s) em branco ainda não planejada(s).</p>
      ${pending.length ? "" : `<span class="cm-badge cm-green">Todas as aulas do período estão planejadas</span>`}
      <p class="cm-note">Branco = não planejado. Vermelho = planejado e não validado. A extensão usa as classes internas do SIAP, não apenas a aparência da cor.</p>
      ${batch ? batch.mode === "lesson-sequence" ? `<div class="cm-alert"><strong>${batch.paused ? "Sequência pausada" : "Aplicando planejamentos"}</strong><br>Aula ${escapeHtml(batch.plans?.[batch.index]?.lesson || batch.current?.lesson || "—")} · planejamento ${escapeHtml(Math.min((batch.index || 0) + 1, batch.plans?.length || 1))} de ${escapeHtml(batch.plans?.length || 0)}. ${batch.paused ? escapeHtml(batch.pauseMessage || "Confira a última aula salva antes de continuar.") : "Procurando o próximo quadradinho em branco no SIAP."}</div>
        <div class="cm-actions"><button class="cm-btn" data-action="batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>` : `<div class="cm-alert"><strong>${batch.paused ? "Lote pausado" : "Lote em andamento"}</strong><br>Origem: quinzenas · ${batch.completed || 0} concluído(s) · ${(batch.periods?.length || 0) - (batch.periodIndex || 0)} período(s) restante(s).</div>
        <div class="cm-actions"><button class="cm-btn" data-action="batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>`
        : `${planningBatchSetup(overview, preview)}`}
      <div class="cm-actions"><button class="cm-btn cm-full" data-action="analyze">Atualizar diagnóstico</button></div>
    </section>`;
  }

  function normalizePlanningGroup(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function planningCurriculumKey(payload) {
    return JSON.stringify([
      normalizePlanningGroup(payload.thematicUnit),
      (payload.selectedSkills || []).map(normalizePlanningGroup).sort(),
      (payload.selectedContents || []).map(normalizePlanningGroup).sort(),
      Boolean(payload.saebAvailable),
      (payload.selectedSaeb || []).map(normalizePlanningGroup).sort()
    ]);
  }

  function planningOverviewOptions() {
    const items = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada")]
      .map((block, domIndex) => ({ ...overviewItem(block), domIndex, classCode: block.getAttribute("codigoturma") || "" }));
    const groups = new Map();
    items.forEach((item) => {
      const key = `${normalizePlanningGroup(item.grade)}|${normalizePlanningGroup(item.subject)}`;
      if (!groups.has(key)) groups.set(key, { key, grade: item.grade, subject: item.subject, classes: new Map() });
      const group = groups.get(key);
      const classKey = item.classCode || normalizePlanningGroup(item.classroom);
      if (!group.classes.has(classKey)) group.classes.set(classKey, []);
      group.classes.get(classKey).push(item);
    });
    groups.forEach((group) => group.classes.forEach((lessons) => lessons.sort((a, b) => a.domIndex - b.domIndex)));
    return { items, groups: [...groups.values()] };
  }

  function planningSlotKey(item) {
    return `${item.classCode || canonicalClassroom(item.classroom)}|${item.lesson}|${normalizePlanningGroup(item.grade)}|${normalizePlanningGroup(item.subject)}`;
  }

  function planningSlotsFromDocument(source, periodValue, periodLabel = "") {
    return [...source.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada")]
      .map((block) => ({ ...overviewItem(block), classCode:block.getAttribute("codigoturma") || "", periodValue, periodLabel }))
      .filter((item) => item.lesson && item.classroom && item.grade && item.subject);
  }

  function capturePlanningOverviewSlots() {
    const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!select || !document.getElementById("cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor")) return;
    const previous = readStoredJson("assistenteSiapPlanningSlots") || {};
    const periods = [...select.options].filter((option) => option.value)
      .map((option) => ({ value:option.value, label:option.textContent.trim() }));
    const snapshots = previous.periods?.map((period) => period.value).join("|") === periods.map((period) => period.value).join("|")
      ? previous.snapshots || {} : {};
    snapshots[select.value] = { items:planningSlotsFromDocument(document, select.value, select.selectedOptions?.[0]?.textContent?.trim() || ""), signature:planningOverviewSignature(), capturedAt:Date.now() };
    sessionStorage.setItem("assistenteSiapPlanningSlots", JSON.stringify({ periods, snapshots, lastPeriod:select.value }));
  }

  function planningSlotMatchesContext(item, context) {
    return normalizePlanningGroup(item.grade) === normalizePlanningGroup(context.grade) &&
      normalizePlanningGroup(item.subject) === normalizePlanningGroup(context.subject);
  }

  function planningSlotQueue(cache, origin, count) {
    const periods = cache?.periods || [];
    const start = periods.findIndex((period) => period.value === origin.periodValue);
    if (start < 0) return [];
    const context = { grade:origin.grade, subject:origin.subject };
    const queue = [origin];
    if (count <= 1) return queue;
    const seen = new Set([planningSlotKey(origin)]);
    for (const period of periods.slice(start)) {
      for (const item of cache.snapshots?.[period.value]?.items || []) {
        if (!planningSlotMatchesContext(item, context) || seen.has(planningSlotKey(item))) continue;
        seen.add(planningSlotKey(item));
        queue.push(item);
        if (queue.length >= count) return queue;
      }
    }
    return queue;
  }

  async function fetchPlanningOverviewDocument(periodValue, baseline) {
    const url = new URL("/AcompanhamentoPlanejamentoProfessorListagem.aspx", location.origin);
    const parse = async (response) => {
      if (!response.ok || new URL(response.url).origin !== location.origin) throw new Error("O SIAP não devolveu as quinzenas de planejamento.");
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!page.getElementById("cphFuncionalidade_ddlPeriodoReconhecer") || !page.getElementById("cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor"))
        throw new Error("O SIAP não confirmou a leitura das quinzenas.");
      return page;
    };
    const base = baseline || await parse(await fetch(url, { credentials:"same-origin", cache:"no-store" }));
    const select = base.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!periodValue || select.value === periodValue) return base;
    const form = select.closest("form") || base.querySelector("form");
    if (!form || !select.name || ![...select.options].some((option) => option.value === periodValue))
      throw new Error("Não foi possível consultar a próxima quinzena no SIAP.");
    const body = new URLSearchParams(new FormData(form));
    body.set("__EVENTTARGET", select.name);
    body.set("__EVENTARGUMENT", "");
    body.set(select.name, periodValue);
    const action = new URL(form.getAttribute("action"), url);
    if (action.origin !== location.origin) throw new Error("Destino de quinzena não reconhecido no SIAP.");
    const page = await parse(await fetch(action, { method:"POST", credentials:"same-origin", cache:"no-store",
      headers:{ "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8" }, body:body.toString() }));
    if (page.getElementById("cphFuncionalidade_ddlPeriodoReconhecer")?.value !== periodValue)
      throw new Error("O SIAP não confirmou a troca para a próxima quinzena.");
    return page;
  }

  async function planningSlotsForLesson(context, lesson, count) {
    let cache = readStoredJson("assistenteSiapPlanningSlots");
    const matchesOrigin = (item) => Number(item.lesson) === lesson && planningSlotMatchesContext(item, context) &&
      canonicalClassroom(item.classroom) === canonicalClassroom(context.classroom);
    let origin = cache?.snapshots?.[cache.lastPeriod]?.items?.find(matchesOrigin);
    let baseline;
    if (origin) cache = { ...cache, snapshots:{ [cache.lastPeriod]:cache.snapshots[cache.lastPeriod] } };
    if (!origin) {
      baseline = await fetchPlanningOverviewDocument();
      const select = baseline.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
      const periods = [...select.options].filter((option) => option.value).map((option) => ({ value:option.value, label:option.textContent.trim() }));
      cache = { periods, snapshots:{}, lastPeriod:"" };
      for (const period of periods) {
        const page = await fetchPlanningOverviewDocument(period.value, baseline);
        const items = planningSlotsFromDocument(page, period.value, period.label);
        cache.snapshots[period.value] = { items, capturedAt:Date.now() };
        origin = items.find(matchesOrigin);
        if (origin) { cache.lastPeriod = period.value; break; }
      }
      if (!origin) throw new Error("A aula aberta não aparece em branco nas quinzenas do SIAP. Confira a turma e a aula antes de gerar prévias.");
    }
    let queue = planningSlotQueue(cache, origin, count);
    if (queue.length < count) {
      baseline ||= await fetchPlanningOverviewDocument();
      const start = cache.periods.findIndex((period) => period.value === origin.periodValue);
      for (const period of cache.periods.slice(start + 1)) {
        const page = await fetchPlanningOverviewDocument(period.value, baseline);
        cache.snapshots[period.value] = { items:planningSlotsFromDocument(page, period.value, period.label), capturedAt:Date.now() };
        queue = planningSlotQueue(cache, origin, count);
        if (queue.length >= count) break;
      }
    }
    return queue;
  }

  function getPlanningPreview() {
    try { return JSON.parse(sessionStorage.getItem("assistenteSiapPlanningPreview") || "null"); } catch { return null; }
  }

  function setPlanningPreview(preview) {
    if (preview) sessionStorage.setItem("assistenteSiapPlanningPreview", JSON.stringify(preview));
    else sessionStorage.removeItem("assistenteSiapPlanningPreview");
  }

  function planningBatchSetup(overview, preview) {
    if (!overview.items.length) return "";
    const equivalentMax = Math.max(0, ...overview.groups.map((group) => Math.max(0, ...[...group.classes.values()].map((lessons) => lessons.length))));
    const max = preview?.mode === "individual" ? overview.items.length : equivalentMax;
    const value = Math.min(Math.max(Number(preview?.count) || 1, 1), Math.max(max, 1));
    const draftCards = preview?.drafts ? Object.entries(preview.drafts).map(([key, draft], index) => {
      const lessons = (preview.queue || []).filter((item) => item.planKey === key).map((item) => `${item.classroom} · aula ${item.lesson}`);
      return `<div class="cm-preview-plan"><strong>Planejamento ${index + 1}</strong><small>${escapeHtml(draft.label || key)}</small><small>Quadradinhos: ${escapeHtml(lessons.join("; ") || "aula em leitura")}</small><small>Unidade temática: ${escapeHtml(draft.thematicUnit || "não identificada")}</small><small>Habilidade: ${escapeHtml((draft.selectedSkills || []).join("; ") || "não identificada")}</small><small>Conteúdo: ${escapeHtml((draft.selectedContents || []).join("; ") || "não identificado")}</small>${draft.saebAvailable ? `<small>Matriz SAEB: ${escapeHtml((draft.selectedSaeb || []).join("; ") || "não identificada")}</small>` : ""}<label class="cm-field"><span>Metodologia</span><textarea rows="7" maxlength="1200" data-preview-plan="${escapeHtml(encodeURIComponent(key))}" data-preview-field="2">${escapeHtml(draft.fields?.[2] || "")}</textarea></label><label class="cm-field"><span>Avaliação</span><textarea rows="6" maxlength="800" data-preview-plan="${escapeHtml(encodeURIComponent(key))}" data-preview-field="3">${escapeHtml(draft.fields?.[3] || "")}</textarea></label></div>`;
    }).join("") : "";
    const previewHtml = preview ? `<div class="cm-alert"><strong>Prévia do lote</strong><br>${preview.uniquePlans} planejamento(s) diferente(s) serão aplicados em ${preview.queue.length} aula(s).</div>
      <div class="cm-list">${preview.summary.map((line) => `<div class="cm-item"><span><strong>${escapeHtml(line)}</strong></span></div>`).join("")}</div>
      ${!preview.draftsReady ? `${draftCards}<p class="cm-note">O Assistente abrirá cada quadradinho e escolherá a unidade temática, a habilidade, o conteúdo e a Matriz SAEB, quando houver. As escolhas já feitas em uma aula serão preservadas. Nenhuma aula será salva nesta etapa.</p><div class="cm-actions"><button class="cm-btn" data-action="batch-preview-clear">Alterar</button><button class="cm-btn cm-primary" data-action="batch-draft-preview">Ler aulas e gerar prévia</button></div>` : `${draftCards}<p class="cm-note">Você pode editar os textos diretamente acima. As alterações ficam guardadas nesta prévia.</p><label class="cm-check"><input id="cm-batch-confirm" type="checkbox"><span>${preview.mode === "equivalent" ? "Conferi as metodologias e avaliações. Autorizo preencher e salvar automaticamente somente as aulas brancas listadas." : "Conferi as metodologias e avaliações. Autorizo preencher as aulas listadas; cada aula será revisada antes de salvar."}</span></label><div class="cm-actions"><button class="cm-btn" data-action="batch-preview-clear">Alterar</button><button class="cm-btn cm-primary" data-action="batch-start" disabled>${preview.mode === "equivalent" ? "Aplicar automaticamente" : "Começar pelas aulas da prévia"}</button></div>`}` : `<p>Escolha quantos planejamentos a IA deve preparar nesta quinzena.</p>
      <label class="cm-check"><input type="radio" name="cm-batch-mode" value="equivalent" checked><span><strong>Turmas equivalentes</strong><br><small>Aulas na mesma posição compartilham o texto somente quando habilidade, conteúdo e Matriz SAEB também coincidem.</small></span></label>
      <label class="cm-check"><input type="radio" name="cm-batch-mode" value="individual"><span><strong>Aulas individuais</strong><br><small>Cada quadrado recebe um planejamento diferente.</small></span></label>
      <label class="cm-field"><span>Quantidade de planejamentos</span><input id="cm-batch-count" type="number" min="1" max="${equivalentMax}" value="${Math.min(value, Math.max(equivalentMax, 1))}"><small data-batch-limit>Limite neste modo: ${equivalentMax} planejamento(s), alcançando até ${overview.items.length} aula(s).</small></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="batch-preview">Gerar prévia completa</button></div>`;
    return previewHtml;
  }

  async function startPlanningDraftPreview() {
    const preview = getPlanningPreview();
    const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!preview?.queue?.length || !["equivalent", "individual"].includes(preview.mode) || !select) return addLog("Gere primeiro a prévia dos planejamentos.");
    if (preview.signature !== planningOverviewSignature()) return addLog("A quinzena mudou. Atualize a prévia antes de gerar os textos.");
    if (getPlanningBatch()) return addLog("Conclua ou interrompa o lote atual antes de gerar outra prévia.");
    setPlanningBatch({ active:true, runId:`preview-${Date.now()}-${Math.random()}`, paused:false, autoSave:false, previewOnly:true, phase:"overview", periods:[{ value:select.value, label:select.selectedOptions?.[0]?.textContent?.trim() || "Período atual" }], periodIndex:0, completed:0, totalPreviewCount:preview.queue.length, reviewedGroups:[], current:null, selectedQueue:preview.queue, queueIndex:0, templates:{}, previewMetadata:preview, mode:preview.mode });
    render();
    addLog("Abrindo cada aula da quinzena para ler habilidade e conteúdo antes da prévia. Nenhuma aula será salva.");
    setTimeout(resumePlanningBatch, 100);
  }

  function buildPlanningPreview() {
    const overview = planningOverviewOptions();
    const mode = panel.querySelector('[name="cm-batch-mode"]:checked')?.value === "individual" ? "individual" : "equivalent";
    const requested = Number(panel.querySelector("#cm-batch-count")?.value);
    let queue = [];
    if (mode === "individual") {
      const count = Math.min(Math.max(requested || 1, 1), overview.items.length);
      queue = overview.items.slice(0, count).map((item, index) => ({ ...item, planKey: `individual-${index + 1}`, groupKey:`individual-${index + 1}`, sequenceIndex: index }));
    } else {
      const max = Math.max(0, ...overview.groups.map((group) => Math.max(0, ...[...group.classes.values()].map((lessons) => lessons.length))));
      const count = Math.min(Math.max(requested || 1, 1), max);
      overview.groups.forEach((group) => {
        for (let position = 0; position < count; position += 1) {
          group.classes.forEach((lessons) => {
            const item = lessons[position];
            if (item) queue.push({ ...item, planKey: `${group.key}|${position + 1}|${item.classCode || item.domIndex}`, groupKey:`${group.key}|${position + 1}`, sequenceIndex: position });
          });
        }
      });
    }
    if (!queue.length) return addLog("Nenhuma aula em branco foi encontrada para a prévia.");
    const uniquePlans = new Set(queue.map((item) => item.planKey)).size;
    const summary = [...new Map(queue.map((item) => [`${item.grade}|${item.subject}`, item])).values()].map((item) => {
      const matches = queue.filter((entry) => entry.grade === item.grade && entry.subject === item.subject);
      return `${item.grade} · ${item.subject}: ${new Set(matches.map((entry) => entry.planKey)).size} planejamento(s) em ${matches.length} aula(s)`;
    });
    setPlanningPreview({ mode, count: requested, queue, uniquePlans, summary, signature: planningOverviewSignature() });
    addLog("Preparando metodologias e avaliações para conferência. Nenhuma aula será salva.");
    return startPlanningDraftPreview();
  }

  function updatePlanningPreviewDraft(event) {
    const input = event.currentTarget;
    const preview = getPlanningPreview();
    let key = "";
    try { key = decodeURIComponent(input.dataset.previewPlan || ""); } catch { key = ""; }
    const fieldIndex = Number(input.dataset.previewField);
    if (!preview?.drafts?.[key]?.fields || ![2, 3].includes(fieldIndex)) return;
    preview.drafts[key].fields[fieldIndex] = input.value.trim();
    preview.edited = true;
    setPlanningPreview(preview);
  }

  function planningCalendarCard(pending) {
    return `<section class="cm-card"><h3>Aulas sem planejamento</h3>
      <p><strong>${pending.length}</strong> aula(s) azul(is) até hoje. Clique em uma data azul no calendário para abrir a aula.</p>
      <p class="cm-note">As datas verdes já possuem planejamento e ficam protegidas contra repetição.</p>
    </section>`;
  }

  function revisaCatalogForCurrentLesson() {
    const context = readContext();
    const termKey = /\b3\s*[º°ªo]?\s*bim/i.test(context.term || "") ? "b3" : /\b4\s*[º°ªo]?\s*bim/i.test(context.term || "") ? "b4" : "";
    if (!termKey) return null;
    const subject = String(context.subject || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const subjectKey = subject.includes("PORTUGUES") ? "lp" : subject.includes("MATEMATICA") ? "math" :
      subject.includes("HISTORIA") ? "history" : subject.includes("GEOGRAFIA") ? "geography" :
      subject.includes("SOCIOLOGIA") ? "sociology" : subject.includes("FILOSOFIA") ? "philosophy" :
      subject.includes("BIOLOGIA") ? "biology" : subject.includes("QUIMICA") ? "chemistry" :
      subject.includes("FISICA") && !subject.includes("EDUCACAO") ? "physics" :
      subject.includes("CIENCIAS") ? "science" : "";
    const grade = String(context.grade || "");
    const gradeKey = /^[6789]\s*[ºª°o]?\s*ano/i.exec(grade)?.[0]?.[0] || (/^[123]\s*[ªº°o]?\s*serie/i.exec(grade.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))?.[0]?.[0] || "");
    const catalog = typeof window === "undefined" ? null : window.AssistenteSiapRevisaSkills;
    const extraCatalog = typeof window === "undefined" ? null : window.AssistenteSiapRevisaExtraSkills;
    const skills = termKey === "b4" && (subjectKey === "lp" || subjectKey === "math")
      ? catalog?.[gradeKey]?.[subjectKey]
      : extraCatalog?.[termKey]?.[gradeKey]?.[subjectKey];
    return Array.isArray(skills) && skills.length ? { termKey, gradeKey, subjectKey, skills } : null;
  }

  function selectedRevisaSkills() {
    const catalog = revisaCatalogForCurrentLesson();
    if (!catalog) return [];
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem("assistenteSiapRevisaSelection") || "null"); } catch { saved = null; }
    if (saved?.signature !== planningSignature() || saved.gradeKey !== catalog.gradeKey || saved.subjectKey !== catalog.subjectKey || (saved.termKey || "b4") !== catalog.termKey) return [];
    const byCode = new Map(catalog.skills.map((skill) => [skill.code, skill]));
    return [...new Set(Array.isArray(saved.codes) ? saved.codes : [])].map((code) => byCode.get(code)).filter(Boolean);
  }

  function revisaSkillPicker(locked = false) {
    const catalog = revisaCatalogForCurrentLesson();
    if (!catalog) {
      const context = readContext();
      const subject = String(context.subject || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (!/\b[34]\s*[º°ªo]?\s*bim/i.test(context.term || "") || !/PORTUGUES|MATEMATICA|HISTORIA|GEOGRAFIA|SOCIOLOGIA|FILOSOFIA|BIOLOGIA|QUIMICA|CIENCIAS|FISICA/.test(subject) || subject.includes("EDUCACAO FISICA") || !context.grade) return "";
      return `<p class="cm-revisa-unavailable">Revisa Goiás · ${escapeHtml(context.grade)}: caderno do professor deste bimestre e disciplina ainda não cadastrado. Envie o PDF para habilitar as habilidades.</p>`;
    }
    const selected = selectedRevisaSkills();
    const chosen = new Set(selected.map((skill) => skill.code));
    return `<div class="cm-revisa-picker"><details id="cm-revisa-details"><summary class="cm-revisa-toggle">Habilidades do Revisa Goiás · ${catalog.termKey === "b3" ? "3º" : "4º"} bimestre <span>${selected.length ? `${selected.length} selecionada(s)` : "Escolher"}</span></summary>
      <div class="cm-revisa-list" role="group" aria-label="Habilidades do Revisa Goiás">
        ${catalog.skills.map((skill) => `<button type="button" class="cm-revisa-skill" data-revisa-code="${escapeHtml(skill.code)}" ${chosen.has(skill.code) || locked ? "disabled" : ""}><strong>${chosen.has(skill.code) ? "✓ " : ""}${escapeHtml(skill.code)}</strong><span>${escapeHtml(skill.description)}</span><small>${skill.kind === "recomposition" ? "Recomposição" : "Currículo"}</small></button>`).join("")}
      </div></details>
      ${selected.length ? `<div class="cm-revisa-selected">${selected.map((skill) => `<span>${escapeHtml(skill.code)}${locked ? "" : ` <button type="button" data-revisa-remove="${escapeHtml(skill.code)}" aria-label="Remover ${escapeHtml(skill.code)}">×</button>`}</span>`).join("")}</div>` : ""}
      <p class="cm-note">${locked ? "Para mudar as habilidades, descarte as prévias e gere novamente. " : ""}Caderno do professor · 2026. Em várias aulas, cada habilidade escolhida será usada em uma prévia; o Assistente completará as demais sem repetir. Sem escolha manual, ele distribuirá as habilidades do caderno automaticamente. As habilidades do SIAP continuam independentes.</p></div>`;
  }

  function methodologyWithRevisaSkills(value, skills, shorter = false) {
    const concise = conciseMethodologyText(value, shorter);
    if (!skills?.length) return concise;
    const codes = skills.map((skill) => skill.code).join(", ");
    const suffix = `Habilidades do Revisa Goiás: ${codes}.`;
    const base = concisePlanningText(concise, 2, shorter ? 26 : 36);
    return `${base} ${suffix}`.trim();
  }

  function revisaSkillsForSequence(selected, available, index) {
    const unique = [...new Map([...selected, ...available].map((skill) => [skill.code, skill])).values()];
    return unique[index] ? [unique[index]] : [];
  }

  function completeEvaluationText(value, shorter = false) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!/[.!?]$/.test(text) || /\b(?:de|do|da|dos|das|em|com|por|para|e|ou)\s*[.!?]$/i.test(text)) return "";
    return shorter ? (text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text) : text;
  }

  function planningObjectiveTopics() {
    const selected = selectedPlanningObjectives();
    const available = planningLinks("content").map((link) => (link.textContent || link.getAttribute("title") || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return [...new Map([...selected, ...available].map((topic) => [normalizePlanningGroup(topic), topic])).values()];
  }

  function selectedPlanningObjectives() {
    return [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"] .cabecalhoConteudo span')]
      .map((span) => (span.getAttribute("title") || span.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  function selectedPlanningSkills() {
    return [...document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr")]
      .filter((row) => !row.querySelector?.("th"))
      .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  function planningSelectionSnapshot() {
    return { skills:selectedPlanningSkills(), objectives:selectedPlanningObjectives(), saeb:selectedPlanningSaeb() };
  }

  function samePlanningChoices(actual, expected, available = []) {
    const normalize = (choices) => (choices || []).filter(Boolean).map(normalizePlanningGroup);
    const actualLabels = normalize(actual);
    const expectedLabels = normalize(expected);
    const availableLabels = normalize(available);
    if (actualLabels.length !== expectedLabels.length) return false;
    const unmatched = [...actualLabels];
    for (const label of expectedLabels) {
      const exact = unmatched.indexOf(label);
      const hierarchical = exact < 0 && availableLabels.filter((choice) => choice === label).length === 1
        ? unmatched.findIndex((choice) => choice.startsWith(`${label} > `)) : -1;
      const index = exact >= 0 ? exact : hierarchical;
      if (index < 0) return false;
      unmatched.splice(index, 1);
    }
    return true;
  }

  function lessonMultiPreviewIsCurrent(preview) {
    if (!preview || preview.signature !== planningSignature() || !preview.sourceSelection ||
      !preview.plans?.length || preview.plans.some((plan) => !Array.isArray(plan.skills) || !Array.isArray(plan.objectives))) return false;
    if ((selectedPlanningSaeb().length || planningLinks("saeb").length) &&
      (!Array.isArray(preview.sourceSelection.saeb) || preview.plans.some((plan) => !Array.isArray(plan.saeb) || !plan.saeb.length))) return false;
    const actual = planningSelectionSnapshot();
    return JSON.stringify((preview.revisaCodes || [])) === JSON.stringify(selectedRevisaSkills().map((skill) => skill.code)) &&
      ["skills", "objectives", "saeb"].every((key) =>
      JSON.stringify((actual[key] || []).map(normalizePlanningGroup)) ===
      JSON.stringify((preview.sourceSelection[key] || []).map(normalizePlanningGroup)));
  }

  function planningTopicForSequence(available, index, selected = []) {
    const options = [...new Map(available.filter(Boolean).map((value) => [normalizePlanningGroup(value), value])).values()];
    if (!options.length) return selected[0] || "";
    const matches = (value, option) => samePlanningChoices([value], [option], available);
    const remaining = options.filter((option) => !selected.some((value) => matches(value, option)));
    if (selected.length && index === 0) return selected[0];
    if (!remaining.length) return selected[0] || options[index % options.length];
    return remaining[(index - (selected.length ? 1 : 0) + remaining.length) % remaining.length];
  }

  function getLessonMultiPreview() {
    return readStoredJson("assistenteSiapLessonMultiPreview");
  }

  function getReusableLessonPlans() {
    return readStoredJson("assistenteSiapReusableLessonPlans");
  }

  function concisePlanningText(value, maxSentences, maxWords) {
    const sentences = String(value || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) || [];
    let result = sentences.slice(0, maxSentences).map((sentence) => sentence.trim()).join(" ").trim();
    const words = result.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) result = `${words.slice(0, maxWords).join(" ").replace(/[,;:]+$/, "")}.`;
    return result;
  }

  function conciseMethodologyText(value, shorter = false) {
    return concisePlanningText(value, 3, shorter ? 30 : 45);
  }

  function updateLessonMultiProgress(completed, total, state = "running") {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
    const previous = model.lessonMultiProgress;
    if (previous?.state === "running" && state === "running" && previous.total === safeTotal) completed = Math.max(safeCompleted, previous.completed);
    else completed = safeCompleted;
    total = safeTotal;
    model.lessonMultiProgress = { completed, total, state };
    const progress = panel.querySelector("#cm-multi-progress");
    if (!progress) return;
    const percentage = Math.round((completed / total) * 100);
    progress.hidden = false;
    progress.dataset.state = state;
    progress.querySelector(".cm-multi-progress-label").textContent = state === "complete" ? "✓ Prévias concluídas" : state === "error" ? "Geração interrompida" : "Gerando prévias";
    progress.querySelector(".cm-multi-progress-count").textContent = `${completed} de ${total} · ${percentage}%`;
    const bar = progress.querySelector("[role='progressbar']");
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(completed));
    bar.querySelector(".cm-multi-progress-fill").style.width = `${percentage}%`;
  }

  function lessonMultiPreviewCard(preview, currentLesson, topics, batch) {
    if (batch?.mode === "lesson-sequence") return `<div class="cm-alert"><strong>${batch.paused ? (batch.phase === "manual" ? "Execução interrompida no SIAP" : "Sequência pausada") : "Aplicando planejamentos"}</strong><br>Aula ${escapeHtml(batch.current?.lesson || currentLesson)} · planejamento ${escapeHtml(Math.min((batch.index || 0) + 1, batch.plans?.length || 1))} de ${escapeHtml(batch.plans?.length || 0)}. ${batch.paused && batch.phase === "manual" ? escapeHtml(batch.pauseMessage || "Veja o motivo em Atividade desta página.") : "As prévias já foram revisadas; cada aula será aplicada em sequência."}</div><div class="cm-actions"><button class="cm-btn" data-action="batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>`;
    const valid = lessonMultiPreviewIsCurrent(preview);
    const reusable = getReusableLessonPlans();
    const context = readContext();
    const thematicUnit = document.getElementById("ddlEixo")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const canReuse = !valid && reusable?.plans?.length && reusable.plans.every((plan) => Array.isArray(plan.skills) && Array.isArray(plan.objectives) &&
      canonicalClassroom(plan.classroom) === canonicalClassroom(reusable.plans[0].classroom)) &&
      normalizePlanningGroup(reusable.grade) === normalizePlanningGroup(context.grade) &&
      normalizePlanningGroup(reusable.subject) === normalizePlanningGroup(context.subject) &&
      normalizePlanningGroup(reusable.thematicUnit) === normalizePlanningGroup(thematicUnit) &&
      canonicalClassroom(reusable.classroom) !== canonicalClassroom(context.classroom) &&
      reusable.plans.every((plan) => topics.some((topic) => normalizePlanningGroup(topic) === normalizePlanningGroup(plan.topic)));
    return `<h4 class="cm-plan-section-title">Planejar várias aulas</h4>
      <p class="cm-note">A partir da aula ${escapeHtml(currentLesson)} · ${topics.length} objetivo(s) disponível(is) no SIAP.</p>
      ${valid ? `<div id="cm-multi-progress" class="cm-multi-progress" data-state="complete" role="status"><div class="cm-multi-progress-heading"><span class="cm-multi-progress-label">✓ Prévias concluídas</span><strong class="cm-multi-progress-count">${preview.plans.length} de ${preview.plans.length} · 100%</strong></div><div class="cm-multi-progress-track" role="progressbar" aria-label="Prévias concluídas" aria-valuemin="0" aria-valuemax="${preview.plans.length}" aria-valuenow="${preview.plans.length}"><div class="cm-multi-progress-fill" style="width:100%"></div></div></div><div class="cm-alert"><strong>${preview.plans.length} prévia(s) editável(is)</strong><br>Quadradinhos previstos: ${preview.plans.map((plan) => `${escapeHtml(plan.classroom)} · aula ${escapeHtml(plan.lesson)}`).join("; ")}. Confira os objetivos e textos antes de aplicar.</div><div class="cm-actions"><button class="cm-btn" data-action="multi-preview-clear" title="Apaga estas prévias e permite escolher outra quantidade de aulas.">Alterar quantidade</button><button class="cm-btn" data-action="multi-preview-discard" title="Exclui as prévias desta aba sem modificar aulas já salvas no SIAP.">Descartar prévias</button></div>${preview.plans.every((plan) => canonicalClassroom(plan.classroom) === canonicalClassroom(preview.plans[0].classroom)) ? `<div class="cm-actions"><button class="cm-btn cm-full" data-action="multi-reuse-save">Guardar para outra turma compatível</button></div>` : ""}<p id="cm-multi-feedback" class="cm-multi-feedback" role="status" hidden></p>` : `<label class="cm-field cm-multi-count-field"><span>Quantidade de aulas</span><span class="cm-multi-stepper"><button type="button" data-action="multi-count-down" aria-label="Diminuir quantidade de aulas">−</button><input id="cm-multi-count" type="number" min="1" max="20" value="1" aria-label="Quantidade de aulas"><button type="button" data-action="multi-count-up" aria-label="Aumentar quantidade de aulas">+</button></span><small>Até 20 quadradinhos brancos da mesma série e disciplina, começando pela aula ${escapeHtml(currentLesson)}. O Assistente consulta as próximas quinzenas quando necessário. Nenhuma aula é salva ao gerar as prévias.</small></label><div id="cm-multi-progress" class="cm-multi-progress" data-state="running" role="status" hidden><div class="cm-multi-progress-heading"><span class="cm-multi-progress-label">Gerando prévias</span><strong class="cm-multi-progress-count">0 de 1 · 0%</strong></div><div class="cm-multi-progress-track" role="progressbar" aria-label="Prévias geradas" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"><div class="cm-multi-progress-fill" style="width:0%"></div></div></div><div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="multi-preview-generate" ${topics.length ? "" : "disabled"}>Gerar prévias editáveis</button></div>${canReuse ? `<div class="cm-actions"><button class="cm-btn cm-full" data-action="multi-reuse-load">Carregar ${reusable.plans.length} aula(s) da turma ${escapeHtml(reusable.classroom)}</button></div>` : ""}`}`;
  }

  function lessonMultiPreviewDetails(preview) {
    if (!lessonMultiPreviewIsCurrent(preview) || !preview.plans?.length) return "";
    return `<div class="cm-multi-preview-details"><h4 class="cm-plan-section-title">Prévias editáveis</h4>
      ${preview.plans.map((plan, index) => `<article class="cm-preview-plan"><strong>${escapeHtml(plan.classroom)} · Aula ${escapeHtml(plan.lesson)}</strong><small>${escapeHtml(plan.grade)} · ${escapeHtml(plan.subject)}${plan.periodLabel ? ` · ${escapeHtml(plan.periodLabel)}` : ""}</small><div class="cm-preview-curriculum"><span>Habilidade${(plan.skills || [plan.skill]).filter(Boolean).length > 1 ? "s" : ""} ${plan.skillSource === "teacher" ? "escolhida pelo professor" : plan.skillSource === "mixed" ? "do professor + escolha do Assistente" : "selecionada pelo Assistente"}</span><p>${escapeHtml((plan.skills || [plan.skill]).filter(Boolean).join(" · ") || "Não identificada")}</p><span>Objetivo${(plan.objectives || [plan.topic]).filter(Boolean).length > 1 ? "s" : ""} ${plan.objectiveSource === "teacher" ? "escolhido pelo professor" : plan.objectiveSource === "mixed" ? "do professor + escolha do Assistente" : "selecionado pelo Assistente"}</span><p>${escapeHtml((plan.objectives || [plan.topic]).filter(Boolean).join(" · "))}</p>${plan.saeb?.length ? `<span>Matriz SAEB ${plan.saebSource === "teacher" ? "selecionada pelo professor" : "selecionada pelo Assistente"}</span><p>${escapeHtml(plan.saeb.join(" · "))}</p>` : ""}${plan.revisaSkills?.length ? `<span>Habilidades do Revisa Goiás ${plan.revisaSource === "assistant" ? "selecionadas pelo Assistente" : "escolhidas pelo professor"}</span><p>${escapeHtml(plan.revisaSkills.map((skill) => `${skill.code} — ${skill.description}`).join(" · "))}</p>` : ""}</div><label class="cm-field"><span>Metodologia</span><textarea rows="4" maxlength="1200" data-multi-index="${index}" data-multi-field="2">${escapeHtml(plan.fields[2])}</textarea></label><label class="cm-field"><span>Avaliação</span><textarea rows="3" maxlength="800" data-multi-index="${index}" data-multi-field="3">${escapeHtml(plan.fields[3])}</textarea></label></article>`).join("")}</div>`;
  }

  function clearLessonMultiPreview() {
    const count = getLessonMultiPreview()?.plans?.length || 1;
    sessionStorage.removeItem("assistenteSiapLessonMultiPreview");
    model.lessonMultiProgress = null;
    model.planningActionFeedback = "";
    render();
    const input = panel.querySelector("#cm-multi-count");
    if (input) {
      input.value = String(count);
      input.scrollIntoView({ block:"center", behavior:"smooth" });
      input.focus({ preventScroll:true });
    }
  }

  function discardLessonMultiPreview() {
    sessionStorage.removeItem("assistenteSiapLessonMultiPreview");
    model.lessonMultiProgress = null;
    model.planningActionFeedback = "";
    render();
    addLog("Prévias descartadas nesta aba. Nenhuma aula do SIAP foi alterada.");
  }

  async function generateLessonMultiPreview() {
    if (model.lessonMultiProgress?.state === "running") return;
    model.planningActionFeedback = "";
    const currentLesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value);
    const requestedCount = Number(panel.querySelector("#cm-multi-count")?.value);
    const topics = planningObjectiveTopics();
    if (!Number.isInteger(currentLesson) || currentLesson < 1 || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20 || !topics.length) {
      return addLog("Informe de 1 a 20 aulas e confira os objetivos disponíveis no SIAP.");
    }
    const signature = planningSignature();
    const context = readContext();
    const selectedAxis = document.getElementById("ddlEixo");
    const thematicUnit = selectedAxis?.selectedOptions?.[0]?.textContent?.trim() || "";
    const thematicUnitValue = selectedAxis?.value || "";
    const sourceSelection = planningSelectionSnapshot();
    const availableSkills = planningLinks("skill").map((link) => (link.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const availableObjectives = planningLinks("content").map((link) => (link.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const fallbackSkill = sourceSelection.skills[0] || availableSkills[0] || "";
    if (!fallbackSkill) return addLog("Não foi possível identificar uma habilidade para as prévias. Confira as opções do SIAP.");
    const selectedSaeb = sourceSelection.saeb;
    const availableSaeb = [...new Map(planningLinks("saeb").map((link) => (link.textContent || "").replace(/\s+/g, " ").trim())
      .filter((label) => /\bD\s*\d+\s*[-–:]/i.test(label)).map((label) => [normalizePlanningGroup(label), label])).values()];
    const concisePlanning = panel.querySelector('[data-plan-option="concisePlanning"]')?.getAttribute("aria-pressed") === "true";
    const conciseMethodology = concisePlanning || panel.querySelector('[data-plan-option="conciseMethodology"]')?.getAttribute("aria-pressed") === "true";
    const conciseEvaluation = concisePlanning || panel.querySelector('[data-plan-option="conciseEvaluation"]')?.getAttribute("aria-pressed") === "true";
    const guidance = panel.querySelector("#cm-plan-guidance")?.value.trim() || "";
    const revisaSkills = selectedRevisaSkills();
    const revisaCodes = revisaSkills.map((skill) => skill.code);
    if (`Habilidades do Revisa Goiás: ${revisaCodes.join(", ")}.`.length > 800) return addLog("Há habilidades do Revisa demais para o campo de metodologia do SIAP. Reduza a seleção antes de gerar as prévias.");
    const button = panel.querySelector('[data-action="multi-preview-generate"]');
    if (button) button.disabled = true;
    updateLessonMultiProgress(0, requestedCount);
    let completed = 0;
    let count = requestedCount;
    try {
      const slots = await planningSlotsForLesson(context, currentLesson, requestedCount);
      if (!slots.length) throw new Error("Nenhum quadradinho em branco foi encontrado para esta série e disciplina.");
      count = slots.length;
      const revisaCatalog = revisaCatalogForCurrentLesson();
      if (revisaCatalog && count > new Set(revisaCatalog.skills.map((skill) => skill.code)).size)
        throw new Error("O caderno Revisa Goiás tem menos habilidades distintas do que aulas solicitadas. Reduza a quantidade para manter uma habilidade diferente por aula.");
      updateLessonMultiProgress(0, count);
      const plans = new Array(count);
      let nextIndex = 0;
      await Promise.all(Array.from({ length:Math.min(2, count) }, async () => {
        while (nextIndex < count) {
          const index = nextIndex++;
          const slot = slots[index];
          const topic = planningTopicForSequence(availableObjectives, index, sourceSelection.objectives);
          const skill = planningTopicForSequence(availableSkills, index, sourceSelection.skills);
          const objectives = index === 0 && sourceSelection.objectives.length ? [...sourceSelection.objectives] : [topic];
          const skills = index === 0 && sourceSelection.skills.length ? [...sourceSelection.skills] : [skill || fallbackSkill];
          const planSaeb = selectedSaeb.length ? [...selectedSaeb] : availableSaeb.length ? [availableSaeb[index % availableSaeb.length]] : [];
          const planRevisaSkills = count === 1 && revisaSkills.length ? revisaSkills : revisaSkillsForSequence(revisaSkills, revisaCatalog?.skills || [], index);
          const planRevisaCodes = planRevisaSkills.map((item) => item.code);
          const draftPayload = {
            kind:"planning", grade:slot.grade || "", subject:slot.subject || "", period:context.term || "",
            thematicUnit,
            lessonSequence:Number(slot.lesson), selectedSkills:skills, selectedContents:objectives,
            selectedSaeb:planSaeb, saebAvailable:Boolean(availableSaeb.length || planSaeb.length),
            guidance:[guidance, planRevisaSkills.length ? `Integre à metodologia a habilidade do Revisa Goiás ${planRevisaCodes.join(", ")}, conforme o contexto educacional enviado. Mantenha as ações da aula objetivas.` : "", `Escreva a metodologia em até três frases e ${conciseMethodology ? 30 : 45} palavras.`,
              index >= topics.length ? "Aprofunde este objetivo em relação às aulas anteriores." : ""].filter(Boolean).join(" "),
            educationalContext:planRevisaSkills.length ? `Habilidade do caderno do professor Revisa Goiás, ${revisaCatalogForCurrentLesson()?.termKey === "b3" ? "3º" : "4º"} bimestre de 2026: ${planRevisaSkills.map((item) => `${item.code} — ${item.description}`).join("; ")}` : "",
            conciseMethodology, conciseEvaluation, tense:"planned"
          };
          let fields = [];
          for (let attempt = 0; attempt < 2; attempt++) {
            const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_AI_DRAFT", payload:attempt
              ? { ...draftPayload, guidance:`${draftPayload.guidance} A avaliação anterior terminou incompleta. Entregue uma frase completa, com procedimento e aprendizagem a observar.` }
              : draftPayload });
            if (!result?.ok || !Array.isArray(result.fields) || result.fields.length !== 4) throw new Error(result?.message || `Falha na prévia da aula ${slot.lesson} da turma ${slot.classroom}.`);
            fields = result.fields.map((field) => String(field || "").trim());
            fields[3] = completeEvaluationText(fields[3], conciseEvaluation);
            if (fields[3]) break;
          }
          if (!fields[3]) throw new Error(`A avaliação da aula ${slot.lesson} veio incompleta. Nenhuma aula foi salva.`);
          if (concisePlanning) fields[1] = concisePlanningText(fields[1], 1, 30);
          fields[2] = methodologyWithRevisaSkills(fields[2], planRevisaSkills, conciseMethodology);
          plans[index] = { lesson:Number(slot.lesson), periodValue:slot.periodValue, periodLabel:slot.periodLabel || "", classCode:slot.classCode || "", topic, objectives, objectiveSource:index === 0 && sourceSelection.objectives.length ? "teacher" : "assistant", skill:skill || skills[0], skills, skillSource:index === 0 && sourceSelection.skills.length ? "teacher" : "assistant", saeb:planSaeb, saebSource:selectedSaeb.length ? "teacher" : planSaeb.length ? "assistant" : "none", revisaSkills:planRevisaSkills, revisaSource:index < revisaSkills.length ? "teacher" : planRevisaSkills.length ? "assistant" : "none", thematicUnit, thematicUnitValue, grade:slot.grade, subject:slot.subject, classroom:slot.classroom, fields };
          updateLessonMultiProgress(++completed, count);
        }
      }));
      if (signature !== planningSignature() || JSON.stringify(revisaCodes) !== JSON.stringify(selectedRevisaSkills().map((skill) => skill.code)) || ["skills", "objectives", "saeb"].some((key) => JSON.stringify(sourceSelection[key].map(normalizePlanningGroup)) !== JSON.stringify(planningSelectionSnapshot()[key].map(normalizePlanningGroup)))) throw new Error("A aula ou as escolhas mudaram durante a geração. Gere as prévias novamente.");
      sessionStorage.setItem("assistenteSiapLessonMultiPreview", JSON.stringify({ signature, sourceSelection, revisaCodes, plans, guidance, concisePlanning, conciseMethodology, conciseEvaluation }));
      updateLessonMultiProgress(count, count, "complete");
      render();
      addLog(`${plans.length} prévia(s) gerada(s) para quadradinhos em branco${count < requestedCount ? `; havia somente ${count} aula(s) disponível(is) nesta e nas próximas quinzenas` : ""}. Nenhuma aula foi salva.`);
    } catch (error) {
      updateLessonMultiProgress(completed || 0, count, "error");
      addLog(error?.message || "Não foi possível gerar as prévias. Nenhuma aula foi salva.");
    } finally {
      setOperationStatus("");
      if (button?.isConnected) button.disabled = false;
    }
  }

  function saveReusableLessonPlans() {
    const preview = getLessonMultiPreview();
    if (!preview?.plans?.length || preview.signature !== planningSignature()) return addLog("Revise as prévias desta aula antes de guardá-las.");
    if (!preview.plans.every((plan) => canonicalClassroom(plan.classroom) === canonicalClassroom(preview.plans[0].classroom)))
      return addLog("As prévias abrangem turmas diferentes e não podem ser reutilizadas como sequência de uma única turma.");
    const first = preview.plans[0];
    sessionStorage.setItem("assistenteSiapReusableLessonPlans", JSON.stringify({
      grade:first.grade, subject:first.subject, classroom:first.classroom, thematicUnit:first.thematicUnit, plans:preview.plans,
      guidance:preview.guidance, concisePlanning:preview.concisePlanning,
      conciseMethodology:preview.conciseMethodology, conciseEvaluation:preview.conciseEvaluation
    }));
    addLog(`${preview.plans.length} planejamento(s) guardado(s) nesta aba para outra turma compatível.`);
    const feedback = panel.querySelector("#cm-multi-feedback");
    if (feedback) {
      feedback.textContent = `✓ ${preview.plans.length} planejamento(s) guardado(s) para outra turma compatível.`;
      feedback.hidden = false;
    }
  }

  function loadReusableLessonPlans() {
    const reusable = getReusableLessonPlans();
    if (reusable?.plans?.length && !reusable.plans.every((plan) => canonicalClassroom(plan.classroom) === canonicalClassroom(reusable.plans[0].classroom)))
      return addLog("Este lote guardado abrange turmas diferentes e não pode ser carregado como sequência de uma turma.");
    const context = readContext();
    const topics = planningObjectiveTopics().map(normalizePlanningGroup);
    const thematicUnit = document.getElementById("ddlEixo")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const skills = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr")].map((row) => row.textContent.trim())
      .concat(planningLinks("skill").map((link) => link.textContent.trim())).map(normalizePlanningGroup);
    const valid = reusable?.plans?.length && reusable.plans.every((plan) => Array.isArray(plan.skills) && Array.isArray(plan.objectives)) &&
      normalizePlanningGroup(reusable.grade) === normalizePlanningGroup(context.grade) &&
      normalizePlanningGroup(reusable.subject) === normalizePlanningGroup(context.subject) &&
      normalizePlanningGroup(reusable.thematicUnit) === normalizePlanningGroup(thematicUnit) &&
      canonicalClassroom(reusable.classroom) !== canonicalClassroom(context.classroom) &&
      reusable.plans.every((plan) => topics.includes(normalizePlanningGroup(plan.topic)) &&
        (!plan.skill || skills.includes(normalizePlanningGroup(plan.skill))));
    if (!valid) return addLog("Esta turma não apresenta a mesma série, disciplina, habilidade e objetivos do lote guardado.");
    const currentLesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value);
    if (!Number.isInteger(currentLesson) || currentLesson < 1) return addLog("Número da aula não identificado no SIAP.");
    const plans = reusable.plans.map((plan, index) => ({ ...plan, lesson:currentLesson + index, classroom:context.classroom }));
    sessionStorage.setItem("assistenteSiapLessonMultiPreview", JSON.stringify({
      signature:planningSignature(), sourceSelection:planningSelectionSnapshot(), plans, guidance:reusable.guidance,
      concisePlanning:reusable.concisePlanning, conciseMethodology:reusable.conciseMethodology,
      conciseEvaluation:reusable.conciseEvaluation
    }));
    render();
    addLog(`${plans.length} prévia(s) carregada(s) para a turma ${context.classroom}. Revise antes de aplicar.`);
  }

  function planningLessonCard() {
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
    const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
    const saebCount = selectedPlanningSaeb().length;
    const saebAvailable = Boolean(saebCount || planningLinks("saeb").length);
    const ready = methodology instanceof HTMLTextAreaElement && evaluation instanceof HTMLTextAreaElement;
    const batch = getPlanningBatch();
    const preview = getLessonMultiPreview();
    const hasMultiPreview = !batch && lessonMultiPreviewIsCurrent(preview) && Boolean(preview.plans?.length);
    const savedGuidance = readStoredJson("assistenteSiapPlanningGuidanceDraft");
    const guidanceDraft = savedGuidance?.signature === planningSignature() ? savedGuidance : {};
    const guidanceLines = String(guidanceDraft.value || "").split(/\r?\n/);
    const legacyMethodology = guidanceLines.some((line) => line.trim().toLowerCase() === "faça a metodologia curta e sucinta.");
    const legacyEvaluation = guidanceLines.some((line) => line.trim().toLowerCase() === "faça a avaliação curta e sucinta.");
    const guidanceText = guidanceLines.filter((line) => !["faça a metodologia curta e sucinta.", "faça a avaliação curta e sucinta."].includes(line.trim().toLowerCase())).join("\n").trim();
    return `<section class="cm-card"><h3>Assistente de planejamento</h3>
      ${batch && batch.mode !== "lesson-sequence" ? `<div class="cm-alert"><strong>${batch.previewOnly ? "Gerando somente a prévia — nenhuma aula será salva" : (batch.paused ? "Aguardando sua revisão" : "Lote em andamento")}</strong><br>${escapeHtml(batch.current?.grade || "")} · ${escapeHtml(batch.current?.subject || "")} · ${escapeHtml(batch.current?.classroom || "")} · Aula ${escapeHtml(batch.current?.lesson || "")}</div>
      ${batch.paused && batch.phase === "review" ? `<label class="cm-check"><input id="cm-batch-lesson-confirm" type="checkbox"><span>Revisei habilidade, conteúdo, descrição, metodologia e avaliação desta aula.</span></label>` : ""}
      <div class="cm-actions"><button class="cm-btn" data-action="batch-toggle" ${batch.paused && batch.phase === "review" ? "disabled" : ""}>${batch.paused ? (batch.phase === "review" ? "Salvar esta aula e continuar" : "Retomar leitura") : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>` : ""}
      <span class="cm-badge ${ready ? "cm-green" : "cm-red"}">${ready ? "Estrutura reconhecida" : "Estrutura divergente"}</span>
      <p class="cm-note">Habilidades selecionadas: ${skillCount} · Conteúdos selecionados: ${contentCount}${saebAvailable ? ` · Matriz SAEB: ${saebCount}` : ""}.</p>
      <div class="cm-alert">Você pode pedir o planejamento sem escolher nada antes. O Assistente selecionará a unidade temática, a habilidade, o conteúdo e, quando houver, a Matriz SAEB. Se você já escolheu uma ou mais opções, elas serão preservadas; o Assistente completará somente as escolhas ausentes.</div>
      <h4 class="cm-plan-section-title">Personalizar textos</h4>
      <div class="cm-plan-options" role="group" aria-label="Formato dos textos gerados">
        <button type="button" class="cm-plan-option" data-plan-option="concisePlanning" aria-pressed="${guidanceDraft.concisePlanning === true}" data-tip="Limita a descrição do conteúdo, a metodologia e a avaliação a textos objetivos e curtos." aria-description="Limita a descrição do conteúdo, a metodologia e a avaliação a textos objetivos e curtos.">Planejamento curto</button>
        <button type="button" class="cm-plan-option" data-plan-option="conciseMethodology" aria-pressed="${guidanceDraft.conciseMethodology === true || legacyMethodology}" data-tip="Gera uma metodologia mais breve, mantendo as etapas essenciais de como a aula será realizada." aria-description="Gera uma metodologia mais breve, mantendo as etapas essenciais de como a aula será realizada.">Metodologia curta</button>
        <button type="button" class="cm-plan-option" data-plan-option="conciseEvaluation" aria-pressed="${guidanceDraft.conciseEvaluation === true || legacyEvaluation}" data-tip="Gera uma avaliação em uma frase breve, indicando como será feita e o que será observado na aprendizagem." aria-description="Gera uma avaliação em uma frase breve, indicando como será feita e o que será observado na aprendizagem.">Avaliação curta</button>
      </div>
      <label class="cm-field cm-plan-guidance"><span>Sugestão para metodologia e avaliação (opcional)</span><textarea id="cm-plan-guidance" maxlength="1000" rows="2" placeholder="Ex.: usar datashow na metodologia; avaliar com perguntas orais.">${escapeHtml(guidanceText)}</textarea></label>
      ${!batch ? revisaSkillPicker(hasMultiPreview) : ""}
      ${!batch || batch.mode === "lesson-sequence" ? lessonMultiPreviewCard(preview, Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value) || 1, planningObjectiveTopics(), batch) : ""}
      ${!batch ? lessonMultiPreviewDetails(preview) : ""}
      ${model.planningActionFeedback ? `<p class="cm-plan-action-feedback" role="alert">${escapeHtml(model.planningActionFeedback)}</p>` : ""}
      ${hasMultiPreview ? `<div class="cm-final-actions" role="group" aria-label="Aplicar planejamento revisado"><button type="button" class="cm-btn cm-apply-reviewed" data-action="plan-apply-save">APLICAR E SALVAR</button><button type="button" class="cm-btn cm-apply-reviewed cm-apply-replicate" data-action="plan-apply-replicate">APLICAR E REPLICAR</button></div>` : ""}
    </section>`;
  }

  function peiCard(peiControls) {
    const fields = getPeiFields();
    const ready = fields.length === 4;
    const filled = fields.filter((field) => hasMeaningfulPeiText(field.value)).length;
    const choices = peiControls || {};
    const focuses = new Set(choices.focuses || []);
    return `<section class="cm-card"><h3>PEI contextualizado</h3>
      <span class="cm-badge ${ready ? "cm-green" : "cm-red"}">${ready ? "Estrutura reconhecida" : "Estrutura divergente"}</span>
      <p class="cm-note">${filled}/4 campos acadêmicos preenchidos. A extensão usa temporariamente série, disciplina e informações pedagógicas desta página, sem guardar nome, matrícula, laudo ou textos.</p>
      <label class="cm-check"><input id="cm-pei-use-name" type="checkbox" ${choices.useName ? "checked" : ""}><span>Usar o nome do estudante nos textos.</span></label>
      <div class="cm-field"><span>O texto deve registrar:</span><div class="cm-choice-group">
        <label class="cm-choice"><input type="radio" name="cm-pei-tense" value="planned" ${choices.tense !== "realized" ? "checked" : ""}><span><strong>O que será trabalhado</strong><small>Planejamento escrito no futuro</small></span></label>
        <label class="cm-choice"><input type="radio" name="cm-pei-tense" value="realized" ${choices.tense === "realized" ? "checked" : ""}><span><strong>O que já foi realizado</strong><small>Registro escrito no passado</small></span></label>
      </div></div>
      <h4>Focos opcionais</h4><div class="cm-option-grid">
        ${["Leitura", "Escrita", "Oralidade", "Atividades práticas", "Trabalho em quadra", "Recursos visuais", "Autonomia", "Trabalho colaborativo"].map((focus) => `<label class="cm-check"><input type="checkbox" data-pei-focus="${escapeHtml(focus)}" ${focuses.has(focus) ? "checked" : ""}><span>${escapeHtml(focus)}</span></label>`).join("")}
      </div>
      <label class="cm-field"><span>Orientação para a IA (opcional)</span><textarea id="cm-pei-guidance" maxlength="1000" rows="4" placeholder="Ex.: priorizar leitura oral; usar imagens na metodologia; avaliar com perguntas curtas.">${escapeHtml(choices.guidance || "")}</textarea></label>
      <p class="cm-note">Se preencher este campo, o Assistente verificará a orientação antes de inserir o rascunho.</p>
      <div class="cm-alert">A denominação clínica não será reproduzida nem interpretada. O rascunho utilizará apenas necessidades educacionais já descritas e deverá ser revisado antes de salvar.</div>
      <label class="cm-check"><input id="cm-pei-confirm" type="checkbox" ${choices.confirmed ? "checked" : ""}><span>Entendo que o texto é um rascunho pedagógico e deve ser revisado individualmente.</span></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="pei-ai-draft" disabled>Gerar campos com IA</button></div>
      <div class="cm-actions"><button class="cm-btn cm-full" data-action="pei-draft" disabled>Usar modelo local</button></div>
      <p class="cm-note">A opção com IA envia ao servidor somente série, disciplina, orientação e contexto educacional anonimizado. Nome, matrícula e senha não são enviados.</p>
    </section>`;
  }

  function getPeiFields() {
    return [
      "cphFuncionalidade_cphCampos_txtPotencialidadesExpectativas",
      "cphFuncionalidade_cphCampos_txtPotencialidadesConteudo",
      "cphFuncionalidade_cphCampos_txtNecessidadesExtratageias",
      "cphFuncionalidade_cphCampos_txtNecessidadesProcedimentos"
    ].map((id) => document.getElementById(id)).filter((field) => field instanceof HTMLTextAreaElement && !field.disabled);
  }

  function hasMeaningfulPeiText(value) {
    return /[\p{L}\p{N}]/u.test(value || "");
  }

  function logCard() {
    return `<section class="cm-card"><h3>Atividade desta página</h3>${model.log.length ? `<ul class="cm-log">${model.log.slice(-8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="cm-note">Nenhuma ação realizada.</p>`}</section>`;
  }

  function bindPanelEvents() {
    panel.querySelector('[data-action="analyze"]')?.addEventListener("click", analyzeOnDemand);
    panel.querySelector('[data-action="select-all"]')?.addEventListener("click", () => panel.querySelectorAll("[data-day]").forEach((input) => { input.checked = true; }));
    panel.querySelector('[data-action="start"]')?.addEventListener("click", reviewRun);
    const peiConfirm = panel.querySelector("#cm-pei-confirm");
    const peiDraft = panel.querySelector('[data-action="pei-draft"]');
    const peiAiDraft = panel.querySelector('[data-action="pei-ai-draft"]');
    const updatePeiButtons = () => {
      const disabled = !peiConfirm.checked || getPeiFields().length !== 4;
      if (peiDraft) peiDraft.disabled = disabled;
      if (peiAiDraft) peiAiDraft.disabled = disabled;
    };
    peiConfirm?.addEventListener("change", updatePeiButtons);
    if (peiConfirm) updatePeiButtons();
    peiDraft?.addEventListener("click", generatePeiDraft);
    peiAiDraft?.addEventListener("click", generatePeiAiDraft);
    const planDraft = panel.querySelector('[data-action="plan-draft"]');
    const planAiDraft = panel.querySelector('[data-action="plan-ai-draft"]');
    const savePlanningGuidanceDraft = () => sessionStorage.setItem("assistenteSiapPlanningGuidanceDraft", JSON.stringify({
      signature:planningSignature(),
      value:panel.querySelector("#cm-plan-guidance")?.value || "",
      concisePlanning:panel.querySelector('[data-plan-option="concisePlanning"]')?.getAttribute("aria-pressed") === "true",
      conciseMethodology:panel.querySelector('[data-plan-option="conciseMethodology"]')?.getAttribute("aria-pressed") === "true",
      conciseEvaluation:panel.querySelector('[data-plan-option="conciseEvaluation"]')?.getAttribute("aria-pressed") === "true"
    }));
    panel.querySelector("#cm-plan-guidance")?.addEventListener("input", savePlanningGuidanceDraft);
    panel.querySelectorAll("[data-revisa-code]").forEach((button) => button.addEventListener("click", () => {
      const catalog = revisaCatalogForCurrentLesson();
      if (!catalog || !catalog.skills.some((skill) => skill.code === button.dataset.revisaCode)) return;
      const codes = [...selectedRevisaSkills().map((skill) => skill.code), button.dataset.revisaCode];
      sessionStorage.setItem("assistenteSiapRevisaSelection", JSON.stringify({ signature:planningSignature(), termKey:catalog.termKey, gradeKey:catalog.gradeKey, subjectKey:catalog.subjectKey, codes }));
      panel.querySelector("#cm-revisa-details").open = false;
      render();
    }));
    panel.querySelectorAll("[data-revisa-remove]").forEach((button) => button.addEventListener("click", () => {
      const catalog = revisaCatalogForCurrentLesson();
      if (!catalog) return;
      const codes = selectedRevisaSkills().filter((skill) => skill.code !== button.dataset.revisaRemove).map((skill) => skill.code);
      sessionStorage.setItem("assistenteSiapRevisaSelection", JSON.stringify({ signature:planningSignature(), termKey:catalog.termKey, gradeKey:catalog.gradeKey, subjectKey:catalog.subjectKey, codes }));
      render();
    }));
    panel.querySelector('[data-action="multi-preview-generate"]')?.addEventListener("click", generateLessonMultiPreview);
    panel.querySelectorAll('[data-action="multi-count-down"], [data-action="multi-count-up"]').forEach((button) => button.addEventListener("click", () => {
      const input = panel.querySelector("#cm-multi-count");
      if (!input) return;
      const value = Number(input.value);
      input.value = String(Math.max(1, Math.min(20, (Number.isInteger(value) ? value : 1) + (button.dataset.action === "multi-count-up" ? 1 : -1))));
      input.focus();
    }));
    panel.querySelector('[data-action="multi-reuse-save"]')?.addEventListener("click", saveReusableLessonPlans);
    panel.querySelector('[data-action="multi-reuse-load"]')?.addEventListener("click", loadReusableLessonPlans);
    panel.querySelector('[data-action="multi-preview-clear"]')?.addEventListener("click", clearLessonMultiPreview);
    panel.querySelector('[data-action="multi-preview-discard"]')?.addEventListener("click", discardLessonMultiPreview);
    panel.querySelectorAll("[data-multi-index][data-multi-field]").forEach((input) => input.addEventListener("input", updateLessonMultiPreview));
    const planChoiceIsActive = (button) => button?.getAttribute("aria-pressed") === "true";
    const togglePlanChoice = (button) => {
      if (!button) return;
      button.setAttribute("aria-pressed", String(!planChoiceIsActive(button)));
      hidePlanningTooltip();
    };
    panel.querySelectorAll(".cm-plan-option").forEach((button) => {
      button.addEventListener("mouseenter", () => showPlanningTooltip(button));
      button.addEventListener("focus", () => showPlanningTooltip(button));
      button.addEventListener("mouseleave", hidePlanningTooltip);
      button.addEventListener("blur", hidePlanningTooltip);
    });
    panel.querySelectorAll("[data-plan-option]").forEach((button) => button.addEventListener("click", () => {
      togglePlanChoice(button);
      savePlanningGuidanceDraft();
    }));
    planDraft?.addEventListener("click", () => startPlanningFlow("local"));
    planAiDraft?.addEventListener("click", () => startPlanningFlow("ai"));
    panel.querySelector('[data-action="plan-apply-save"]')?.addEventListener("click", () => applyReviewedPlanning(false));
    panel.querySelector('[data-action="plan-apply-replicate"]')?.addEventListener("click", () => applyReviewedPlanning(true));
    const batchConfirm = panel.querySelector("#cm-batch-confirm");
    const batchStart = panel.querySelector('[data-action="batch-start"]');
    batchConfirm?.addEventListener("change", () => { if (batchStart) batchStart.disabled = !batchConfirm.checked; });
    batchStart?.addEventListener("click", startPlanningBatch);
    panel.querySelector('[data-action="batch-preview"]')?.addEventListener("click", buildPlanningPreview);
    panel.querySelector('[data-action="batch-draft-preview"]')?.addEventListener("click", startPlanningDraftPreview);
    panel.querySelectorAll("[data-preview-plan][data-preview-field]").forEach((input) => input.addEventListener("input", updatePlanningPreviewDraft));
    panel.querySelector('[data-action="batch-preview-clear"]')?.addEventListener("click", () => { setPlanningPreview(null); render(); });
    panel.querySelectorAll('[name="cm-batch-mode"]').forEach((input) => input.addEventListener("change", () => {
      const overview = planningOverviewOptions();
      const individual = input.value === "individual" && input.checked;
      const max = individual ? overview.items.length : Math.max(0, ...overview.groups.map((group) => Math.max(0, ...[...group.classes.values()].map((lessons) => lessons.length))));
      const count = panel.querySelector("#cm-batch-count");
      if (count) { count.max = String(max); count.value = String(Math.min(Number(count.value) || 1, Math.max(max, 1))); }
      const limit = panel.querySelector("[data-batch-limit]");
      if (limit) limit.textContent = individual ? `Limite neste modo: ${max} aula(s) individual(is).` : `Limite neste modo: ${max} planejamento(s), alcançando até ${overview.items.length} aula(s).`;
    }));
    panel.querySelectorAll('[data-action="batch-auto"]').forEach((input) => input.addEventListener("change", updateBatchAutoSave));
    panel.querySelector('[data-action="batch-toggle"]')?.addEventListener("click", togglePlanningBatch);
    const batchLessonConfirm = panel.querySelector("#cm-batch-lesson-confirm");
    const batchToggle = panel.querySelector('[data-action="batch-toggle"]');
    batchLessonConfirm?.addEventListener("change", () => { if (batchToggle) batchToggle.disabled = !batchLessonConfirm.checked; });
    panel.querySelector('[data-action="batch-stop"]')?.addEventListener("click", stopPlanningBatch);
    const contentConfirm = panel.querySelector("#cm-content-confirm");
    const contentStart = panel.querySelector('[data-action="content-batch-start"]');
    contentConfirm?.addEventListener("change", () => { if (contentStart) contentStart.disabled = !contentConfirm.checked; });
    contentStart?.addEventListener("click", startContentBatch);
    panel.querySelector('[data-action="content-batch-toggle"]')?.addEventListener("click", toggleContentBatch);
    panel.querySelector('[data-action="content-batch-stop"]')?.addEventListener("click", stopContentBatch);
    const attendanceConfirm = panel.querySelector("#cm-attendance-confirm");
    const attendanceStart = panel.querySelector('[data-action="attendance-batch-start"]');
    attendanceConfirm?.addEventListener("change", () => { if (attendanceStart) attendanceStart.disabled = !attendanceConfirm.checked; });
    attendanceStart?.addEventListener("click", startAttendanceBatch);
    panel.querySelector('[data-action="attendance-batch-toggle"]')?.addEventListener("click", toggleAttendanceBatch);
    panel.querySelector('[data-action="attendance-batch-stop"]')?.addEventListener("click", stopAttendanceBatch);
  }

  async function startContentBatch() {
    const months = [...panel.querySelectorAll("[data-content-month]:checked")].map((input) => Number(input.dataset.contentMonth)).sort((a, b) => a - b);
    const material = panel.querySelector('[name="cm-support-material"]:checked');
    if (!months.length) return addLog("Selecione pelo menos um mês.");
    if (!material) return addLog("Selecione um material de apoio.");
    if (!await consumeFeature("content")) return;
    setContentBatch({ active: true, authorized: true, paused: false, phase: "month", months, monthIndex: 0, materialIndex: Number(material.dataset.materialIndex), completed: 0, skipped: 0, skippedDays: [], processedDays: [], saveAttempts: 0 });
    render();
    scheduleContentResume(100);
  }

  function toggleContentBatch() {
    const batch = getContentBatch();
    if (!batch) return;
    batch.paused = !batch.paused;
    setContentBatch(batch);
    render();
    if (!batch.paused) scheduleContentResume(100);
  }

  function stopContentBatch() {
    clearTimeout(contentResumeTimer);
    setContentBatch(null);
    addLog("Execução de conteúdos interrompida pelo professor.");
  }

  function scheduleContentResume(delay = 500) {
    clearTimeout(contentResumeTimer);
    contentResumeTimer = setTimeout(resumeContentBatch, delay);
  }

  function contentCalendarSignature() {
    return [...document.querySelectorAll(`#${IDS.calendar} td.letivo`)].map((cell) => `${cell.textContent.trim()}:${cell.getAttribute("style") || ""}:${cell.className}`).join("|");
  }

  function findMaterialButton(materialIndex) {
    const wanted = SUPPORT_MATERIALS[materialIndex];
    const rows = [...document.querySelectorAll('[id*="GrdMaterialApoio"] tr')];
    const row = rows.find((item) => (item.textContent || "").replace(/Executar/g, "").trim() === wanted);
    return row?.querySelector('input[type="submit"], input[type="button"], button');
  }

  function materialAlreadyUsed(materialIndex) {
    const used = document.getElementById("cphFuncionalidade_cphCampos_GrdMaterialApoioRealizado");
    return !!used && (used.textContent || "").includes(SUPPORT_MATERIALS[materialIndex]);
  }

  function stopContentBatchWithError(message) {
    const batch = getContentBatch();
    if (batch) { batch.paused = true; setContentBatch(batch); }
    addLog(`${message} O lote foi pausado.`);
  }

  function contentLessonValues() {
    const select = document.getElementById(IDS.lesson);
    return select ? [...select.options].filter((option) => !option.disabled && option.value).map((option) => option.value) : [];
  }

  function contentLessonIsSelected(value) {
    const select = document.getElementById(IDS.lesson);
    return select?.value === value && select.selectedOptions?.[0]?.hasAttribute("selected");
  }

  function nextContentLesson(batch) {
    batch.lessonIndex = (batch.lessonIndex || 0) + 1;
    batch.contentButtonIds = [];
    batch.contentIndex = 0;
    batch.saveAttempts = 0;
    if (batch.lessonIndex >= batch.lessonValues.length) {
      batch.completed = (batch.completed || 0) + batch.lessonValues.length;
      batch.processedDays = [...new Set([...(batch.processedDays || []), `${batch.months[batch.monthIndex]}|${batch.currentLabel}`])];
      batch.currentLabel = "";
      batch.lessonValues = [];
      batch.lessonIndex = 0;
      batch.phase = "month";
    } else batch.phase = "day";
    setContentBatch(batch);
    scheduleContentResume(100);
  }

  function skipUnavailableContentDay(batch, reason) {
    const label = batch.currentLabel || "Data não identificada";
    const key = `${batch.months[batch.monthIndex]}|${label}`;
    batch.completed = (batch.completed || 0) + (batch.lessonIndex || 0);
    batch.processedDays = [...new Set([...(batch.processedDays || []), key])];
    batch.skippedDays = [...new Set([...(batch.skippedDays || []), key])];
    batch.skipped = batch.skippedDays.length;
    batch.currentLabel = "";
    batch.lessonValues = [];
    batch.lessonIndex = 0;
    batch.contentButtonIds = [];
    batch.contentIndex = 0;
    batch.saveAttempts = 0;
    batch.dayAttempts = 0;
    delete batch.saveWaitStartedAt;
    batch.phase = "month";
    setContentBatch(batch);
    addLog(`${label} ignorada: ${reason}. Seguindo para a próxima data ou mês.`);
    scheduleContentResume(100);
  }

  function resumeContentBatch() {
    if (model.license?.active === false && !finishingAuthorizedFreeWork()) return lockAssistantAfterExpiry();
    const batch = getContentBatch();
    if (!batch || batch.paused || Core.pageType(location.pathname) !== "content") return;
    const monthSelect = document.getElementById(IDS.month);
    if (!monthSelect) return stopContentBatchWithError("Seletor de mês não encontrado.");
    const targetMonth = batch.months[batch.monthIndex];
    if (targetMonth === undefined) { setContentBatch(null); return addLog(`Execução concluída: ${batch.completed || 0} aula(s) salva(s) e ${batch.skipped || 0} data(s) ignorada(s).`); }

    if (batch.phase === "switch-month") {
      const elapsed = Date.now() - (batch.switchStartedAt || 0);
      if (monthSelect.selectedIndex === targetMonth && (contentCalendarSignature() !== batch.calendarSignature || elapsed >= 4000)) {
        batch.phase = "month";
        setContentBatch(batch);
      } else if (elapsed >= 20000) return stopContentBatchWithError("O SIAP não confirmou a troca de mês.");
      else return scheduleContentResume(500);
    }
    if (monthSelect.selectedIndex !== targetMonth) {
      batch.phase = "switch-month";
      batch.calendarSignature = contentCalendarSignature();
      batch.switchStartedAt = Date.now();
      setContentBatch(batch);
      monthSelect.selectedIndex = targetMonth;
      monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return scheduleContentResume(500);
    }
    if (batch.phase === "saving") {
      const wait = (batch.verifyNotBefore || 0) - Date.now();
      if (wait > 0) return scheduleContentResume(wait);
      const lesson = batch.lessonValues?.[batch.lessonIndex];
      const realized = document.querySelector(`#${IDS.realized} input[type="submit"], #${IDS.realized} input[type="button"], #${IDS.realized} button`);
      const lastLesson = batch.lessonIndex === batch.lessonValues.length - 1;
      const green = readCalendarDays().find((item) => item.label === batch.currentLabel)?.state === "saved";
      const confirmed = lastLesson ? green : document.getElementById(IDS.date)?.value === batch.currentLabel && contentLessonIsSelected(lesson) && !!realized;
      if (!confirmed) {
        const retryKey = lastLesson && !green ? "dayAttempts" : "saveAttempts";
        batch[retryKey] = (batch[retryKey] || 0) + 1;
        if (batch[retryKey] >= MAX_SAVE_ATTEMPTS) {
          batch.paused = true;
          setContentBatch(batch);
          return addLog(`O SIAP não confirmou ${lastLesson ? "a data verde" : lesson} após ${MAX_SAVE_ATTEMPTS} tentativas. O lote foi pausado para conferência.`);
        }
        if (lastLesson && !green) batch.lessonIndex = 0;
        batch.phase = "retry-wait";
        batch.retryAt = Date.now() + Core.backoff(batch[retryKey]);
        setContentBatch(batch);
        return scheduleContentResume(Core.backoff(batch[retryKey]));
      }
      return nextContentLesson(batch);
    }
    if (batch.phase === "retry-wait") {
      const wait = (batch.retryAt || 0) - Date.now();
      if (wait > 0) return scheduleContentResume(wait);
      const day = readCalendarDays().find((item) => item.label === batch.currentLabel);
      if (!day) return stopContentBatchWithError("A data da aula não foi reencontrada após o salvamento.");
      batch.phase = "day";
      setContentBatch(batch);
      return day.cell.click();
    }
    if (batch.phase === "execute-content") {
      const buttonId = batch.contentButtonIds?.[batch.contentIndex || 0];
      if (buttonId) {
        const execute = document.getElementById(buttonId);
        if (!execute || execute.disabled) return stopContentBatchWithError("Um conteúdo planejado deixou de estar disponível antes da execução.");
        batch.contentIndex = (batch.contentIndex || 0) + 1;
        setContentBatch(batch);
        return execute.click();
      }
      batch.phase = "material";
      setContentBatch(batch);
    }
    if (batch.phase === "material") {
      if (materialAlreadyUsed(batch.materialIndex)) {
        batch.phase = "save";
        batch.saveWaitStartedAt = Date.now();
        setContentBatch(batch);
        return scheduleContentResume(100);
      }
      const materialButton = findMaterialButton(batch.materialIndex);
      if (!materialButton) return stopContentBatchWithError("O material de apoio escolhido não foi encontrado nesta tela.");
      batch.phase = "save";
      batch.saveWaitStartedAt = Date.now();
      setContentBatch(batch);
      return materialButton.click();
    }
    if (batch.phase === "save") {
      const save = document.getElementById(IDS.save);
      if (!save || save.disabled) {
        batch.saveWaitStartedAt = batch.saveWaitStartedAt || Date.now();
        setContentBatch(batch);
        if (Date.now() - batch.saveWaitStartedAt >= (!save ? 5000 : 10000)) {
          return skipUnavailableContentDay(batch, !save ? "o SIAP não apresentou botão de salvar" : "o botão de salvar permaneceu indisponível");
        }
        return scheduleContentResume(500);
      }
      delete batch.saveWaitStartedAt;
      batch.phase = "saving";
      batch.verifyNotBefore = Date.now() + 5000;
      setContentBatch(batch);
      return save.click();
    }
    if (batch.phase === "day") {
      if (document.getElementById(IDS.date)?.value !== batch.currentLabel) return scheduleContentResume(400);
      if (!batch.lessonValues?.length) {
        batch.lessonValues = contentLessonValues();
        batch.lessonIndex = 0;
        if (!batch.lessonValues.length) return stopContentBatchWithError("O seletor de aulas da data não foi encontrado.");
        setContentBatch(batch);
      }
      const lesson = batch.lessonValues[batch.lessonIndex];
      const select = document.getElementById(IDS.lesson);
      if (!contentLessonValues().includes(lesson)) return stopContentBatchWithError("Uma aula deixou de estar disponível nesta data.");
      if (!contentLessonIsSelected(lesson)) {
        if (select?.value !== lesson) {
          select.value = lesson;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return scheduleContentResume(1200);
      }
      const alreadyExecuted = !!document.querySelector(`#${IDS.realized} input[type="submit"], #${IDS.realized} input[type="button"], #${IDS.realized} button`);
      batch.contentButtonIds = alreadyExecuted ? [] : [...document.querySelectorAll(`#${IDS.planned} input[type="submit"], #${IDS.planned} input[type="button"], #${IDS.planned} button`)]
        .filter((button) => !button.disabled && button.id)
        .map((button) => button.id);
      batch.contentIndex = 0;
      if (!alreadyExecuted && !batch.contentButtonIds.length) return stopContentBatchWithError("Nenhum conteúdo planejado disponível para executar nesta data.");
      batch.phase = alreadyExecuted ? "material" : "execute-content";
      setContentBatch(batch);
      return resumeContentBatch();
    }
    if (batch.phase === "month") {
      const processed = new Set(batch.processedDays || []);
      const pending = readCalendarDays().find((item) => item.state === "pending" && item.eligible && !processed.has(`${targetMonth}|${item.label}`));
      if (!pending) { batch.monthIndex += 1; setContentBatch(batch); return scheduleContentResume(100); }
      batch.currentLabel = pending.label;
      batch.lessonValues = [];
      batch.lessonIndex = 0;
      batch.dayAttempts = 0;
      batch.contentButtonIds = [];
      batch.contentIndex = 0;
      batch.phase = "day";
      setContentBatch(batch);
      pending.cell.click();
    }
  }

  function scheduleAttendanceResume(delay = 500) {
    clearTimeout(attendanceResumeTimer);
    attendanceResumeTimer = setTimeout(resumeAttendanceBatch, delay);
  }

  async function startAttendanceBatch() {
    const months = [...panel.querySelectorAll("[data-attendance-month]:checked")].map((input) => Number(input.dataset.attendanceMonth)).sort((a, b) => a - b);
    if (!months.length) return addLog("Selecione pelo menos um mês.");
    if (!await consumeFeature("attendance")) return;
    setAttendanceBatch({ active: true, authorized: true, paused: false, phase: "month", months, monthIndex: 0, completed: 0, attempts: 0, skipped: 0, skippedDays: [] });
    render();
    scheduleAttendanceResume(100);
  }

  function toggleAttendanceBatch() {
    const batch = getAttendanceBatch();
    if (!batch) return;
    batch.paused = !batch.paused;
    setAttendanceBatch(batch);
    render();
    if (!batch.paused) scheduleAttendanceResume(100);
  }

  function stopAttendanceBatch() {
    clearTimeout(attendanceResumeTimer);
    setAttendanceBatch(null);
    addLog("Execução de frequências interrompida pelo professor.");
  }

  function pauseAttendanceBatch(message) {
    const batch = getAttendanceBatch();
    if (batch) { batch.paused = true; setAttendanceBatch(batch); }
    addLog(`${message} O lote foi pausado.`);
  }

  function attendanceBatchDayKey(batch, label) {
    return `${batch.months?.[batch.monthIndex] ?? ""}|${label || ""}`;
  }

  function skipUnavailableAttendanceDay(batch, reason) {
    const label = batch.currentLabel || "Data não identificada";
    const skipped = new Set(batch.skippedDays || []);
    skipped.add(attendanceBatchDayKey(batch, label));
    batch.skippedDays = [...skipped];
    batch.skipped = batch.skippedDays.length;
    batch.attempts = 0;
    batch.currentLabel = "";
    batch.dayOpenedAt = 0;
    batch.phase = "month";
    setAttendanceBatch(batch);
    addLog(`${label} ignorada: ${reason}. Seguindo para a próxima data.`);
    scheduleAttendanceResume(100);
  }

  function resumeAttendanceBatch() {
    if (model.license?.active === false && !finishingAuthorizedFreeWork()) return lockAssistantAfterExpiry();
    const batch = getAttendanceBatch();
    if (!batch || batch.paused || Core.pageType(location.pathname) !== "attendance") return;
    const monthSelect = document.getElementById(IDS.month);
    if (!monthSelect) return pauseAttendanceBatch("Seletor de mês não encontrado.");
    const targetMonth = batch.months[batch.monthIndex];
    if (targetMonth === undefined) { setAttendanceBatch(null); return addLog(`Frequências concluídas: ${batch.completed || 0} chamada(s) salva(s) e ${batch.skipped || 0} data(s) ignorada(s).`); }

    if (batch.phase === "switch-month") {
      const elapsed = Date.now() - (batch.switchStartedAt || 0);
      if (monthSelect.selectedIndex === targetMonth && (contentCalendarSignature() !== batch.calendarSignature || elapsed >= 4000)) {
        batch.phase = "month";
        setAttendanceBatch(batch);
      } else if (elapsed >= 20000) return pauseAttendanceBatch("O SIAP não confirmou a troca de mês.");
      else return scheduleAttendanceResume(500);
    }
    if (monthSelect.selectedIndex !== targetMonth) {
      batch.phase = "switch-month";
      batch.calendarSignature = contentCalendarSignature();
      batch.switchStartedAt = Date.now();
      setAttendanceBatch(batch);
      monthSelect.selectedIndex = targetMonth;
      monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return scheduleAttendanceResume(500);
    }
    if (batch.phase === "saving") {
      const wait = (batch.verifyNotBefore || 0) - Date.now();
      if (wait > 0) return scheduleAttendanceResume(wait);
      const day = readCalendarDays().find((item) => item.label === batch.currentLabel);
      if (day?.state === "pending") {
        batch.attempts = (batch.attempts || 0) + 1;
        if (batch.attempts >= MAX_SAVE_ATTEMPTS) {
          setAttendanceBatch(batch);
          return pauseAttendanceBatch(`O SIAP não confirmou o salvamento da frequência após ${MAX_SAVE_ATTEMPTS} tentativas.`);
        }
        batch.phase = "retry-wait";
        batch.retryAt = Date.now() + Core.backoff(batch.attempts);
        setAttendanceBatch(batch);
        return scheduleAttendanceResume(Core.backoff(batch.attempts));
      }
      batch.completed += 1;
      batch.attempts = 0;
      batch.phase = "month";
      batch.currentLabel = "";
      setAttendanceBatch(batch);
    }
    if (batch.phase === "retry-wait") {
      const wait = (batch.retryAt || 0) - Date.now();
      if (wait > 0) return scheduleAttendanceResume(wait);
      const day = readCalendarDays().find((item) => item.label === batch.currentLabel && item.state === "pending");
      if (!day) { batch.phase = "saving"; batch.verifyNotBefore = Date.now(); setAttendanceBatch(batch); return scheduleAttendanceResume(100); }
      batch.phase = "day";
      setAttendanceBatch(batch);
      return day.cell.click();
    }
    if (batch.phase === "day") {
      if (document.getElementById(IDS.date)?.value !== batch.currentLabel) return scheduleAttendanceResume(400);
      const save = document.getElementById(IDS.save);
      if (!save) return skipUnavailableAttendanceDay(batch, "o SIAP não apresentou botão de salvar");
      if (save.disabled) {
        batch.dayOpenedAt = batch.dayOpenedAt || Date.now();
        if (Date.now() - batch.dayOpenedAt >= 10000) return skipUnavailableAttendanceDay(batch, "o botão de salvar permaneceu indisponível");
        setAttendanceBatch(batch);
        return scheduleAttendanceResume(500);
      }
      batch.phase = "saving";
      batch.verifyNotBefore = Date.now() + 5000;
      batch.dayOpenedAt = 0;
      setAttendanceBatch(batch);
      return save.click();
    }
    if (batch.phase === "month") {
      const skipped = new Set(batch.skippedDays || []);
      const pending = readCalendarDays().find((item) => item.state === "pending" && item.eligible && !skipped.has(attendanceBatchDayKey(batch, item.label)));
      if (!pending) { batch.monthIndex += 1; setAttendanceBatch(batch); return scheduleAttendanceResume(100); }
      batch.currentLabel = pending.label;
      batch.dayOpenedAt = Date.now();
      batch.phase = "day";
      setAttendanceBatch(batch);
      return pending.cell.click();
    }
  }

  function updateLessonMultiPreview(event) {
    const preview = getLessonMultiPreview();
    const index = Number(event.currentTarget.dataset.multiIndex);
    const field = Number(event.currentTarget.dataset.multiField);
    if (!preview || preview.signature !== planningSignature() || !preview.plans?.[index] || ![2, 3].includes(field)) return;
    preview.plans[index].fields[field] = event.currentTarget.value.trim();
    sessionStorage.setItem("assistenteSiapLessonMultiPreview", JSON.stringify(preview));
  }

  function startLessonSequence(replicate = false) {
    const preview = getLessonMultiPreview();
    if (!preview?.plans?.length || !lessonMultiPreviewIsCurrent(preview) || getPlanningBatch()) return reportPlanningActionError("Gere e revise novamente as prévias desta aula antes de aplicar.");
    if (preview.plans.some((plan) => !plan.fields?.[2]?.trim() || !plan.fields?.[3]?.trim())) return reportPlanningActionError("Preencha metodologia e avaliação de todas as aulas antes de aplicar.");
    if (!lessonSequenceSaveButton({ index:0, plans:preview.plans })) return reportPlanningActionError("O SIAP não oferece um botão de salvar nesta aula. Confira a página antes de aplicar.");
    if (preview.plans.every((plan) => canonicalClassroom(plan.classroom) === canonicalClassroom(preview.plans[0].classroom))) {
      sessionStorage.setItem("assistenteSiapReusableLessonPlans", JSON.stringify({
        grade:preview.plans[0].grade, subject:preview.plans[0].subject, classroom:preview.plans[0].classroom, thematicUnit:preview.plans[0].thematicUnit,
        plans:preview.plans, guidance:preview.guidance, concisePlanning:preview.concisePlanning,
        conciseMethodology:preview.conciseMethodology, conciseEvaluation:preview.conciseEvaluation
      }));
    }
    const templates = Object.fromEntries(preview.plans.map((plan, index) => [`lesson-${index}`, {
      fields:plan.fields, expectedTopic:plan.topic, expectedTopics:plan.objectives || [plan.topic], expectedSkill:plan.skill, expectedSkills:plan.skills || [plan.skill], expectedSaeb:plan.saeb || [], expectedUnit:plan.thematicUnit, origin:"lesson-sequence"
    }]));
    setPlanningBatch({ active:true, mode:"lesson-sequence", runId:`lessons-${Date.now()}`, paused:false, autoSave:true, replicate,
      phase:"preparing", index:0, plans:preview.plans, current:null, templates,
      previewMetadata:{ guidance:preview.guidance, concisePlanning:preview.concisePlanning, conciseMethodology:preview.conciseMethodology, conciseEvaluation:preview.conciseEvaluation }
    });
    render();
    resumePlanningBatch();
  }

  function lessonSequenceSaveButton(batch) {
    const saveOnly = document.getElementById("cphFuncionalidade_btnAlterar");
    return saveOnly && !saveOnly.disabled ? saveOnly : null;
  }

  function ensureLessonSequenceUnit(batch, expected) {
    const select = document.getElementById("ddlEixo");
    const unit = normalizePlanningGroup(expected.thematicUnit);
    const pause = (reason) => {
      batch.paused = true;
      batch.phase = "manual";
      batch.pauseMessage = `Aula ${expected.lesson} da turma ${expected.classroom}: ${reason} Nenhuma alteração foi salva nesta aula.`;
      setPlanningBatch(batch);
      addLog(batch.pauseMessage);
      return false;
    };
    if (!select || !unit) return pause("a unidade temática da prévia não foi identificada.");
    const matching = [...select.options].filter((option) => option.value && normalizePlanningGroup(option.textContent) === unit);
    const target = matching.find((option) => expected.thematicUnitValue && option.value === expected.thematicUnitValue) ||
      (matching.length === 1 ? matching[0] : null);
    if (!target) return pause(matching.length ? "há mais de uma opção com o nome da unidade temática da prévia." : "a unidade temática da prévia não está disponível no SIAP.");
    const pending = batch.pendingUnitSelection;
    if (pending) {
      const confirmed = select.value === pending.value &&
        (globalThis.performance?.timeOrigin !== pending.pageEpoch || (!pending.defaultSelected && target.defaultSelected));
      if (!confirmed) {
        if (Date.now() - pending.startedAt < 20000) return setTimeout(resumePlanningBatch, 500), false;
        return pause("o SIAP não confirmou a troca da unidade temática.");
      }
      delete batch.pendingUnitSelection;
      setPlanningBatch(batch);
      addLog(`Unidade temática ${target.textContent.trim()} confirmada para a aula ${expected.lesson} da turma ${expected.classroom}.`);
    }
    if (select.value === target.value) return true;
    const hasSelections = selectedPlanningSkills().length || selectedPlanningObjectives().length || selectedPlanningSaeb().length;
    if (hasSelections) return pause("esta aula já contém escolhas curriculares em outra unidade temática; confira antes de continuar.");
    batch.pendingUnitSelection = { value:target.value, pageEpoch:globalThis.performance?.timeOrigin || 0,
      defaultSelected:Boolean(target.defaultSelected), startedAt:Date.now() };
    setPlanningBatch(batch);
    select.value = target.value;
    select.dispatchEvent(new Event("change", { bubbles:true }));
    addLog(`Selecionando ${target.textContent.trim()} no SIAP para a aula ${expected.lesson} da turma ${expected.classroom}.`);
    setTimeout(resumePlanningBatch, 500);
    return false;
  }

  function reconcileReplicatedLesson(batch, expected) {
    if (batch.index < 1) return true;
    const previous = batch.plans[batch.index - 1];
    const availableObjectives = planningLinks("content").map((link) => link.textContent || "");
    const matches = (value, choices, kind) => (choices || []).some((choice) =>
      samePlanningChoices([value], [choice], kind === "content" ? availableObjectives : []));
    const pause = (message) => {
      batch.paused = true;
      batch.phase = "manual";
      batch.pauseMessage = message;
      setPlanningBatch(batch);
      addLog(message);
      return false;
    };
    const skills = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr")]
      .filter((row) => !row.querySelector("th"))
      .map((row) => ({ label:(row.textContent || "").replace(/\s+/g, " ").trim(), button:row.querySelector('input[type="image"]') }));
    const contents = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]')]
      .map((row) => ({ label:(row.querySelector(".cabecalhoConteudo span")?.getAttribute("title") || row.querySelector(".cabecalhoConteudo span")?.textContent || "").replace(/\s+/g, " ").trim(), button:row.querySelector('[id*="btnRemover"]') }));
    const entries = [...skills.map((entry) => ({ ...entry, kind:"skill" })), ...contents.map((entry) => ({ ...entry, kind:"content" }))];
    const pending = batch.pendingRemoval;
    if (pending) {
      if (entries.some((entry) => entry.kind === pending.kind && normalizePlanningGroup(entry.label) === pending.label)) {
        if (Date.now() - pending.startedAt > 15000) return pause("O SIAP não confirmou a remoção do item copiado. Confira a aula antes de continuar.");
        setTimeout(resumePlanningBatch, 500);
        return false;
      }
      delete batch.pendingRemoval;
      setPlanningBatch(batch);
    }
    for (const entry of entries) {
      const wanted = entry.kind === "skill" ? expected.skills || [expected.skill] : expected.objectives || [expected.topic];
      if (matches(entry.label, wanted, entry.kind)) continue;
      const copied = entry.kind === "skill" ? previous.skills || [previous.skill] : previous.objectives || [previous.topic];
      if (!matches(entry.label, copied, entry.kind) || !entry.button || entry.button.disabled) return pause("Esta aula contém uma escolha diferente da prévia e da aula replicada. Confira antes de continuar.");
      batch.pendingRemoval = { kind:entry.kind, label:normalizePlanningGroup(entry.label), startedAt:Date.now() };
      setPlanningBatch(batch);
      entry.button.click();
      setTimeout(resumePlanningBatch, 500);
      return false;
    }
    const fields = [
      [document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia"), previous.fields?.[2], expected.fields?.[2]],
      [document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao"), previous.fields?.[3], expected.fields?.[3]],
      ...[...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]')]
        .map((field) => [field, previous.fields?.[1], expected.fields?.[1]])
    ];
    for (const [field, copied, wanted] of fields) {
      if (!field) continue;
      const value = String(field.value || "").trim();
      if (!value || value === String(wanted || "").trim()) continue;
      if (value !== String(copied || "").trim() && contents.length) return pause("Esta aula contém texto diferente da prévia e da aula replicada. Confira antes de continuar.");
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles:true }));
      field.dispatchEvent(new Event("change", { bubbles:true }));
    }
    return true;
  }

  function resumeLessonSequenceOverview(batch) {
    if (batch.phase === "replication-confirmed" && batch.current) {
      batch.current.saveMethod = "save-only";
      batch.current.saveStartedAt ||= Date.now();
      setPlanningBatch(batch);
      const savedPlan = batch.plans?.[batch.index] || batch.current;
      const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
      const period = batch.current.periodValue || savedPlan.periodValue;
      if (!select) return setTimeout(resumePlanningBatch, 500);
      if (period && select.value !== period) {
        batch.phase = "saving";
        setPlanningBatch(batch);
        return resumeLessonSequenceOverview(batch);
      }
      if (sequenceOverviewBlock(document, savedPlan)?.classList.contains("planejada")) {
        batch.current.saveVerifiedFromServer = true;
        batch.phase = "saving";
        setPlanningBatch(batch);
        return resumeLessonSequenceOverview(batch);
      }
      if (Date.now() - batch.current.saveStartedAt < 30000) {
        void verifySequenceSaveFromOverview(batch);
        return setTimeout(resumePlanningBatch, 500);
      }
      batch.paused = true;
      batch.phase = "manual";
      batch.pauseMessage = `O SIAP confirmou a replicação, mas não confirmou o salvamento da aula ${batch.current.lesson} da turma ${batch.current.classroom}. Confira antes de continuar.`;
      setPlanningBatch(batch);
      return addLog(batch.pauseMessage);
    }
    if (batch.phase === "saving" && batch.current?.saveMethod === "save-only") {
      const savedPlan = batch.plans?.[batch.index] || batch.current;
      const period = batch.current.periodValue || savedPlan?.periodValue;
      const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
      if (!select) return setTimeout(resumePlanningBatch, 500);
      if (period && select.value !== period) {
        const pending = batch.saveCheckSwitch;
        if (pending && Date.now() - pending.startedAt >= 20000) {
          batch.paused = true;
          batch.phase = "manual";
          batch.pauseMessage = `O SIAP não confirmou a quinzena da aula ${batch.current.lesson} após salvar. Confira antes de continuar.`;
          setPlanningBatch(batch);
          return addLog(batch.pauseMessage);
        }
        if (!pending) {
          batch.saveCheckSwitch = { startedAt:Date.now(), signature:planningOverviewSignature() };
          setPlanningBatch(batch);
          select.value = period;
          select.dispatchEvent(new Event("change", { bubbles:true }));
        }
        return setTimeout(resumePlanningBatch, 500);
      }
      if (batch.saveCheckSwitch) {
        if (planningOverviewSignature() === batch.saveCheckSwitch.signature && Date.now() - batch.saveCheckSwitch.startedAt < 5000)
          return setTimeout(resumePlanningBatch, 500);
        delete batch.saveCheckSwitch;
        setPlanningBatch(batch);
      }
      const block = sequenceOverviewBlock(document, savedPlan);
      if (!block?.classList.contains("planejada") && !batch.current.saveVerifiedFromServer) {
        if (!batch.current.saveCheckStartedAt) {
          batch.current.saveCheckStartedAt = batch.current.saveStartedAt || Date.now();
          setPlanningBatch(batch);
        }
        if (Date.now() - batch.current.saveCheckStartedAt < 30000) {
          void verifySequenceSaveFromOverview(batch);
          return setTimeout(resumePlanningBatch, 500);
        }
        batch.paused = true;
        batch.phase = "manual";
        batch.pauseMessage = `O quadradinho da aula ${batch.current.lesson} não aparece como planejado no SIAP. Confira antes de continuar; nenhuma próxima aula será aberta.`;
        setPlanningBatch(batch);
        return addLog(batch.pauseMessage);
      }
      const savedLesson = batch.current.lesson;
      batch.index += 1;
      batch.current = null;
      if (batch.index >= batch.plans.length) {
        setPlanningBatch(null);
        sessionStorage.removeItem("assistenteSiapLessonMultiPreview");
        render();
        return addLog(`${batch.plans.length} aula(s) da sequência foram salvas. A última foi a aula ${savedLesson}, usando Salvar do SIAP.`);
      }
      batch.phase = "locating-next";
      batch.searchPeriodIndex = 0;
      batch.searchPeriods = null;
      setPlanningBatch(batch);
      addLog(`Aula ${savedLesson} salva. Procurando a aula ${batch.plans[batch.index].lesson} da mesma turma nas quinzenas do SIAP.`);
    }
    if (batch.phase !== "locating-next") return;
    const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!select) return;
    if (!batch.searchPeriods) {
      const expectedPeriod = batch.plans?.[batch.index]?.periodValue;
      batch.searchPeriods = expectedPeriod ? [expectedPeriod] : [...select.options].map((option) => option.value);
    }
    if (batch.searchSwitch) {
      const elapsed = Date.now() - batch.searchSwitch.startedAt;
      if (select.value !== batch.searchSwitch.value || (planningOverviewSignature() === batch.searchSwitch.signature && elapsed < 5000)) {
        if (elapsed < 20000) return setTimeout(resumePlanningBatch, 500);
        batch.paused = true;
        batch.phase = "manual";
        batch.pauseMessage = "O SIAP não confirmou a troca de quinzena para localizar a próxima aula.";
        setPlanningBatch(batch);
        return addLog(batch.pauseMessage);
      }
      delete batch.searchSwitch;
      setPlanningBatch(batch);
    }
    const period = batch.searchPeriods[batch.searchPeriodIndex || 0];
    if (!period) {
      const expected = batch.plans[batch.index];
      const saved = batch.index;
      setPlanningBatch(null);
      render();
      return addLog(`Sequência interrompida após ${saved} de ${batch.plans.length} aula(s) salvas. A aula ${expected.lesson} da turma ${expected.classroom} não está disponível em branco na quinzena prevista; essa prévia não foi aplicada.`);
    }
    if (select.value !== period) {
      batch.searchSwitch = { value:period, signature:planningOverviewSignature(), startedAt:Date.now() };
      setPlanningBatch(batch);
      select.value = period;
      select.dispatchEvent(new Event("change", { bubbles:true }));
      setTimeout(resumePlanningBatch, 500);
      return;
    }
    const expected = batch.plans[batch.index];
    const block = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada")]
      .find((candidate) => {
        const item = overviewItem(candidate);
        return Number(item.lesson) === Number(expected.lesson) && (!expected.periodValue || select.value === expected.periodValue) &&
          canonicalClassroom(item.classroom) === canonicalClassroom(expected.classroom) &&
          normalizePlanningGroup(item.subject) === normalizePlanningGroup(expected.subject) && normalizePlanningGroup(item.grade) === normalizePlanningGroup(expected.grade);
      });
    if (block) {
      batch.phase = "preparing";
      batch.current = null;
      delete batch.searchPeriods;
      delete batch.searchPeriodIndex;
      setPlanningBatch(batch);
      if (!requestSiapPostBack(block)) {
        batch.paused = true;
        batch.phase = "manual";
        batch.pauseMessage = `Não foi possível abrir a aula ${expected.lesson} da turma ${expected.classroom}.`;
        setPlanningBatch(batch);
        addLog(batch.pauseMessage);
      }
      return;
    }
    batch.searchPeriodIndex += 1;
    setPlanningBatch(batch);
    setTimeout(resumePlanningBatch, 100);
  }

  function sequenceOverviewBlock(page, plan) {
    return [...page.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula")]
      .find((candidate) => {
        if (Number(candidate.getAttribute("numeroaula")) !== Number(plan.lesson)) return false;
        const code = candidate.getAttribute("codigoturma");
        if (plan.classCode && code) return code === plan.classCode;
        const item = overviewItem(candidate);
        return canonicalClassroom(item.classroom) === canonicalClassroom(plan.classroom) &&
          normalizePlanningGroup(item.grade) === normalizePlanningGroup(plan.grade) &&
          normalizePlanningGroup(item.subject) === normalizePlanningGroup(plan.subject);
      });
  }

  async function verifySequenceSaveFromLesson(batch) {
    if (planningSaveCheckRun || Date.now() - planningSaveCheckAt < 1500) return;
    planningSaveCheckAt = Date.now();
    planningSaveCheckRun = (async () => {
      try {
        const page = await fetchPlanningOverviewDocument(batch.current.periodValue);
        if (!sequenceOverviewBlock(page, batch.current)?.classList.contains("planejada")) return;
        const latest = getPlanningBatch();
        if (latest?.runId !== batch.runId || latest.index !== batch.index || latest.phase !== "saving" || latest.paused ||
          Core.pageType(location.pathname) !== "planning-lesson") return;
        location.assign("/AcompanhamentoPlanejamentoProfessorListagem.aspx");
      } catch { /* A confirmação é tentada novamente até o prazo do SIAP. */ }
    })();
    try { await planningSaveCheckRun; } finally { planningSaveCheckRun = null; }
  }

  async function verifySequenceSaveFromOverview(batch) {
    if (planningSaveCheckRun || Date.now() - planningSaveCheckAt < 1500) return;
    planningSaveCheckAt = Date.now();
    planningSaveCheckRun = (async () => {
      try {
        const plan = batch.plans?.[batch.index] || batch.current;
        const page = await fetchPlanningOverviewDocument(batch.current.periodValue || plan.periodValue);
        if (!sequenceOverviewBlock(page, plan)?.classList.contains("planejada")) return;
        const latest = getPlanningBatch();
        if (latest?.runId !== batch.runId || latest.index !== batch.index || !["saving", "replication-confirmed"].includes(latest.phase) || latest.paused ||
          Core.pageType(location.pathname) !== "planning-overview") return;
        latest.current.saveVerifiedFromServer = true;
        latest.current.saveMethod = "save-only";
        latest.current.saveStartedAt ||= Date.now();
        latest.phase = "saving";
        setPlanningBatch(latest);
        resumePlanningBatch();
      } catch { /* Aguarda a confirmação atualizada do SIAP até o prazo previsto. */ }
    })();
    try { await planningSaveCheckRun; } finally { planningSaveCheckRun = null; }
  }

  function resumeLessonSequence(batch) {
    if (Core.pageType(location.pathname) === "planning-overview") return resumeLessonSequenceOverview(batch);
    if (Core.pageType(location.pathname) !== "planning-lesson") {
      batch.paused = true;
      batch.phase = "manual";
      setPlanningBatch(batch);
      return addLog("O SIAP saiu da página da aula. A sequência foi pausada; confira a última aula salva.");
    }
    const lesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value);
    if (batch.phase === "locating-next") {
      const expected = batch.plans?.[batch.index];
      if (expected && lesson === expected.lesson && canonicalClassroom(readContext().classroom) === canonicalClassroom(expected.classroom)) {
        batch.phase = "preparing";
        batch.current = null;
        setPlanningBatch(batch);
      } else {
        batch.paused = true;
        batch.phase = "manual";
        batch.pauseMessage = `A aula aberta não corresponde à aula ${expected?.lesson || "esperada"} da próxima prévia.`;
        setPlanningBatch(batch);
        return addLog(batch.pauseMessage);
      }
    }
    if (batch.phase === "replication-confirmed" || batch.phase === "replication-cancelled") {
      if (lesson === batch.current?.lesson) {
        const elapsed = Date.now() - (batch.current?.replicationClosedAt || batch.current?.replicationConfirmedAt || 0);
        const dialog = document.getElementById("dialogConfirmacao");
        if (dialog?.getClientRects().length || elapsed < 1200) {
          if (elapsed > 15000) {
            batch.paused = true;
            batch.phase = "manual";
            setPlanningBatch(batch);
            return addLog("A janela de replicação não fechou. Confira o SIAP antes de continuar.");
          }
          return setTimeout(resumePlanningBatch, 500);
        }
        const save = lessonSequenceSaveButton(batch);
        if (!save) {
          batch.paused = true;
          batch.phase = "manual";
          setPlanningBatch(batch);
          return addLog("A janela de replicação foi fechada, mas o SIAP não oferece um botão de salvar disponível. Confira a aula.");
        }
        batch.current.saveMethod = save.id === "cphFuncionalidade_cphCampos_btnSalvarProximo" ? "save-next" : "save-only";
        batch.current.saveStartedAt = Date.now();
        batch.phase = "saving";
        setPlanningBatch(batch);
        save.click();
        return;
      }
      batch.phase = "saving";
      setPlanningBatch(batch);
    }
    if (batch.phase === "saving") {
      if (lesson === batch.current?.lesson) {
        if (Date.now() - (batch.current?.saveStartedAt || 0) > 60000) {
          batch.paused = true;
          batch.phase = "manual";
          setPlanningBatch(batch);
          return addLog("O SIAP não confirmou a passagem à próxima aula. Confira o salvamento antes de continuar.");
        }
        if (batch.current?.saveMethod === "save-only" && Date.now() - batch.current.saveStartedAt >= 2000)
          void verifySequenceSaveFromLesson(batch);
        return setTimeout(resumePlanningBatch, 500);
      }
      if (batch.current?.saveMethod === "save-only") {
        batch.paused = true;
        batch.phase = "manual";
        batch.pauseMessage = `O SIAP abriu outra aula antes de confirmar o salvamento da aula ${batch.current.lesson}. Volte à quinzena para conferir o quadradinho.`;
        setPlanningBatch(batch);
        return addLog(batch.pauseMessage);
      }
      batch.index += 1;
      if (batch.index >= batch.plans.length) {
        setPlanningBatch(null);
        sessionStorage.removeItem("assistenteSiapLessonMultiPreview");
        render();
        return addLog(`${batch.plans.length} aula(s) da sequência foram salvas e o SIAP abriu a próxima aula.`);
      }
      batch.phase = "preparing";
      batch.current = null;
      setPlanningBatch(batch);
    }
    const expected = batch.plans[batch.index];
    if (!expected || lesson !== expected.lesson || canonicalClassroom(readContext().classroom) !== canonicalClassroom(expected.classroom)) {
      batch.paused = true;
      batch.phase = "manual";
      setPlanningBatch(batch);
      return addLog(`A aula aberta não corresponde à aula ${expected?.lesson || "esperada"} da prévia. Sequência pausada sem preencher esta aula.`);
    }
    if (batch.phase === "preparing") {
      if (!ensureLessonSequenceUnit(batch, expected)) return;
      if (!reconcileReplicatedLesson(batch, expected)) return;
      batch.current = { ...expected, planKey:`lesson-${batch.index}`, sequenceIndex:batch.index };
      batch.phase = "filling";
      delete batch.pauseMessage;
      setPlanningBatch(batch);
      return startPlanningFlow("ai");
    }
    if (batch.phase === "filling" && !sessionStorage.getItem("assistenteSiapPlanningFlow") && !batch.aiRequestedAt) return startPlanningFlow("ai");
  }

  function getPlanningBatch() {
    try { return JSON.parse(sessionStorage.getItem("assistenteSiapPlanningBatch") || "null"); } catch { return null; }
  }

  function setPlanningBatch(batch) {
    if (batch) sessionStorage.setItem("assistenteSiapPlanningBatch", JSON.stringify(batch));
    else sessionStorage.removeItem("assistenteSiapPlanningBatch");
    updateOperationStatus();
  }

  function startPlanningBatch() {
    const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!select) return addLog("Lista de períodos não encontrada.");
    const preview = getPlanningPreview();
    if (!preview?.queue?.length) return addLog("Gere e revise a prévia antes de iniciar.");
    if (preview.signature !== planningOverviewSignature()) {
      setPlanningPreview(null);
      render();
      return addLog("A quinzena mudou depois da prévia. Gere uma nova prévia para proteger os planejamentos existentes.");
    }
    const period = { value: select.value, label: select.selectedOptions?.[0]?.textContent?.trim() || "Período atual" };
    if (preview.draftsReady !== true) return addLog("Gere e confira metodologia e avaliação antes de iniciar.");
    const automaticEquivalent = preview.mode === "equivalent";
    setPlanningBatch({ active: true, runId:`apply-${Date.now()}-${Math.random()}`, paused: false, autoSave: automaticEquivalent, phase: "overview", periods: [period], periodIndex: 0, completed: 0, reviewedGroups: [], current: null, selectedQueue: preview.queue, queueIndex: 0, templates: preview.drafts || {}, mode: preview.mode });
    setPlanningPreview(null);
    render();
    setTimeout(resumePlanningBatch, 100);
  }

  function overviewItem(block) {
    const row = block.closest(".planejamentoContent");
    const subject = row?.previousElementSibling?.classList.contains("disciplina") ? row.previousElementSibling.textContent.trim() : "Disciplina";
    const grade = row?.querySelector(".serie")?.textContent.trim() || "Série";
    const classroomNode = row?.querySelector(".turma");
    const classroom = classroomNode ? [...classroomNode.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent.trim() : "Turma";
    return { onclick: block.getAttribute("onclick"), lesson: block.getAttribute("numeroaula"), subject, grade, classroom, group: `${grade} · ${subject}` };
  }

  function planningOverviewSignature() {
    const blocks = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula")];
    return blocks.map((block) => [
      block.getAttribute("codigoturma") || "",
      block.getAttribute("numeroaula") || "",
      block.classList.contains("naoPlanejada") ? "P" : block.classList.contains("planejada") ? "S" : "?"
    ].join(":")) .join("|");
  }

  function requestSiapPostBack(element) {
    const postback = Core.parsePostBackSources(
      element?.getAttribute("onclick"),
      element?.getAttribute("href")
    );
    if (!postback || !Core.isAllowedPostBackTarget(postback.target)) return false;
    document.dispatchEvent(new CustomEvent("assistente-siap:postback", { detail: JSON.stringify({ ...postback, elementId:element?.id || "" }) }));
    return true;
  }

  function resumePlanningBatch() {
    if (model.license?.active === false && !finishingAuthorizedFreeWork()) return lockAssistantAfterExpiry();
    const batch = getPlanningBatch();
    if (!batch) return;
    if (batch.mode === "lesson-sequence" && batch.paused && batch.phase === "manual" && !batch.current?.saveStartedAt &&
      batch.index > 0 && batch.recoveryAttemptedForIndex !== batch.index) {
      const expected = batch.plans?.[batch.index];
      const lesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value);
      if (expected && Core.pageType(location.pathname) === "planning-lesson" && lesson === expected.lesson &&
        canonicalClassroom(readContext().classroom) === canonicalClassroom(expected.classroom)) {
        batch.recoveryAttemptedForIndex = batch.index;
        batch.paused = false;
        batch.autoSave = true;
        batch.phase = "preparing";
        batch.current = null;
        delete batch.pauseMessage;
        setPlanningBatch(batch);
        addLog(`Conferindo seleções trazidas pelo SIAP para a aula ${lesson} e retomando a prévia já aprovada.`);
      }
    }
    if (batch.paused) return;
    if (batch.mode === "lesson-sequence") return resumeLessonSequence(batch);
    // O SIAP pode trocar de tela por postback antes de o observador atualizar o modelo.
    // Leia a página real novamente antes de criar a assinatura persistida do fluxo.
    model.page = Core.pageType(location.pathname);
    model.context = readContext();
    if (model.page === "planning-overview") {
      const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
      const period = batch.periods[batch.periodIndex];
      if (!period) { setPlanningBatch(null); return addLog("Lote concluído: não há mais quinzenas selecionadas."); }

      // Após salvar, o SIAP volta para o primeiro período da lista. Antes de
      // validar o bloco salvo ou procurar a próxima pendência, restaure a
      // quinzena do lote e aguarde um postback completo.
      if (batch.phase === "switching-period") {
        const changed = planningOverviewSignature() !== batch.switchSignature;
        const elapsed = Date.now() - (batch.switchStartedAt || 0);
        if (select?.value === batch.targetPeriod && (changed || elapsed >= 5000)) {
          batch.phase = batch.resumePhase || "overview";
          delete batch.resumePhase;
          delete batch.targetPeriod;
          delete batch.switchSignature;
          delete batch.switchStartedAt;
          setPlanningBatch(batch);
        } else if (elapsed >= 20000) {
          batch.paused = true;
          batch.phase = "manual";
          setPlanningBatch(batch);
          return addLog("O SIAP não confirmou a troca de quinzena. O lote foi pausado.");
        } else {
          return setTimeout(resumePlanningBatch, 500);
        }
      }
      if (select?.value !== period.value) {
        batch.resumePhase = batch.phase;
        batch.phase = "switching-period";
        batch.targetPeriod = period.value;
        batch.switchSignature = planningOverviewSignature();
        batch.switchStartedAt = Date.now();
        setPlanningBatch(batch);
        select.value = period.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(resumePlanningBatch, 500);
        return;
      }
      // Depois de clicar num bloco, aguarde a tela de edição. Sem esta trava o
      // watchdog clicava repetidamente no mesmo bloco enquanto o SIAP carregava.
      if (batch.phase === "saving") {
        const pendingBlock = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada")]
          .find((block) => block.getAttribute("onclick") === batch.current?.onclick);
        if (pendingBlock) {
          const attempts = (batch.current.saveAttempts || 0) + 1;
          batch.current.saveAttempts = attempts;
          if (attempts >= MAX_SAVE_ATTEMPTS) {
            batch.paused = true;
            batch.phase = "manual";
            setPlanningBatch(batch);
            return addLog(`O SIAP não confirmou o salvamento após ${MAX_SAVE_ATTEMPTS} tentativas. O lote foi pausado.`);
          }
          batch.phase = "preparing";
          setPlanningBatch(batch);
          addLog(`O bloco continuou em branco. Nova tentativa de salvamento (${attempts + 1}/${MAX_SAVE_ATTEMPTS}).`);
          return setTimeout(() => requestSiapPostBack(pendingBlock), Core.backoff(attempts));
        }
        if (Array.isArray(batch.selectedQueue)) {
          batch.current.saveAttempts = 0;
          batch.completed += 1;
          batch.queueIndex = (batch.queueIndex || 0) + 1;
          batch.phase = "overview";
          batch.current = null;
          setPlanningBatch(batch);
          return setTimeout(resumePlanningBatch, 100);
        }
        batch.current.saveAttempts = 0;
        batch.completed += 1;
        batch.phase = "overview";
        batch.current = null;
        setPlanningBatch(batch);
        return setTimeout(resumePlanningBatch, 100);
      }
      if (batch.phase === "return") {
        batch.phase = "overview";
        setPlanningBatch(batch);
      } else if (batch.phase !== "overview") {
        return;
      }
      let block;
      if (Array.isArray(batch.selectedQueue)) {
        while ((batch.queueIndex || 0) < batch.selectedQueue.length && !block) {
          const target = batch.selectedQueue[batch.queueIndex || 0];
          block = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada")]
            .find((candidate) => candidate.getAttribute("onclick") === target.onclick && candidate.getAttribute("codigoturma") === target.classCode && candidate.getAttribute("numeroaula") === target.lesson);
          if (!block) {
            batch.queueIndex = (batch.queueIndex || 0) + 1;
            addLog(`Aula ${target.lesson} ignorada porque deixou de estar em branco.`);
          }
        }
        if (!block && (batch.queueIndex || 0) >= batch.selectedQueue.length) {
          if (batch.previewOnly) {
            const preview = batch.previewMetadata || getPlanningPreview();
            const aliases = new Map();
            const drafts = {};
            const queue = preview.queue.map((item) => {
              const draft = batch.templates?.[item.planKey];
              if (!draft) return item;
              const alias = `${item.groupKey}|${draft.curriculumKey}`;
              if (!aliases.has(alias)) {
                aliases.set(alias, item.planKey);
                drafts[item.planKey] = draft;
              }
              return { ...item, planKey:aliases.get(alias) };
            });
            const summary = [...new Map(queue.map((item) => [`${item.grade}|${item.subject}`, item])).values()].map((item) => {
              const matches = queue.filter((entry) => entry.grade === item.grade && entry.subject === item.subject);
              return `${item.grade} · ${item.subject}: ${new Set(matches.map((entry) => entry.planKey)).size} planejamento(s) em ${matches.length} aula(s)`;
            });
            setPlanningPreview({ ...preview, queue, summary, drafts, uniquePlans:Object.keys(drafts).length, draftsReady:queue.every((item) => Boolean(drafts[item.planKey])), signature:planningOverviewSignature() });
            setPlanningBatch(null);
            render();
            return addLog("Prévia baseada nas habilidades e conteúdos de cada aula pronta para conferência. Nenhuma aula foi salva.");
          }
          setPlanningBatch(null);
          return addLog(`Lote concluído: ${batch.completed || 0} aula(s) revisada(s) e salva(s).`);
        }
      } else {
        block = document.querySelector("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.naoPlanejada");
      }
      if (!block) {
        batch.periodIndex += 1;
        setPlanningBatch(batch);
        return setTimeout(resumePlanningBatch, 100);
      }
      batch.current = { ...overviewItem(block), ...(Array.isArray(batch.selectedQueue) ? batch.selectedQueue[batch.queueIndex || 0] : {}) };
      batch.phase = "preparing";
      setPlanningBatch(batch);
      if (!requestSiapPostBack(block)) {
        batch.paused = true;
        batch.phase = "manual";
        setPlanningBatch(batch);
        addLog("Não foi possível abrir o bloco pelo postback reconhecido do SIAP.");
      }
      return;
    }
    if (model.page === "planning-lesson" && batch.phase === "return") {
      location.href = "/AcompanhamentoPlanejamentoProfessorListagem.aspx";
      return;
    }
    if (model.page === "planning-lesson" && batch.phase === "preparing") {
      const groupReviewed = batch.reviewedGroups.includes(batch.current?.group);
      batch.phase = "filling";
      setPlanningBatch(batch);
      startPlanningFlow(Array.isArray(batch.selectedQueue) ? "ai" : "local");
      if (!groupReviewed) return;
    }
    if (model.page === "planning-lesson" && batch.phase === "filling" && !sessionStorage.getItem("assistenteSiapPlanningFlow")) {
      if (batch.aiRequestedAt && Date.now() - batch.aiRequestedAt < 300000) return;
      startPlanningFlow(Array.isArray(batch.selectedQueue) ? "ai" : "local");
    }
  }

  function togglePlanningBatch() {
    const batch = getPlanningBatch();
    if (!batch) return;
    if (batch.mode === "lesson-sequence") {
      if (batch.phase === "manual") {
        const lesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value);
        const current = batch.plans?.[batch.index];
        if (batch.current?.saveStartedAt) {
          const page = Core.pageType(location.pathname);
          if (page !== "planning-overview" && !(page === "planning-lesson" && lesson === batch.current.lesson &&
            canonicalClassroom(readContext().classroom) === canonicalClassroom(batch.current.classroom)))
            return addLog("Volte à quinzena ou à aula que estava sendo salva. O Assistente precisa confirmar o quadradinho antes de abrir a próxima prévia.");
          batch.current.saveStartedAt = Date.now();
          batch.phase = "saving";
          batch.paused = false;
          batch.autoSave = true;
          delete batch.pauseMessage;
          setPlanningBatch(batch);
          render();
          setTimeout(resumePlanningBatch, 100);
          return;
        }
        if (!batch.current?.saveStartedAt && current && lesson === current.lesson &&
          canonicalClassroom(readContext().classroom) === canonicalClassroom(current.classroom)) {
          batch.current = null;
          batch.phase = "preparing";
          batch.paused = false;
          batch.autoSave = true;
          delete batch.pauseMessage;
          setPlanningBatch(batch);
          render();
          setTimeout(resumePlanningBatch, 100);
          return;
        }
        return addLog("Abra a aula indicada na prévia ou volte à quinzena. O Assistente não avançará sem confirmar o salvamento anterior.");
      }
      batch.paused = !batch.paused;
      batch.autoSave = !batch.paused;
      setPlanningBatch(batch);
      render();
      if (!batch.paused) setTimeout(resumePlanningBatch, 100);
      return;
    }
    if (!batch.paused) {
      batch.autoSave = false;
      batch.paused = true;
      setPlanningBatch(batch);
      render();
      return;
    }
    if (batch.paused && batch.phase === "manual" && model.page === "planning-lesson") {
      batch.paused = false;
      batch.phase = "filling";
      delete batch.aiRequestedAt;
      setPlanningBatch(batch);
      startPlanningFlow(Array.isArray(batch.selectedQueue) ? "ai" : "local");
      return;
    }
    if (batch.paused && model.page === "planning-lesson" && batch.phase === "review") {
      if (batch.previewOnly) {
        stopPlanningBatch();
        return addLog("Bloqueio de segurança: uma prévia nunca pode salvar uma aula.");
      }
      batch.paused = false;
      if (!batch.reviewedGroups.includes(batch.current?.group)) batch.reviewedGroups.push(batch.current.group);
      if (!Array.isArray(batch.selectedQueue) && openPlanningReplication()) return;
      batch.phase = "saving";
      setPlanningBatch(batch);
      document.getElementById("cphFuncionalidade_btnAlterar")?.click();
      return;
    }
    batch.paused = false;
    setPlanningBatch(batch);
    render();
    if (!batch.paused) setTimeout(resumePlanningBatch, 100);
  }

  function updateBatchAutoSave(event) {
    const batch = getPlanningBatch();
    if (!batch) return;
    batch.autoSave = event.currentTarget.checked === true;
    setPlanningBatch(batch);
    render();
  }

  function installManualPlanningSaveTracking() {
    document.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      const save = event.target.closest?.("#cphFuncionalidade_btnAlterar");
      if (!save || save.disabled) return;
      const batch = getPlanningBatch();
      if (!batch || !["review", "filling", "manual"].includes(batch.phase)) return;
      if (batch.previewOnly) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return addLog("Esta etapa gera somente a prévia. Nenhuma aula pode ser salva agora.");
      }
      if (Array.isArray(batch.selectedQueue) && batch.phase === "review" && panel.querySelector("#cm-batch-lesson-confirm")?.checked !== true) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return addLog("Confirme a revisão desta aula no assistente antes de salvar.");
      }
      batch.paused = false;
      if (!Array.isArray(batch.selectedQueue) && document.getElementById("cphFuncionalidade_cphCampos_btnReplicar")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (openPlanningReplication()) return;
        document.getElementById("cphFuncionalidade_btnAlterar")?.click();
        return;
      }
      batch.phase = "saving";
      setPlanningBatch(batch);
    }, true);
  }

  function stopPlanningBatch() {
    clearTimeout(planningResumeTimer);
    const batch = getPlanningBatch();
    if (batch?.previewOnly && batch.previewMetadata) {
      setPlanningPreview({ ...batch.previewMetadata, drafts:batch.templates || {}, draftsReady:false, signature:batch.previewMetadata.signature || planningOverviewSignature() });
    }
    setPlanningBatch(null);
    sessionStorage.removeItem("assistenteSiapPlanningFlow");
    sessionStorage.removeItem("assistenteSiapPlanningAi");
    sessionStorage.removeItem("assistenteSiapOpenReplicate");
    sessionStorage.removeItem("assistenteSiapConfirmReplicate");
    sessionStorage.removeItem("assistenteSiapSaveAfterReplicationCancel");
    addLog("Lote interrompido pelo professor. Nenhuma nova ação será iniciada.");
  }

  function planningSignature() {
    const current = readContext();
    const batch = getPlanningBatch();
    return [
      current.year || "",
      current.classroom || batch?.current?.classroom || "",
      current.subject || batch?.current?.subject || "",
      document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value || batch?.current?.lesson || ""
    ].join("|");
  }

  function planningLinks(kind) {
    const fragment = kind === "skill" ? "sHabilidades" : kind === "saeb" ? "sMatriz SAEB" : "sObjetivos";
    return [...document.querySelectorAll('#cphFuncionalidade_cphCampos_treeView a[href*="__doPostBack"]')]
      .filter((link) => decodeURIComponent(link.getAttribute("href") || "").includes(fragment));
  }

  function planningLinkForChoice(links, expected, index) {
    if (!expected) return links[index % links.length];
    const normalized = normalizePlanningGroup(expected);
    return links.find((link) => {
      const label = normalizePlanningGroup(link.textContent);
      return label.includes(normalized) || normalized.includes(label);
    });
  }

  function lessonSequenceMissingChoices(batch, kind) {
    if (batch?.mode !== "lesson-sequence" || !batch.current) return [];
    const expected = kind === "skill" ? batch.current.skills || [batch.current.skill] : batch.current.objectives || [batch.current.topic];
    const selected = kind === "skill" ? selectedPlanningSkills() : selectedPlanningObjectives();
    const available = kind === "content" ? planningLinks("content").map((link) => link.textContent || "") : [];
    return expected.filter((choice) => choice && !selected.some((value) => samePlanningChoices([value], [choice], available)));
  }

  function selectedPlanningSaeb() {
    const container = document.querySelector("#conteudomatrizsaebs .itens");
    if (!container) return [];
    const rows = [...container.querySelectorAll("tr")];
    const entries = rows.length ? rows : [container];
    return entries.map((entry) => String(entry.innerText || entry.textContent || "").replace(/\s+/g, " ").trim())
      .filter((value) => /\bD\s*\d+\s*[-–:]/i.test(value)).slice(0, 20);
  }

  function tryNextPlanningAxis(flow) {
    if (flow.lockedAxis) return false;
    const select = document.getElementById("ddlEixo");
    if (!select) return false;
    flow.triedAxes = Core.unique([...(flow.triedAxes || []), select.value]);
    const next = [...select.options].find((option) => option.value && !flow.triedAxes.includes(option.value));
    if (!next) return false;
    sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
    select.value = next.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function startPlanningFlow(mode = "local") {
    model.page = Core.pageType(location.pathname);
    model.context = readContext();
    if (!getPlanningBatch()) sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    if (mode === "ai") {
      const batchSettings = getPlanningBatch()?.previewMetadata;
      const guidance = batchSettings ? batchSettings.guidance || "" : panel.querySelector("#cm-plan-guidance")?.value.trim() || "";
      const concisePlanning = batchSettings ? batchSettings.concisePlanning === true : panel.querySelector('[data-plan-option="concisePlanning"]')?.getAttribute("aria-pressed") === "true";
      const conciseMethodology = batchSettings ? batchSettings.conciseMethodology === true : concisePlanning || panel.querySelector('[data-plan-option="conciseMethodology"]')?.getAttribute("aria-pressed") === "true";
      const conciseEvaluation = batchSettings ? batchSettings.conciseEvaluation === true : concisePlanning || panel.querySelector('[data-plan-option="conciseEvaluation"]')?.getAttribute("aria-pressed") === "true";
      sessionStorage.setItem("assistenteSiapPlanningAi", JSON.stringify({ guidance, concisePlanning, conciseMethodology, conciseEvaluation }));
    } else {
      sessionStorage.removeItem("assistenteSiapPlanningAi");
    }
    const signature = planningSignature();
    const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
    const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
    const batch = getPlanningBatch();
    const stage = batch?.mode === "lesson-sequence"
      ? lessonSequenceMissingChoices(batch, "skill").length ? "skill" : lessonSequenceMissingChoices(batch, "content").length ? "content" : "fill"
      : skillCount ? (contentCount ? "fill" : "content") : "skill";
    const axis = document.getElementById("ddlEixo");
    const manuallyChosenAxis = readStoredJson("assistenteSiapManualPlanningAxis");
    const lockedAxis = Boolean(batch?.mode === "lesson-sequence" || skillCount || contentCount || selectedPlanningSaeb().length || (manuallyChosenAxis?.signature === signature && manuallyChosenAxis.value === axis?.value));
    sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify({ signature, stage, lockedAxis }));
    updateOperationStatus();
    resumePlanningFlow();
  }

  function resumePlanningFlow() {
    if (Core.pageType(location.pathname) !== "planning-lesson") {
      sessionStorage.removeItem("assistenteSiapPlanningFlow");
      sessionStorage.removeItem("assistenteSiapPlanningAi");
      return;
    }
    let flow;
    try { flow = JSON.parse(sessionStorage.getItem("assistenteSiapPlanningFlow") || "null"); } catch { flow = null; }
    if (!flow) return;
    if (flow.signature !== planningSignature()) return stopPlanningFlow("A aula mudou durante o planejamento. Inicie novamente nesta aula.");
    if (flow.paused) return;
    const batch = getPlanningBatch();
    const lesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value) || 1;
    const selectionIndex = Number.isInteger(batch?.current?.sequenceIndex) ? batch.current.sequenceIndex : lesson - 1;
    if (flow.stage === "skill") {
      const links = planningLinks("skill");
      const contentLinks = planningLinks("content");
      if (!links.length && batch?.mode === "lesson-sequence") return stopPlanningFlow("O SIAP não oferece a habilidade adicional prevista nesta aula. Nenhuma aula foi salva.");
      if (!links.length) {
        if (flow.lockedAxis && !batch) {
          flow.stage = "fill";
          sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
          addLog("O SIAP não oferece habilidade nesta unidade e neste bimestre. A IA usará a unidade temática escolhida; confira as seleções antes de salvar.");
        } else {
        if (document.querySelector('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]')) {
          return stopPlanningFlow("O conteúdo escolhido foi preservado. Selecione uma habilidade compatível no SIAP e tente novamente.");
        }
        if (tryNextPlanningAxis(flow)) return;
        return stopPlanningFlow(flow.lockedAxis
          ? "A unidade temática escolhida não oferece habilidade e conteúdo simultaneamente neste bimestre. Sua escolha foi preservada; confira as opções no SIAP."
          : "Nenhum eixo curricular possui habilidade e conteúdo simultaneamente no bimestre atual.");
        }
      } else if (!contentLinks.length && (!flow.lockedAxis || batch?.active)) {
        if (tryNextPlanningAxis(flow)) return;
        return stopPlanningFlow(flow.lockedAxis
          ? "A unidade temática escolhida não oferece conteúdo neste bimestre. O lote foi pausado sem salvar."
          : "Nenhum eixo curricular possui habilidade e conteúdo simultaneamente no bimestre atual.");
      }
      if (flow.stage !== "fill") {
        flow.stage = "wait-skill";
        flow.waitStartedAt = Date.now();
        flow.pendingChoice = batch?.mode === "lesson-sequence" ? lessonSequenceMissingChoices(batch, "skill")[0] : "";
        sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
        if (!requestSiapPostBack(planningLinkForChoice(links, flow.pendingChoice, selectionIndex))) return stopPlanningFlow("Não foi possível selecionar a habilidade prevista no SIAP.");
        schedulePlanningResume();
        return;
      }
    }
    if (flow.stage === "wait-skill") {
      const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
      const pendingSkill = batch?.mode === "lesson-sequence" && flow.pendingChoice &&
        lessonSequenceMissingChoices(batch, "skill").some((choice) => normalizePlanningGroup(choice) === normalizePlanningGroup(flow.pendingChoice));
      if (!skillCount || pendingSkill) {
        if (Date.now() - (flow.waitStartedAt || 0) >= 15000) {
          flow.stage = "skill";
          if (tryNextPlanningAxis(flow)) return schedulePlanningResume();
          return stopPlanningFlow("O SIAP não confirmou a seleção automática da habilidade nas opções disponíveis. Nenhuma aula foi salva.");
        }
        schedulePlanningResume();
        return;
      }
      const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
      delete flow.pendingChoice;
      flow.stage = batch?.mode === "lesson-sequence" ? lessonSequenceMissingChoices(batch, "skill").length ? "skill" : lessonSequenceMissingChoices(batch, "content").length ? "content" : "fill" : contentCount ? "fill" : "content";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
      if (flow.stage === "skill") return schedulePlanningResume();
    }
    if (flow.stage === "content") {
      const links = planningLinks("content");
      if (!links.length) {
        if (batch?.active) return stopPlanningFlow("A unidade temática e a habilidade foram preservadas, mas o SIAP não oferece conteúdo nesta unidade e neste bimestre. O lote foi pausado sem salvar.");
        flow.stage = "fill";
        sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
        addLog("O SIAP não oferece conteúdo nesta unidade e neste bimestre. A IA usará a unidade temática e a habilidade escolhidas; confira o conteúdo antes de salvar.");
      } else {
        flow.stage = "wait-content";
        flow.waitStartedAt = Date.now();
        flow.pendingChoice = batch?.mode === "lesson-sequence" ? lessonSequenceMissingChoices(batch, "content")[0] : "";
        sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
        if (!requestSiapPostBack(planningLinkForChoice(links, flow.pendingChoice, selectionIndex))) return stopPlanningFlow("Não foi possível selecionar o objetivo previsto no SIAP.");
        schedulePlanningResume();
        return;
      }
    }
    if (flow.stage === "wait-content") {
      const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
      const pendingContent = batch?.mode === "lesson-sequence" && flow.pendingChoice &&
        lessonSequenceMissingChoices(batch, "content").some((choice) => normalizePlanningGroup(choice) === normalizePlanningGroup(flow.pendingChoice));
      if (!contentCount || pendingContent) {
        if (Date.now() - (flow.waitStartedAt || 0) >= 15000) {
          flow.stage = "skill";
          if (tryNextPlanningAxis(flow)) return schedulePlanningResume();
          return stopPlanningFlow("O SIAP não confirmou a seleção automática do conteúdo nas opções disponíveis. Nenhuma aula foi salva.");
        }
        schedulePlanningResume();
        return;
      }
      delete flow.pendingChoice;
      flow.stage = batch?.mode === "lesson-sequence" && lessonSequenceMissingChoices(batch, "content").length ? "content" : "fill";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
      if (flow.stage === "content") return schedulePlanningResume();
    }
    if (flow.stage === "fill" && !flow.saebChecked) {
      flow.saebChecked = true;
      const links = planningLinks("saeb");
      const selected = selectedPlanningSaeb();
      const expected = batch?.mode === "lesson-sequence" ? batch.current?.saeb : null;
      if (batch?.mode === "lesson-sequence" && links.length && !Array.isArray(expected))
        return stopPlanningFlow("A prévia anterior não registrou a Matriz SAEB. Gere e revise novamente as prévias antes de aplicar.");
      if (Array.isArray(expected) && !samePlanningChoices(selected, expected) && selected.length)
        return stopPlanningFlow("A Matriz SAEB desta aula difere da prévia. Nenhuma aula foi salva.");
      if (Array.isArray(expected) && expected.length && !links.length && !selected.length)
        return stopPlanningFlow("O descritor da Matriz SAEB previsto na prévia não está disponível nesta aula. Nenhuma aula foi salva.");
      if (links.length && !selected.length) {
        const link = Array.isArray(expected)
          ? expected.length ? links.find((option) => normalizePlanningGroup(option.textContent) === normalizePlanningGroup(expected[0])) : null
          : links[selectionIndex % links.length];
        if (Array.isArray(expected) && expected.length && !link)
          return stopPlanningFlow("O descritor da Matriz SAEB da prévia não aparece nas opções desta aula. Nenhuma aula foi salva.");
        if (!link) return stopPlanningFlow("A Matriz SAEB da prévia não foi identificada. Nenhuma aula foi salva.");
        flow.stage = "wait-saeb";
        flow.saebStartedAt = Date.now();
        sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
        if (!requestSiapPostBack(link)) return stopPlanningFlow("Não foi possível selecionar o descritor da Matriz SAEB no SIAP.");
        schedulePlanningResume();
        return;
      }
    }
    if (flow.stage === "wait-saeb") {
      const selected = selectedPlanningSaeb();
      const expected = batch?.mode === "lesson-sequence" ? batch.current?.saeb : null;
      if (!selected.length) {
        if (Date.now() - flow.saebStartedAt < 10000) return schedulePlanningResume();
        return stopPlanningFlow("O SIAP não confirmou a seleção da Matriz SAEB. Confira o descritor antes de continuar.");
      }
      if (Array.isArray(expected) && !samePlanningChoices(selected, expected))
        return stopPlanningFlow("O SIAP selecionou um descritor da Matriz SAEB diferente da prévia. Nenhuma aula foi salva.");
      flow.stage = "fill";
    }
    if (flow.stage === "fill") {
      sessionStorage.removeItem("assistenteSiapPlanningFlow");
      const aiRequested = sessionStorage.getItem("assistenteSiapPlanningAi");
      if (aiRequested) return generatePlanningAiDraft(aiRequested);
      generatePlanningDraft();
    }
  }

  function stopPlanningFlow(message) {
    clearTimeout(planningResumeTimer);
    model.busyMessage = "";
    sessionStorage.removeItem("assistenteSiapPlanningFlow");
    sessionStorage.removeItem("assistenteSiapPlanningAi");
    sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    const batch = getPlanningBatch();
    if (batch?.active) {
      batch.paused = true;
      batch.phase = "manual";
      setPlanningBatch(batch);
    }
    addLog(message);
    updateOperationStatus();
  }

  function generatePlanningDraft() {
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    if (!(methodology instanceof HTMLTextAreaElement) || !(evaluation instanceof HTMLTextAreaElement)) return addLog("Planejamento não preenchido: estrutura diferente da esperada.");
    const subject = model.context.subject || "componente curricular";
    const normalizedSubject = subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const isPhysicalEducation = normalizedSubject.includes("EDUCACAO FISICA");
    const isArt = normalizedSubject === "ARTE" || normalizedSubject.includes("ARTES");
    const thematicUnit = document.getElementById("ddlEixo")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const isDance = isPhysicalEducation && normalizePlanningGroup(thematicUnit).includes("DANCA");
    const batchState = getPlanningBatch();
    const approvedTemplate = batchState?.templates?.[batchState.current?.group];
    const contentFields = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]')];
    const contentDescription = isDance
      ? "Exploração de movimentos e sequências coreográficas relacionados à dança e à habilidade escolhida."
      : isPhysicalEducation
      ? "Vivência prática do conteúdo selecionado, com orientação sobre regras, segurança, cooperação e respeito às diferentes possibilidades de participação."
      : isArt
        ? "Apreciação, contextualização e experimentação artística relacionadas ao conteúdo selecionado, com produção e socialização das aprendizagens."
        : "Desenvolvimento do conteúdo selecionado por meio de leitura, análise, discussão orientada e atividade de aplicação.";
    contentFields.forEach((field) => {
      if (!field.value.trim()) field.value = contentDescription;
    });
    const selectedContentTitles = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"] .cabecalhoConteudo span')]
      .map((span) => (span.getAttribute("title") || span.textContent || "").trim().replace(/[\s:;,.]+$/, ""))
      .filter(Boolean);
    const contents = (selectedContentTitles.length ? selectedContentTitles : contentFields.map((field) => field.value.trim().replace(/[\s:;,.]+$/, "")))
      .filter(Boolean).slice(0, 3);
    const selectedSkill = document.querySelector("#cphFuncionalidade_cphCampos_gdvExpectativas tr")?.textContent?.trim() || "";
    const selectedSaeb = selectedPlanningSaeb();
    const focus = [contents.length ? contents.join(", ") : thematicUnit || selectedSkill || "os objetivos e conteúdos selecionados", ...selectedSaeb].join("; ");
    const generatedMethodology = isDance
      ? `Apresentar referências de ${focus} e orientar a exploração de movimentos, ritmos e formas de composição. Propor uma sequência coreográfica coerente com a habilidade escolhida, com tempo para criação, ensaio e apreciação. Encerrar com registro ou comentário sobre as escolhas de movimento e as aprendizagens.`
      : isPhysicalEducation
      ? `Iniciar com acolhida, apresentação dos objetivos e preparação corporal adequada. Organizar a turma em atividades práticas progressivas sobre ${focus}, com demonstração dos movimentos, estações de experimentação e situações cooperativas. Reforçar regras, segurança, respeito e inclusão durante as vivências. Encerrar com volta à calma e conversa breve sobre estratégias, dificuldades e aprendizagens.`
      : isArt
        ? `Iniciar com apreciação e contextualização de referências relacionadas a ${focus}. Propor experimentação orientada de materiais, técnicas e formas de expressão, seguida de produção individual ou coletiva. Acompanhar o processo criativo com intervenções que valorizem autoria, diversidade cultural e reflexão estética. Finalizar com socialização das produções e síntese das aprendizagens.`
        : `Iniciar com uma breve retomada dos conhecimentos prévios da ${model.context.grade || "turma"} e apresentar o objetivo da aula. Desenvolver atividades participativas sobre ${focus}, com explicação objetiva, leitura ou análise orientada e aplicação prática. Fazer intervenções durante a atividade, respeitando diferentes ritmos de aprendizagem, e encerrar com síntese coletiva do que foi aprendido em ${subject}.`;
    const generatedEvaluation = isDance
      ? "Observar a criação, a participação e a apreciação das sequências coreográficas, conforme a habilidade escolhida."
      : isPhysicalEducation
      ? `Realizar avaliação contínua e formativa por meio da observação da participação nas práticas, compreensão das regras, execução progressiva dos movimentos, cooperação, respeito e cuidado com a segurança. Registrar avanços e dificuldades para orientar adaptações e retomadas nas aulas seguintes.`
      : isArt
        ? `Avaliar de forma processual a participação, a experimentação de materiais e técnicas, a relação entre a produção e o conteúdo estudado, a autoria e a capacidade de apreciar e comentar as produções próprias e dos colegas. Registrar avanços para orientar novas propostas.`
        : `Realizar avaliação contínua e formativa na ${model.context.grade || "turma"} por meio da observação da participação, da compreensão das orientações e da aplicação dos conteúdos selecionados nas atividades propostas. Registrar avanços e dificuldades para orientar retomadas e adequações nas aulas seguintes.`;
    if (!methodology.value.trim()) {
      const shorterMethodology = batchState?.previewMetadata?.conciseMethodology === true ||
        panel.querySelector('[data-plan-option="concisePlanning"]')?.getAttribute("aria-pressed") === "true" ||
        panel.querySelector('[data-plan-option="conciseMethodology"]')?.getAttribute("aria-pressed") === "true";
      methodology.value = approvedTemplate?.methodology || conciseMethodologyText(generatedMethodology, shorterMethodology);
    }
    if (!evaluation.value.trim()) evaluation.value = approvedTemplate?.evaluation || generatedEvaluation;
    [...contentFields, methodology, evaluation].forEach((field) => { field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })); });
    addLog("Habilidade, conteúdo e campos vazios preparados. Revise tudo antes de salvar.");
    const batch = getPlanningBatch();
    if (!batch && contentFields.length && autoSaveAndReplicatePlanningIfRequested()) return;
    if (!batch && !contentFields.length) sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    if (batch && batch.phase === "filling") {
      const methodologyText = methodology.value;
      const evaluationText = evaluation.value;
      batch.templates = batch.templates || {};
      batch.templates[batch.current.group] = { methodology: methodologyText, evaluation: evaluationText };
      if (!batch.autoSave) {
        batch.paused = true;
        batch.phase = "review";
        setPlanningBatch(batch);
        render();
      } else if (batch.previewOnly) {
        stopPlanningBatch();
        return addLog("Bloqueio de segurança: uma prévia nunca pode salvar uma aula.");
      } else {
        if (openPlanningReplication()) return;
        batch.phase = "saving";
        setPlanningBatch(batch);
        document.getElementById("cphFuncionalidade_btnAlterar")?.click();
      }
    }
  }

  async function generatePlanningAiDraft(rawRequest) {
    sessionStorage.removeItem("assistenteSiapPlanningAi");
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    const contentFields = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]')]
      .filter((field) => field instanceof HTMLTextAreaElement);
    if (!(methodology instanceof HTMLTextAreaElement) || !(evaluation instanceof HTMLTextAreaElement)) {
      return addLog("Planejamento não preenchido: estrutura diferente da esperada.");
    }
    let request = {};
    try { request = JSON.parse(rawRequest) || {}; } catch { request = {}; }
    const batch = getPlanningBatch();
    const selectedSkills = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr")]
      .map((row) => row.textContent.trim()).filter(Boolean).slice(0, 20);
    const selectedContents = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"] .cabecalhoConteudo span')]
      .map((span) => (span.getAttribute("title") || span.textContent || "").trim()).filter(Boolean).slice(0, 20);
    const selectedSaeb = selectedPlanningSaeb();
    const saebAvailable = Boolean(selectedSaeb.length || planningLinks("saeb").length);
    const payload = {
      kind:"planning",
      grade:model.context.grade || "Turma não identificada",
      subject:(model.context.subject || "Componente curricular").replace(/^\d+\s*-\s*/, ""),
      period:model.context.term || "",
      thematicUnit:document.getElementById("ddlEixo")?.selectedOptions?.[0]?.textContent?.trim() || "",
      lessonSequence:Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value) || 0,
      guidance:[
        typeof request.guidance === "string" ? request.guidance : "",
        `Escreva a metodologia em até três frases e ${request.conciseMethodology === true ? 30 : 45} palavras.`,
        request.conciseEvaluation === true ? "Faça a avaliação curta e sucinta." : ""
      ].filter(Boolean).join(" "),
      conciseMethodology:request.conciseMethodology === true,
      conciseEvaluation:request.conciseEvaluation === true,
      educationalContext:selectedSaeb.length ? `Descritor da Matriz SAEB selecionado no SIAP: ${selectedSaeb.join("; ")}` : "",
      selectedSkills,
      selectedContents,
      selectedSaeb,
      saebAvailable,
      tense:"planned"
    };
    if (!selectedSkills.length && !selectedContents.length && !payload.thematicUnit) {
      return stopPlanningFlow("Não foi possível identificar habilidade ou conteúdo desta aula. Confira as seleções no SIAP antes de gerar a prévia.");
    }
    const curriculumKey = planningCurriculumKey(payload);
    const template = batch?.current?.planKey ? batch.templates?.[batch.current.planKey] : null;
    if (batch?.mode === "lesson-sequence" && (!selectedSkills.length || !selectedContents.length || !contentFields.length)) {
      batch.paused = true;
      batch.phase = "manual";
      setPlanningBatch(batch);
      return addLog("O SIAP não confirmou habilidade, objetivo ou descrição desta aula. Sequência pausada sem salvar.");
    }
    const expectedTopics = (template?.expectedTopics || [template?.expectedTopic]).filter(Boolean).map(normalizePlanningGroup);
    const topicMatches = template?.origin === "lesson-sequence"
      ? samePlanningChoices(selectedContents, template?.expectedTopics || [template?.expectedTopic], planningLinks("content").map((link) => link.textContent || ""))
      : expectedTopics.every((expected) => selectedContents.some((content) => normalizePlanningGroup(content).includes(expected)));
    const expectedSkills = (template?.expectedSkills || [template?.expectedSkill]).filter(Boolean).map(normalizePlanningGroup);
    const skillMatches = template?.origin === "lesson-sequence"
      ? samePlanningChoices(selectedSkills, template?.expectedSkills || [template?.expectedSkill])
      : expectedSkills.every((expected) => selectedSkills.some((skill) => normalizePlanningGroup(skill).includes(expected)));
    const saebMatches = template?.origin === "lesson-sequence"
      ? samePlanningChoices(selectedSaeb, template.expectedSaeb || []) : true;
    const expectedUnit = template?.expectedUnit ? normalizePlanningGroup(template.expectedUnit) : "";
    const unitMatches = !expectedUnit || normalizePlanningGroup(payload.thematicUnit) === expectedUnit;
    if (template && !batch.previewOnly && (template.origin === "lesson-sequence" ? !topicMatches || !skillMatches || !saebMatches || !unitMatches : template.curriculumKey !== curriculumKey)) {
      batch.paused = true;
      batch.phase = "manual";
      const differences = [!skillMatches && "habilidade", !topicMatches && "objetivo", !saebMatches && "Matriz SAEB", !unitMatches && "unidade temática"].filter(Boolean);
      batch.pauseMessage = template.origin === "lesson-sequence"
        ? `Aula ${batch.current?.lesson || payload.lessonSequence}: ${differences.join(", ")} ${differences.length === 1 ? "não corresponde" : "não correspondem"} à prévia. Nenhuma alteração foi salva nesta aula.`
        : "As escolhas curriculares desta aula não correspondem à prévia. Nenhuma alteração foi salva.";
      setPlanningBatch(batch);
      return addLog(batch.pauseMessage);
    }
    const equivalentDraft = batch?.previewOnly ? Object.values(batch.templates || {}).find((draft) => draft.groupKey === batch.current?.groupKey && draft.curriculumKey === curriculumKey) : null;
    if (batch?.active && batch.phase === "filling") {
      batch.aiRequestedAt = Date.now();
      setPlanningBatch(batch);
    }
    const run = { cancelled:false, paused:false, resume:null };
    planningAiRun = run;
    let aiTimeout;
    setOperationStatus("Gerando planejamento...");
    addLog("Gerando o planejamento com IA…");
    try {
      const result = template || equivalentDraft ? { ok: true, fields: (template || equivalentDraft).fields } : await Promise.race([
        chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_AI_DRAFT", payload }),
        new Promise((_, reject) => { aiTimeout = setTimeout(() => reject(new Error("timeout")), 90000); })
      ]);
      if (run.cancelled) return;
      if (run.paused) await new Promise((resolve) => { run.resume = resolve; });
      if (run.cancelled) return;
      if (batch?.active) {
        const currentBatch = getPlanningBatch();
        if (!currentBatch || currentBatch.runId !== batch.runId || currentBatch.paused || currentBatch.phase !== "filling" || currentBatch.current?.planKey !== batch.current?.planKey) return;
      }
      if (!result?.ok || !Array.isArray(result.fields) || result.fields.length !== 4) {
        return stopPlanningFlow(result?.message || "A IA não devolveu os quatro campos esperados.");
      }
      if (!template && request.concisePlanning === true) result.fields[1] = concisePlanningText(result.fields[1], 1, 30);
      if (!template) result.fields[2] = conciseMethodologyText(result.fields[2], request.conciseMethodology === true);
      if (!template && request.conciseEvaluation === true) result.fields[3] = concisePlanningText(result.fields[3], 1, 22);
      if (batch?.active) delete batch.aiRequestedAt;
      if (batch?.active && batch.phase === "filling" && batch.previewOnly) {
        batch.templates = batch.templates || {};
        if (batch.current?.planKey) {
          batch.templates[batch.current.planKey] = {
            fields: result.fields.map((field) => String(field || "").trim()),
            label: `${batch.current.grade} · ${batch.current.subject} · aula ${batch.current.lesson} · ${selectedContents.join(", ").slice(0, 90)}`,
            groupKey:batch.current.groupKey,
            curriculumKey,
            thematicUnit:payload.thematicUnit,
            selectedSkills,
            selectedContents,
            selectedSaeb,
            saebAvailable
          };
        }
        batch.previewMetadata = { ...(batch.previewMetadata || {}), drafts:batch.templates, draftsReady:false };
        batch.completed += 1;
        batch.queueIndex = (batch.queueIndex || 0) + 1;
        batch.phase = "return";
        setPlanningBatch(batch);
        location.href = "/AcompanhamentoPlanejamentoProfessorListagem.aspx";
        return;
      }
      if (batch?.mode === "lesson-sequence" &&
        ((methodology.value.trim() && methodology.value.trim() !== String(result.fields[2] || "").trim()) ||
          (evaluation.value.trim() && evaluation.value.trim() !== String(result.fields[3] || "").trim()))) {
        batch.paused = true;
        batch.phase = "manual";
        setPlanningBatch(batch);
        return addLog("Esta aula já tem metodologia ou avaliação diferente da prévia. Sequência pausada sem salvar.");
      }
      contentFields.forEach((field) => { if (!field.value.trim()) field.value = String(result.fields[1] || "").trim(); });
      if (!batch || !methodology.value.trim()) methodology.value = String(result.fields[2] || "").trim();
      if (!batch || !evaluation.value.trim()) evaluation.value = String(result.fields[3] || "").trim();
      [...contentFields, methodology, evaluation].forEach((field) => {
        field.dispatchEvent(new Event("input", { bubbles:true }));
        field.dispatchEvent(new Event("change", { bubbles:true }));
      });
      if (!batch && contentFields.length && autoSaveAndReplicatePlanningIfRequested()) return;
      if (!batch && !contentFields.length) sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
      if (batch?.active && batch.phase === "filling") {
        batch.templates = batch.templates || {};
        if (batch.current?.planKey && !batch.templates[batch.current.planKey]) batch.templates[batch.current.planKey] = { fields: result.fields.map((field) => String(field || "").trim()), label: `${batch.current.grade} · ${batch.current.subject} · aula ${batch.current.lesson}`, groupKey:batch.current.groupKey, curriculumKey };
        if (batch.previewOnly) {
          stopPlanningBatch();
          return addLog("Bloqueio de segurança: uma prévia nunca pode salvar uma aula.");
        }
        if (batch.autoSave) {
          if (batch.mode === "lesson-sequence") {
            const saveNext = document.getElementById("cphFuncionalidade_cphCampos_btnSalvarProximo");
            const save = lessonSequenceSaveButton(batch);
            if (!save) {
              batch.paused = true;
              batch.phase = "manual";
              batch.pauseMessage = "O SIAP não apresentou um botão de salvar disponível. Aula preenchida, mas sequência pausada sem salvar.";
              setPlanningBatch(batch);
              return addLog(batch.pauseMessage);
            }
            batch.current.saveMethod = save === saveNext ? "save-next" : "save-only";
            setPlanningBatch(batch);
            if (batch.replicate && openPlanningReplication()) return;
            if (batch.replicate) addLog("O SIAP não oferece replicação nesta aula. Salvando a sequência na turma atual.");
            batch.current.saveStartedAt = Date.now();
            batch.phase = "saving";
            setPlanningBatch(batch);
            save.click();
          } else if (Array.isArray(batch.selectedQueue) || !openPlanningReplication()) {
            batch.phase = "saving";
            setPlanningBatch(batch);
            document.getElementById("cphFuncionalidade_btnAlterar")?.click();
          }
        } else {
          batch.paused = true;
          batch.phase = "review";
          setPlanningBatch(batch);
          render();
        }
      }
      addLog(template ? "Planejamento equivalente aplicado. Revise esta aula; nada foi salvo." : "Planejamento gerado com IA. Revise habilidade, conteúdo, Matriz SAEB (se houver) e textos; nada foi salvo.");
    } catch (error) {
      if (!run.cancelled) stopPlanningFlow(error?.message === "timeout"
        ? "A geração demorou mais de 90 segundos. Tente novamente; nenhuma aula foi salva."
        : "Não foi possível acessar a IA do Assistente SIAP. Verifique o acesso à extensão e tente novamente.");
    } finally {
      clearTimeout(aiTimeout);
      if (planningAiRun === run) planningAiRun = null;
      setOperationStatus("");
    }
  }

  function reportPlanningActionError(message) {
    model.planningActionFeedback = message;
    addLog(message);
  }

  function applyReviewedPlanning(replicate = false) {
    model.planningActionFeedback = "";
    const preview = getLessonMultiPreview();
    if (!preview?.plans?.length || !lessonMultiPreviewIsCurrent(preview)) return reportPlanningActionError("As prévias não estão prontas ou as escolhas do SIAP mudaram. Gere e revise as prévias antes de aplicar.");
    return startLessonSequence(replicate);
  }

  function savePlanning(replicate = false) {
    const save = document.getElementById("cphFuncionalidade_btnAlterar");
    if (!save || save.disabled) return addLog("O botão Salvar não está disponível nesta aula.");
    if (!document.querySelector('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]')) return addLog("O SIAP não apresenta conteúdo selecionado para esta aula. Escolha um conteúdo compatível antes de salvar pelo Assistente.");
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    if (!methodology?.value?.trim() || !evaluation?.value?.trim()) return addLog("Preencha metodologia e avaliação antes de aplicar o planejamento.");
    if (replicate) {
      if (openPlanningReplication()) return;
      addLog("O SIAP não oferece replicação nesta aula. Salvando somente a aula atual.");
    }
    save.click();
  }

  function autoSaveAndReplicatePlanningIfRequested() {
    const signature = planningSignature();
    if (sessionStorage.getItem("assistenteSiapAutoSaveReplicate") !== signature) return false;
    sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    if (openPlanningReplication()) return true;
    const save = document.getElementById("cphFuncionalidade_btnAlterar");
    if (!save || save.disabled) {
      addLog("O SIAP não oferece replicação nem salvamento nesta aula. Confira os campos antes de continuar.");
      return true;
    }
    addLog("O SIAP não oferece replicação nesta aula. Salvando somente a aula atual.");
    save.click();
    return true;
  }

  function openPlanningReplication() {
    const replicate = document.getElementById("cphFuncionalidade_cphCampos_btnReplicar");
    if (!replicate || replicate.disabled) return false;
    const signature = planningSignature();
    const batch = getPlanningBatch();
    if (batch?.active) {
      batch.phase = "replicating";
      setPlanningBatch(batch);
    }
    sessionStorage.removeItem("assistenteSiapOpenReplicate");
    sessionStorage.setItem("assistenteSiapConfirmReplicate", signature);
    sessionStorage.setItem("assistenteSiapReplicationOpenedAt", String(Date.now()));
    addLog("Planejamento concluído. Abrindo a replicação automática.");
    replicate.click();
    return true;
  }

  function resumeReplicateAfterSave() {
    const expected = sessionStorage.getItem("assistenteSiapOpenReplicate");
    if (!expected || expected !== planningSignature()) return;
    const replicate = document.getElementById("cphFuncionalidade_cphCampos_btnReplicar");
    if (!replicate || replicate.disabled) return;
    sessionStorage.removeItem("assistenteSiapOpenReplicate");
    sessionStorage.setItem("assistenteSiapConfirmReplicate", expected);
    replicate.click();
  }

  function finishUnavailableReplication(expected, reason = "Replicação indisponível") {
    sessionStorage.removeItem("assistenteSiapConfirmReplicate");
    sessionStorage.removeItem("assistenteSiapReplicationOpenedAt");
    const batch = getPlanningBatch();
    const modal = document.getElementById("dialogConfirmacao");
    if (modal?.getClientRects().length) {
      const cancel = document.getElementById("cphFuncionalidade_cphCampos_btnCancelarReplicar");
      if (!cancel || cancel.disabled || !cancel.getClientRects().length) {
        if (batch) { batch.paused = true; batch.phase = "manual"; setPlanningBatch(batch); }
        return addLog("O SIAP não permitiu replicar e não apresentou Cancelar. Confira esta aula.");
      }
      if (batch?.mode === "lesson-sequence") {
        batch.current.replicationClosedAt = Date.now();
        batch.phase = "replication-cancelled";
        setPlanningBatch(batch);
      } else {
        sessionStorage.setItem("assistenteSiapSaveAfterReplicationCancel", JSON.stringify({ signature:expected, startedAt:Date.now() }));
      }
      addLog(`${reason}. Fechando a janela antes de salvar esta aula.`);
      cancel.click();
      setTimeout(batch?.mode === "lesson-sequence" ? resumePlanningBatch : resumeAfterReplicationCancel, 1200);
      return;
    }
    const save = batch?.mode === "lesson-sequence" ? lessonSequenceSaveButton(batch) : document.getElementById("cphFuncionalidade_btnAlterar");
    if (!save || save.disabled) {
      if (batch) { batch.paused = true; batch.phase = "manual"; setPlanningBatch(batch); }
      return addLog("O SIAP não permitiu replicar nem salvar esta aula. Confira os campos.");
    }
    if (batch) {
      if (batch.mode === "lesson-sequence") {
        batch.current.saveMethod = save.id === "cphFuncionalidade_cphCampos_btnSalvarProximo" ? "save-next" : "save-only";
        batch.current.saveStartedAt = Date.now();
      }
      batch.phase = "saving";
      setPlanningBatch(batch);
    }
    addLog(`${reason}. Salvando esta aula sem replicar.`);
    save.click();
  }

  function completeReplicationIfRequested() {
    const expected = sessionStorage.getItem("assistenteSiapConfirmReplicate");
    if (!expected || expected !== planningSignature()) return;
    const dialog = document.getElementById("divTurmasReplicacao") || document.querySelector('[id$="_divTurmasReplicacao"]');
    const confirmationDialog = document.getElementById("dialogConfirmacao");
    const replicationType = document.getElementById("cphFuncionalidade_cphCampos_ddlTipoReplicacao");
    const confirm = document.getElementById("cphFuncionalidade_cphCampos_btnConfirmarReplicar");
    const openedAt = Number(sessionStorage.getItem("assistenteSiapReplicationOpenedAt")) || Date.now();
    const batch = getPlanningBatch();
    if (confirmationDialog?.getClientRects().length && confirmationDialog.contains(confirm)
      && replicationType?.value === "PROXIMA" && !replicationType.disabled
      && confirm && !confirm.disabled && confirm.getClientRects().length) {
      if (batch?.mode === "lesson-sequence" && batch.plans?.slice(batch.index + 1).some((plan) =>
        canonicalClassroom(plan.classroom) === canonicalClassroom(batch.current?.classroom) && Number(plan.lesson) === Number(batch.current?.lesson) + 1))
        return finishUnavailableReplication(expected, "A próxima aula tem uma prévia própria");
      sessionStorage.removeItem("assistenteSiapConfirmReplicate");
      sessionStorage.removeItem("assistenteSiapReplicationOpenedAt");
      if (batch?.mode === "lesson-sequence") {
        batch.current.replicationConfirmedAt = Date.now();
        batch.phase = "replication-confirmed";
        setPlanningBatch(batch);
        addLog("Confirmando a replicação no SIAP; depois a aula será salva pelo botão disponível.");
        confirm.click();
        setTimeout(resumePlanningBatch, 1200);
        return;
      }
      if (batch) { batch.phase = "saving"; setPlanningBatch(batch); }
      addLog("Confirmando a replicação na próxima aula da mesma turma.");
      confirm.click();
      return;
    }
    if (!dialog || !dialog.getClientRects().length) {
      if (Date.now() - openedAt < 8000) return setTimeout(completeReplicationIfRequested, 200);
      return finishUnavailableReplication(expected);
    }
    const inputs = [...dialog.querySelectorAll('input[type="checkbox"]')];
    if (!inputs.length) {
      if (Date.now() - openedAt < 3000) return setTimeout(completeReplicationIfRequested, 200);
    }
    const reservedClasses = new Set(batch?.mode === "lesson-sequence"
      ? batch.plans?.slice(batch.index + 1).map((plan) => canonicalClassroom(plan.classroom)) : []);
    const targets = inputs.filter((input) => {
      if (input.disabled) return false;
      if (!reservedClasses.size) return true;
      const label = (input.closest("label")?.textContent || input.parentElement?.textContent || "").match(/\b\d+[A-Z]\b/i)?.[0];
      return label && !reservedClasses.has(canonicalClassroom(label));
    });
    if (!targets.length) {
      return finishUnavailableReplication(expected, reservedClasses.size ? "As turmas disponíveis têm prévias próprias ou não foram identificadas com segurança" : "Replicação indisponível");
    }
    if (!confirm || confirm.disabled || !confirm.getClientRects().length) {
      if (Date.now() - openedAt < 8000) return setTimeout(completeReplicationIfRequested, 200);
      return finishUnavailableReplication(expected);
    }
    inputs.forEach((input) => {
      const checked = targets.includes(input);
      if (input.checked === checked) return;
      input.checked = checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    sessionStorage.removeItem("assistenteSiapConfirmReplicate");
    sessionStorage.removeItem("assistenteSiapReplicationOpenedAt");
    if (batch?.mode === "lesson-sequence") {
      batch.current.replicationConfirmedAt = Date.now();
      batch.phase = "replication-confirmed";
    } else if (batch) batch.phase = "saving";
    if (batch) setPlanningBatch(batch);
    confirm.click();
    if (batch?.mode === "lesson-sequence") setTimeout(resumePlanningBatch, 1200);
  }

  function resumeAfterReplicationCancel() {
    const pending = readStoredJson("assistenteSiapSaveAfterReplicationCancel");
    if (!pending) return;
    if (pending.signature !== planningSignature() || Date.now() - pending.startedAt > 15000) {
      sessionStorage.removeItem("assistenteSiapSaveAfterReplicationCancel");
      const batch = getPlanningBatch();
      if (batch) { batch.paused = true; batch.phase = "manual"; setPlanningBatch(batch); }
      return addLog("O SIAP não confirmou o fechamento da replicação. Confira a aula antes de salvar.");
    }
    if (document.getElementById("dialogConfirmacao")?.getClientRects().length) return setTimeout(resumeAfterReplicationCancel, 500);
    const save = document.getElementById("cphFuncionalidade_btnAlterar");
    sessionStorage.removeItem("assistenteSiapSaveAfterReplicationCancel");
    if (!save || save.disabled) return addLog("O botão Salvar não está disponível. Confira a aula no SIAP.");
    const batch = getPlanningBatch();
    if (batch) { batch.phase = "saving"; setPlanningBatch(batch); }
    save.click();
  }

  function generatePeiDraft() {
    const fields = getPeiFields();
    if (fields.length !== 4) return addLog("PEI não preenchido: estrutura diferente da esperada.");
    const subject = (model.context.subject || "componente curricular").replace(/^\d+\s*-\s*/, "");
    const grade = model.context.grade || "turma";
    const guidance = panel.querySelector("#cm-pei-guidance")?.value.trim() || "";
    const guidanceNormalized = guidance.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const selectedFocuses = [...panel.querySelectorAll("[data-pei-focus]:checked")].map((input) => input.dataset.peiFocus);
    const requestedName = panel.querySelector("#cm-pei-use-name")?.checked === true || /(?:use|utilize|coloque|inclua).{0,25}nome/.test(guidanceNormalized);
    const rawName = document.getElementById("cphFuncionalidade_cphCampos_txtNomeEstudante")?.value.trim() || "";
    const studentName = rawName.toLocaleLowerCase("pt-BR").replace(/(^|\s)(\p{L})/gu, (_, space, letter) => `${space}${letter.toLocaleUpperCase("pt-BR")}`);
    const student = requestedName && studentName ? studentName : "o estudante";
    const realized = panel.querySelector('[name="cm-pei-tense"]:checked')?.value === "realized" || /(?:trabalho realizado|escreva no passado|foi trabalhado|houve muito)/.test(guidanceNormalized);
    const sourceIds = [
      "cphFuncionalidade_cphCampos_txtPotencialidadesCognitivas",
      "cphFuncionalidade_cphCampos_txtPotencialidadesHabilidades",
      "cphFuncionalidade_cphCampos_txtNecessidadesCognitivas",
      "cphFuncionalidade_cphCampos_txtNecessidadesHabilidades"
    ];
    const source = sourceIds.map((id) => document.getElementById(id)?.value || "").join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const diagnosis = (document.getElementById("cphFuncionalidade_cphCampos_txtNomeNecessidadeEspecial")?.value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const supports = [];
    if (/visual|imagem|concreto/.test(source)) supports.push("apoios visuais e exemplos concretos");
    if (/objetiv|comando|etapa|rotina/.test(source)) supports.push("orientações objetivas, rotina previsível e tarefas divididas em etapas");
    if (/mediacao|acompanhamento|apoio constante|individual/.test(source)) supports.push("mediação pedagógica gradual e acompanhamento individual quando necessário");
    if (/interacao|social|colega|coletiv/.test(source)) supports.push("interação mediada e atividades colaborativas com pares de referência");
    if (/autonomia/.test(source)) supports.push("o desenvolvimento progressivo da autonomia");
    if (diagnosis.includes("deficiencia intelectual")) supports.push("repetição planejada e oportunidades de generalizar a aprendizagem em diferentes situações");
    const supportText = supports.length ? supports.slice(0, 3).join(", ") : "orientações claras, atividades graduadas, apoio visual e mediação conforme a necessidade observada";
    const normalizedSubject = subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const language = normalizedSubject.includes("PORTUGUES");
    const physicalEducation = normalizedSubject.includes("EDUCACAO FISICA");
    const focusText = selectedFocuses.length ? selectedFocuses.join(", ").toLocaleLowerCase("pt-BR") : "";
    const contentFocus = focusText || (language
      ? "estratégias de leitura e compreensão, localização de informações, ampliação de vocabulário, oralidade e produção de textos curtos e significativos"
      : physicalEducation
        ? "práticas corporais, coordenação motora, participação, cooperação, regras e segurança"
        : `habilidades e conteúdos essenciais de ${subject}, organizados de forma concreta, gradual e funcional`);
    const cleanGuidance = guidance.split(/[\n.!?]+/).map((item) => item.trim()).filter(Boolean)
      .filter((item) => !/(?:use|utilize|coloque|inclua).{0,25}nome/i.test(item));
    const routed = { expectation: [], content: [], strategy: [], evaluation: [] };
    cleanGuidance.forEach((instruction) => {
      const normalized = instruction.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (/avali|observ|registro|prova|instrumento|portfolio/.test(normalized)) routed.evaluation.push(instruction);
      else if (/conteudo|tema|leitura|escrita|oralidade|vocabulario|esporte|jogo|danca/.test(normalized)) routed.content.push(instruction);
      else if (/objetivo|expectativa|aprender|desenvolver|ampliar|autonomia/.test(normalized)) routed.expectation.push(instruction);
      else routed.strategy.push(instruction);
    });
    const note = (items, label) => items.length ? ` ${label}: ${items.join("; ")}.` : "";
    const drafts = realized ? [
      `Ao longo do período, foram desenvolvidas com ${student} a participação, a compreensão e a autonomia nas aprendizagens essenciais de ${subject} relacionadas ao ${grade}, respeitando seu ritmo e suas formas de comunicação. As propostas favoreceram a realização das atividades com maior segurança, iniciativa e envolvimento, valorizando conhecimentos já construídos e avanços observados. Buscou-se ainda ampliar a capacidade de mobilizar essas aprendizagens em situações variadas, com crescente independência e participação nas experiências individuais e coletivas.${note(routed.expectation, "Objetivo destacado pelo professor")}`,
      `No trabalho com os objetos de conhecimento, foram abordados ${contentFocus}, organizados em objetivos graduais e relacionados às habilidades do bimestre. Os conteúdos foram retomados quando necessário, com exemplos próximos da realidade do estudante, diferentes formas de representação e oportunidades de aplicação em atividades significativas. Essa organização permitiu articular conceitos, procedimentos e atitudes próprios de ${subject}, favorecendo compreensão, consolidação e uso funcional do que foi aprendido.${note(routed.content, "Conteúdo destacado pelo professor")}`,
      `Para favorecer o acesso às aprendizagens, adotaram-se ${supportText}, combinando atividades progressivas, modelagem, prática guiada e verificação frequente da compreensão. As orientações foram apresentadas em etapas, com tempo ampliado quando necessário, incentivo à participação e intervenções ajustadas às respostas demonstradas pelo estudante. Alternaram-se momentos de exploração, acompanhamento e realização mais autônoma, mantendo objetivos claros e possibilidades diversificadas de participação.${physicalEducation || /quadra/.test(guidanceNormalized) ? " As práticas em quadra ocorreram com participação orientada, adaptações e atenção à segurança." : ""}${note(routed.strategy, "Registro do professor")}`,
      `O acompanhamento da aprendizagem ocorreu de forma contínua e formativa, considerando participação, respostas orais, atividades práticas e produções adaptadas em ${subject}, com registros vinculados aos objetivos individualizados. Foram observados o nível de compreensão, a mediação necessária, a iniciativa, a interação e a aplicação do conhecimento em novas situações. As evidências reunidas orientaram devolutivas, retomadas de conteúdo, ajustes nas estratégias e a definição de intervenções pedagógicas posteriores.${note(routed.evaluation, "Procedimento destacado pelo professor")}`
    ] : [
      `Como expectativa de aprendizagem, busca-se que ${student} amplie progressivamente a participação, a compreensão e a autonomia nas aprendizagens essenciais de ${subject} previstas para o ${grade}, respeitando seu ritmo e suas formas de comunicação. Pretende-se fortalecer a segurança para iniciar e concluir atividades, comunicar dúvidas, mobilizar conhecimentos e participar de situações individuais e coletivas. O percurso deverá valorizar avanços graduais e favorecer a aplicação do que foi aprendido em contextos variados e significativos.${note(routed.expectation, "Orientação do professor")}`,
      `Em relação aos objetos de conhecimento, serão priorizados ${contentFocus}, organizados em objetivos graduais, articulados às habilidades do bimestre e aos conhecimentos prévios do estudante. Os conteúdos serão apresentados por diferentes linguagens, exemplos e situações significativas, com retomadas planejadas e oportunidades de aplicação. A seleção buscará integrar conceitos, procedimentos e atitudes próprios de ${subject}, favorecendo compreensão, consolidação e uso funcional da aprendizagem com autonomia crescente.${note(routed.content, "Orientação do professor")}`,
      `Para viabilizar a participação e a aprendizagem, serão empregados ${supportText}, com atividades progressivas, modelagem, prática guiada, tempo adequado e verificação frequente da compreensão. As orientações serão divididas em etapas, acompanhadas de exemplos, retomadas e incentivo positivo, ajustando-se o nível de apoio às respostas observadas. Serão alternados momentos de exploração, interação e realização mais autônoma, mantendo objetivos claros e diferentes possibilidades de participação.${physicalEducation || /quadra/.test(guidanceNormalized) ? " As atividades práticas em quadra terão participação orientada, adaptações e atenção à segurança." : ""}${note(routed.strategy, "Orientação do professor")}`,
      `O processo avaliativo será contínuo e formativo, reunindo evidências por meio de observação, participação, respostas orais, atividades práticas e produções adaptadas em ${subject}. Os registros considerarão a compreensão das orientações, o nível de mediação necessário, a iniciativa, a interação, a evolução em relação aos objetivos e a aplicação das aprendizagens em novas situações. Os resultados serão utilizados para oferecer devolutivas, retomar conteúdos, ajustar estratégias e planejar intervenções pedagógicas subsequentes.${note(routed.evaluation, "Orientação do professor")}`
    ];
    let inserted = 0;
    fields.forEach((field, index) => {
      if (hasMeaningfulPeiText(field.value)) return;
      field.value = drafts[index];
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      if (hasMeaningfulPeiText(field.value)) inserted += 1;
    });
    const remaining = fields.filter((field) => !hasMeaningfulPeiText(field.value)).length;
    addLog(remaining
      ? `Rascunho inserido em ${inserted} campo(s), mas ${remaining} permaneceu(ram) vazio(s). Nada foi salvo.`
      : `Rascunho pedagógico inserido em ${inserted} campo(s) vazio(s). Revise no SIAP; nada foi salvo.`);
  }

  async function generatePeiAiDraft() {
    const fields = getPeiFields();
    if (fields.length !== 4) return addLog("PEI não preenchido: estrutura diferente da esperada.");
    const button = panel.querySelector('[data-action="pei-ai-draft"]');
    if (button) { button.disabled = true; button.textContent = "Gerando com IA…"; }
    setOperationStatus("Gerando PEI...");
    const sourceIds = [
      "cphFuncionalidade_cphCampos_txtPotencialidadesCognitivas",
      "cphFuncionalidade_cphCampos_txtPotencialidadesHabilidades",
      "cphFuncionalidade_cphCampos_txtNecessidadesCognitivas",
      "cphFuncionalidade_cphCampos_txtNecessidadesHabilidades"
    ];
    const educationalContext = sourceIds.map((id) => document.getElementById(id)?.value?.trim() || "").filter(Boolean).join("\n");
    const selectedFocuses = [...panel.querySelectorAll("[data-pei-focus]:checked")].map((input) => input.dataset.peiFocus).filter(Boolean);
    const guidance = panel.querySelector("#cm-pei-guidance")?.value.trim() || "";
    const payload = {
      kind:"pei",
      grade:model.context.grade || "Turma não identificada",
      subject:(model.context.subject || "Componente curricular").replace(/^\d+\s*-\s*/, ""),
      period:model.context.term || "",
      guidance,
      selectedFocuses,
      educationalContext,
      tense:panel.querySelector('[name="cm-pei-tense"]:checked')?.value === "realized" ? "realized" : "planned"
    };
    try {
      const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_AI_DRAFT", payload });
      if (!result?.ok || !Array.isArray(result.fields) || result.fields.length !== 4) {
        addLog(result?.message || "A IA não devolveu os quatro campos esperados.");
        return;
      }
      let inserted = 0;
      fields.forEach((field, index) => {
        if (hasMeaningfulPeiText(field.value)) return;
        field.value = String(result.fields[index] || "").trim();
        field.dispatchEvent(new Event("input", { bubbles:true }));
        field.dispatchEvent(new Event("change", { bubbles:true }));
        if (hasMeaningfulPeiText(field.value)) inserted += 1;
      });
      addLog(`IA inseriu ${inserted} campo(s) vazio(s). Revise individualmente; nada foi salvo.`);
    } catch {
      addLog("Não foi possível acessar a IA do Assistente SIAP. Verifique o acesso à extensão e tente novamente.");
    } finally {
      setOperationStatus("");
      if (button?.isConnected) { button.textContent = "Gerar campos com IA"; button.disabled = panel.querySelector("#cm-pei-confirm")?.checked !== true; }
    }
  }

  function reviewRun() {
    const selected = [...panel.querySelectorAll("[data-day]:checked")].map((input) => input.dataset.day);
    const dryRun = panel.querySelector("#cm-dry-run")?.checked !== false;
    if (!selected.length) return addLog("Selecione pelo menos uma data.");
    if (model.page === "attendance" && dryRun) return simulate(selected, null, "chamada");
    if (model.page === "attendance") return reviewAttendance(selected);
    showConfirmation(selected, dryRun);
  }

  function showConfirmation(selected, dryRun) {
    const card = document.createElement("section");
    card.className = "cm-card";
    card.id = "cm-confirm-card";
    card.innerHTML = `<h3>${dryRun ? "Confirmar simulação" : "Confirmar execução"}</h3><div class="cm-alert">${dryRun ? "A simulação analisará" : "O SIAP será alterado em"} ${selected.length} data(s). Turma: ${escapeHtml(model.context.classroom || "não identificada")}.</div>
      <label class="cm-check"><input id="cm-understood" type="checkbox"><span>Revisei o contexto e autorizo esta etapa.</span></label>
      <div class="cm-actions"><button class="cm-btn" data-cancel>Cancelar</button><button class="cm-btn cm-primary" data-confirm disabled>${dryRun ? "Simular" : "Executar"}</button></div>`;
    panel.querySelector(".cm-body").prepend(card);
    const understood = card.querySelector("#cm-understood");
    const confirm = card.querySelector("[data-confirm]");
    understood.addEventListener("change", () => { confirm.disabled = !understood.checked; });
    card.querySelector("[data-cancel]").addEventListener("click", () => card.remove());
    confirm.addEventListener("click", () => dryRun ? simulate(selected, card) : startContentRun(selected, card));
  }

  function simulate(selected, card, kind = "conteúdo") {
    card?.remove();
    selected.forEach((iso) => addLog(`Simulação de ${kind}: ${iso} seria analisada e salva após confirmação verde.`));
  }

  async function startContentRun(selected, card) {
    // O executor real fica bloqueado nesta versão até um teste unitário/homologado comprovar
    // seleção de data, múltiplas aulas e retomada após postback. Evita alterar dados reais por engano.
    card.remove();
    addLog(`Execução preparada para ${selected.length} data(s). Modo real bloqueado até homologação.`);
  }

  function reviewAttendance(selected) {
    const selectedDate = document.getElementById(IDS.date)?.value;
    const save = document.getElementById(IDS.save);
    const requestedLabel = model.days.find((day) => day.iso === selected[0])?.label;
    if (!selectedDate || selectedDate !== requestedLabel) return addLog(`Abra ${requestedLabel || "a data selecionada"} no calendário do SIAP antes de revisar a chamada.`);
    const selectedDay = model.days.find((day) => day.label === selectedDate);
    if (selectedDay?.state === "saved") return addLog("Data verde: chamada já salva e protegida contra repetição.");
    if (selectedDay && !selectedDay.eligible) return addLog("Data futura: chamada bloqueada.");
    const card = document.createElement("section");
    card.className = "cm-card";
    card.id = "cm-attendance-review";
    card.innerHTML = `<h3>Revisão da chamada</h3><p><strong>Data:</strong> ${escapeHtml(selectedDate)}</p>
      <div class="cm-alert">Revise na grade do SIAP: ponto significa presença e F significa falta. Estudantes com situação especial devem permanecer sem alteração.</div>
      <label class="cm-check"><input id="cm-attendance-ok" type="checkbox"><span>Conferi todas as ausências desta data.</span></label>
      <div class="cm-actions"><button class="cm-btn" data-cancel>Voltar</button><button class="cm-btn cm-primary" data-save disabled>Salvar chamada</button></div>`;
    panel.querySelector(".cm-body").prepend(card);
    const check = card.querySelector("#cm-attendance-ok");
    const button = card.querySelector("[data-save]");
    check.addEventListener("change", () => { button.disabled = !check.checked || !save; });
    card.querySelector("[data-cancel]").addEventListener("click", () => card.remove());
    button.addEventListener("click", () => {
      card.remove();
      addLog("Salvamento real bloqueado até validação em ambiente controlado.");
    });
  }

  function observeSiapUpdates() {
    // O SIAP substitui FormularioPrincipal inteiro durante alguns postbacks.
    // Observar o body mantém o assistente conectado depois dessas trocas; o painel
    // fica fora do body, portanto a própria renderização não cria um ciclo.
    const target = document.body;
    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        analyze();
        if (model.page === "planning-lesson") {
          resumePlanningFlow();
          completeReplicationIfRequested();
          resumeAfterReplicationCancel();
        }
        if (["planning-overview", "planning-lesson"].includes(model.page)) resumePlanningBatch();
        if (model.page === "content") resumeContentBatch();
        if (model.page === "attendance") resumeAttendanceBatch();
      }, 450);
    }).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  }

  function addLog(text) {
    model.log.push(`${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — ${text}`);
    render();
  }

  function setOpen(open, closed = false) {
    const launcher = document.getElementById("assistente-siap-launcher");
    if (!open) planningDockDetached = false;
    if (open && Core.pageType(location.pathname) === "planning-lesson") {
      for (const property of ["left", "top", "right", "bottom"]) panel.style.removeProperty(property);
    }
    panel.hidden = !open;
    applyPlanningDockLayout();
    if (launcher) launcher.hidden = open || closed;
    sessionStorage.setItem("assistenteSiapPanelOpenThisTab", String(open));
    chrome.storage.local.set({ panelOpen: open, panelClosed: closed });
  }

  function pair(label, value) { return `<div><span>${label}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

  function canonicalClassroom(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
      .replace(/\b(ANO|SERIE|TURMA)\b/g, "").replace(/[ºª°._\-\s]/g, "");
  }

  function normalizedLabel(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function readAttendanceStudents() {
    const names = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_ControleFrequenciaAluno .listaDeAlunos .itens > .item")];
    const frequencyLists = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_ControleFrequenciaAluno .listaDeFrequencias")];
    const marksByLesson = frequencyLists.map((list) => [...list.querySelectorAll(":scope .itens > .item")]);
    if (!names.length || !marksByLesson.length || marksByLesson.some((marks) => marks.length !== names.length)) return [];
    return names.map((item, index) => {
      const rawName = String(item.querySelector(".aluno")?.textContent || "").replace(/^\s*\d+[.)-]?\s*/, "").trim();
      const situationElement = item.querySelector(".situacao");
      const situation = `${situationElement?.getAttribute("title") || ""} ${situationElement?.textContent || ""}`.trim();
      const transferred = /transferid/i.test(situation) || /^T$/i.test(situation);
      const marks = marksByLesson.map((lesson) => normalizedLabel(lesson[index]?.textContent));
      return {
        name:rawName,
        transferred,
        present:marks.filter((mark) => mark === "•" || mark === "." || mark === "P").length,
        absent:marks.filter((mark) => mark === "F").length,
        total:marks.filter((mark) => /^(F|P|\.|•)$/.test(mark)).length
      };
    }).filter(item => item.name);
  }

  function calendarSignature() {
    const month = document.getElementById(IDS.month);
    const calendar = document.getElementById(IDS.calendar);
    return `${month?.selectedIndex ?? -1}|${String(calendar?.textContent || "").replace(/\s+/g, " ")}|${document.getElementById(IDS.date)?.value || ""}`;
  }

  function waitUntil(predicate, timeout = 15000, interval = 150) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        try {
          const value = predicate();
          if (value) return resolve(value);
        } catch { /* o SIAP pode substituir os controles durante o postback */ }
        if (Date.now() - started >= timeout) return reject(new Error("O SIAP não concluiu a atualização da tela."));
        setTimeout(check, interval);
      };
      check();
    });
  }

  async function switchAttendanceMonth(monthIndex) {
    const before = calendarSignature();
    const select = document.getElementById(IDS.month);
    if (!select) throw new Error("Seletor de mês não encontrado.");
    if (select.selectedIndex === monthIndex) return;
    select.selectedIndex = monthIndex;
    select.dispatchEvent(new Event("change", { bubbles:true }));
    await waitUntil(() => {
      const current = document.getElementById(IDS.month);
      return current?.selectedIndex === monthIndex && calendarSignature() !== before;
    });
    analyze();
  }

  async function openAttendanceDay(label) {
    if (document.getElementById(IDS.date)?.value === label && readAttendanceStudents().length) return;
    const day = readCalendarDays().find(item => item.label === label);
    if (!day?.cell) throw new Error(`A data ${label} não foi reencontrada no calendário.`);
    day.cell.click();
    await waitUntil(() => document.getElementById(IDS.date)?.value === label && readAttendanceStudents().length);
  }

  async function collectAttendance(request) {
    const aggregate = new Map();
    const readDates = [];
    for (const monthIndex of [...new Set(request.months || [])].sort((a, b) => a - b)) {
      await switchAttendanceMonth(monthIndex);
      analyze();
      const labels = readCalendarDays()
        .filter(day => day.eligible && day.state === "saved")
        .map(day => day.label);
      for (const label of [...new Set(labels)]) {
        await openAttendanceDay(label);
        const rows = readAttendanceStudents();
        if (!rows.length) continue;
        readDates.push(label);
        rows.forEach(row => {
          const key = normalizedLabel(row.name);
          const current = aggregate.get(key) || { name:row.name, transferred:false, present:0, absent:0, total:0 };
          current.transferred ||= row.transferred;
          current.present += row.present;
          current.absent += row.absent;
          current.total += row.total;
          aggregate.set(key, current);
        });
      }
    }
    return { students:[...aggregate.values()], readDates };
  }

  function attendancePeriodLabel(request) {
    const monthLabels = [...new Set(request.months || [])].sort((a, b) => a - b).map(index => MONTHS[index]).filter(Boolean);
    return `${monthLabels.join(", ")} de ${request.year || model.context.year || new Date().getFullYear()}`;
  }

  function attendanceLabelsForCurrentMonth() {
    analyze();
    return [...new Set(readCalendarDays()
      .filter(day => day.eligible && day.state === "saved")
      .map(day => day.label))];
  }

  function attendancePageIsLoading() {
    const candidates = document.querySelectorAll(
      '.blockUI, .ui-widget-overlay, [id*="UpdateProgress"], [id*="Carregando"], [class*="loading"], [class*="Loading"]'
    );
    return [...candidates].some(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    });
  }

  function scheduleSiapNavigation(action) {
    setTimeout(() => {
      try { action(); } catch { /* a etapa seguinte validará a tela resultante */ }
    }, 80);
  }

  function exportAttendanceStep(request, savedProgress) {
    const months = [...new Set(request.months || [])].filter(Number.isInteger).sort((a, b) => a - b);
    const progress = savedProgress && typeof savedProgress === "object"
      ? { ...savedProgress, dates:Array.isArray(savedProgress.dates) ? [...savedProgress.dates] : [] }
      : { monthCursor:0, monthIndex:null, dates:[], dateCursor:0, monthScanSignature:"", monthScanStable:0, dateRetries:0, monthReadDates:0 };
    const periodLabel = attendancePeriodLabel(request);
    if (progress.monthCursor >= months.length) return { ok:true, students:[], readDates:0, periodLabel };

    const monthIndex = months[progress.monthCursor];
    const select = document.getElementById(IDS.month);
    if (!select) return { ok:false, code:"MONTH_SELECTOR_NOT_FOUND", message:"O seletor de meses da frequência não foi encontrado." };
    if (attendancePageIsLoading()) {
      return { pending:true, nextPhase:"read", progress, retryAfter:700, periodLabel };
    }
    if (select.selectedIndex !== monthIndex) {
      select.selectedIndex = monthIndex;
      scheduleSiapNavigation(() => select.dispatchEvent(new Event("change", { bubbles:true })));
      return { pending:true, nextPhase:"read", progress, waitForNavigation:true, periodLabel };
    }

    if (progress.monthIndex !== monthIndex) {
      const detectedDates = attendanceLabelsForCurrentMonth();
      const signature = detectedDates.join("|");
      // O Web Forms pode reconstruir primeiro o seletor e somente depois
      // aplicar as cores do calendario. Exija duas leituras iguais antes de
      // fechar a lista do mes para nao aceitar um calendario intermediario.
      if (progress.monthScanSignature !== signature) {
        progress.monthScanSignature = signature;
        progress.monthScanStable = 1;
        return { pending:true, nextPhase:"read", progress, retryAfter:700, periodLabel };
      }
      progress.monthScanStable = (progress.monthScanStable || 0) + 1;
      // Calendários vazios precisam de mais tempo: durante um postback lento o
      // SIAP pode exibir temporariamente zero datas salvas.
      const requiredStableScans = detectedDates.length ? 3 : 6;
      if (progress.monthScanStable < requiredStableScans) return { pending:true, nextPhase:"read", progress, retryAfter:700, periodLabel };
      progress.monthIndex = monthIndex;
      progress.dates = detectedDates;
      progress.dateCursor = 0;
      progress.dateRetries = 0;
      progress.monthReadDates = 0;
      return { pending:true, nextPhase:"read", progress, retryAfter:100, periodLabel };
    }

    if (progress.dateCursor >= progress.dates.length) {
      if ((progress.monthReadDates || 0) !== progress.dates.length) {
        return { ok:false, code:"MONTH_READ_INCOMPLETE", message:`A leitura de ${MONTHS[monthIndex]} ficou incompleta. Nenhum resultado parcial foi enviado.` };
      }
      progress.monthCursor += 1;
      progress.monthIndex = null;
      progress.dates = [];
      progress.dateCursor = 0;
      progress.monthScanSignature = "";
      progress.monthScanStable = 0;
      progress.dateRetries = 0;
      progress.monthReadDates = 0;
      return { pending:true, nextPhase:"read", progress, retryAfter:100, periodLabel };
    }

    const label = progress.dates[progress.dateCursor];
    const rows = readAttendanceStudents();
    if (document.getElementById(IDS.date)?.value !== label || !rows.length) {
      progress.dateRetries = (progress.dateRetries || 0) + 1;
      if (progress.dateRetries > 8) {
        return { ok:false, code:"SAVED_DATE_NOT_FOUND", message:`A chamada salva de ${label} nao permaneceu disponivel durante o carregamento. Nenhum resultado parcial foi enviado.` };
      }
      const day = readCalendarDays().find(item => item.label === label);
      if (!day?.cell) {
        return { pending:true, nextPhase:"read", progress, retryAfter:700, periodLabel };
      }
      scheduleSiapNavigation(() => day.cell.click());
      return { pending:true, nextPhase:"read", progress, waitForNavigation:true, periodLabel };
    }

    progress.dateRetries = 0;
    progress.dateCursor += 1;
    progress.monthReadDates = (progress.monthReadDates || 0) + 1;
    return { pending:true, nextPhase:"read", progress, students:rows, readDates:1, retryAfter:100, periodLabel };
  }

  function selectOptionByText(select, predicate) {
    if (!(select instanceof HTMLSelectElement)) return { found:false, changed:false };
    const index = [...select.options].findIndex(option => predicate(normalizedLabel(option.textContent)));
    if (index < 0) return { found:false, changed:false };
    if (select.selectedIndex === index) return { found:true, changed:false };
    select.selectedIndex = index;
    scheduleSiapNavigation(() => select.dispatchEvent(new Event("change", { bubbles:true })));
    return { found:true, changed:true };
  }

  function requestedGrade(className) {
    return String(className || "").match(/[1-9]/)?.[0] || "";
  }

  function matchingDiaryRows(request) {
    const grid = document.getElementById("cphFuncionalidade_gdvListagem");
    if (!grid) return [];
    return [...grid.querySelectorAll("tr[onclick]")].filter(row => {
      const cells = [...row.querySelectorAll(":scope > td")];
      if (cells.length < 2) return false;
      const classroom = canonicalClassroom(cells.at(-1)?.textContent);
      // O turno já foi aplicado ao filtro antes de clicar em Listar. Não o
      // compare novamente na grade, pois o SIAP pode renderizar abreviações
      // diferentes no resultado durante o primeiro ciclo de layout.
      // O componente já foi aplicado no filtro do SIAP antes de Listar. Nesta
      // grade, portanto, basta identificar a turma. Recomparar o texto da
      // disciplina aqui é redundante e pode rejeitar uma linha válida por
      // diferenças invisíveis de renderização do Web Forms.
      return classroom === canonicalClassroom(request.className);
    });
  }

  function prepareDiaryComponentDiscovery(request, phase) {
    if (/server error in|nullreferenceexception|object reference not set/i.test(document.body?.innerText || "")) {
      return { ok:false, code:"SIAP_INTERNAL_ERROR", message:"O SIAP apresentou um erro interno ao localizar os componentes." };
    }
    const grade = requestedGrade(request.className);
    const composition = document.getElementById("cphFuncionalidade_cphCampos_ddlComposicao");
    const series = document.getElementById("cphFuncionalidade_cphCampos_ddlSerie");
    const shift = document.getElementById("cphFuncionalidade_cphCampos_ddlTurno");
    const subject = document.getElementById("cphFuncionalidade_cphCampos_ddlDisciplina");
    if (!composition || !series || !shift || !subject) return { ok:false, code:"DIARY_FILTERS_NOT_FOUND", message:"Os filtros do Diário do Professor não foram reconhecidos." };
    const isRequestedGrade = text => grade && String(text || "").match(/[1-9]/)?.[0] === grade;
    if (![...series.options].some(option => isRequestedGrade(option.textContent))) {
      const changed = selectOptionByText(composition, text => grade && Number(grade) >= 6 ? text.includes("ENSINO FUNDAMENTAL DE 6") : text.includes("ENSINO MEDIO"));
      if (!changed.found) return { ok:false, code:"CLASS_LEVEL_NOT_FOUND", message:"A composição de ensino da turma não foi encontrada no SIAP." };
      if (changed.changed) return { pending:true, nextPhase:"discover", waitForNavigation:true };
    }
    const seriesChange = selectOptionByText(series, text => isRequestedGrade(text));
    if (!seriesChange.found) return { ok:false, code:"GRADE_NOT_FOUND", message:"A série da turma não foi encontrada no SIAP." };
    if (seriesChange.changed) return { pending:true, nextPhase:"discover", waitForNavigation:true };
    const shiftChange = selectOptionByText(shift, text => text === normalizedLabel(request.shift));
    if (!shiftChange.found) return { ok:false, code:"SHIFT_NOT_FOUND", message:"O turno informado não foi encontrado no SIAP." };
    if (shiftChange.changed) return { pending:true, nextPhase:"discover", waitForNavigation:true };
    const subjectChange = selectOptionByText(subject, text => text === "TODAS");
    if (!subjectChange.found) return { ok:false, code:"SUBJECT_FILTER_NOT_FOUND", message:"O filtro de componente curricular não foi encontrado no SIAP." };
    if (subjectChange.changed) return { pending:true, nextPhase:"discover", waitForNavigation:true };

    if (!/^discover-listed-\d+$/.test(String(phase || ""))) {
      const list = document.getElementById("cphFuncionalidade_btnListar");
      if (!list) return { ok:false, code:"LIST_BUTTON_NOT_FOUND", message:"O botão Listar do SIAP não foi reconhecido." };
      scheduleSiapNavigation(() => list.click());
      return { pending:true, nextPhase:"discover-listed-1", waitForNavigation:true };
    }
    const rows = matchingDiaryRows(request);
    if (!rows.length) {
      const attempt = Number(String(phase).match(/^discover-listed-(\d+)$/)?.[1] || 0);
      if (attempt >= 20) return { ok:false, code:"CLASS_NOT_FOUND", message:"A turma e o turno não foram encontrados no Diário do Professor." };
      // Não clique novamente em Listar. O SIAP pode publicar os filtros antes
      // de terminar de reconstruir a grade; repetir o postback reinicia esse
      // carregamento e pode esconder indefinidamente uma turma existente.
      return { pending:true, nextPhase:`discover-listed-${attempt + 1}`, retryAfter:1000 };
    }
    const components = [...new Map(rows.map(row => {
      const cells = [...row.querySelectorAll(":scope > td")];
      const rawLabel = String(cells.at(-2)?.textContent || "").trim();
      const label = rawLabel.replace(/^\s*\d+\s*-\s*/, "").trim();
      return [normalizedLabel(rawLabel), { id:normalizedLabel(rawLabel), label }];
    }).filter(([id, item]) => id && item.label)).values()];
    return components.length
      ? { ok:true, components }
      : { ok:false, code:"COMPONENTS_NOT_FOUND", message:"Nenhum componente curricular foi encontrado para esta turma e turno." };
  }

  function prepareDiaryAttendance(request, phase, componentIndex = 0) {
    if (/server error in|nullreferenceexception|object reference not set/i.test(document.body?.innerText || "")) {
      return { ok:false, code:"SIAP_INTERNAL_ERROR", message:"O SIAP apresentou um erro interno ao abrir a turma. Volte ao Diário do Professor, clique em Listar e tente novamente." };
    }
    const grade = requestedGrade(request.className);
    const composition = document.getElementById("cphFuncionalidade_cphCampos_ddlComposicao");
    const series = document.getElementById("cphFuncionalidade_cphCampos_ddlSerie");
    const shift = document.getElementById("cphFuncionalidade_cphCampos_ddlTurno");
    const subject = document.getElementById("cphFuncionalidade_cphCampos_ddlDisciplina");
    if (!composition || !series || !shift || !subject) return { ok:false, code:"DIARY_FILTERS_NOT_FOUND", message:"Os filtros do Diário do Professor não foram reconhecidos." };

    // Ao selecionar uma linha, o próprio SIAP troca o filtro de componente de
    // "Todas" para a disciplina daquela linha. Isso é parte do estado interno
    // válido do Web Forms. Abra Frequência antes de normalizar qualquer filtro;
    // mudar o componente aqui apagaria a seleção recém-feita e causaria um
    // falso "turma não encontrada" na tentativa seguinte.
    if (phase === "open-frequency") {
      const frequency = document.getElementById("cphFuncionalidade_btnAuxiliar2");
      if (!frequency || frequency.disabled) return { pending:true, nextPhase:"open-frequency", retryAfter:700 };
      scheduleSiapNavigation(() => frequency.click());
      return { pending:true, nextPhase:"read", waitForNavigation:true };
    }

    // O SIAP pode representar a série como "6º Ano", "6° Ano" ou com
    // espaços/caracteres ordinais diferentes. Compare pelo algarismo inicial
    // canônico, que é o mesmo formato usado para interpretar "6A".
    const isRequestedGrade = text => grade && String(text || "").match(/[1-9]/)?.[0] === grade;
    const hasGrade = [...series.options].some(option => isRequestedGrade(option.textContent));
    if (!hasGrade) {
      const changed = selectOptionByText(composition, text => grade && Number(grade) >= 6 ? text.includes("ENSINO FUNDAMENTAL DE 6") : text.includes("ENSINO MEDIO"));
      if (!changed.found) return { ok:false, code:"CLASS_LEVEL_NOT_FOUND", message:"A composição de ensino da turma não foi encontrada no SIAP." };
      if (changed.changed) return { pending:true, nextPhase:"locate", waitForNavigation:true };
    }
    const seriesChange = selectOptionByText(series, text => isRequestedGrade(text));
    if (!seriesChange.found) return { ok:false, code:"GRADE_NOT_FOUND", message:"A série da turma não foi encontrada no SIAP." };
    if (seriesChange.changed) return { pending:true, nextPhase:"locate", waitForNavigation:true };
    const shiftChange = selectOptionByText(shift, text => text === normalizedLabel(request.shift));
    if (!shiftChange.found) return { ok:false, code:"SHIFT_NOT_FOUND", message:"O turno da turma não foi encontrado no SIAP." };
    if (shiftChange.changed) return { pending:true, nextPhase:"locate", waitForNavigation:true };
    const requestedComponent = normalizedLabel(request.componentId || "");
    const subjectChange = selectOptionByText(subject, text => requestedComponent ? text === requestedComponent : text === "TODAS");
    if (!subjectChange.found) return { ok:false, code:"SUBJECT_FILTER_NOT_FOUND", message:"O filtro de componente curricular não foi encontrado no SIAP." };
    if (subjectChange.changed) return { pending:true, nextPhase:"locate", waitForNavigation:true };

    // Depois de qualquer postback de filtro, o Web Forms pode manter no HTML
    // uma grade visual antiga, embora o estado interno dela já tenha sido
    // descartado. Clicar nessa linha residual dispara NullReferenceException
    // no próprio SIAP. Por isso, sempre exigimos uma resposta nova do botão
    // Listar antes de selecionar a turma.
    if (!/^locate-listed-\d+$/.test(String(phase || ""))) {
      const list = document.getElementById("cphFuncionalidade_btnListar");
      if (!list) return { ok:false, code:"LIST_BUTTON_NOT_FOUND", message:"O botão Listar do SIAP não foi reconhecido." };
      scheduleSiapNavigation(() => list.click());
      return { pending:true, nextPhase:"locate-listed-1", waitForNavigation:true };
    }

    const rows = matchingDiaryRows(request);
    if (!rows.length) {
      const listAttempt = Number(String(phase || "").match(/^locate-listed-(\d+)$/)?.[1] || 0);
      if (listAttempt >= 20) return { ok:false, code:"CLASS_NOT_FOUND", message:"A turma e o turno solicitados pelo Carômetro não foram encontrados no Diário do Professor." };
      // O primeiro clique em Listar já foi enviado acima. Aguarde a grade
      // estabilizar sem disparar novos postbacks que reiniciariam o carregamento.
      return { pending:true, nextPhase:`locate-listed-${listAttempt + 1}`, retryAfter:1000 };
    }
    if (phase !== "open-frequency") {
      if (!rows[componentIndex]) return { ok:false, code:"CLASS_COMPONENT_CHANGED", message:"A lista de componentes da turma mudou durante a leitura. Tente novamente." };
      scheduleSiapNavigation(() => rows[componentIndex].click());
      return { pending:true, nextPhase:"open-frequency", componentCount:rows.length, waitForNavigation:true };
    }
    return { pending:true, nextPhase:"open-frequency", componentCount:rows.length, retryAfter:900 };
  }

  async function runAttendanceJob(payload) {
    const request = payload?.request || {};
    const phase = payload?.phase || "locate";
    // A mensagem do service worker pode chegar antes de install() terminar o
    // primeiro analyze(). Leia a rota e o cabeçalho de forma síncrona aqui;
    // caso contrário, uma frequência já aberta parece estar sem turma e o
    // fluxo volta indevidamente ao Diário.
    model.page = Core.pageType(location.pathname);
    model.context = readContext();
    if (location.pathname.toLowerCase().endsWith("/login.aspx")) {
      return { ok:false, code:"SIAP_LOGIN_REQUIRED", message:"A sessão do SIAP expirou. Entre novamente e tente de novo." };
    }
    if (/server error in|nullreferenceexception|object reference not set/i.test(document.body?.innerText || "")) {
      return { ok:false, code:"SIAP_INTERNAL_ERROR", message:"O SIAP apresentou um erro interno durante a leitura." };
    }
    if (model.page === "diary") return prepareDiaryAttendance(request, phase, Number(payload?.componentIndex) || 0);
    if (model.page === "attendance" && phase === "read") {
      const sameClass = canonicalClassroom(model.context.classroom) === canonicalClassroom(request.className);
      const sameShift = !request.shift || normalizedLabel(model.context.shift) === normalizedLabel(request.shift);
      if (sameClass && sameShift) return exportAttendanceStep(request, payload?.progress);
    }
    scheduleSiapNavigation(() => location.assign("/DiarioEscolarListagem.aspx"));
    return { pending:true, nextPhase:"locate", waitForNavigation:true };
  }

  async function runComponentDiscovery(payload) {
    model.page = Core.pageType(location.pathname);
    model.context = readContext();
    if (location.pathname.toLowerCase().endsWith("/login.aspx")) return { ok:false, code:"SIAP_LOGIN_REQUIRED", message:"A sessão do SIAP expirou. Entre novamente e tente de novo." };
    if (!location.pathname.toLowerCase().endsWith("/diarioescolarlistagem.aspx")) {
      scheduleSiapNavigation(() => location.assign("/DiarioEscolarListagem.aspx"));
      return { pending:true, nextPhase:"discover", waitForNavigation:true };
    }
    return prepareDiaryComponentDiscovery(payload?.request || {}, payload?.phase || "discover");
  }

  async function exportAttendance(request) {
    if (location.pathname.toLowerCase().endsWith("/login.aspx")) return { ok:false, code:"SIAP_LOGIN_REQUIRED", message:"A sessão do SIAP expirou. Entre novamente e tente de novo." };
    if (model.page !== "attendance") return { ok:false, code:"SIAP_ATTENDANCE_PAGE_REQUIRED", message:"Abra a frequência da turma no SIAP para homologar a primeira leitura." };
    analyze();
    const requestedClass = canonicalClassroom(request?.className);
    const openClass = canonicalClassroom(model.context.classroom);
    if (!requestedClass || !openClass || requestedClass !== openClass) return { ok:false, code:"CLASS_MISMATCH", message:`A turma aberta no SIAP (${model.context.classroom || "não identificada"}) não corresponde à turma solicitada pelo Carômetro (${request?.className || "não identificada"}).` };
    if (request?.shift && normalizedLabel(request.shift) !== normalizedLabel(model.context.shift)) return { ok:false, code:"SHIFT_MISMATCH", message:"O turno aberto no SIAP não corresponde ao turno da turma no Carômetro." };
    try {
      const result = await collectAttendance(request);
      if (!result.students.length || !result.readDates.length) return { ok:false, code:"NO_SAVED_ATTENDANCE", message:"Nenhuma chamada salva foi encontrada nos meses selecionados." };
      const monthLabels = request.months.map(index => MONTHS[index]).filter(Boolean);
      const componentPrefix = request.componentLabel ? `${request.componentLabel} · ` : "";
      return { ok:true, classId:String(request.classId), students:result.students, readDates:result.readDates.length, periodLabel:`${componentPrefix}${monthLabels.join(", ")} de ${request.year || model.context.year || new Date().getFullYear()}` };
    } catch (error) {
      return { ok:false, code:"SIAP_READ_INTERRUPTED", message:error?.message || "A leitura foi interrompida pelo SIAP." };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "ASSISTENTE_SIAP_LICENSE_UPDATED") {
      model.license = message.license || null;
      if (message.license && 'accountEmail' in message.license) model.accountEmail = message.license.accountEmail;
      model.sessionRequired = !message.license;
      if (!message.license) { model.accountEmail = null; window.SiapExamPanel?.resetAccount?.(); }
      if (model.license?.active !== true && !finishingAuthorizedFreeWork()) lockAssistantAfterExpiry();
      render();
      refreshActivitySiteStatus();
      respond({ ok:true });
      return;
    }
    if (model.license?.active === false && !["ASSISTENTE_SIAP_TOGGLE", "ASSISTENTE_SIAP_STATUS"].includes(message?.type)) {
      respond({ ok:false, code:"ASSISTANT_ACCESS_EXPIRED", message:"O acesso ao Assistente SIAP terminou. Assine para continuar." });
      return;
    }
    if (message?.type === "ASSISTENTE_SIAP_TOGGLE") { setOpen(panel.hidden, false); respond({ ok: true }); }
    if (message?.type === "ASSISTENTE_SIAP_STATUS") respond({ page: model.page, pending: model.days.filter((d) => d.state === "pending" && d.eligible).length, open: !panel.hidden, extensionVersion:EXTENSION_VERSION });
    if (message?.type === "ASSISTENTE_SIAP_EXPORT_ATTENDANCE") {
      exportAttendance(message.payload || {}).then(respond);
      return true;
    }
    if (message?.type === "ASSISTENTE_SIAP_RUN_ATTENDANCE_JOB") {
      runAttendanceJob(message.payload || {}).then(respond).catch(error => respond({
        ok:false,
        code:"ATTENDANCE_STEP_ERROR",
        message:error?.message || "A etapa de leitura da frequência falhou antes de responder."
      }));
      return true;
    }
    if (message?.type === "ASSISTENTE_SIAP_DISCOVER_COMPONENTS") {
      runComponentDiscovery(message.payload || {}).then(respond);
      return true;
    }
  });
})();
