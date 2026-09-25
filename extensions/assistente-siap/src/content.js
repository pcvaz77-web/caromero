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
  let model = { page: initialPageType, days: [], context: {}, busy: false, busyMessage: "", log: [], license: null, accountEmail: null, sessionRequired: false, activitySiteEnabled:false };
  let panel;
  let contentResumeTimer;
  let attendanceResumeTimer;
  let panelDialogShift;

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
    const stored = await chrome.storage.local.get(["panelOpen", "panelClosed", "panelPosition", "launcherPosition", "dryRun", "maxItems"]);
    // A navegação entre etapas do SIAP não pode alterar a escolha visual do usuário.
    // Na primeira utilização começa minimizado; depois preserva aberto/minimizado.
    createShell(stored.panelOpen === true, false, stored);
    refreshLicenseStatus();
    refreshActivitySiteStatus();
    window.addEventListener('focus', () => { if (!document.hidden) refreshActivitySiteStatus(); });
    if (initialPageType === 'exam') window.addEventListener('focus', () => { if (!document.hidden) refreshLicenseStatus(); });
    if (initialPageType === "exam" && stored.panelOpen === undefined) setOpen(true, false);
    analyze();
    observeSiapUpdates();
    setTimeout(analyze, 700);
    setTimeout(analyze, 1600);
    if (initialPageType === "planning-lesson") {
      installManualPlanningSaveTracking();
      setTimeout(resumePlanningFlow, 700);
      setTimeout(resumeReplicateAfterSave, 900);
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
        if (model.license.active !== true) lockAssistantAfterExpiry();
        render();
      }
      else if (model.sessionRequired) { model.accountEmail = null; render(); }
    } catch { /* A sessão do Assistente é verificada novamente ao usar a IA. */ }
  }

  window.SiapExamAccessUpdated = access => {
    if (!access || typeof access !== 'object') return;
    model.license = { ...(model.license || {}), examAccess: access };
    render();
  };

  function accessSummary(access, now = Date.now()) {
    if (access?.active !== true) return [];
    const lines = [];
    const validity = value => {
      const end = Date.parse(value);
      if (!Number.isFinite(end)) return 'Validade não informada';
      const days = Math.max(0, Math.ceil((end - now) / 86400000));
      return `Válido até ${new Date(end).toLocaleDateString('pt-BR')} · ${days} dia(s) restante(s)`;
    };
    if (access.status === 'granted') {
      lines.push('Licença concedida pelo proprietário');
      lines.push(access.expiresAt === null ? 'Por tempo indeterminado' : validity(access.expiresAt));
    } else if (access.status === 'subscription') {
      lines.push('Plano com Correção de Provas ativo');
      lines.push(validity(access.generalUntil || access.expiresAt));
    } else {
      lines.push('Correção por créditos');
    }
    const credits = Math.max(0, Math.floor(Number(access.credits) || 0));
    const blocks = Math.max(0, Math.floor(Number(access.openBlocks) || 0));
    if (credits || blocks || access.status === 'credits') {
      lines.push(`${credits} crédito(s) disponível(is) · ${blocks} bloco(s) em andamento`);
    }
    return lines;
  }

  async function refreshActivitySiteStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_ACTIVITY_SITE_STATUS" });
      model.activitySiteEnabled = result?.visible === true;
    } catch { model.activitySiteEnabled = false; }
    render();
  }

  function licenseCard() {
    const license = model.license;
    if (!license) return "";
    const days = Math.max(0, Number(license.daysRemaining || 0));
    const salesButton = `<div class="cm-actions"><a class="cm-btn cm-primary cm-full" href="https://sistemacarometro.com.br/assistente-siap.html#planos" target="_blank" rel="noopener noreferrer">Ver planos</a></div>`;
    if (license.status === "grant_ended" || license.status === "expired") return `<section class="cm-card cm-license cm-license-expired"><h3>Licença expirada</h3><p>Sua licença expirou. Clique para continuar usando o Assistente SIAP.</p>${salesButton}</section>`;
    if (license.mode === "external") {
      const uses = license.freeUses || {};
      const rows = [["Planejamento", "planning"], ["Conteúdo", "content"], ["Frequência", "attendance"], ["PEI", "pei"]]
        .map(([label, key]) => `<div class="cm-item"><span><strong>${label}</strong><small>${Math.max(0, Number(uses[key] || 0))} uso(s) restante(s)</small></span></div>`).join("");
      const available = Object.values(uses).some((value) => Number(value) > 0);
      const runningLow = Object.values(uses).some((value) => Number(value) === 1);
      return `<section class="cm-card cm-license ${available ? "cm-license-warning" : "cm-license-expired"}"><h3>${available ? "Licença de teste" : "Licença expirada"}</h3>${available ? `<p>2 usos de cada recurso para experimentar.</p><div class="cm-list">${rows}</div>${runningLow ? `<p>Seu teste está chegando ao fim. Escolha um plano para continuar usando.</p>${salesButton}` : ""}` : `<p>Seus usos gratuitos terminaram. Clique para continuar usando.</p>${salesButton}`}</section>`;
    }
    if (license.mode === "carometro" && license.active === true) return `<section class="cm-card cm-license ${days > 0 && days <= 3 ? "cm-license-warning" : ""}"><h3>Acesso concedido pelo Carômetro</h3><span class="cm-badge cm-green">${license.permanent === true || license.daysRemaining == null ? "Concessão permanente" : `${days} dia(s) restante(s)`}</span>${days > 0 && days <= 3 && license.permanent !== true ? `<p>Sua concessão termina em breve. Peça a renovação ao responsável ou escolha um plano individual.</p>${salesButton}` : ""}</section>`;
    if (license.mode === "subscription" && license.active === true) return `<section class="cm-card cm-license ${days > 0 && days <= 3 ? "cm-license-warning" : ""}"><h3>Licença ativa</h3><span class="cm-badge cm-green">${days} dia(s) restante(s)</span>${days > 0 && days <= 3 ? `<p>Sua licença vence em breve. Confira a renovação para continuar usando.</p>${salesButton}` : ""}</section>`;
    return `<section class="cm-card cm-license cm-license-expired"><h3>Seu acesso ao Assistente SIAP terminou</h3><p>Contrate um plano para continuar utilizando os recursos.</p>${salesButton}</section>`;
  }

  function featureHasFreeUse(feature) {
    return model.license?.mode !== "external" || Number(model.license?.freeUses?.[feature] || 0) > 0;
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
    }
  }

  function removeCompetitorOverlap() {
    // Não altera a outra extensão; apenas desloca visualmente nosso botão se ela estiver presente.
    document.documentElement.classList.toggle("cm-has-other-assistant", !!document.querySelector("#tm-exec-panel, [id^='freq-btn-']"));
  }

  function lockAssistantAfterExpiry() {
    clearTimeout(contentResumeTimer);
    clearTimeout(attendanceResumeTimer);
    ["assistenteSiapPlanningBatch", "assistenteSiapPlanningPreview", "assistenteSiapPlanningFlow", "assistenteSiapPlanningAi", "assistenteSiapAutoSaveReplicate", "assistenteSiapOpenReplicate", "assistenteSiapConfirmReplicate", "assistenteSiapReplicationOpenedAt", CONTENT_BATCH_KEY, ATTENDANCE_BATCH_KEY].forEach((key) => sessionStorage.removeItem(key));
    model.busyMessage = "";
  }

  function createShell(open, closed, stored) {
    const root = document.createElement("div");
    root.id = "assistente-siap-root";
    root.innerHTML = `<button id="assistente-siap-launcher" title="Abrir Assistente SIAP" aria-label="Abrir Assistente SIAP"><img src="${chrome.runtime.getURL("src/carometro-icon.svg")}" alt=""></button>
      <aside id="assistente-siap-panel" aria-label="Assistente SIAP do Professor" ${open ? "" : "hidden"}></aside>`;
    document.documentElement.append(root);
    panel = root.querySelector("#assistente-siap-panel");
    const launcher = root.querySelector("#assistente-siap-launcher");
    launcher.hidden = open || closed;
    applyStoredPosition(panel, stored.panelPosition);
    applyStoredPosition(launcher, stored.launcherPosition);
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
    model.days = model.page === "planning-calendar"
      ? readPlanningCalendarDays()
      : model.page === "planning-overview"
        ? readPlanningOverview()
        : Core.usesMonthlyCalendar(model.page)
          ? readCalendarDays()
          : [];
    render();
    syncPanelWithSiapDialog();
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
      return {
        day,
        iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        label: `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`,
        state: Core.colorState(getComputedStyle(cell).backgroundColor),
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
    const pending = model.days.filter((day) => day.state === "pending" && day.eligible);
    const future = model.days.filter((day) => day.state === "pending" && !day.eligible);
    const saved = model.days.filter((day) => day.state === "saved");
    const supported = ["diary", "content", "attendance", "planning-list", "planning-calendar", "planning-lesson", "planning-overview", "pei-list", "pei-edit"].includes(model.page);
    const pageNames = { exam: "Correção de Provas", diary: "Diário do Professor", content: "Conteúdo", attendance: "Frequência", grades: "Notas", remote: "Acesso Remoto", "planning-list": "Planejamentos", "planning-calendar": "Calendário de planejamento", "planning-lesson": "Planejamento da aula", "planning-overview": "Planejamento rápido", "pei-list": "PEI · Etapa 2", "pei-edit": "PEI · Edição", unsupported: "Página não reconhecida" };

    if (!panel.querySelector(".cm-body")) {
      panel.innerHTML = `<header class="cm-head">
        <div class="cm-logo"><img src="${chrome.runtime.getURL("src/carometro-icon.svg")}" alt=""></div><div class="cm-title"><small>v${EXTENSION_VERSION}</small><h2>Assistente SIAP</h2><p></p><span class="cm-account-identity" hidden></span></div>
        <div class="cm-window-actions"><button class="cm-account-toggle" type="button">Entrar</button><button class="cm-minimize" data-action="minimize" aria-label="Minimizar" title="Minimizar">−</button></div>
        <a class="cm-activity-link" href="https://atividades.sistemacarometro.com.br/" target="_blank" rel="noopener noreferrer" aria-label="Atividades para professores (abre em nova guia)" title="Atividades para professores" hidden>Atividades ↗</a>
      </header><div class="cm-operation-status" role="status" aria-live="polite" hidden></div><div class="cm-body"></div>`;
      panel.querySelector('[data-action="minimize"]')?.addEventListener("click", () => setOpen(false, false));
      installDrag(panel, panel.querySelector(".cm-head"), "panelPosition");
    }
    const pageLabel = panel.querySelector(".cm-title p");
    if (pageLabel) pageLabel.textContent = model.page === "exam" ? "Correção de Provas" : `Professor · ${pageNames[model.page]}`;
    const activityLink = panel.querySelector('.cm-activity-link');
    if (activityLink) activityLink.hidden = !(model.activitySiteEnabled && (model.license?.active === true || model.license?.examAccess?.active === true) && !model.sessionRequired);
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
    if (model.sessionRequired) {
      panel.querySelector('.cm-body').innerHTML = '<section class="cm-card"><h3>Entrar no Assistente</h3><p>Se você recebeu acesso pelo Carômetro, entre no Carômetro com sua conta e conecte a extensão na página aberta. Não é necessário confirmar o e-mail novamente. Para compra individual, confirme o e-mail pelo link enviado à sua caixa de entrada.</p><div class="cm-login-actions"><a class="cm-btn cm-primary" href="https://sistemacarometro.com.br/assistente-siap-conta.html?plano=account" target="_blank" rel="noopener noreferrer">Abrir minha conta e conectar</a><a class="cm-btn" href="https://sistemacarometro.com.br/assistente-siap-conta.html?plano=trial" target="_blank" rel="noopener noreferrer">Experimentar grátis</a><a class="cm-btn" href="https://sistemacarometro.com.br/assistente-siap.html#planos" target="_blank" rel="noopener noreferrer">Ver planos e comprar acesso</a></div></section>';
      updateOperationStatus();
      return;
    }
    if (model.page === "exam") {
      if (!model.license) {
        panel.querySelector(".cm-body").textContent = 'Verificando acesso à Correção de Provas…';
      } else if (model.license.examAccess?.active !== true) {
        panel.querySelector(".cm-body").innerHTML = `<section class="cm-card"><h3>Correção de Provas</h3><p>${model.license.examAccess?.status === 'unavailable' ? 'Não foi possível verificar este acesso. Tente novamente em instantes.' : 'Compre créditos ou utilize uma concessão gratuita do proprietário.'}</p><button type="button" class="cm-btn cm-primary" data-exam-check-access>Verificar acesso novamente</button></section>`;
        panel.querySelector('[data-exam-check-access]').onclick = refreshLicenseStatus;
      } else window.SiapExamPanel?.mount(panel.querySelector(".cm-body"));
      const body=panel.querySelector('.cm-body');
      const access = model.license?.examAccess;
      if (access?.active === true) {
        body.querySelector('[data-exam-shop]')?.remove();
        let card = body.querySelector('[data-exam-access]');
        if (!card) {
          card = document.createElement('section');
          card.dataset.examAccess = '';
          card.className = 'cm-card cm-license cm-exam-access';
          body.prepend(card);
        }
        card.replaceChildren();
        const title = document.createElement('h3');
        title.textContent = 'Correção de Provas · Acesso ativo';
        const badge = document.createElement('span');
        badge.className = 'cm-exam-active-badge';
        badge.textContent = '✓ Licença ativa';
        card.append(badge, title);
        for (const text of accessSummary(access)) {
          const line = document.createElement('p');
          line.textContent = text;
          card.append(line);
        }
        const explanation = document.createElement('p');
        explanation.className = 'cm-exam-access-help';
        explanation.textContent = 'Cada crédito corrige um bloco de avaliação em todas as suas turmas. Ao abrir o QR Code no celular, ele fica vinculado àquele bloco até você finalizar a correção. Planos e concessões permitem corrigir durante sua validade.';
        const plans = document.createElement('a');
        plans.className = 'cm-btn cm-exam-plans';
        plans.href = 'https://sistemacarometro.com.br/assistente-siap.html#correcao-de-provas';
        plans.target = '_blank';
        plans.rel = 'noopener noreferrer';
        plans.textContent = 'Entenda os créditos e veja os planos ↗';
        card.append(explanation, plans);
      }
      if(access && access.active !== true && access.status !== 'unavailable' && !body.querySelector('[data-exam-shop]')) {
        const shop=document.createElement('section');shop.dataset.examShop='';shop.className='cm-card';
        shop.innerHTML=`<h3>Correção de Provas</h3><p>Cada crédito corrige um bloco de avaliação em todas as suas turmas. Ao abrir o QR Code no celular, ele fica vinculado àquele bloco até você finalizar a correção.</p><label><input type="checkbox" data-exam-legal> Li e aceito os <a href="https://sistemacarometro.com.br/legal.html#termos" target="_blank" rel="noopener noreferrer">termos</a>.</label><button style="border-radius:999px;padding:13px 18px;width:100%;margin-top:12px;font-weight:700" class="cm-btn cm-primary" data-exam-buy="exam_one">1 crédito · R$ 20</button><button style="border-radius:999px;padding:13px 18px;width:100%;margin-top:10px;font-weight:700" class="cm-btn" data-exam-buy="exam_four">4 créditos · R$ 80</button><p data-exam-buy-status role="status"></p><a class="cm-btn cm-exam-plans" href="https://sistemacarometro.com.br/assistente-siap.html#correcao-de-provas" target="_blank" rel="noopener noreferrer">Entenda os créditos e veja os planos ↗</a>`;
        const accountHint = document.createElement('p');
        accountHint.className = 'cm-payment-account';
        accountHint.textContent = model.accountEmail ? `No pagamento, use ${model.accountEmail}. O crédito será vinculado a essa conta.` : 'Use no pagamento o mesmo e-mail conectado ao Assistente.';
        shop.querySelector('label').before(accountHint);
        shop.querySelectorAll('[data-exam-buy]').forEach(button=>button.onclick=async()=>{
          const status=shop.querySelector('[data-exam-buy-status]');
          if(!shop.querySelector('[data-exam-legal]').checked){status.textContent='Leia e aceite os termos para continuar.';return;}
          button.disabled=true;status.textContent='Abrindo pagamento seguro…';
          try {const result=await chrome.runtime.sendMessage({type:'SIAP_EXAM_BUY',offerKey:button.dataset.examBuy,legalAccepted:true});status.textContent=result?.ok?'Pagamento aberto na Hotmart. Use o mesmo e-mail da sua conta do Assistente.':result?.error||'Conecte sua conta do Assistente para comprar.';}catch{status.textContent='Não foi possível abrir o pagamento.';}finally{button.disabled=false;}
        });body.prepend(shop);
      }
      return;
    }
    if (model.license && model.license.active !== true) {
      panel.querySelector(".cm-body").innerHTML = licenseCard();
      updateOperationStatus();
      return;
    }
    panel.querySelector(".cm-body").innerHTML = `
      ${licenseCard()}
      ${contextCard()}
      <section class="cm-card"><h3>Diagnóstico</h3>
        ${supported ? `<span class="cm-badge cm-green">Página reconhecida</span>` : `<span class="cm-badge cm-yellow">Somente leitura</span>`}
        <div class="cm-stats"><div class="cm-stat"><strong>${pending.length}</strong><span>Pendentes</span></div><div class="cm-stat"><strong>${saved.length}</strong><span>Salvos</span></div><div class="cm-stat"><strong>${future.length}</strong><span>Futuros</span></div></div>
        <div class="cm-actions"><button class="cm-btn cm-full" data-action="analyze">Analisar novamente</button></div>
      </section>
      ${workCard(pending)}
      ${logCard()}`;
    updateOperationStatus();
    bindPanelEvents();
  }

  function readStoredJson(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
  }

  function operationStatusMessage() {
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
    const planningFlow = readStoredJson("assistenteSiapPlanningFlow");
    if (planningFlow) return sessionStorage.getItem("assistenteSiapPlanningAi") ? "Gerando planejamento..." : "Preparando planejamento...";
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
    status.textContent = message;
    status.hidden = !message;
  }

  function setOperationStatus(message = "") {
    model.busyMessage = message;
    updateOperationStatus();
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

  function workCard(pending) {
    if (model.page === "diary") return `<section class="cm-card"><h3>Próximo passo</h3><p>Use os filtros, clique em <strong>Listar</strong>, selecione uma única turma e escolha Conteúdo ou Frequência.</p><p class="cm-note">O assistente aguardará cada atualização do SIAP antes de continuar.</p></section>`;
    if (model.page === "grades") return `<section class="cm-card"><h3>Notas protegidas</h3><div class="cm-alert">O MVP não preenche notas nem envia dados ao SIGE.</div></section>`;
    if (model.page === "remote") return `<section class="cm-card"><h3>Fora do escopo</h3><p>Acesso Remoto permanece somente para consulta.</p></section>`;
    if (model.page === "pei-list") return `<section class="cm-card"><h3>PEI · Etapa 2</h3><p>Filtre e liste os registros no SIAP. Selecione um estudante e clique em <strong>Visualizar</strong> para preparar um rascunho individual.</p><p class="cm-note">O assistente não guarda matrícula, nome, laudo ou diagnóstico.</p></section>`;
    if (model.page === "pei-edit") return peiCard();
    if (model.page === "planning-list") return `<section class="cm-card"><h3>Planejamentos</h3><p>Filtre a turma, clique em <strong>Listar</strong>, selecione uma linha e abra <strong>Visualizar</strong>.</p><p class="cm-note">Na próxima tela, datas azuis indicam aulas ainda sem planejamento.</p></section>`;
    if (model.page === "planning-overview") return planningOverviewCard(pending);
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
      <div class="cm-alert"><strong>${batch.paused ? "Lote pausado" : "Lote em andamento"}</strong><br>${batch.completed || 0} dia(s) concluído(s) · ${escapeHtml(SUPPORT_MATERIALS[batch.materialIndex] || "Material não identificado")}</div>
      <p class="cm-note">${escapeHtml(batch.currentLabel || "Procurando a próxima data azul nos meses escolhidos.")}</p>
      <div class="cm-actions"><button class="cm-btn" data-action="content-batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="content-batch-stop">Parar</button></div>
    </section>`;
    const monthChecks = MONTHS.map((month, index) => `<label class="cm-check"><input type="checkbox" data-content-month="${index}" ${index === selectedMonth ? "checked" : ""}><span>${month}</span></label>`).join("");
    const materialRadios = SUPPORT_MATERIALS.map((material, index) => `<label class="cm-check"><input type="radio" name="cm-support-material" data-material-index="${index}" ${index === SUPPORT_MATERIALS.length - 1 ? "checked" : ""}><span>${escapeHtml(material)}</span></label>`).join("");
    return `<section class="cm-card"><h3>Executar conteúdos planejados</h3>
      <p>Escolha os meses e um material de apoio. Somente datas azuis até hoje serão processadas.</p>
      <h4>Meses</h4><div class="cm-option-grid">${monthChecks}</div>
      <h4>Material de apoio</h4><div class="cm-option-list">${materialRadios}</div>
      <label class="cm-check"><input id="cm-content-confirm" type="checkbox"><span>Autorizo executar os conteúdos planejados e salvar cada data selecionada.</span></label>
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
      ${batch ? `<div class="cm-alert"><strong>${batch.paused ? "Lote pausado" : "Lote em andamento"}</strong><br>Origem: quinzenas · ${batch.completed || 0} concluído(s) · ${batch.periods.length - batch.periodIndex} período(s) restante(s).</div>
        <div class="cm-actions"><button class="cm-btn" data-action="batch-toggle">${batch.paused ? "Continuar" : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>`
        : `${planningBatchSetup(overview, preview)}`}
      <div class="cm-actions"><button class="cm-btn cm-full" data-action="analyze">Atualizar diagnóstico</button></div>
    </section>`;
  }

  function normalizePlanningGroup(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
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
    const draftCards = preview?.drafts ? Object.entries(preview.drafts).map(([key, draft], index) => `<div class="cm-preview-plan"><strong>Planejamento ${index + 1}</strong><small>${escapeHtml(draft.label || key)}</small><label class="cm-field"><span>Metodologia</span><textarea rows="7" maxlength="1200" data-preview-plan="${escapeHtml(encodeURIComponent(key))}" data-preview-field="2">${escapeHtml(draft.fields?.[2] || "")}</textarea></label><label class="cm-field"><span>Avaliação</span><textarea rows="6" maxlength="800" data-preview-plan="${escapeHtml(encodeURIComponent(key))}" data-preview-field="3">${escapeHtml(draft.fields?.[3] || "")}</textarea></label></div>`).join("") : "";
    const previewHtml = preview ? `<div class="cm-alert"><strong>Prévia do lote</strong><br>${preview.uniquePlans} planejamento(s) diferente(s) serão aplicados em ${preview.queue.length} aula(s).</div>
      <div class="cm-list">${preview.summary.map((line) => `<div class="cm-item"><span><strong>${escapeHtml(line)}</strong></span></div>`).join("")}</div>
      ${!preview.draftsReady ? `${draftCards}<p class="cm-note">A geração foi interrompida. As prévias concluídas acima foram preservadas; continue para gerar as restantes, sem salvar aulas.</p><div class="cm-actions"><button class="cm-btn" data-action="batch-preview-clear">Alterar</button><button class="cm-btn cm-primary" data-action="batch-draft-preview">Continuar geração da prévia</button></div>` : `${draftCards}<p class="cm-note">Você pode editar os textos diretamente acima. As alterações ficam guardadas nesta prévia.</p><label class="cm-check"><input id="cm-batch-confirm" type="checkbox"><span>${preview.mode === "equivalent" ? "Conferi as metodologias e avaliações. Autorizo preencher e salvar automaticamente somente as aulas brancas listadas." : "Conferi as metodologias e avaliações. Autorizo preencher as aulas listadas; cada aula será revisada antes de salvar."}</span></label><div class="cm-actions"><button class="cm-btn" data-action="batch-preview-clear">Alterar</button><button class="cm-btn cm-primary" data-action="batch-start" disabled>${preview.mode === "equivalent" ? "Aplicar automaticamente" : "Começar pelas aulas da prévia"}</button></div>`}` : `<p>Escolha quantos planejamentos a IA deve preparar nesta quinzena.</p>
      <label class="cm-check"><input type="radio" name="cm-batch-mode" value="equivalent" checked><span><strong>Turmas equivalentes</strong><br><small>O mesmo planejamento é usado na mesma posição de aula das turmas da mesma série e disciplina.</small></span></label>
      <label class="cm-check"><input type="radio" name="cm-batch-mode" value="individual"><span><strong>Aulas individuais</strong><br><small>Cada quadrado recebe um planejamento diferente.</small></span></label>
      <label class="cm-field"><span>Quantidade de planejamentos</span><input id="cm-batch-count" type="number" min="1" max="${equivalentMax}" value="${Math.min(value, Math.max(equivalentMax, 1))}"><small data-batch-limit>Limite neste modo: ${equivalentMax} planejamento(s), alcançando até ${overview.items.length} aula(s).</small></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="batch-preview">Gerar prévia completa</button></div>`;
    return previewHtml;
  }

  async function startPlanningDraftPreview() {
    let preview = getPlanningPreview();
    const select = document.getElementById("cphFuncionalidade_ddlPeriodoReconhecer");
    if (!preview?.queue?.length || !["equivalent", "individual"].includes(preview.mode) || !select) return addLog("Gere primeiro a prévia dos planejamentos.");
    if (preview.signature !== planningOverviewSignature()) return addLog("A quinzena mudou. Atualize a prévia antes de gerar os textos.");
    if (preview.generationActive) return;

    const representatives = [...new Map(preview.queue.map((item) => [item.planKey, item])).values()];
    const drafts = { ...(preview.drafts || {}) };
    const pending = representatives.filter((item) => !drafts[item.planKey]);
    if (!pending.length) {
      setPlanningPreview({ ...preview, drafts, draftsReady:true, generationActive:false });
      render();
      return addLog("Todas as prévias já estão prontas para conferência.");
    }

    const generationId = `${Date.now()}-${Math.random()}`;
    preview = { ...preview, drafts, draftsReady:false, generationActive:true, generationId, generationCompleted:Object.keys(drafts).length };
    setPlanningPreview(preview);
    render();
    addLog("Gerando as prévias no painel. Nenhuma aula do SIAP será aberta ou salva.");

    try {
      for (const item of pending) {
        const current = getPlanningPreview();
        if (!current || current.generationId !== generationId || current.signature !== planningOverviewSignature()) return;
        const sequence = Number(item.sequenceIndex || 0) + 1;
        const result = await chrome.runtime.sendMessage({
          type:"ASSISTENTE_SIAP_AI_DRAFT",
          payload:{
            kind:"planning",
            grade:item.grade || "Turma não identificada",
            subject:String(item.subject || "Componente curricular").replace(/^\d+\s*-\s*/, ""),
            period:select.selectedOptions?.[0]?.textContent?.trim() || "",
            guidance:`Crie uma proposta diferente para a sequência ${sequence}.`,
            selectedSkills:[],
            selectedContents:[],
            tense:"planned"
          }
        });
        if (!result?.ok || !Array.isArray(result.fields) || result.fields.length !== 4) throw new Error(result?.message || "A IA não devolveu os campos esperados.");
        drafts[item.planKey] = {
          fields:result.fields.map((field) => String(field || "").trim()),
          label:`${item.grade} · ${item.subject} · sequência ${sequence}`
        };
        preview = { ...getPlanningPreview(), drafts:{ ...drafts }, generationCompleted:Object.keys(drafts).length };
        setPlanningPreview(preview);
        render();
      }
      preview = { ...getPlanningPreview(), drafts:{ ...drafts }, draftsReady:Object.keys(drafts).length === preview.uniquePlans, generationActive:false };
      setPlanningPreview(preview);
      render();
      addLog("Prévias editáveis prontas. Nenhuma aula foi aberta ou salva.");
    } catch (error) {
      preview = { ...getPlanningPreview(), drafts:{ ...drafts }, draftsReady:false, generationActive:false };
      setPlanningPreview(preview);
      render();
      addLog(error?.message || "Não foi possível concluir as prévias.");
    }
  }

  function buildPlanningPreview() {
    const overview = planningOverviewOptions();
    const mode = panel.querySelector('[name="cm-batch-mode"]:checked')?.value === "individual" ? "individual" : "equivalent";
    const requested = Number(panel.querySelector("#cm-batch-count")?.value);
    let queue = [];
    if (mode === "individual") {
      const count = Math.min(Math.max(requested || 1, 1), overview.items.length);
      queue = overview.items.slice(0, count).map((item, index) => ({ ...item, planKey: `individual-${index + 1}`, sequenceIndex: index }));
    } else {
      const max = Math.max(0, ...overview.groups.map((group) => Math.max(0, ...[...group.classes.values()].map((lessons) => lessons.length))));
      const count = Math.min(Math.max(requested || 1, 1), max);
      overview.groups.forEach((group) => {
        for (let position = 0; position < count; position += 1) {
          group.classes.forEach((lessons) => {
            const item = lessons[position];
            if (item) queue.push({ ...item, planKey: `${group.key}|${position + 1}`, sequenceIndex: position });
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

  function planningLessonCard() {
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
    const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
    const ready = methodology instanceof HTMLTextAreaElement && evaluation instanceof HTMLTextAreaElement;
    const batch = getPlanningBatch();
    return `<section class="cm-card"><h3>Assistente de planejamento</h3>
      ${batch ? `<div class="cm-alert"><strong>${batch.previewOnly ? "Gerando somente a prévia — nenhuma aula será salva" : (batch.paused ? "Aguardando sua revisão" : "Lote em andamento")}</strong><br>${escapeHtml(batch.current?.grade || "")} · ${escapeHtml(batch.current?.subject || "")} · ${escapeHtml(batch.current?.classroom || "")} · Aula ${escapeHtml(batch.current?.lesson || "")}</div>
      ${batch.paused && batch.phase === "review" ? `<label class="cm-check"><input id="cm-batch-lesson-confirm" type="checkbox"><span>Revisei habilidade, conteúdo, descrição, metodologia e avaliação desta aula.</span></label>` : ""}
      <div class="cm-actions"><button class="cm-btn" data-action="batch-toggle" ${batch.paused && batch.phase === "review" ? "disabled" : ""}>${batch.paused ? "Salvar esta aula e continuar" : "Pausar"}</button><button class="cm-btn" data-action="batch-stop">Parar</button></div>` : ""}
      <span class="cm-badge ${ready ? "cm-green" : "cm-red"}">${ready ? "Estrutura reconhecida" : "Estrutura divergente"}</span>
      <p class="cm-note">Habilidades selecionadas: ${skillCount} · Conteúdos selecionados: ${contentCount}.</p>
      <div class="cm-alert">A seleção automática alterna itens do bimestre conforme o número da aula. Revise a coerência pedagógica antes de salvar.</div>
      <label class="cm-field"><span>Orientação opcional para a IA</span><textarea id="cm-plan-guidance" maxlength="1000" rows="3" placeholder="Ex.: atividade prática em grupos, leitura compartilhada ou avaliação por produção textual."></textarea></label>
      <label class="cm-check"><input id="cm-plan-confirm" type="checkbox"><span>Autorizo selecionar habilidade e conteúdo e preencher os campos vazios.</span></label>
      <label class="cm-check"><input id="cm-plan-auto-save-replicate" type="checkbox"><span><strong>Salvar e replicar automaticamente, sem revisão.</strong><br><small>Após completar o planejamento, o assistente abrirá a replicação, selecionará todas as turmas compatíveis e confirmará. Se nenhuma estiver disponível, cancelará a replicação e salvará somente esta aula.</small></span></label>
      <div class="cm-actions"><button class="cm-btn cm-full cm-primary" data-action="plan-ai-draft" disabled>Completar com IA</button></div>
      <div class="cm-actions"><button class="cm-btn cm-full" data-action="plan-draft" disabled>Usar modelo local</button></div>
      <hr>
      <label class="cm-check"><input id="cm-plan-save-confirm" type="checkbox"><span>Revisei habilidade, conteúdo, descrição, metodologia e avaliação.</span></label>
      <label class="cm-check"><input id="cm-plan-replicate" type="checkbox"><span>Replicar automaticamente em todas as turmas compatíveis após salvar.</span></label>
      <div class="cm-actions"><button class="cm-btn cm-full" data-action="plan-save" disabled>Salvar planejamento revisado</button></div>
    </section>`;
  }

  function peiCard() {
    const fields = getPeiFields();
    const ready = fields.length === 4;
    const filled = fields.filter((field) => hasMeaningfulPeiText(field.value)).length;
    return `<section class="cm-card"><h3>PEI contextualizado</h3>
      <span class="cm-badge ${ready ? "cm-green" : "cm-red"}">${ready ? "Estrutura reconhecida" : "Estrutura divergente"}</span>
      <p class="cm-note">${filled}/4 campos acadêmicos preenchidos. A extensão usa temporariamente série, disciplina e informações pedagógicas desta página, sem guardar nome, matrícula, laudo ou textos.</p>
      <label class="cm-check"><input id="cm-pei-use-name" type="checkbox"><span>Usar o nome do estudante nos textos.</span></label>
      <div class="cm-field"><span>O texto deve registrar:</span><div class="cm-choice-group">
        <label class="cm-choice"><input type="radio" name="cm-pei-tense" value="planned" checked><span><strong>O que será trabalhado</strong><small>Planejamento escrito no futuro</small></span></label>
        <label class="cm-choice"><input type="radio" name="cm-pei-tense" value="realized"><span><strong>O que já foi realizado</strong><small>Registro escrito no passado</small></span></label>
      </div></div>
      <h4>Focos opcionais</h4><div class="cm-option-grid">
        ${["Leitura", "Escrita", "Oralidade", "Atividades práticas", "Trabalho em quadra", "Recursos visuais", "Autonomia", "Trabalho colaborativo"].map((focus) => `<label class="cm-check"><input type="checkbox" data-pei-focus="${escapeHtml(focus)}"><span>${escapeHtml(focus)}</span></label>`).join("")}
      </div>
      <label class="cm-field"><span>Orientação opcional do professor</span><textarea id="cm-pei-guidance" maxlength="1000" rows="4" placeholder="Ex.: priorizar leitura oral, atividades curtas, uso de imagens ou trabalho em dupla."></textarea></label>
      <div class="cm-alert">A denominação clínica não será reproduzida nem interpretada. O rascunho utilizará apenas necessidades educacionais já descritas e deverá ser revisado antes de salvar.</div>
      <label class="cm-check"><input id="cm-pei-confirm" type="checkbox"><span>Entendo que o texto é um rascunho pedagógico e deve ser revisado individualmente.</span></label>
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
    panel.querySelector('[data-action="analyze"]')?.addEventListener("click", analyze);
    panel.querySelector('[data-action="select-all"]')?.addEventListener("click", () => panel.querySelectorAll("[data-day]").forEach((input) => { input.checked = true; }));
    panel.querySelector('[data-action="start"]')?.addEventListener("click", reviewRun);
    const peiConfirm = panel.querySelector("#cm-pei-confirm");
    const peiDraft = panel.querySelector('[data-action="pei-draft"]');
    const peiAiDraft = panel.querySelector('[data-action="pei-ai-draft"]');
    peiConfirm?.addEventListener("change", () => {
      const disabled = !peiConfirm.checked || getPeiFields().length !== 4;
      if (peiDraft) peiDraft.disabled = disabled;
      if (peiAiDraft) peiAiDraft.disabled = disabled;
    });
    peiDraft?.addEventListener("click", generatePeiDraft);
    peiAiDraft?.addEventListener("click", generatePeiAiDraft);
    const planConfirm = panel.querySelector("#cm-plan-confirm");
    const planDraft = panel.querySelector('[data-action="plan-draft"]');
    const planAiDraft = panel.querySelector('[data-action="plan-ai-draft"]');
    planConfirm?.addEventListener("change", () => {
      if (planDraft) planDraft.disabled = !planConfirm.checked;
      if (planAiDraft) planAiDraft.disabled = !planConfirm.checked;
    });
    planDraft?.addEventListener("click", () => startPlanningFlow("local"));
    planAiDraft?.addEventListener("click", () => startPlanningFlow("ai"));
    const saveConfirm = panel.querySelector("#cm-plan-save-confirm");
    const saveButton = panel.querySelector('[data-action="plan-save"]');
    saveConfirm?.addEventListener("change", () => { if (saveButton) saveButton.disabled = !saveConfirm.checked; });
    saveButton?.addEventListener("click", savePlanning);
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
    setContentBatch({ active: true, paused: false, phase: "month", months, monthIndex: 0, materialIndex: Number(material.dataset.materialIndex), completed: 0, saveAttempts: 0 });
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

  function resumeContentBatch() {
    if (model.license?.active === false) return lockAssistantAfterExpiry();
    const batch = getContentBatch();
    if (!batch || batch.paused || Core.pageType(location.pathname) !== "content") return;
    const monthSelect = document.getElementById(IDS.month);
    if (!monthSelect) return stopContentBatchWithError("Seletor de mês não encontrado.");
    const targetMonth = batch.months[batch.monthIndex];
    if (targetMonth === undefined) { setContentBatch(null); return addLog(`Execução concluída: ${batch.completed || 0} dia(s) salvo(s).`); }

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
      const day = readCalendarDays().find((item) => item.label === batch.currentLabel);
      if (day?.state === "pending") {
        batch.saveAttempts = (batch.saveAttempts || 0) + 1;
        if (batch.saveAttempts >= MAX_SAVE_ATTEMPTS) {
          batch.paused = true;
          setContentBatch(batch);
          return addLog(`O SIAP não confirmou o salvamento do conteúdo após ${MAX_SAVE_ATTEMPTS} tentativas. O lote foi pausado.`);
        }
        batch.phase = "retry-wait";
        batch.retryAt = Date.now() + Core.backoff(batch.saveAttempts);
        setContentBatch(batch);
        return scheduleContentResume(Core.backoff(batch.saveAttempts));
      }
      batch.completed += 1;
      batch.saveAttempts = 0;
      batch.phase = "month";
      batch.currentLabel = "";
      setContentBatch(batch);
    }
    if (batch.phase === "retry-wait") {
      const wait = (batch.retryAt || 0) - Date.now();
      if (wait > 0) return scheduleContentResume(wait);
      const day = readCalendarDays().find((item) => item.label === batch.currentLabel && item.state === "pending");
      if (!day) {
        batch.phase = "saving";
        batch.verifyNotBefore = Date.now();
        setContentBatch(batch);
        return scheduleContentResume(100);
      }
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
        if (Date.now() - batch.saveWaitStartedAt >= 20000) return stopContentBatchWithError("O botão de salvar permaneceu indisponível por 20 segundos.");
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
      const pending = readCalendarDays().find((item) => item.state === "pending" && item.eligible);
      if (!pending) { batch.monthIndex += 1; setContentBatch(batch); return scheduleContentResume(100); }
      batch.currentLabel = pending.label;
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
    setAttendanceBatch({ active: true, paused: false, phase: "month", months, monthIndex: 0, completed: 0, attempts: 0, skipped: 0, skippedDays: [] });
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
    if (model.license?.active === false) return lockAssistantAfterExpiry();
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
    setPlanningBatch({ active: true, paused: false, autoSave: automaticEquivalent, phase: "overview", periods: [period], periodIndex: 0, completed: 0, reviewedGroups: [], current: null, selectedQueue: preview.queue, queueIndex: 0, templates: preview.drafts || {}, mode: preview.mode });
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
    document.dispatchEvent(new CustomEvent("assistente-siap:postback", { detail: JSON.stringify(postback) }));
    return true;
  }

  function resumePlanningBatch() {
    if (model.license?.active === false) return lockAssistantAfterExpiry();
    const batch = getPlanningBatch();
    if (!batch || batch.paused) return;
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
        // O SIAP retorna diretamente à quinzena depois de salvar. Reabra o
        // bloco recém-salvo para usar o botão Replicar da tela de edição.
        const savedBlock = [...document.querySelectorAll("#cphFuncionalidade_ControleAcompanhamentoPlanejamentoProfessor .aula.planejada")]
          .find((block) => {
            if (block.getAttribute("onclick") === batch.current?.onclick) return true;
            const item = overviewItem(block);
            return item.lesson === batch.current?.lesson &&
              item.classroom === batch.current?.classroom &&
              item.subject === batch.current?.subject;
          });
        if (!savedBlock) {
          batch.paused = true;
          batch.phase = "manual";
          setPlanningBatch(batch);
          return addLog("O planejamento foi salvo, mas o bloco não foi reencontrado para replicação.");
        }
        batch.current.saveAttempts = 0;
        batch.phase = "replicating";
        setPlanningBatch(batch);
        if (!requestSiapPostBack(savedBlock)) {
          batch.paused = true;
          batch.phase = "manual";
          setPlanningBatch(batch);
          addLog("O planejamento foi salvo, mas não foi possível reabri-lo para replicação.");
        }
        return;
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
            const drafts = Object.fromEntries(Object.entries(batch.templates || {}).map(([key, value]) => [key, { ...value, label: value.label || key }]));
            setPlanningPreview({ ...preview, drafts, draftsReady: Object.keys(drafts).length === preview.uniquePlans, signature: planningOverviewSignature() });
            setPlanningBatch(null);
            render();
            return addLog("Prévia de metodologia e avaliação pronta para conferência. Nenhuma aula foi salva.");
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
    if (model.page === "planning-lesson" && batch.phase === "replicating") {
      resumeReplicateAfterSave();
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
      startPlanningFlow(Array.isArray(batch.selectedQueue) ? "ai" : "local");
    }
  }

  function togglePlanningBatch() {
    const batch = getPlanningBatch();
    if (!batch) return;
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
      setPlanningBatch(batch);
      startPlanningFlow();
      return;
    }
    if (batch.paused && model.page === "planning-lesson" && batch.phase === "review") {
      if (batch.previewOnly) {
        stopPlanningBatch();
        return addLog("Bloqueio de segurança: uma prévia nunca pode salvar uma aula.");
      }
      batch.paused = false;
      if (!batch.reviewedGroups.includes(batch.current?.group)) batch.reviewedGroups.push(batch.current.group);
      batch.phase = "saving";
      setPlanningBatch(batch);
      if (!Array.isArray(batch.selectedQueue)) sessionStorage.setItem("assistenteSiapOpenReplicate", planningSignature());
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
      batch.phase = "saving";
      setPlanningBatch(batch);
      if (!Array.isArray(batch.selectedQueue)) sessionStorage.setItem("assistenteSiapOpenReplicate", planningSignature());
    }, true);
  }

  function stopPlanningBatch() {
    const batch = getPlanningBatch();
    if (batch?.previewOnly && batch.previewMetadata) {
      setPlanningPreview({ ...batch.previewMetadata, drafts:batch.templates || {}, draftsReady:false, signature:batch.previewMetadata.signature || planningOverviewSignature() });
    }
    setPlanningBatch(null);
    sessionStorage.removeItem("assistenteSiapPlanningFlow");
    sessionStorage.removeItem("assistenteSiapPlanningAi");
    sessionStorage.removeItem("assistenteSiapOpenReplicate");
    sessionStorage.removeItem("assistenteSiapConfirmReplicate");
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
    const fragment = kind === "skill" ? "sHabilidades" : "sObjetivos";
    return [...document.querySelectorAll('#cphFuncionalidade_cphCampos_treeView a[href*="__doPostBack"]')]
      .filter((link) => decodeURIComponent(link.getAttribute("href") || "").includes(fragment));
  }

  function tryNextPlanningAxis(flow) {
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
    if (!getPlanningBatch()) {
      const autoSaveReplicate = panel.querySelector("#cm-plan-auto-save-replicate")?.checked === true;
      if (autoSaveReplicate) sessionStorage.setItem("assistenteSiapAutoSaveReplicate", planningSignature());
      else sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    }
    if (mode === "ai") {
      const guidance = panel.querySelector("#cm-plan-guidance")?.value.trim() || "";
      sessionStorage.setItem("assistenteSiapPlanningAi", JSON.stringify({ guidance }));
    } else {
      sessionStorage.removeItem("assistenteSiapPlanningAi");
    }
    const signature = planningSignature();
    const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
    const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
    const stage = skillCount ? (contentCount ? "fill" : "content") : "skill";
    sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify({ signature, stage }));
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
    if (!flow || flow.signature !== planningSignature()) return;
    const batch = getPlanningBatch();
    const lesson = Number(document.getElementById("cphFuncionalidade_cphCampos_txtNumeroAula")?.value) || 1;
    const selectionIndex = Number.isInteger(batch?.current?.sequenceIndex) ? batch.current.sequenceIndex : lesson - 1;
    if (flow.stage === "skill") {
      const links = planningLinks("skill");
      const contentLinks = planningLinks("content");
      if (!links.length || !contentLinks.length) {
        if (tryNextPlanningAxis(flow)) return;
        return stopPlanningFlow("Nenhum eixo curricular possui habilidade e conteúdo simultaneamente no bimestre atual.");
      }
      flow.stage = "wait-skill";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
      if (!requestSiapPostBack(links[selectionIndex % links.length])) return stopPlanningFlow("Não foi possível selecionar a habilidade no SIAP.");
      return;
    }
    if (flow.stage === "wait-skill") {
      const skillCount = document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr").length;
      if (!skillCount) return;
      flow.stage = "content";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
    }
    if (flow.stage === "content") {
      const links = planningLinks("content");
      if (!links.length) return stopPlanningFlow("Nenhum conteúdo disponível para o bimestre atual.");
      flow.stage = "wait-content";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
      if (!requestSiapPostBack(links[selectionIndex % links.length])) return stopPlanningFlow("Não foi possível selecionar o conteúdo no SIAP.");
      return;
    }
    if (flow.stage === "wait-content") {
      const contentCount = document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]').length;
      if (!contentCount) return;
      flow.stage = "fill";
      sessionStorage.setItem("assistenteSiapPlanningFlow", JSON.stringify(flow));
    }
    if (flow.stage === "fill") {
      sessionStorage.removeItem("assistenteSiapPlanningFlow");
      const aiRequested = sessionStorage.getItem("assistenteSiapPlanningAi");
      if (aiRequested) return generatePlanningAiDraft(aiRequested);
      generatePlanningDraft();
    }
  }

  function stopPlanningFlow(message) {
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
  }

  function generatePlanningDraft() {
    const methodology = document.getElementById("cphFuncionalidade_cphCampos_txtMetodologia");
    const evaluation = document.getElementById("cphFuncionalidade_cphCampos_txtAvaliacao");
    if (!(methodology instanceof HTMLTextAreaElement) || !(evaluation instanceof HTMLTextAreaElement)) return addLog("Planejamento não preenchido: estrutura diferente da esperada.");
    const subject = model.context.subject || "componente curricular";
    const normalizedSubject = subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const isPhysicalEducation = normalizedSubject.includes("EDUCACAO FISICA");
    const isArt = normalizedSubject === "ARTE" || normalizedSubject.includes("ARTES");
    const batchState = getPlanningBatch();
    const approvedTemplate = batchState?.templates?.[batchState.current?.group];
    const contentFields = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]')];
    const contentDescription = isPhysicalEducation
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
    const focus = contents.length ? contents.join(", ") : "os objetivos e conteúdos selecionados";
    const generatedMethodology = isPhysicalEducation
      ? `Iniciar com acolhida, apresentação dos objetivos e preparação corporal adequada. Organizar a turma em atividades práticas progressivas sobre ${focus}, com demonstração dos movimentos, estações de experimentação e situações cooperativas. Reforçar regras, segurança, respeito e inclusão durante as vivências. Encerrar com volta à calma e conversa breve sobre estratégias, dificuldades e aprendizagens.`
      : isArt
        ? `Iniciar com apreciação e contextualização de referências relacionadas a ${focus}. Propor experimentação orientada de materiais, técnicas e formas de expressão, seguida de produção individual ou coletiva. Acompanhar o processo criativo com intervenções que valorizem autoria, diversidade cultural e reflexão estética. Finalizar com socialização das produções e síntese das aprendizagens.`
        : `Iniciar com uma breve retomada dos conhecimentos prévios da ${model.context.grade || "turma"} e apresentar o objetivo da aula. Desenvolver atividades participativas sobre ${focus}, com explicação objetiva, leitura ou análise orientada e aplicação prática. Fazer intervenções durante a atividade, respeitando diferentes ritmos de aprendizagem, e encerrar com síntese coletiva do que foi aprendido em ${subject}.`;
    const generatedEvaluation = isPhysicalEducation
      ? `Realizar avaliação contínua e formativa por meio da observação da participação nas práticas, compreensão das regras, execução progressiva dos movimentos, cooperação, respeito e cuidado com a segurança. Registrar avanços e dificuldades para orientar adaptações e retomadas nas aulas seguintes.`
      : isArt
        ? `Avaliar de forma processual a participação, a experimentação de materiais e técnicas, a relação entre a produção e o conteúdo estudado, a autoria e a capacidade de apreciar e comentar as produções próprias e dos colegas. Registrar avanços para orientar novas propostas.`
        : `Realizar avaliação contínua e formativa na ${model.context.grade || "turma"} por meio da observação da participação, da compreensão das orientações e da aplicação dos conteúdos selecionados nas atividades propostas. Registrar avanços e dificuldades para orientar retomadas e adequações nas aulas seguintes.`;
    if (!methodology.value.trim()) methodology.value = approvedTemplate?.methodology || generatedMethodology;
    if (!evaluation.value.trim()) evaluation.value = approvedTemplate?.evaluation || generatedEvaluation;
    [...contentFields, methodology, evaluation].forEach((field) => { field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })); });
    addLog("Habilidade, conteúdo e campos vazios preparados. Revise tudo antes de salvar.");
    const batch = getPlanningBatch();
    if (!batch && autoSaveAndReplicatePlanningIfRequested()) return;
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
        batch.phase = "saving";
        setPlanningBatch(batch);
        sessionStorage.setItem("assistenteSiapOpenReplicate", planningSignature());
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
    if (!(methodology instanceof HTMLTextAreaElement) || !(evaluation instanceof HTMLTextAreaElement) || !contentFields.length) {
      return addLog("Planejamento não preenchido: estrutura diferente da esperada.");
    }
    let request = {};
    try { request = JSON.parse(rawRequest) || {}; } catch { request = {}; }
    const batch = getPlanningBatch();
    const template = batch?.current?.planKey ? batch.templates?.[batch.current.planKey] : null;
    const selectedSkills = [...document.querySelectorAll("#cphFuncionalidade_cphCampos_gdvExpectativas tr")]
      .map((row) => row.textContent.trim()).filter(Boolean).slice(0, 20);
    const selectedContents = [...document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"] .cabecalhoConteudo span')]
      .map((span) => (span.getAttribute("title") || span.textContent || "").trim()).filter(Boolean).slice(0, 20);
    const payload = {
      kind:"planning",
      grade:model.context.grade || "Turma não identificada",
      subject:(model.context.subject || "Componente curricular").replace(/^\d+\s*-\s*/, ""),
      period:model.context.term || "",
      guidance:typeof request.guidance === "string" ? request.guidance : "",
      selectedSkills,
      selectedContents,
      tense:"planned"
    };
    setOperationStatus("Gerando planejamento...");
    addLog("Gerando o planejamento com IA…");
    try {
      const result = template ? { ok: true, fields: template.fields } : await chrome.runtime.sendMessage({ type:"ASSISTENTE_SIAP_AI_DRAFT", payload });
      if (!result?.ok || !Array.isArray(result.fields) || result.fields.length !== 4) {
        addLog(result?.message || "A IA não devolveu os quatro campos esperados.");
        return;
      }
      if (batch?.active && batch.phase === "filling" && batch.previewOnly) {
        batch.templates = batch.templates || {};
        if (batch.current?.planKey) {
          batch.templates[batch.current.planKey] = {
            fields: result.fields.map((field) => String(field || "").trim()),
            label: `${batch.current.grade} · ${batch.current.subject} · sequência ${Number(batch.current.sequenceIndex || 0) + 1}`
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
      contentFields.forEach((field) => { if (!field.value.trim()) field.value = String(result.fields[1] || "").trim(); });
      if (!methodology.value.trim()) methodology.value = String(result.fields[2] || "").trim();
      if (!evaluation.value.trim()) evaluation.value = String(result.fields[3] || "").trim();
      [...contentFields, methodology, evaluation].forEach((field) => {
        field.dispatchEvent(new Event("input", { bubbles:true }));
        field.dispatchEvent(new Event("change", { bubbles:true }));
      });
      if (!batch && autoSaveAndReplicatePlanningIfRequested()) return;
      if (batch?.active && batch.phase === "filling") {
        batch.templates = batch.templates || {};
        if (batch.current?.planKey && !batch.templates[batch.current.planKey]) batch.templates[batch.current.planKey] = { fields: result.fields.map((field) => String(field || "").trim()), label: `${batch.current.grade} · ${batch.current.subject} · sequência ${Number(batch.current.sequenceIndex || 0) + 1}` };
        if (batch.previewOnly) {
          stopPlanningBatch();
          return addLog("Bloqueio de segurança: uma prévia nunca pode salvar uma aula.");
        }
        if (batch.autoSave) {
          batch.phase = "saving";
          setPlanningBatch(batch);
          document.getElementById("cphFuncionalidade_btnAlterar")?.click();
        } else {
          batch.paused = true;
          batch.phase = "review";
          setPlanningBatch(batch);
          render();
        }
      }
      addLog(template ? "Planejamento equivalente aplicado. Revise esta aula; nada foi salvo." : "Planejamento gerado com IA. Revise habilidade, conteúdo e textos; nada foi salvo.");
    } catch {
      addLog("Não foi possível acessar a IA do Assistente SIAP. Verifique o acesso à extensão e tente novamente.");
    } finally {
      setOperationStatus("");
    }
  }

  function savePlanning() {
    const save = document.getElementById("cphFuncionalidade_btnAlterar");
    if (!save || save.disabled) return addLog("O botão Salvar não está disponível nesta aula.");
    const replicate = panel.querySelector("#cm-plan-replicate")?.checked === true;
    if (replicate) sessionStorage.setItem("assistenteSiapOpenReplicate", planningSignature());
    save.click();
  }

  function autoSaveAndReplicatePlanningIfRequested() {
    const signature = planningSignature();
    if (sessionStorage.getItem("assistenteSiapAutoSaveReplicate") !== signature) return false;
    const replicate = document.getElementById("cphFuncionalidade_cphCampos_btnReplicar");
    if (!replicate || replicate.disabled) {
      sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
      addLog("O preenchimento foi concluído, mas o botão Replicar não está disponível. Revise e salve manualmente.");
      return false;
    }
    sessionStorage.removeItem("assistenteSiapAutoSaveReplicate");
    return openPlanningReplication();
  }

  function openPlanningReplication() {
    const replicate = document.getElementById("cphFuncionalidade_cphCampos_btnReplicar");
    if (!replicate || replicate.disabled) return false;
    const signature = planningSignature();
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

  function completeReplicationIfRequested() {
    const expected = sessionStorage.getItem("assistenteSiapConfirmReplicate");
    if (!expected || expected !== planningSignature()) return;
    const dialog = document.getElementById("divTurmasReplicacao") || document.querySelector('[id$="_divTurmasReplicacao"]');
    const confirm = document.getElementById("cphFuncionalidade_cphCampos_btnConfirmarReplicar");
    if (!dialog || !confirm || confirm.disabled || getComputedStyle(dialog).display === "none") return;
    const inputs = [...dialog.querySelectorAll('input[type="checkbox"]')];
    if (!inputs.length) {
      const openedAt = Number(sessionStorage.getItem("assistenteSiapReplicationOpenedAt")) || Date.now();
      if (Date.now() - openedAt < 3000) return setTimeout(completeReplicationIfRequested, 200);
    }
    const targets = inputs.filter((input) => !input.disabled);
    if (!targets.length) {
      sessionStorage.removeItem("assistenteSiapConfirmReplicate");
      sessionStorage.removeItem("assistenteSiapReplicationOpenedAt");
      const cancel = document.getElementById("cphFuncionalidade_cphCampos_btnCancelarReplicar");
      const batch = getPlanningBatch();
      if (batch) {
        batch.completed += 1;
        batch.phase = "return";
        setPlanningBatch(batch);
        setTimeout(resumePlanningBatch, 100);
      } else {
        cancel?.click();
        addLog("Nenhuma turma compatível disponível. Replicação cancelada; salvando somente esta aula.");
        setTimeout(() => {
          const save = document.getElementById("cphFuncionalidade_btnAlterar");
          if (!save || save.disabled) return addLog("A replicação foi cancelada, mas o botão Salvar não está disponível. Salve manualmente.");
          save.click();
        }, 100);
      }
      return;
    }
    targets.forEach((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    sessionStorage.removeItem("assistenteSiapConfirmReplicate");
    sessionStorage.removeItem("assistenteSiapReplicationOpenedAt");
    const batch = getPlanningBatch();
    if (batch) {
      batch.completed += 1;
      batch.phase = "return";
      setPlanningBatch(batch);
    }
    confirm.click();
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
    const guidance = [panel.querySelector("#cm-pei-guidance")?.value.trim() || "", selectedFocuses.length ? `Focos: ${selectedFocuses.join(", ")}.` : ""].filter(Boolean).join(" ");
    const payload = {
      kind:"pei",
      grade:model.context.grade || "Turma não identificada",
      subject:(model.context.subject || "Componente curricular").replace(/^\d+\s*-\s*/, ""),
      period:model.context.term || "",
      guidance,
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
    panel.hidden = !open;
    if (launcher) launcher.hidden = open || closed;
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
    const frequencies = frequencyLists.at(-1);
    const marks = frequencies ? [...frequencies.querySelectorAll(":scope .itens > .item")] : [];
    if (!names.length || marks.length !== names.length) return [];
    return names.map((item, index) => {
      const rawName = String(item.querySelector(".aluno")?.textContent || "").replace(/^\s*\d+[.)-]?\s*/, "").trim();
      const situationElement = item.querySelector(".situacao");
      const situation = `${situationElement?.getAttribute("title") || ""} ${situationElement?.textContent || ""}`.trim();
      const transferred = /transferid/i.test(situation) || /^T$/i.test(situation);
      const mark = normalizedLabel(marks[index]?.textContent);
      return {
        name:rawName,
        transferred,
        present:mark === "•" || mark === "." || mark === "P" ? 1 : 0,
        absent:mark === "F" ? 1 : 0,
        total:/^(F|P|\.|•)$/.test(mark) ? 1 : 0
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
      if (model.license?.active !== true) lockAssistantAfterExpiry();
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
