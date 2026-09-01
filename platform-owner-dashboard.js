// CARÔMETRO COMERCIAL
// Painel do proprietário da plataforma

(() => {

  const PLAN_LABELS = {
    free: 'Gratuito',
    basic: 'Básico',
    professional: 'Profissional',
    enterprise: 'Empresarial'
  };

  const STATUS_LABELS = {
    active: 'Ativa',
    suspended: 'Suspensa',
    archived: 'Arquivada',
    expired: 'Expirada',
    missing: 'Não configurada'
  };

  const DELETION_JOB_STATUS_LABELS = {
    pending: 'Aguardando início',
    deleting_storage: 'Removendo arquivos',
    deleting_database: 'Removendo dados',
    failed: 'Falhou'
  };

  const AUDIT_LABELS = {
    school_provisioned: 'Escola criada',
    school_status_changed: 'Status da escola alterado',
    subscription_status_changed: 'Status da assinatura alterado',
    subscription_plan_changed: 'Plano da assinatura alterado',
    account_access_changed: 'Acesso da conta alterado',
    subscription_visibility_changed: 'Visibilidade da assinatura alterada',
    account_login_cancelled: 'Login cancelado',
    account_permanently_deleted: 'Conta excluída permanentemente',
    school_archived: 'Escola arquivada',
    school_restored: 'Escola restaurada',
    school_permanently_deleted: 'Escola excluída permanentemente',
    plan_catalog_updated: 'Catálogo de planos atualizado',
    billing_contact_changed: 'Responsável pela assinatura alterado',
    plan_override_set: 'Concessão administrativa de plano definida',
    plan_override_removed: 'Concessão administrativa de plano removida',
    subscription_commercial_terms_changed: 'Condições comerciais da escola alteradas'
  };

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function injectStyle() {
    // O visual do workspace vive em platform-owner-dashboard.css. Manter
    // esta função preserva o contrato de inicialização do módulo.
  }


  function createDashboardModal() {

    if (document.getElementById('platformDashboardModal')) {
      return document.getElementById('platformDashboardModal');
    }

    const modal = document.createElement('div');
    modal.id = 'platformDashboardModal';
    modal.className = 'modal-bg platform-workspace-bg hidden';
    modal.innerHTML = `
      <div class="platform-workspace">
        <aside class="platform-sidebar">
          <div class="platform-brand"><span class="platform-brand-mark">C</span><div><strong>CARÔMETRO</strong><small>Plataforma</small></div></div>
          <nav class="platform-nav" aria-label="Painel da plataforma">
            <button type="button" class="active" data-platform-page="overview"><span class="platform-nav-icon">◈</span>Visão geral</button>
            <button type="button" data-platform-page="schools"><span class="platform-nav-icon">▦</span>Escolas</button>
            <button type="button" data-platform-page="applications"><span class="platform-nav-icon">✉</span>Novos clientes</button>
            <button type="button" data-platform-page="subscriptions"><span class="platform-nav-icon">▣</span>Assinaturas</button>
            <button type="button" data-platform-page="plans"><span class="platform-nav-icon">☆</span>Planos</button>
            <button type="button" data-platform-page="contacts"><span class="platform-nav-icon">♧</span>Responsáveis</button>
            <button type="button" data-platform-page="audit"><span class="platform-nav-icon">◷</span>Auditoria</button>
            <button type="button" data-platform-page="settings"><span class="platform-nav-icon">⚙</span>Configurações</button>
          </nav>
          <div class="platform-sidebar-foot"><div class="platform-owner-chip"><span class="platform-owner-avatar">P</span><div><strong>Proprietário</strong><small>Dono da Plataforma</small></div></div></div>
        </aside>
        <div class="platform-shell">
          <header class="platform-topbar">
            <div style="display:flex;align-items:center;gap:12px"><button class="platform-menu-toggle" type="button" aria-label="Abrir menu">☰</button><div><h2 id="platformPageTitle">Olá, Proprietário! 👋</h2><p id="platformPageSubtitle">Aqui está o resumo da sua plataforma.</p></div></div>
            <div class="platform-top-actions"><span class="platform-date" id="platformCurrentDate"></span><button class="platform-close" type="button" aria-label="Fechar painel">×</button></div>
          </header>
          <main class="platform-content">
            <section class="platform-page active" data-platform-section="overview">
              <div class="platform-stats" id="platformStats"></div>
              <div class="platform-grid-2">
                <section class="platform-panel"><div class="platform-panel-head"><h4>Escolas cadastradas</h4><button class="btn primary" type="button" data-go-page="schools">+ Nova escola</button></div><div class="platform-panel-body"><div id="platformOverviewSchools" class="platform-subscription-grid"></div></div></section>
                <section class="platform-panel"><div class="platform-panel-head"><h4>Assinaturas por plano</h4></div><div id="platformPlanDistribution" class="platform-panel-body platform-plan-distribution"></div></section>
              </div>
            </section>
            <section class="platform-page" data-platform-section="schools">
              <div class="platform-page-heading"><div><h3>Escolas</h3><p>Cadastre e administre as escolas da plataforma.</p></div></div>
              <section class="platform-panel"><div class="platform-panel-head"><h4>Nova escola</h4></div><form id="platformSchoolForm" class="platform-school-form">
            <div class="field"><label for="platformSchoolName">Nome da escola</label><input id="platformSchoolName" maxlength="160" required></div>
            <div class="field"><label for="platformSchoolAdminEmail">E-mail do administrador</label><input id="platformSchoolAdminEmail" type="email" required></div>
            <div class="field"><label for="platformSchoolPlan">Plano</label><select id="platformSchoolPlan"></select></div>
            <div class="field"><label for="platformSchoolPrice">Preço mensal</label><input id="platformSchoolPrice" type="number" min="0" step="0.01" value="0" required></div>
            <button class="btn primary" type="submit">Criar escola</button>
          </form></section>
          <div id="platformAdminInvite" class="hidden" style="margin:-6px 0 18px">
            <p id="platformAdminInviteStatus" class="meta"></p>
            <button id="platformAdminInviteRetry" class="btn secondary" type="button">Reenviar convite ao administrador</button>
          </div>
          <section class="platform-panel" style="margin-top:18px"><div class="platform-panel-head"><h4>Escolas cadastradas</h4></div>
            <div class="platform-table-wrap">
              <table class="platform-table platform-schools-table">
                <thead>
                  <tr>
                    <th>Escola</th>
                    <th>Plano</th>
                    <th>Status</th>
                    <th>Assinatura</th>
                    <th>Usuários</th>
                    <th>Alunos</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody id="platformSchoolsBody"></tbody>
              </table>
            </div>
            <div id="platformArchivedSection" class="platform-archived-section hidden">
              <h4>Escolas arquivadas</h4>
              <div id="platformArchivedList"></div>
            </div>
          </section>
            </section>
            <section class="platform-page" data-platform-section="applications"><div class="platform-page-heading"><div><h3>Novos clientes</h3><p>Solicitações enviadas pela vitrine pública de planos.</p></div></div><div id="platformApplicationsList" class="platform-applications-list"></div></section>
            <section class="platform-page" data-platform-section="subscriptions"><div class="platform-page-heading"><div><h3>Assinaturas</h3><p>Planos, status e condições comerciais reais por escola.</p></div></div><div id="platformSubscriptionsList" class="platform-subscription-grid"></div><div class="platform-page-heading platform-payment-heading"><div><h3>Pagamentos pelo Mercado Pago</h3><p>Assinaturas recorrentes iniciadas pela oferta pública.</p></div></div><div id="platformPaymentSubscriptionsList" class="platform-subscription-grid"></div></section>
            <section class="platform-page" data-platform-section="plans"><div class="platform-page-heading"><div><h3>Planos</h3><p>Catálogo comercial configurado no banco.</p></div></div><div id="platformPlansList" class="platform-plans-list"></div></section>
            <section class="platform-page" data-platform-section="contacts"><div class="platform-page-heading"><div><h3>Responsáveis pela assinatura</h3><p>Contatos comerciais independentes dos administradores escolares.</p></div></div><div id="platformBillingContactsList" class="platform-contacts-grid"></div></section>
            <section class="platform-page" data-platform-section="audit"><div class="platform-page-heading"><div><h3>Auditoria</h3><p>Operações administrativas registradas pela plataforma.</p></div></div>
          <section class="platform-panel">
            <div class="platform-panel-head"><h4>Gerenciar conta</h4></div>
            <form id="platformAccountForm" class="platform-account-form">
              <div class="field"><label for="platformAccountEmail">E-mail exato da conta</label><input id="platformAccountEmail" type="email" required autocomplete="off"></div>
              <button class="btn secondary" type="submit">Localizar conta</button>
            </form>
            <div id="platformAccountResult" class="platform-account-result hidden"></div>
          </section>
          <section class="platform-panel" style="margin-top:18px">
            <div class="platform-panel-head"><h4>Atividade administrativa recente</h4></div>
            <div class="platform-table-wrap">
              <table class="platform-table platform-audit-table">
                <thead><tr><th>Data</th><th>Ação</th><th>Escola/conta</th><th>Alteração</th></tr></thead>
                <tbody id="platformAuditBody"></tbody>
              </table>
            </div>
          </section></section>
          <section class="platform-page" data-platform-section="settings"><div class="platform-page-heading"><div><h3>Configurações</h3><p>Opções globais sustentadas pelo backend atual.</p></div></div><section class="platform-panel"><div class="platform-settings-row"><div><h4>Oferta pública dos planos</h4><p>Exibir a oferta de planos na área pública do Carômetro.</p><p id="platformShowSubscriptionError" class="error hidden" style="margin-top:8px"></p></div><label class="platform-switch"><input id="platformShowSubscription" type="checkbox"><span></span></label></div></section></section>
          </main>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.platform-close').onclick = closeDashboard;
    modal.querySelector('.platform-menu-toggle').onclick = event => {
      event.stopPropagation();
      const workspace = modal.querySelector('.platform-workspace');
      if (window.matchMedia('(max-width: 800px)').matches) {
        workspace.classList.toggle('menu-open');
      } else {
        workspace.classList.toggle('menu-collapsed');
      }
    };
    modal.querySelectorAll('[data-platform-page]').forEach(button => button.onclick = () => showPlatformPage(button.dataset.platformPage));
    modal.querySelectorAll('[data-go-page]').forEach(button => button.onclick = () => showPlatformPage(button.dataset.goPage));
    modal.querySelector('#platformSchoolForm').onsubmit = provisionSchool;
    modal.querySelector('#platformAdminInviteRetry').onclick = retryAdminInvite;
    modal.querySelector('#platformAccountForm').onsubmit = lookupAccount;
    modal.querySelector('#platformShowSubscription').onchange = toggleShowSubscription;
    modal.querySelector('.platform-shell').onclick = event => {
      if (event.target.closest('.platform-menu-toggle')) return;
      const workspace = modal.querySelector('.platform-workspace');
      if (window.matchMedia('(max-width: 800px)').matches) {
        workspace.classList.remove('menu-open');
      } else {
        workspace.classList.add('menu-collapsed');
      }
    };
    modal.onclick = event => {
      if (event.target === modal) {
        closeDashboard();
      }
    };

    return modal;

  }

  const PLATFORM_PAGE_COPY = {
    overview: ['Olá, Proprietário! 👋', 'Aqui está o resumo da sua plataforma.'],
    schools: ['Escolas', 'Cadastre e administre as escolas do Carômetro.'],
    applications: ['Novos clientes', 'Analise solicitações recebidas pela página de planos.'],
    subscriptions: ['Assinaturas', 'Acompanhe planos e condições comerciais.'],
    plans: ['Planos', 'Configure o catálogo comercial da plataforma.'],
    contacts: ['Responsáveis pela assinatura', 'Gerencie os contatos comerciais das escolas.'],
    audit: ['Auditoria', 'Consulte as operações administrativas recentes.'],
    settings: ['Configurações', 'Controle opções globais da plataforma.']
  };

  let cachedPlatformPlans = [];

  function closeDashboard() {
    document.getElementById('platformDashboardModal')?.classList.add('hidden');
    document.querySelector('.platform-workspace')?.classList.remove('menu-open');
    document.body.classList.remove('platform-workspace-open');
  }

  function showPlatformPage(page) {
    const modal = document.getElementById('platformDashboardModal');
    if (!modal || !PLATFORM_PAGE_COPY[page]) return;
    modal.querySelectorAll('[data-platform-section]').forEach(section => {
      section.classList.toggle('active', section.dataset.platformSection === page);
    });
    modal.querySelectorAll('[data-platform-page]').forEach(button => {
      button.classList.toggle('active', button.dataset.platformPage === page);
    });
    const [title, subtitle] = PLATFORM_PAGE_COPY[page];
    document.getElementById('platformPageTitle').textContent = title;
    document.getElementById('platformPageSubtitle').textContent = subtitle;
    const workspace = modal.querySelector('.platform-workspace');
    workspace?.classList.remove('menu-open');
    if (!window.matchMedia('(max-width: 800px)').matches) workspace?.classList.add('menu-collapsed');
    modal.querySelector('.platform-content')?.scrollTo({ top:0, behavior:'smooth' });
  }

  function currency(value) {
    if (value === null || value === undefined || value === '') return 'Sob consulta';
    return Number(value).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function limitLabel(value, singular, plural) {
    return value === null || value === undefined ? `${plural} ilimitados` : `Até ${Number(value).toLocaleString('pt-BR')} ${Number(value) === 1 ? singular : plural}`;
  }

  // O plano contratado/concessão administrativa/plano efetivo mostrados
  // aqui vêm todos prontos de platform_list_schools_with_counts_v3 —
  // este modal nunca recalcula precedência entre eles; só exibe o que o
  // backend já resolveu (mesmo princípio de describeSubscriptionVisibility:
  // nunca reimplementar no frontend uma regra que já existe no banco).
  function createPlanModal() {
    let modal = document.getElementById('platformPlanModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformPlanModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-plan-modal">
        <div class="modal-head"><h3>Gerenciar plano</h3><button class="close" type="button">×</button></div>
        <div class="form">
          <p id="platformPlanSchool" class="meta"></p>
          <div class="platform-plan-context">
            <p><span class="label">Plano contratado:</span> <span id="platformPlanContracted"></span></p>
            <p><span class="label">Concessão administrativa:</span> <span id="platformPlanOverrideCurrent"></span></p>
            <p><span class="label">Plano efetivo:</span> <span id="platformPlanEffective"></span></p>
          </div>
          <p class="meta">Conceder ou alterar a concessão administrativa desta escola. Isso é uma decisão administrativa e não representa uma contratação financeira.</p>
          <form id="platformPlanForm">
            <div class="field"><label for="platformPlanValue">Plano</label><select id="platformPlanValue" required></select></div>
            <div class="field"><label for="platformPlanReason">Motivo</label><input id="platformPlanReason" maxlength="500" placeholder="Ex.: cortesia, teste, parceria" required></div>
            <button id="platformPlanSubmit" class="btn primary full" type="submit">Salvar concessão</button>
          </form>
          <button id="platformPlanRemoveOverride" class="btn danger-outline full hidden" type="button">Remover concessão</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#platformPlanForm').onsubmit = savePlanOverride;
    modal.querySelector('#platformPlanRemoveOverride').onclick = removePlanOverride;
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    syncPlanSelectors(cachedPlatformPlans);
    return modal;
  }

  function openPlanModal(button) {
    const modal = createPlanModal();
    modal.dataset.schoolId = button.dataset.schoolId;
    modal.dataset.schoolName = button.dataset.schoolName;
    // dataset nunca tem null de verdade — atributos ausentes/vazios viram
    // string vazia, nunca a string "null". "|| null" abaixo devolve o
    // valor real ao conceito de "não configurado".
    const contractedPlan = button.dataset.contractedPlan || null;
    const overridePlan = button.dataset.overridePlan || null;
    const effectivePlan = button.dataset.plan || null;
    modal.dataset.contractedPlan = contractedPlan || '';

    document.getElementById('platformPlanSchool').textContent = button.dataset.schoolName;
    document.getElementById('platformPlanContracted').textContent = contractedPlan
      ? (PLAN_LABELS[contractedPlan] || contractedPlan)
      : 'Nenhum plano contratado';
    document.getElementById('platformPlanOverrideCurrent').textContent = overridePlan
      ? `${PLAN_LABELS[overridePlan] || overridePlan} — permanente`
      : 'Nenhuma concessão administrativa ativa';
    document.getElementById('platformPlanEffective').textContent = effectivePlan
      ? (PLAN_LABELS[effectivePlan] || effectivePlan)
      : 'Não configurado';

    document.getElementById('platformPlanValue').value = overridePlan || effectivePlan || 'free';
    document.getElementById('platformPlanReason').value = '';
    document.getElementById('platformPlanRemoveOverride').classList.toggle('hidden', !overridePlan);

    modal.classList.remove('hidden');
  }

  async function savePlanOverride(event) {
    event.preventDefault();
    const modal = document.getElementById('platformPlanModal');
    const button = document.getElementById('platformPlanSubmit');
    const plan = document.getElementById('platformPlanValue').value;
    const reason = document.getElementById('platformPlanReason').value.trim();
    if (!reason) { toast('Informe o motivo da concessão.'); return; }
    const schoolName = modal.dataset.schoolName || 'esta escola';
    if (!confirm(`Confirma conceder o plano ${PLAN_LABELS[plan] || plan} para ${schoolName}? Isso é uma concessão administrativa e não representa uma contratação financeira.`)) return;

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_plan_override', {
        p_school_id: modal.dataset.schoolId,
        p_override_plan: plan,
        p_override_expires_at: null,
        p_reason: reason
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Concessão administrativa salva.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  async function removePlanOverride() {
    const modal = document.getElementById('platformPlanModal');
    const schoolName = modal.dataset.schoolName || 'esta escola';
    const contractedPlan = modal.dataset.contractedPlan || null;
    const resultLabel = contractedPlan
      ? `o plano contratado (${PLAN_LABELS[contractedPlan] || contractedPlan})`
      : 'o plano Grátis';
    if (!confirm(`Remover a concessão administrativa de ${schoolName}? A escola passará a usar ${resultLabel}.`)) return;
    const reason = prompt('Informe o motivo da remoção:');
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) { toast('Informe o motivo da remoção.'); return; }

    const button = document.getElementById('platformPlanRemoveOverride');
    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_remove_plan_override', {
        p_school_id: modal.dataset.schoolId,
        p_reason: trimmedReason
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Concessão administrativa removida.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  // "Alterar preço e cobrança" é deliberadamente uma ação separada de
  // "Gerenciar plano": school_subscriptions.price/billing_type são a
  // condição comercial específica desta escola, nunca o preço público do
  // catálogo (platform_plans.price) nem parte da concessão administrativa
  // de plano — por isso usa exclusivamente platform_set_school_commercial_terms,
  // nunca uma RPC de plano.
  function createCommercialTermsModal() {
    let modal = document.getElementById('platformCommercialTermsModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformCommercialTermsModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-plan-modal">
        <div class="modal-head"><h3>Alterar preço e cobrança</h3><button class="close" type="button">×</button></div>
        <form id="platformCommercialTermsForm" class="form">
          <p id="platformCommercialTermsSchool" class="meta"></p>
          <p class="meta">Este é o valor específico contratado por esta escola — não é o preço público do catálogo de planos.</p>
          <div class="field"><label for="platformCommercialTermsPrice">Preço mensal desta escola</label><input id="platformCommercialTermsPrice" type="number" min="0" max="99999999.99" step="0.01" required></div>
          <div class="field"><label for="platformCommercialTermsBilling">Tipo de cobrança</label><select id="platformCommercialTermsBilling" required><option value="fixed_school">Valor fixo por escola</option><option value="per_student">Por aluno</option></select></div>
          <div class="field"><label for="platformCommercialTermsReason">Motivo</label><input id="platformCommercialTermsReason" maxlength="500" placeholder="Ex.: negociação, ajuste contratual" required></div>
          <button id="platformCommercialTermsSubmit" class="btn primary full" type="submit">Salvar condições comerciais</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#platformCommercialTermsForm').onsubmit = saveCommercialTerms;
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    return modal;
  }

  function openCommercialTermsModal(button) {
    const modal = createCommercialTermsModal();
    modal.dataset.schoolId = button.dataset.schoolId;
    modal.dataset.schoolName = button.dataset.schoolName;
    document.getElementById('platformCommercialTermsSchool').textContent = button.dataset.schoolName;
    document.getElementById('platformCommercialTermsPrice').value = button.dataset.price;
    document.getElementById('platformCommercialTermsBilling').value = button.dataset.billingType;
    document.getElementById('platformCommercialTermsReason').value = '';
    modal.classList.remove('hidden');
  }

  async function saveCommercialTerms(event) {
    event.preventDefault();
    const modal = document.getElementById('platformCommercialTermsModal');
    const button = document.getElementById('platformCommercialTermsSubmit');
    const price = Number(document.getElementById('platformCommercialTermsPrice').value);
    const billingType = document.getElementById('platformCommercialTermsBilling').value;
    const reason = document.getElementById('platformCommercialTermsReason').value.trim();
    if (!Number.isFinite(price) || price < 0) { toast('Informe um preço válido.'); return; }
    if (!reason) { toast('Informe o motivo da alteração comercial.'); return; }
    const schoolName = modal.dataset.schoolName || 'esta escola';
    if (!confirm(`Confirma alterar as condições comerciais de ${schoolName}?`)) return;

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_school_commercial_terms', {
        p_school_id: modal.dataset.schoolId,
        p_price: price,
        p_billing_type: billingType,
        p_reason: reason
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Condições comerciais atualizadas.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  // Reutiliza exatamente a coluna/RPC já existentes (platform_settings.
  // show_subscription / platform_set_subscription_visibility) — mesma
  // fonte de verdade do botão antigo em subscription-settings.js, nunca
  // uma configuração paralela.
  //
  // Três estados são possíveis na leitura, e cada um precisa de um
  // resultado visual diferente — em especial, um erro de consulta
  // (rede/RLS) NUNCA pode aparecer como "Ligado": isso mostraria ao
  // proprietário uma configuração que não foi realmente confirmada.
  //   - linha existe -> reflete o valor real (true/false).
  //   - linha inexistente -> assume visível, só para o proprietário
  //     revisar/corrigir no próprio Painel; a oferta pública em si
  //     (subscription-settings.js) não usa mais este padrão — lá, linha
  //     inexistente também esconde a oferta (fail-closed).
  //   - erro na consulta -> nunca marca como ligado; desabilita o
  //     controle e mostra mensagem de estado indisponível.
  function describeSubscriptionVisibility(result) {
    if (result.error) return { state:'error', message:result.error.message };
    if (!result.data) return { state:'missing' };
    return { state:'known', value:result.data.show_subscription === true };
  }

  function refreshShowSubscriptionToggle(status) {
    const checkbox = document.getElementById('platformShowSubscription');
    const errorNote = document.getElementById('platformShowSubscriptionError');
    if (!checkbox) return;
    if (status.state === 'error') {
      checkbox.checked = false;
      checkbox.indeterminate = true;
      checkbox.disabled = true;
      if (errorNote) {
        errorNote.textContent = 'Não foi possível confirmar esta configuração agora. Tente novamente.';
        errorNote.classList.remove('hidden');
      }
      return;
    }
    checkbox.indeterminate = false;
    checkbox.disabled = false;
    if (errorNote) errorNote.classList.add('hidden');
    checkbox.checked = status.state === 'missing' ? true : status.value;
  }

  async function toggleShowSubscription(event) {
    const checkbox = event.currentTarget;
    const show = checkbox.checked;
    checkbox.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_subscription_visibility', { p_show_subscription: show });
      if (error) { checkbox.checked = !show; toast(error.message); return; }
      toast(show ? 'Planos exibidos na tela de login.' : 'Planos ocultados da tela de login.');
    } finally {
      checkbox.disabled = false;
    }
  }

  function planCardHtml(plan, features) {
    const priceValue = plan.price === null || plan.price === undefined ? '' : plan.price;
    const enabledFeatures = (features || []).filter(item => item.plan_key === plan.plan_key && item.enabled);
    return `<form class="platform-plan-card" data-plan-key="${esc(plan.plan_key)}" data-highlighted="${plan.highlighted === true}">
      <div class="platform-plan-card-head"><b>${esc(plan.display_name)}</b><span class="platform-plan-price">${esc(currency(plan.price))}${plan.price === null || plan.contact_only ? '' : '<small style="font-size:11px;font-weight:600">/mês</small>'}</span><span class="meta">${esc(plan.plan_key)}</span></div>
      <div class="platform-plan-limits"><span>✓ ${esc(limitLabel(plan.max_students, 'aluno', 'alunos'))}</span><span>✓ ${esc(limitLabel(plan.max_staff, 'profissional', 'profissionais'))}</span><span>✓ ${esc(limitLabel(plan.max_classes, 'turma', 'turmas'))}</span>${enabledFeatures.map(item => `<span>✓ ${esc(item.platform_features?.label || item.feature_key)}</span>`).join('')}</div>
      <div class="field"><label>Nome</label><input data-field="display_name" value="${esc(plan.display_name)}" required></div>
      <div class="field"><label>Preço mensal</label><input data-field="price" type="number" min="0" step="0.01" value="${esc(priceValue)}" placeholder="Sob consulta"></div>
      <div class="field"><label>Descrição</label><input data-field="description" value="${esc(plan.description || '')}"></div>
      <div class="field"><label>Texto do botão</label><input data-field="cta_label" value="${esc(plan.cta_label)}" required></div>
      <div class="field"><label>Ordem</label><input data-field="display_order" type="number" min="1" step="1" value="${esc(plan.display_order)}" required></div>
      <label class="check"><input data-field="highlighted" type="checkbox" ${plan.highlighted ? 'checked' : ''}> Destacar como recomendado</label>
      <label class="check"><input data-field="contact_only" type="checkbox" ${plan.contact_only ? 'checked' : ''}> Somente contato / Sob consulta</label>
      <button class="btn primary" type="submit">Salvar alterações</button>
    </form>`;
  }

  function renderPlans(plans, error, features) {
    const target = document.getElementById('platformPlansList');
    if (!target) return;
    if (error) {
      target.innerHTML = '<div class="error">Não foi possível carregar os planos agora. Tente novamente.</div>';
      return;
    }
    target.innerHTML = (plans || []).map(plan => planCardHtml(plan, features)).join('') || '<div class="empty">Nenhum plano cadastrado.</div>';
    target.querySelectorAll('.platform-plan-card').forEach(form => {
      form.onsubmit = savePlanDetails;
    });
  }

  async function refreshPlansSection() {
    const [plansResult, featuresResult] = await Promise.all([
      db.from('platform_plans').select('*').order('display_order'),
      db.from('platform_plan_features').select('plan_key, feature_key, enabled, platform_features(label)')
    ]);
    if (plansResult.error) { toast(plansResult.error.message); return; }
    renderPlans(plansResult.data || [], null, featuresResult.error ? [] : (featuresResult.data || []));
    syncPlanSelectors(plansResult.data || []);
  }

  async function savePlanDetails(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const planKey = form.dataset.planKey;
    const field = name => form.querySelector(`[data-field="${name}"]`);
    const displayName = field('display_name').value.trim();
    const priceRaw = field('price').value.trim();
    const price = priceRaw === '' ? null : Number(priceRaw);
    const description = field('description').value.trim();
    const ctaLabel = field('cta_label').value.trim();
    const displayOrder = Number(field('display_order').value);
    const highlighted = field('highlighted').checked;
    const contactOnly = field('contact_only').checked;
    if (!displayName || !ctaLabel) { toast('Preencha o nome e o texto do botão.'); return; }
    if (price !== null && (!Number.isFinite(price) || price < 0)) { toast('Informe um preço válido, ou deixe em branco para "sob consulta".'); return; }
    if (!Number.isInteger(displayOrder) || displayOrder < 1) { toast('Informe uma ordem de apresentação válida.'); return; }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_plan_details', {
        p_plan_key: planKey,
        p_display_name: displayName,
        p_price: price,
        p_description: description || null,
        p_cta_label: ctaLabel,
        p_highlighted: highlighted,
        p_contact_only: contactOnly,
        p_display_order: displayOrder
      });
      if (error) { toast(error.message); return; }
      toast('Plano atualizado.');
      // Relê o banco (em vez de só atualizar este card): marcar este plano
      // como destaque pode ter removido o destaque de outro, então os
      // demais cards precisam refletir isso também.
      await refreshPlansSection();
    } finally {
      button.disabled = false;
    }
  }

  function createArchiveModal() {
    let modal = document.getElementById('platformArchiveModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformArchiveModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-archive-modal">
        <div class="modal-head"><h3>Excluir escola</h3><button class="close" type="button">×</button></div>
        <form id="platformArchiveForm" class="form">
          <p class="warning">Esta ação desativa e arquiva a escola. Alunos, turmas, ocorrências, fotos e todo o histórico são preservados — a escola só deixa de estar disponível para uso normal. Convites pendentes desta escola serão cancelados e a assinatura será suspensa. Nenhuma conta de usuário é excluída.</p>
          <p>Para confirmar, digite exatamente o nome da escola: <span class="school-name-confirm" id="platformArchiveSchoolName"></span></p>
          <div class="field"><label for="platformArchiveConfirmInput">Nome da escola</label><input id="platformArchiveConfirmInput" required autocomplete="off"></div>
          <button id="platformArchiveSubmit" class="btn danger full" type="submit" disabled>Excluir escola</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    modal.querySelector('#platformArchiveForm').onsubmit = submitArchiveSchool;
    modal.querySelector('#platformArchiveConfirmInput').oninput = event => {
      const expected = modal.dataset.schoolName || '';
      document.getElementById('platformArchiveSubmit').disabled = event.target.value !== expected;
    };
    return modal;
  }

  function openArchiveModal(button) {
    const modal = createArchiveModal();
    modal.dataset.schoolId = button.dataset.schoolId;
    modal.dataset.schoolName = button.dataset.schoolName;
    document.getElementById('platformArchiveSchoolName').textContent = button.dataset.schoolName;
    document.getElementById('platformArchiveConfirmInput').value = '';
    document.getElementById('platformArchiveSubmit').disabled = true;
    modal.classList.remove('hidden');
  }

  async function submitArchiveSchool(event) {
    event.preventDefault();
    const modal = document.getElementById('platformArchiveModal');
    const button = document.getElementById('platformArchiveSubmit');
    const confirmName = document.getElementById('platformArchiveConfirmInput').value;
    // Checagem client-side é só UX (mantém o botão desabilitado até bater o
    // nome). A checagem que realmente protege é a mesma comparação, feita
    // de novo dentro de platform_archive_school(), no banco, com
    // is_platform_owner() — nunca confiada só ao frontend.
    if (confirmName !== modal.dataset.schoolName) {
      toast('O nome digitado não corresponde ao nome exato da escola.');
      return;
    }
    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_archive_school', {
        p_school_id: modal.dataset.schoolId,
        p_confirm_name: confirmName
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Escola arquivada. Os dados foram preservados.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  function createBillingContactModal() {
    let modal = document.getElementById('platformBillingContactModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformBillingContactModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-billing-modal">
        <div class="modal-head"><h3>Responsável pela assinatura</h3><button class="close" type="button">×</button></div>
        <form id="platformBillingContactForm" class="form">
          <p id="platformBillingContactSchool" class="meta"></p>
          <div class="field"><label for="platformBillingContactName">Nome</label><input id="platformBillingContactName" maxlength="160" required></div>
          <div class="field"><label for="platformBillingContactEmail">E-mail</label><input id="platformBillingContactEmail" type="email" maxlength="320" required></div>
          <div class="field"><label for="platformBillingContactPhone">Telefone</label><input id="platformBillingContactPhone" maxlength="40"></div>
          <button id="platformBillingContactSubmit" class="btn primary full" type="submit">Salvar</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#platformBillingContactForm').onsubmit = saveBillingContact;
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    return modal;
  }

  function openBillingContactModal(button, contact) {
    const modal = createBillingContactModal();
    modal.dataset.schoolId = button.dataset.schoolId;
    document.getElementById('platformBillingContactSchool').textContent = button.dataset.schoolName;
    document.getElementById('platformBillingContactName').value = contact ? contact.out_full_name : '';
    document.getElementById('platformBillingContactEmail').value = contact ? contact.out_email : '';
    document.getElementById('platformBillingContactPhone').value = contact && contact.out_phone ? contact.out_phone : '';
    modal.classList.remove('hidden');
  }

  async function saveBillingContact(event) {
    event.preventDefault();
    const modal = document.getElementById('platformBillingContactModal');
    const button = document.getElementById('platformBillingContactSubmit');
    const fullName = document.getElementById('platformBillingContactName').value.trim();
    const email = document.getElementById('platformBillingContactEmail').value.trim();
    const phone = document.getElementById('platformBillingContactPhone').value.trim();
    if (!fullName || !email) { toast('Preencha nome e e-mail do responsável.'); return; }

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_billing_contact', {
        p_school_id: modal.dataset.schoolId,
        p_full_name: fullName,
        p_email: email,
        p_phone: phone || null
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Responsável pela assinatura salvo.');
      // Mesmo padrão já usado por todo o resto do Painel (ex.:
      // savePlanOverride, submitArchiveSchool): releitura via RPC e
      // re-render do conteúdo do modal já aberto — nunca um reload real
      // da página.
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  function createDeleteForeverModal() {
    let modal = document.getElementById('platformDeleteForeverModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformDeleteForeverModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-archive-modal">
        <div class="modal-head"><h3>Excluir permanentemente</h3><button class="close" type="button">×</button></div>
        <form id="platformDeleteForeverForm" class="form">
          <p class="warning" id="platformDeleteForeverWarning"></p>
          <p>Para confirmar, digite exatamente o nome da escola: <span class="school-name-confirm" id="platformDeleteForeverSchoolName"></span></p>
          <div class="field"><label for="platformDeleteForeverConfirmInput">Nome da escola</label><input id="platformDeleteForeverConfirmInput" required autocomplete="off"></div>
          <div class="field ack-field"><label><input type="checkbox" id="platformDeleteForeverAck"> Entendo que esta ação é irreversível e não pode ser desfeita.</label></div>
          <button id="platformDeleteForeverSubmit" class="btn danger full" type="submit" disabled>Excluir permanentemente</button>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    modal.querySelector('#platformDeleteForeverForm').onsubmit = submitDeleteForeverSchool;

    const updateEnabled = () => {
      const expected = modal.dataset.schoolName || '';
      const nameOk = document.getElementById('platformDeleteForeverConfirmInput').value === expected;
      const ackOk = document.getElementById('platformDeleteForeverAck').checked;
      document.getElementById('platformDeleteForeverSubmit').disabled = !(nameOk && ackOk);
    };
    modal.querySelector('#platformDeleteForeverConfirmInput').oninput = updateEnabled;
    modal.querySelector('#platformDeleteForeverAck').onchange = updateEnabled;

    return modal;
  }

  function openDeleteForeverModal(button) {
    const modal = createDeleteForeverModal();
    const jobStatus = button.dataset.jobStatus || 'none';
    modal.dataset.schoolId = button.dataset.schoolId;
    modal.dataset.schoolName = button.dataset.schoolName;
    document.getElementById('platformDeleteForeverSchoolName').textContent = button.dataset.schoolName;
    document.getElementById('platformDeleteForeverConfirmInput').value = '';
    document.getElementById('platformDeleteForeverAck').checked = false;
    document.getElementById('platformDeleteForeverSubmit').disabled = true;
    document.getElementById('platformDeleteForeverSubmit').textContent =
      jobStatus === 'none' ? 'Excluir permanentemente' : (jobStatus === 'failed' ? 'Tentar novamente' : 'Continuar exclusão');
    document.getElementById('platformDeleteForeverWarning').textContent = jobStatus === 'none'
      ? 'Esta ação remove permanentemente alunos, turmas, ocorrências, fotos e todo o histórico desta escola. Não pode ser desfeita. Nenhuma conta de usuário é excluída — apenas o vínculo com esta escola deixa de existir.'
      : 'Esta escola já tem uma exclusão permanente em andamento ou que falhou anteriormente. Continuar retoma exatamente de onde parou — o que já foi removido não volta, e não existe mais caminho de restauração para esta escola.';
    modal.classList.remove('hidden');
  }

  async function submitDeleteForeverSchool(event) {
    event.preventDefault();
    const modal = document.getElementById('platformDeleteForeverModal');
    const button = document.getElementById('platformDeleteForeverSubmit');
    const confirmName = document.getElementById('platformDeleteForeverConfirmInput').value;
    if (confirmName !== modal.dataset.schoolName || !document.getElementById('platformDeleteForeverAck').checked) {
      return;
    }
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Excluindo…';
    try {
      const { data, error } = await db.functions.invoke('platform-delete-school', {
        body: { schoolId: modal.dataset.schoolId, confirmName }
      });
      if (error) {
        let message = error.message || 'Não foi possível concluir a exclusão.';
        try {
          const payload = await error.context?.json();
          if (payload?.error) message = payload.error;
        } catch {}
        toast(message);
        return;
      }
      if (data?.error) { toast(data.error); return; }
      modal.classList.add('hidden');
      toast(data?.already_completed ? 'Esta exclusão já havia sido concluída anteriormente.' : 'Escola excluída permanentemente.');
      await openDashboard();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function restoreSchool(button) {
    const schoolId = button.dataset.schoolId;
    const schoolName = button.dataset.schoolName;
    if (!confirm(`Restaurar "${schoolName}"? A escola volta a existir com status Suspensa — será preciso reativar o acesso e, se necessário, a assinatura manualmente antes que volte a ser utilizável.`)) {
      return;
    }
    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_restore_school', { p_school_id: schoolId });
      if (error) { toast(error.message); return; }
      toast('Escola restaurada como Suspensa. Reative o acesso e a assinatura quando estiver pronto.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }

  async function invokeManageUser(body) {
    const { data, error } = await db.functions.invoke('manage-user', { body });
    if (error) {
      let message = error.message || 'Não foi possível concluir a operação.';
      try {
        const payload = await error.context?.json();
        if (payload?.error) message = payload.error;
      } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function renderAccount(user) {
    const target = document.getElementById('platformAccountResult');
    if (!target) return;
    target.classList.remove('hidden');
    target.dataset.userId = user.id;
    target.dataset.email = user.email;
    // A proteção real está inteiramente no backend (manage-user); isto é só
    // diagnóstico para a pessoa entender o bloqueio antes de tentar a ação.
    const blocked = Boolean(user.is_owner) || Boolean(user.blocked);
    const reasons = user.blocked_reasons || [];
    const warnings = reasons.map(reason => `<p class="error">${esc(reason)}</p>`).join('');
    const adminSchools = user.admin_schools || [];
    const pendingInvitations = user.pending_invitations || [];
    const memberships = user.school_memberships || [];
    const roleLabels = { school_admin:'Administrador(a)', coordinator:'Coordenador(a)', teacher:'Professor(a)' };
    const membershipStatusLabels = { active:'Ativo', suspended:'Suspenso', pending:'Pendente' };
    const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)) : 'Não informado';
    const membershipCards = memberships.length
      ? memberships.map(item => `<div class="platform-account-membership"><strong>${esc(item.school_name || item.school_id)}</strong><span>${esc(roleLabels[item.role] || item.role)} · ${esc(membershipStatusLabels[item.status] || item.status)}</span></div>`).join('')
      : '<p class="meta">Esta conta não possui vínculo escolar.</p>';
    const adminSchoolsLine = adminSchools.length
      ? `<p class="meta">Administra: ${adminSchools.map(s => esc(s.school_name || s.school_id)).join(', ')}</p>`
      : '';
    const pendingInvitationsLine = pendingInvitations.length
      ? `<p class="meta">Convites pendentes: ${pendingInvitations.map(i => `${esc(i.school_name || i.school_id)} (${esc(i.role)})`).join(', ')}</p>`
      : '';
    target.innerHTML = `
      <strong>${esc(user.full_name || 'Conta sem nome cadastrado')}</strong>
      <p class="meta">${esc(user.email)}</p>
      <div class="platform-account-facts">
        <div><span>Nome do usuário</span><strong>${esc(user.full_name || 'Não informado')}</strong></div>
        <div><span>Conta criada em</span><strong>${esc(formatDateTime(user.created_at))}</strong></div>
        <div><span>Situação da conta</span><strong>${esc(STATUS_LABELS[user.status] || user.status)}</strong></div>
        <div><span>E-mail</span><strong>${user.confirmed ? 'Confirmado' : 'Não confirmado'}</strong></div>
        <div><span>Último acesso</span><strong>${esc(formatDateTime(user.last_sign_in_at))}</strong></div>
      </div>
      <div class="platform-account-memberships"><b>Escolas e funções (${esc(user.memberships)})</b>${membershipCards}</div>
      ${adminSchoolsLine}
      ${pendingInvitationsLine}
      ${warnings}
      <div class="actions">
        <button class="btn secondary" type="button" data-account-action="cancel_login" ${blocked ? 'disabled' : ''}>Cancelar login</button>
        <button class="btn danger" type="button" data-account-action="permanent_delete" ${blocked ? 'disabled' : ''}>Excluir permanentemente</button>
      </div>`;
    target.querySelectorAll('[data-account-action]').forEach(button => {
      button.onclick = () => manageAccount(button);
    });
  }

  async function lookupAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const email = document.getElementById('platformAccountEmail').value.trim();
    const target = document.getElementById('platformAccountResult');
    if (!email || !target) return;
    button.disabled = true;
    target.classList.remove('hidden');
    target.innerHTML = '<span class="meta">Consultando conta…</span>';
    try {
      const data = await invokeManageUser({ action:'lookup_user', email });
      renderAccount(data.user);
    } catch (error) {
      target.innerHTML = `<span class="error">${esc(error.message)}</span>`;
    } finally {
      button.disabled = false;
    }
  }

  async function manageAccount(button) {
    const target = document.getElementById('platformAccountResult');
    if (!target) return;
    const userId = target.dataset.userId;
    const email = target.dataset.email;
    const action = button.dataset.accountAction;
    if (!userId || !email || !action) return;
    const permanent = action === 'permanent_delete';
    const message = permanent
      ? `Excluir permanentemente a conta ${email}? Esta ação remove o login e não pode ser desfeita.`
      : `Cancelar o login de ${email}? O acesso será removido e o e-mail ficará preservado no histórico.`;
    if (!confirm(message)) return;
    button.disabled = true;
    try {
      await invokeManageUser({ action, userId });
      toast(permanent ? 'Conta excluída permanentemente.' : 'Login cancelado e registrado no histórico.');
      document.getElementById('platformAccountEmail').value = '';
      target.classList.add('hidden');
      target.innerHTML = '';
      await openDashboard();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function auditStateSummary(entry) {
    const previous = entry.previous_state || {};
    const next = entry.new_state || {};
    if (entry.event_type === 'school_permanently_deleted') {
      return `${next.students_removed ?? 0} aluno(s), ${next.classes_removed ?? 0} turma(s) e ${next.storage_objects_removed ?? 0} arquivo(s) removidos`;
    }
    if (entry.event_type === 'plan_catalog_updated') {
      return `${next.display_name ?? next.plan_key ?? 'Plano'} (${next.plan_key ?? ''})`;
    }
    if (entry.event_type === 'billing_contact_changed') {
      const fields = Array.isArray(next.changed_fields) ? next.changed_fields.join(', ') : '';
      const action = previous.existed ? 'Atualizado' : 'Cadastrado';
      return fields ? `${action} (${fields})` : action;
    }
    if (entry.event_type === 'plan_override_set') {
      return `${PLAN_LABELS[next.plan] || next.plan || '—'} (permanente)`;
    }
    if (entry.event_type === 'plan_override_removed') {
      return `Volta para ${PLAN_LABELS[next.plan] || next.plan || '—'}`;
    }
    if (entry.event_type === 'subscription_commercial_terms_changed') {
      const billingLabel = value => value === 'per_student' ? 'Por aluno' : value === 'fixed_school' ? 'Valor fixo' : value;
      return `Preço: R$ ${previous.price ?? '—'} → R$ ${next.price ?? '—'} · ${billingLabel(next.billing_type)}`;
    }
    const key = Object.prototype.hasOwnProperty.call(next, 'status')
      ? 'status'
      : Object.prototype.hasOwnProperty.call(next, 'show_subscription')
        ? 'show_subscription'
        : Object.prototype.hasOwnProperty.call(next, 'plan') ? 'plan' : null;
    if (!key) return 'Registrado';
    const label = key === 'show_subscription' ? 'Exibir assinatura' : key === 'plan' ? 'Plano' : 'Status';
    const format = value => value === true ? 'Sim' : value === false ? 'Não' : (STATUS_LABELS[value] || PLAN_LABELS[value] || ({ cancelled:'Cancelado', deleted:'Excluído' })[value] || value || 'Não configurado');
    return `${label}: ${format(previous[key])} → ${format(next[key])}`;
  }

  function renderAudit(entries, error) {
    const body = document.getElementById('platformAuditBody');
    if (!body) return;
    if (error) {
      body.innerHTML = '<tr><td colspan="4" class="meta">Histórico indisponível até a trilha de auditoria ser aplicada no ambiente comercial.</td></tr>';
      return;
    }
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">Nenhuma atividade administrativa registrada.</td></tr>';
      return;
    }
    body.innerHTML = entries.map(entry => {
      const target = entry.school_name || entry.new_state?.school_name || entry.previous_state?.school_name || entry.target_email || 'Plataforma';
      const date = entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '';
      return `<tr><td>${esc(date)}</td><td>${esc(AUDIT_LABELS[entry.event_type] || entry.event_type)}</td><td>${esc(target)}</td><td>${esc(auditStateSummary(entry))}</td></tr>`;
    }).join('');
  }

  let pendingAdminInvite = null; // { invitationId, adminEmail } — só para permitir reenviar sem reprovisionar.

  function renderAdminInviteStatus(message) {
    const box = document.getElementById('platformAdminInvite');
    const status = document.getElementById('platformAdminInviteStatus');
    if (!box || !status) return;
    if (!pendingAdminInvite) { box.classList.add('hidden'); return; }
    status.textContent = message;
    box.classList.remove('hidden');
  }

  async function sendAdminInvite(invitationId, adminEmail) {
    try {
      const data = await invokeManageUser({ action:'invite_school_admin', invitationId });
      pendingAdminInvite = { invitationId, adminEmail };
      if (data.already_linked) {
        pendingAdminInvite = null;
        renderAdminInviteStatus('');
        toast(`${adminEmail} já está vinculado(a) a esta escola.`);
        return;
      }
      renderAdminInviteStatus(`Convite enviado para ${adminEmail}. Aguardando definição de senha e confirmação.`);
      toast('Escola criada. Convite de administrador enviado por e-mail.');
    } catch (error) {
      pendingAdminInvite = { invitationId, adminEmail };
      renderAdminInviteStatus(`Escola criada, mas o envio do convite falhou: ${error.message}`);
      toast(error.message);
    }
  }

  async function retryAdminInvite() {
    if (!pendingAdminInvite) return;
    const button = document.getElementById('platformAdminInviteRetry');
    button.disabled = true;
    try {
      await sendAdminInvite(pendingAdminInvite.invitationId, pendingAdminInvite.adminEmail);
    } finally {
      button.disabled = false;
    }
  }

  async function provisionSchool(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const schoolName = document.getElementById('platformSchoolName').value.trim();
    const adminEmail = document.getElementById('platformSchoolAdminEmail').value.trim();
    const plan = document.getElementById('platformSchoolPlan').value;
    const price = Number(document.getElementById('platformSchoolPrice').value);
    if (!schoolName || !adminEmail || !Number.isFinite(price) || price < 0) return;
    if (!confirm(`Criar a escola “${schoolName}” e tornar ${adminEmail} seu administrador?`)) return;
    button.disabled = true;
    button.textContent = 'Criando…';
    try {
      const { data, error } = await db.rpc('platform_provision_school', {
        p_school_name:schoolName,
        p_admin_email:adminEmail,
        p_plan:plan,
        p_price:price
      });
      if (error) { toast(error.message); return; }
      form.reset();
      document.getElementById('platformSchoolPrice').value = '0';
      pendingAdminInvite = null;
      renderAdminInviteStatus('');
      if (data?.admin_state === 'invited' && data.invitation_id) {
        await sendAdminInvite(data.invitation_id, data.admin_email);
      } else {
        toast('Escola criada e vinculada ao administrador informado.');
      }
      await openDashboard();
    } finally {
      button.disabled = false;
      button.textContent = 'Criar escola';
    }
  }


  function syncPlanSelectors(plans) {
    cachedPlatformPlans = plans || [];
    const options = cachedPlatformPlans.map(plan => `<option value="${esc(plan.plan_key)}">${esc(plan.display_name)}</option>`).join('');
    const schoolSelect = document.getElementById('platformSchoolPlan');
    if (schoolSelect) {
      const current = schoolSelect.value;
      schoolSelect.innerHTML = options;
      if ([...schoolSelect.options].some(option => option.value === current)) schoolSelect.value = current;
      schoolSelect.onchange = () => {
      const selected = cachedPlatformPlans.find(plan => plan.plan_key === schoolSelect.value);
      const price = document.getElementById('platformSchoolPrice');
      if (price && selected?.price !== null && selected?.price !== undefined) price.value = selected.price;
      };
    }
    const overrideSelect = document.getElementById('platformPlanValue');
    if (overrideSelect) {
      const current = overrideSelect.value;
      overrideSelect.innerHTML = options;
      if ([...overrideSelect.options].some(option => option.value === current)) overrideSelect.value = current;
    }
  }

  function renderApplications(applications, paymentSubscriptions, error) {
    const target = document.getElementById('platformApplicationsList');
    if (!target) return;
    if (error) {
      target.innerHTML = '<div class="empty">O funil de novos clientes será exibido depois que a migration 060 for aplicada.</div>';
      return;
    }
    const statusLabels = { pending:'Aguardando análise', approved:'Aprovada', rejected:'Recusada', cancelled:'Cancelada', expired:'Expirada' };
    target.innerHTML = (applications || []).map(item => {
      const plan = cachedPlatformPlans.find(entry => entry.plan_key === item.plan_key);
      const payment = (paymentSubscriptions || []).find(entry => entry.application_id === item.id);
      const paymentNote = payment ? `<p><b>Mercado Pago:</b> ${esc(payment.last_payment_status || payment.provider_status || payment.status)} · ${esc(currency(payment.amount))}/mês</p>` : '';
      const actions = item.status === 'pending' && !payment
        ? `<div class="platform-application-actions"><button class="btn primary" type="button" data-approve-application="${esc(item.id)}">Aprovar e enviar convite</button><button class="btn secondary" type="button" data-reject-application="${esc(item.id)}">Recusar</button></div>`
        : item.status === 'pending' && payment
          ? `<p class="meta">A ativação será automática somente após o pagamento aprovado pelo Mercado Pago.</p><div class="platform-application-actions"><button class="btn secondary" type="button" data-cancel-paid-application="${esc(item.id)}">Cancelar solicitação</button></div>`
          : item.status === 'expired' && payment
            ? `<div class="platform-application-actions"><button class="btn secondary" type="button" data-cancel-paid-application="${esc(item.id)}">Encerrar no Mercado Pago</button></div>`
          : '';
      return `<article class="platform-application-card">
        <h4>${esc(item.school_name)} <span class="platform-badge ${esc(item.status)}">${esc(statusLabels[item.status] || item.status)}</span></h4>
        <p><b>Plano:</b> ${esc(plan?.display_name || item.plan_key)} · <b>Alunos estimados:</b> ${esc(item.estimated_students ?? 'Não informado')}</p>
        <p><b>Responsável:</b> ${esc(item.responsible_name)} · ${esc(item.email)} · ${esc(item.phone)}</p>
        <p><b>Localidade:</b> ${esc(item.city)}/${esc(item.state)} · <b>Recebida em:</b> ${esc(new Date(item.created_at).toLocaleString('pt-BR'))}</p>
        ${paymentNote}
        ${actions}
      </article>`;
    }).join('') || '<div class="empty">Nenhuma solicitação recebida.</div>';

    target.querySelectorAll('[data-approve-application]').forEach(button => {
      button.onclick = async () => {
        const application = applications.find(item => item.id === button.dataset.approveApplication);
        if (!application || !confirm(`Aprovar ${application.school_name}, criar a escola e enviar o convite para ${application.email}?`)) return;
        button.disabled = true;
        button.textContent = 'Aprovando…';
        try {
          const { data, error: approveError } = await db.rpc('platform_approve_school_application', { p_application_id:application.id });
          if (approveError) throw approveError;
          if (data?.admin_state === 'invited' && data.invitation_id) {
            await sendAdminInvite(data.invitation_id, data.admin_email);
          } else {
            toast('Solicitação aprovada e escola vinculada ao administrador.');
          }
          await openDashboard();
          showPlatformPage('applications');
        } catch (approveError) {
          toast(approveError.message || 'Não foi possível aprovar a solicitação.');
        } finally {
          button.disabled = false;
          button.textContent = 'Aprovar e enviar convite';
        }
      };
    });
    target.querySelectorAll('[data-reject-application]').forEach(button => {
      button.onclick = async () => {
        const application = applications.find(item => item.id === button.dataset.rejectApplication);
        if (!application || !confirm(`Recusar a solicitação de ${application.school_name}?`)) return;
        button.disabled = true;
        const { error: rejectError } = await db.rpc('platform_decide_school_application', { p_application_id:application.id, p_status:'rejected', p_school_id:null });
        if (rejectError) toast(rejectError.message); else { toast('Solicitação recusada.'); await openDashboard(); showPlatformPage('applications'); }
        button.disabled = false;
      };
    });
    target.querySelectorAll('[data-cancel-paid-application]').forEach(button => {
      button.onclick = async () => {
        const application = applications.find(item => item.id === button.dataset.cancelPaidApplication);
        if (!application || !confirm(`Cancelar a solicitação de ${application.school_name}?`)) return;
        button.disabled = true;
        button.textContent = 'Cancelando…';
        const { data:cancelResult, error:cancelError } = await db.functions.invoke('cancel-mercado-pago-subscription', { body:{ applicationId:application.id } });
        if (cancelError || cancelResult?.error) toast(cancelResult?.error || cancelError.message); else {
          toast('Solicitação cancelada. O e-mail foi liberado para uma nova tentativa.');
          await openDashboard();
          showPlatformPage('applications');
        }
        button.disabled = false;
        button.textContent = 'Cancelar solicitação';
      };
    });
  }

  function renderOverview(schools, billingContacts, plans) {
    const active = (schools || []).filter(school => school.school_status !== 'archived');
    const preview = document.getElementById('platformOverviewSchools');
    if (preview) {
      preview.innerHTML = active.slice(0, 4).map(school => `<article class="platform-subscription-card"><h4>${esc(school.school_name)}</h4><p>${adminLine(school)}</p><p><span class="platform-badge ${esc(school.plan || 'free')}">${esc((plans.find(plan => plan.plan_key === school.plan)?.display_name) || PLAN_LABELS[school.plan] || school.plan)}</span> <span class="platform-badge ${esc(school.school_status || 'active')}">${esc(STATUS_LABELS[school.school_status] || school.school_status)}</span></p><p>${esc(school.student_count || 0)} aluno(s) · ${esc(school.user_count || 0)} membro(s)</p></article>`).join('') || '<div class="empty">Nenhuma escola cadastrada.</div>';
    }
    const distribution = document.getElementById('platformPlanDistribution');
    if (distribution) {
      distribution.innerHTML = (plans || []).map(plan => {
        const count = active.filter(school => school.plan === plan.plan_key).length;
        const percentage = active.length ? Math.round((count / active.length) * 100) : 0;
        return `<div class="platform-plan-row"><b>${esc(plan.display_name)}</b><span class="platform-plan-bar"><i style="width:${percentage}%"></i></span><strong>${count}</strong></div>`;
      }).join('');
    }
  }

  function renderSubscriptions(schools, plans) {
    const target = document.getElementById('platformSubscriptionsList');
    if (!target) return;
    target.innerHTML = (schools || []).filter(school => school.school_status !== 'archived').map(school => {
      const plan = plans.find(item => item.plan_key === school.plan);
      const override = school.override_plan ? `<p>Concessão: <b>${esc(plans.find(item => item.plan_key === school.override_plan)?.display_name || school.override_plan)}</b>${school.override_expires_at ? ` até ${esc(new Date(school.override_expires_at).toLocaleDateString('pt-BR'))}` : ' · permanente'}</p>` : '<p>Sem concessão administrativa</p>';
      return `<article class="platform-subscription-card"><h4>${esc(school.school_name)}</h4><p>Plano efetivo: <b>${esc(plan?.display_name || school.plan || 'Não configurado')}</b></p><p>Plano contratado: ${esc(plans.find(item => item.plan_key === school.contracted_plan)?.display_name || school.contracted_plan || 'Não configurado')}</p>${override}<p>Condição: <b>${esc(currency(school.price))}</b> · ${esc(school.billing_type || 'Não configurada')}</p><span class="platform-badge ${esc(school.subscription_status || 'missing')}">${esc(STATUS_LABELS[school.subscription_status] || school.subscription_status)}</span></article>`;
    }).join('') || '<div class="empty">Nenhuma assinatura cadastrada.</div>';
  }

  function renderPaymentSubscriptions(payments, applications, error) {
    const target = document.getElementById('platformPaymentSubscriptionsList');
    if (!target) return;
    if (error) {
      target.innerHTML = '<div class="empty">A integração do Mercado Pago será exibida depois que a migration 061 for aplicada.</div>';
      return;
    }
    const statusLabels = { creating:'Criando', pending:'Aguardando pagamento', authorized:'Autorizada', paused:'Pausada', cancelled:'Cancelada', expired:'Expirada', failed:'Falhou' };
    target.innerHTML = (payments || []).map(payment => {
      const application = (applications || []).find(item => item.id === payment.application_id);
      const plan = cachedPlatformPlans.find(item => item.plan_key === payment.plan_key);
      return `<article class="platform-subscription-card"><h4>${esc(application?.school_name || payment.payer_email)}</h4><p>Plano: <b>${esc(plan?.display_name || payment.plan_key)}</b></p><p>Valor: <b>${esc(currency(payment.amount))}/mês</b></p><p>Responsável: ${esc(payment.payer_email)}</p><p>Último pagamento: ${esc(payment.last_payment_status || 'Ainda não confirmado')}</p><span class="platform-badge ${esc(payment.status)}">${esc(statusLabels[payment.status] || payment.status)}</span></article>`;
    }).join('') || '<div class="empty">Nenhuma assinatura iniciada pelo Mercado Pago.</div>';
  }

  function renderBillingContacts(schools, contactsBySchoolId) {
    const target = document.getElementById('platformBillingContactsList');
    if (!target) return;
    target.innerHTML = (schools || []).filter(school => school.school_status !== 'archived').map(school => {
      const contact = contactsBySchoolId[school.school_id];
      return `<article class="platform-contact-card"><h4>${esc(school.school_name)}</h4>${contact ? `<p><b>${esc(contact.out_full_name)}</b></p><p>${esc(contact.out_email)}</p><p>${esc(contact.out_phone || 'Telefone não informado')}</p><p>${contact.out_has_linked_user ? 'Conta vinculada' : 'Sem conta vinculada'}</p>` : '<p>Responsável comercial ainda não definido.</p>'}<button class="btn secondary" type="button" data-contact-school="${esc(school.school_id)}">${contact ? 'Editar responsável' : 'Definir responsável'}</button></article>`;
    }).join('') || '<div class="empty">Nenhuma escola cadastrada.</div>';
    target.querySelectorAll('[data-contact-school]').forEach(button => {
      const school = schools.find(item => item.school_id === button.dataset.contactSchool);
      button.onclick = () => openBillingContactModal({ dataset:{ schoolId:school.school_id, schoolName:school.school_name } }, contactsBySchoolId[school.school_id] || null);
    });
  }

  function renderStats(summary, schools, contactsBySchoolId) {

    const target = document.getElementById('platformStats');

    if (!target) {
      return;
    }

    const currentSchools = (schools || []).filter(school => school.school_status !== 'archived');
    const totalUsers = currentSchools.reduce((total, school) => total + Number(school.user_count || 0), 0);
    const totalStudents = currentSchools.reduce((total, school) => total + Number(school.student_count || 0), 0);
    const activeSubscriptions = currentSchools.filter(school => school.subscription_status === 'active').length;
    const cards = [
      ['Escolas ativas', summary?.active_schools ?? 0, `de ${summary?.total_schools ?? 0} no total`, '▦'],
      ['Usuários no total', totalUsers, 'Membros das escolas', '♥'],
      ['Alunos no total', totalStudents, 'Em todas as escolas', '◆'],
      ['Assinaturas ativas', activeSubscriptions, `${Object.keys(contactsBySchoolId || {}).length} responsável(is) definido(s)`, '$']
    ];

    target.innerHTML = cards
      .map(([label, value, detail, icon]) => `<div class="platform-stat"><div class="platform-stat-top"><span>${esc(label)}</span><i class="platform-stat-icon">${esc(icon)}</i></div><strong>${esc(Number(value).toLocaleString('pt-BR'))}</strong><small>${esc(detail)}</small></div>`)
      .join('');

  }


  function adminLine(school) {
    const state = school.admin_state || 'none';
    if (state === 'active') return `<span class="platform-school-admin"><span class="label">Administrador:</span> ${esc(school.admin_email)}</span>`;
    if (state === 'pending') return `<span class="platform-school-admin pending"><span class="label">Administrador:</span> ${esc(school.admin_email)} · convite pendente</span>`;
    return `<span class="platform-school-admin none">Sem administrador</span>`;
  }

  // Deliberadamente com rótulo próprio e cor distinta de adminLine(): o
  // responsável pela assinatura é comercial/financeiro, independente do
  // school_admin, e precisa ser visualmente impossível de confundir com
  // ele mesmo quando são pessoas diferentes na mesma linha da tabela.
  function billingContactLine(contact) {
    if (!contact) {
      return `<span class="platform-billing-contact none">Responsável pela assinatura: Não definido</span>`;
    }
    const phone = contact.out_phone ? ` · ${esc(contact.out_phone)}` : '';
    return `<span class="platform-billing-contact"><span class="label">Responsável pela assinatura:</span> ${esc(contact.out_full_name)} · ${esc(contact.out_email)}${phone}</span>`;
  }

  function renderSchools(schools, jobsBySchoolId, billingContactsBySchoolId) {

    const jobs = jobsBySchoolId || {};
    const billingContacts = billingContactsBySchoolId || {};
    const body = document.getElementById('platformSchoolsBody');
    const archivedSection = document.getElementById('platformArchivedSection');
    const archivedList = document.getElementById('platformArchivedList');

    if (!body) {
      return;
    }

    // Escola arquivada nunca aparece na tabela principal como se fosse
    // ativa — fica numa lista própria, discreta, logo abaixo (menor
    // impacto: mesma consulta/RPC, só separação no render).
    const activeSchools = schools.filter(school => school.school_status !== 'archived');
    const archivedSchools = schools.filter(school => school.school_status === 'archived');

    if (!activeSchools.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma escola cadastrada.</td></tr>';
    } else {
      const rows = activeSchools.map(school => {
        const plan = school.plan || 'free';
        const status = school.school_status || 'active';
        const subscriptionStatus = school.subscription_status || 'missing';
        const nextStatus = status === 'active' ? 'suspended' : 'active';
        const actionLabel = nextStatus === 'suspended' ? 'Suspender' : 'Reativar';
        const nextSubscriptionStatus = subscriptionStatus === 'active' ? 'suspended' : 'active';
        const subscriptionActionLabel = nextSubscriptionStatus === 'suspended' ? 'Suspender assinatura' : 'Reativar assinatura';
        const subscriptionButton = subscriptionStatus === 'missing'
          ? ''
          : `<button class="btn secondary" type="button" data-subscription-status="${esc(nextSubscriptionStatus)}" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${subscriptionActionLabel}</button>`;
        // dataset só aceita string: valores ausentes (contracted_plan/
        // override_plan/override_expires_at nulos) viram '' aqui, nunca a
        // string "null" — quem lê de volta (openPlanModal) trata ''
        // como "não configurado" via "|| null".
        const planButton = subscriptionStatus === 'missing'
          ? ''
          : `<button class="btn secondary" type="button" data-manage-plan data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}" data-plan="${esc(plan)}" data-contracted-plan="${esc(school.contracted_plan || '')}" data-override-plan="${esc(school.override_plan || '')}" data-override-expires-at="${esc(school.override_expires_at || '')}">Gerenciar plano</button>`;
        const commercialTermsButton = subscriptionStatus === 'missing'
          ? ''
          : `<button class="btn secondary" type="button" data-commercial-terms data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}" data-price="${esc(school.price ?? 0)}" data-billing-type="${esc(school.billing_type || 'fixed_school')}">Alterar preço e cobrança</button>`;
        const billingContact = billingContacts[school.school_id] || null;
        const billingContactButton = `<button class="btn secondary" type="button" data-billing-contact data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${billingContact ? 'Editar responsável' : 'Definir responsável'}</button>`;

        return `<tr>
          <td data-label="Escola"><b>${esc(school.school_name)}</b>${adminLine(school)}${billingContactLine(billingContact)}</td>
          <td data-label="Plano"><span class="platform-badge ${esc(plan)}">${esc(PLAN_LABELS[plan] || plan)}</span></td>
          <td data-label="Status"><span class="platform-badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span></td>
          <td data-label="Assinatura"><span class="platform-badge ${esc(subscriptionStatus)}">${esc(STATUS_LABELS[subscriptionStatus] || subscriptionStatus)}</span></td>
          <td data-label="Usuários">${esc(school.user_count ?? 0)}</td>
          <td data-label="Alunos">${esc(school.student_count ?? 0)}</td>
          <td data-label="Ações" class="platform-school-actions">${planButton} ${commercialTermsButton} <button class="btn secondary" type="button" data-school-status="${esc(nextStatus)}" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${actionLabel} escola</button> ${subscriptionButton} ${billingContactButton} <button class="btn danger" type="button" data-archive-school data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">Excluir escola</button></td>
        </tr>`;
      });

      body.innerHTML = rows.join('');

      body.querySelectorAll('[data-school-status]').forEach(button => {
        button.onclick = () => setSchoolStatus(button);
      });
      body.querySelectorAll('[data-subscription-status]').forEach(button => {
        button.onclick = () => setSubscriptionStatus(button);
      });
      body.querySelectorAll('[data-billing-contact]').forEach(button => {
        button.onclick = () => openBillingContactModal(button, billingContacts[button.dataset.schoolId] || null);
      });
      body.querySelectorAll('[data-manage-plan]').forEach(button => {
        button.onclick = () => openPlanModal(button);
      });
      body.querySelectorAll('[data-commercial-terms]').forEach(button => {
        button.onclick = () => openCommercialTermsModal(button);
      });
      body.querySelectorAll('[data-archive-school]').forEach(button => {
        button.onclick = () => openArchiveModal(button);
      });
    }

    if (archivedSection && archivedList) {
      if (!archivedSchools.length) {
        archivedSection.classList.add('hidden');
        archivedList.innerHTML = '';
      } else {
        archivedSection.classList.remove('hidden');
        archivedList.innerHTML = archivedSchools.map(school => {
          const archivedDate = school.archived_at ? new Date(school.archived_at).toLocaleDateString('pt-BR') : '';
          const job = jobs[school.school_id];
          // Se existe qualquer job (pending/deleting_storage/deleting_database/failed),
          // Restaurar nunca é oferecido — uma escola parcialmente purgada nunca é
          // apresentada como restaurável. Só resta continuar/tentar novamente a exclusão.
          const actions = !job
            ? `<button class="btn secondary" type="button" data-restore-school data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">Restaurar escola</button>
               <button class="btn danger" type="button" data-delete-forever data-job-status="none" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">Excluir permanentemente</button>`
            : `<button class="btn danger" type="button" data-delete-forever data-job-status="${esc(job.status)}" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${job.status === 'failed' ? 'Tentar novamente' : 'Continuar exclusão'}</button>`;
          const jobNote = job
            ? `<p class="platform-job-note">${job.status === 'failed' ? `Falha na exclusão anterior: ${esc(job.error_message || '')}` : `Exclusão permanente em andamento (${esc(DELETION_JOB_STATUS_LABELS[job.status] || job.status)})`}</p>`
            : '';
          return `<div class="platform-archived-item">
            <div><b>${esc(school.school_name)}</b>${adminLine(school)}
              <div class="meta">${archivedDate ? `Arquivada em ${esc(archivedDate)} · ` : ''}${esc(school.user_count ?? 0)} usuário(s) · ${esc(school.student_count ?? 0)} aluno(s)</div>
              ${jobNote}
            </div>
            <div class="platform-school-actions">${actions}</div>
          </div>`;
        }).join('');

        archivedList.querySelectorAll('[data-restore-school]').forEach(button => {
          button.onclick = () => restoreSchool(button);
        });
        archivedList.querySelectorAll('[data-delete-forever]').forEach(button => {
          button.onclick = () => openDeleteForeverModal(button);
        });
      }
    }

  }


  async function setSubscriptionStatus(button) {
    const schoolId = button.dataset.schoolId;
    const schoolName = button.dataset.schoolName;
    const status = button.dataset.subscriptionStatus;
    const action = status === 'suspended' ? 'suspender' : 'reativar';
    if (!confirm(`Deseja ${action} a assinatura de “${schoolName}”? Nenhum dado será excluído.`)) return;

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_subscription_status', {
        p_school_id:schoolId,
        p_status:status
      });
      if (error) { toast(error.message); return; }
      toast(status === 'suspended' ? 'Assinatura suspensa. Os dados foram preservados.' : 'Assinatura reativada.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }


  async function setSchoolStatus(button) {
    const schoolId = button.dataset.schoolId;
    const schoolName = button.dataset.schoolName;
    const status = button.dataset.schoolStatus;
    const action = status === 'suspended' ? 'suspender' : 'reativar';
    if (!confirm(`Deseja ${action} o acesso da escola “${schoolName}”? Nenhum dado será excluído.`)) return;

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_school_status', {
        p_school_id:schoolId,
        p_status:status
      });
      if (error) { toast(error.message); return; }
      toast(status === 'suspended' ? 'Escola suspensa. Os dados foram preservados.' : 'Escola reativada.');
      await openDashboard();
    } finally {
      button.disabled = false;
    }
  }


  async function openDashboard() {

    const modal = createDashboardModal();
    modal.classList.remove('hidden');
    document.body.classList.add('platform-workspace-open');
    document.getElementById('platformCurrentDate').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle:'long' }).format(new Date());

    const statsTarget = document.getElementById('platformStats');
    const bodyTarget = document.getElementById('platformSchoolsBody');
    const auditTarget = document.getElementById('platformAuditBody');

    if (statsTarget) {
      statsTarget.innerHTML = '<div class="meta">Carregando resumo...</div>';
    }

    if (bodyTarget) {
      bodyTarget.innerHTML = '<tr><td colspan="7" class="meta">Carregando escolas...</td></tr>';
    }

    if (auditTarget) {
      auditTarget.innerHTML = '<tr><td colspan="4" class="meta">Carregando atividade...</td></tr>';
    }

    const [summaryResult, schoolsResult, auditResult, jobsResult, plansResult, settingsResult, billingContactsResult, featuresResult, applicationsResult, paymentSubscriptionsResult] = await Promise.all([
      db.rpc('platform_dashboard_summary'),
      db.rpc('platform_list_schools_with_counts_v3'),
      db.rpc('platform_list_audit', { p_limit:50 }),
      db.from('platform_school_deletion_jobs').select('school_id, status, error_message, updated_at'),
      db.from('platform_plans').select('*').order('display_order'),
      db.from('platform_settings').select('show_subscription').eq('id', true).maybeSingle(),
      db.rpc('platform_list_billing_contacts'),
      db.from('platform_plan_features').select('plan_key, feature_key, enabled, platform_features(label)'),
      db.rpc('platform_list_school_applications'),
      db.rpc('platform_list_payment_subscriptions')
    ]);

    if (summaryResult.error || schoolsResult.error) {
      if (statsTarget) {
        statsTarget.innerHTML = '';
      }
      if (bodyTarget) {
        bodyTarget.innerHTML = '<tr><td colspan="7" class="error">Não foi possível carregar os dados da plataforma.</td></tr>';
      }
      return;
    }

    const expiredPaidApplications = (applicationsResult.data || []).filter(application =>
      application.status === 'expired' && (paymentSubscriptionsResult.data || []).some(payment =>
        payment.application_id === application.id && payment.status === 'expired'
      )
    );
    if (expiredPaidApplications.length) {
      const cancellations = await Promise.all(expiredPaidApplications.map(application =>
        db.functions.invoke('cancel-mercado-pago-subscription', { body:{ applicationId:application.id } })
      ));
      if (cancellations.some(result => !result.error && !result.data?.error)) return openDashboard();
    }

    const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
    const jobsBySchoolId = {};
    if (!jobsResult.error) {
      (jobsResult.data || []).forEach(job => { jobsBySchoolId[job.school_id] = job; });
    }
    const billingContactsBySchoolId = {};
    if (billingContactsResult.error) {
      toast(billingContactsResult.error.message);
    } else {
      (billingContactsResult.data || []).forEach(contact => { billingContactsBySchoolId[contact.out_school_id] = contact; });
    }

    renderStats(summary, schoolsResult.data || [], billingContactsBySchoolId);
    renderSchools(schoolsResult.data || [], jobsBySchoolId, billingContactsBySchoolId);
    renderAudit(auditResult.data || [], auditResult.error);
    renderPlans(plansResult.data || [], plansResult.error, featuresResult.error ? [] : (featuresResult.data || []));
    syncPlanSelectors(plansResult.data || []);
    renderApplications(applicationsResult.data || [], paymentSubscriptionsResult.data || [], applicationsResult.error);
    renderOverview(schoolsResult.data || [], billingContactsBySchoolId, plansResult.data || []);
    renderSubscriptions(schoolsResult.data || [], plansResult.data || []);
    renderPaymentSubscriptions(paymentSubscriptionsResult.data || [], applicationsResult.data || [], paymentSubscriptionsResult.error);
    renderBillingContacts(schoolsResult.data || [], billingContactsBySchoolId);
    refreshShowSubscriptionToggle(describeSubscriptionVisibility(settingsResult));

  }


  function createPlatformNavigation() {

    const nav = document.querySelector('.nav');

    if (!nav) {
      return;
    }

    if (document.getElementById('platformNav')) {
      return;
    }

    const button = document.createElement('button');

    button.id = 'platformNav';
    button.innerHTML = '&#9678; &nbsp; Plataforma';
    button.className = 'hidden';

    nav.insertBefore(
      button,
      nav.firstChild
    );

    button.onclick = () => {
      openDashboard();
    };

  }


  async function checkPlatformOwner() {

    const button =
      document.getElementById('platformNav');

    if (!button) {
      return;
    }


    const {
      data: { user }
    } = await db.auth.getUser();


    if (!user) {
      button.classList.add('hidden');
      return;
    }


    const { data:owner, error } = await db.rpc('is_platform_owner');

    if (error) {
      button.classList.add('hidden');
      return;
    }


    button.classList.toggle(
      'hidden',
      !owner
    );

  }


  function start() {

    injectStyle();
    createPlatformNavigation();

    checkPlatformOwner();
    document.addEventListener('carometro:data-loaded', checkPlatformOwner);

  }


  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      start
    );

  } else {

    start();

  }


})();
