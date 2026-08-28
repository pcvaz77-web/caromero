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
    expired: 'Expirada',
    missing: 'Não configurada'
  };

  const AUDIT_LABELS = {
    school_provisioned: 'Escola criada',
    school_status_changed: 'Status da escola alterado',
    subscription_status_changed: 'Status da assinatura alterado',
    account_access_changed: 'Acesso da conta alterado',
    subscription_visibility_changed: 'Visibilidade da assinatura alterada',
    account_login_cancelled: 'Login cancelado',
    account_permanently_deleted: 'Conta excluída permanentemente'
  };

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function injectStyle() {

    if (document.getElementById('platformDashboardStyle')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'platformDashboardStyle';
    style.textContent = `
      .platform-modal { width:min(1180px,100%); }
      .platform-modal .form { padding:23px 24px; }
      .platform-stats { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:24px; }
      .platform-stats .stat strong { font-size:24px; }
      .platform-table-wrap { width:100%; overflow-x:auto; padding:8px 22px 20px; }
      .platform-table { width:100%; border-collapse:collapse; }
      .platform-schools-table { min-width:850px; }
      .platform-audit-table { min-width:680px; }
      .platform-table th, .platform-table td { text-align:left; padding:11px 10px; border-bottom:1px solid var(--line); font-size:14px; }
      .platform-table th { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
      .platform-badge { font-size:12px; font-weight:750; border-radius:99px; padding:4px 9px; display:inline-flex; }
      .platform-badge.active { background:#eaf8f1; color:#08784b; }
      .platform-badge.suspended, .platform-badge.expired, .platform-badge.missing { background:#fee4e2; color:#b42318; }
      .platform-badge.free { background:#f1f4f8; color:#40516f; }
      .platform-badge.basic, .platform-badge.professional, .platform-badge.enterprise { background:#eaf1ff; color:#315dbb; }
      .platform-head-actions { display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .platform-school-actions { white-space:nowrap; }
      .platform-school-actions .btn { min-height:34px; padding:7px 10px; }
      .platform-school-form { display:grid; grid-template-columns:1.4fr 1.4fr .8fr .7fr auto; gap:10px; align-items:end; margin-bottom:22px; padding:16px; border:1px solid var(--line); border-radius:11px; background:#f8faff; }
      .platform-school-form .field { margin:0; }
      .platform-account-form { display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:10px; align-items:end; padding:16px; }
      .platform-account-form .field { margin:0; }
      .platform-account-result { margin:0 16px 18px; padding:14px; border:1px solid var(--line); border-radius:11px; background:#f8faff; }
      .platform-account-result .actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:12px; }
      .platform-account-result .danger { background:#b42318; color:#fff; border-color:#b42318; }
      @media(max-width:800px) {
        .platform-modal { width:100%; max-height:100vh; border-radius:0; }
        .platform-modal .form { padding:18px 14px; }
        .platform-stats { grid-template-columns:repeat(2,1fr); }
        .platform-table-wrap { padding:8px 12px 16px; }
        .platform-school-form { grid-template-columns:1fr; }
        .platform-account-form { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);

  }


  function createDashboardModal() {

    if (document.getElementById('platformDashboardModal')) {
      return document.getElementById('platformDashboardModal');
    }

    const modal = document.createElement('div');
    modal.id = 'platformDashboardModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-modal">
        <div class="modal-head">
          <h3>👑 Painel da Plataforma</h3>
          <button class="close" type="button" data-close="platformDashboardModal">×</button>
        </div>
        <div class="form">
          <div id="platformStats" class="platform-stats"></div>
          <form id="platformSchoolForm" class="platform-school-form">
            <div class="field"><label for="platformSchoolName">Nome da escola</label><input id="platformSchoolName" maxlength="160" required></div>
            <div class="field"><label for="platformSchoolAdminEmail">E-mail do administrador</label><input id="platformSchoolAdminEmail" type="email" required></div>
            <div class="field"><label for="platformSchoolPlan">Plano</label><select id="platformSchoolPlan"><option value="free">Gratuito</option><option value="basic">Básico</option><option value="professional">Profissional</option><option value="enterprise">Empresarial</option></select></div>
            <div class="field"><label for="platformSchoolPrice">Preço mensal</label><input id="platformSchoolPrice" type="number" min="0" step="0.01" value="0" required></div>
            <button class="btn primary" type="submit">Criar escola</button>
          </form>
          <div id="platformAdminInvite" class="hidden" style="margin:-6px 0 18px">
            <p id="platformAdminInviteStatus" class="meta"></p>
            <button id="platformAdminInviteRetry" class="btn secondary" type="button">Reenviar convite ao administrador</button>
          </div>
          <section class="panel">
            <div class="head">
              <h3>Escolas cadastradas</h3>
            </div>
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
          </section>
          <section class="panel" style="margin-top:22px">
            <div class="head"><h3>Gerenciar conta</h3></div>
            <form id="platformAccountForm" class="platform-account-form">
              <div class="field"><label for="platformAccountEmail">E-mail exato da conta</label><input id="platformAccountEmail" type="email" required autocomplete="off"></div>
              <button class="btn secondary" type="submit">Localizar conta</button>
            </form>
            <div id="platformAccountResult" class="platform-account-result hidden"></div>
          </section>
          <section class="panel" style="margin-top:22px">
            <div class="head">
              <h3>Atividade administrativa recente</h3>
            </div>
            <div class="platform-table-wrap">
              <table class="platform-table platform-audit-table">
                <thead><tr><th>Data</th><th>Ação</th><th>Escola/conta</th><th>Alteração</th></tr></thead>
                <tbody id="platformAuditBody"></tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#platformSchoolForm').onsubmit = provisionSchool;
    modal.querySelector('#platformAdminInviteRetry').onclick = retryAdminInvite;
    modal.querySelector('#platformAccountForm').onsubmit = lookupAccount;
    modal.onclick = event => {
      if (event.target === modal) {
        modal.classList.add('hidden');
      }
    };

    return modal;

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
    const ownerWarning = user.is_owner ? '<p class="error">A conta proprietária não pode ser removida.</p>' : '';
    target.innerHTML = `
      <strong>${esc(user.full_name || 'Conta sem nome cadastrado')}</strong>
      <p class="meta">${esc(user.email)} · ${esc(user.memberships)} vínculo(s) escolar(es) · ${user.confirmed ? 'E-mail confirmado' : 'E-mail não confirmado'} · ${esc(STATUS_LABELS[user.status] || user.status)}</p>
      ${ownerWarning}
      <div class="actions">
        <button class="btn secondary" type="button" data-account-action="cancel_login" ${user.is_owner ? 'disabled' : ''}>Cancelar login</button>
        <button class="btn danger" type="button" data-account-action="permanent_delete" ${user.is_owner ? 'disabled' : ''}>Excluir permanentemente</button>
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
      const target = entry.school_name || entry.target_email || 'Plataforma';
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


  function renderStats(summary) {

    const target = document.getElementById('platformStats');

    if (!target) {
      return;
    }

    const cards = [
      ['Total de escolas', summary?.total_schools ?? 0],
      ['Escolas ativas', summary?.active_schools ?? 0],
      ['Escolas suspensas', summary?.suspended_schools ?? 0],
      ['Planos gratuitos', summary?.free_schools ?? 0],
      ['Planos pagos', summary?.paid_schools ?? 0]
    ];

    target.innerHTML = cards
      .map(([label, value]) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
      .join('');

  }


  function renderSchools(schools) {

    const body = document.getElementById('platformSchoolsBody');

    if (!body) {
      return;
    }

    if (!schools.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma escola cadastrada.</td></tr>';
      return;
    }

    const rows = schools.map(school => {
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

      return `<tr>
        <td>${esc(school.school_name)}</td>
        <td><span class="platform-badge ${esc(plan)}">${esc(PLAN_LABELS[plan] || plan)}</span></td>
        <td><span class="platform-badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span></td>
        <td><span class="platform-badge ${esc(subscriptionStatus)}">${esc(STATUS_LABELS[subscriptionStatus] || subscriptionStatus)}</span></td>
        <td>${esc(school.user_count ?? 0)}</td>
        <td>${esc(school.student_count ?? 0)}</td>
        <td class="platform-school-actions"><button class="btn secondary" type="button" data-school-status="${esc(nextStatus)}" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${actionLabel} escola</button> ${subscriptionButton}</td>
      </tr>`;

    });

    body.innerHTML = rows.join('');

    body.querySelectorAll('[data-school-status]').forEach(button => {
      button.onclick = () => setSchoolStatus(button);
    });
    body.querySelectorAll('[data-subscription-status]').forEach(button => {
      button.onclick = () => setSubscriptionStatus(button);
    });

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

    const [summaryResult, schoolsResult, auditResult] = await Promise.all([
      db.rpc('platform_dashboard_summary'),
      db.rpc('platform_list_schools_with_counts'),
      db.rpc('platform_list_audit', { p_limit:50 })
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

    const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;

    renderStats(summary);
    renderSchools(schoolsResult.data || []);
    renderAudit(auditResult.data || [], auditResult.error);

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
