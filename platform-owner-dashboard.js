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
    school_permanently_deleted: 'Escola excluída permanentemente'
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
      .platform-badge.archived { background:#eef0f4; color:#5b6472; }
      .platform-badge.free { background:#f1f4f8; color:#40516f; }
      .platform-badge.basic, .platform-badge.professional, .platform-badge.enterprise { background:#eaf1ff; color:#315dbb; }
      .platform-school-admin { display:block; margin-top:3px; color:var(--muted); font-size:12px; }
      .platform-school-admin.pending { color:#b7791f; }
      .platform-school-admin.none { font-style:italic; }
      .platform-archived-section { margin-top:26px; padding:0 22px 18px; }
      .platform-archived-section .head h4 { margin:0 0 10px; font-size:14px; color:var(--muted); }
      .platform-archived-item { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:12px 14px; border:1px solid var(--line); border-radius:9px; margin-bottom:8px; opacity:.85; flex-wrap:wrap; }
      .platform-archived-item b { display:block; }
      .platform-archived-item .platform-school-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .platform-job-note { margin:4px 0 0; font-size:12px; color:#b42318; font-weight:600; }
      .platform-archive-modal { width:min(480px,100%); }
      .platform-archive-modal .warning { background:#fef3f2; border:1px solid #fecdca; border-radius:9px; padding:12px 14px; font-size:13px; color:#7a271a; margin-bottom:16px; }
      .platform-archive-modal .school-name-confirm { font-weight:800; }
      .platform-archive-modal .ack-field label { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; }
      .platform-archive-modal .ack-field input[type="checkbox"] { width:auto; }
      .platform-modal .btn.danger, .platform-archive-modal .btn.danger { background:#b42318; color:#fff; border-color:#b42318; }
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
      .platform-plan-modal { width:min(520px,100%); }
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
            <div id="platformArchivedSection" class="platform-archived-section hidden">
              <div class="head"><h4>Escolas arquivadas</h4></div>
              <div id="platformArchivedList"></div>
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

  function createPlanModal() {
    let modal = document.getElementById('platformPlanModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'platformPlanModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal platform-plan-modal">
        <div class="modal-head"><h3>Alterar plano</h3><button class="close" type="button">×</button></div>
        <form id="platformPlanForm" class="form">
          <p id="platformPlanSchool" class="meta"></p>
          <div class="field"><label for="platformPlanValue">Plano</label><select id="platformPlanValue" required><option value="free">Gratuito</option><option value="basic">Básico</option><option value="professional">Profissional</option><option value="enterprise">Empresarial</option></select></div>
          <div class="field"><label for="platformPlanPrice">Preço mensal</label><input id="platformPlanPrice" type="number" min="0" max="99999999.99" step="0.01" required></div>
          <div class="field"><label for="platformPlanBilling">Tipo de cobrança</label><select id="platformPlanBilling" required><option value="fixed_school">Valor fixo por escola</option><option value="per_student">Por aluno</option></select></div>
          <div class="field"><label for="platformPlanReason">Justificativa</label><input id="platformPlanReason" maxlength="500" placeholder="Ex.: contratação confirmada" required></div>
          <button id="platformPlanSubmit" class="btn primary full" type="submit">Salvar alteração</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#platformPlanForm').onsubmit = saveSubscriptionPlan;
    modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
    return modal;
  }

  function openPlanModal(button) {
    const modal = createPlanModal();
    modal.dataset.schoolId = button.dataset.schoolId;
    document.getElementById('platformPlanSchool').textContent = button.dataset.schoolName;
    document.getElementById('platformPlanValue').value = button.dataset.plan;
    document.getElementById('platformPlanPrice').value = button.dataset.price;
    document.getElementById('platformPlanBilling').value = button.dataset.billingType;
    document.getElementById('platformPlanReason').value = '';
    modal.classList.remove('hidden');
  }

  async function saveSubscriptionPlan(event) {
    event.preventDefault();
    const modal = document.getElementById('platformPlanModal');
    const button = document.getElementById('platformPlanSubmit');
    const plan = document.getElementById('platformPlanValue').value;
    const price = Number(document.getElementById('platformPlanPrice').value);
    const billingType = document.getElementById('platformPlanBilling').value;
    const reason = document.getElementById('platformPlanReason').value.trim();
    if (!Number.isFinite(price) || price < 0) { toast('Informe um preço válido.'); return; }
    if (!confirm(`Confirma a alteração para o plano ${PLAN_LABELS[plan]}?`)) return;

    button.disabled = true;
    try {
      const { error } = await db.rpc('platform_set_subscription_plan', {
        p_school_id:modal.dataset.schoolId,
        p_plan:plan,
        p_price:price,
        p_billing_type:billingType,
        p_reason:reason
      });
      if (error) { toast(error.message); return; }
      modal.classList.add('hidden');
      toast('Plano alterado com sucesso.');
      await openDashboard();
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
    if (entry.event_type === 'school_permanently_deleted') {
      return `${next.students_removed ?? 0} aluno(s), ${next.classes_removed ?? 0} turma(s) e ${next.storage_objects_removed ?? 0} arquivo(s) removidos`;
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


  function adminLine(school) {
    const state = school.admin_state || 'none';
    if (state === 'active') return `<span class="platform-school-admin">${esc(school.admin_email)}</span>`;
    if (state === 'pending') return `<span class="platform-school-admin pending">${esc(school.admin_email)} · convite pendente</span>`;
    return `<span class="platform-school-admin none">Sem administrador</span>`;
  }

  function renderSchools(schools, jobsBySchoolId) {

    const jobs = jobsBySchoolId || {};
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
        const planButton = subscriptionStatus === 'missing'
          ? ''
          : `<button class="btn secondary" type="button" data-edit-plan data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}" data-plan="${esc(plan)}" data-price="${esc(school.price ?? 0)}" data-billing-type="${esc(school.billing_type || 'fixed_school')}">Alterar plano</button>`;

        return `<tr>
          <td><b>${esc(school.school_name)}</b>${adminLine(school)}</td>
          <td><span class="platform-badge ${esc(plan)}">${esc(PLAN_LABELS[plan] || plan)}</span></td>
          <td><span class="platform-badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span></td>
          <td><span class="platform-badge ${esc(subscriptionStatus)}">${esc(STATUS_LABELS[subscriptionStatus] || subscriptionStatus)}</span></td>
          <td>${esc(school.user_count ?? 0)}</td>
          <td>${esc(school.student_count ?? 0)}</td>
          <td class="platform-school-actions">${planButton} <button class="btn secondary" type="button" data-school-status="${esc(nextStatus)}" data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">${actionLabel} escola</button> ${subscriptionButton} <button class="btn danger" type="button" data-archive-school data-school-id="${esc(school.school_id)}" data-school-name="${esc(school.school_name)}">Excluir escola</button></td>
        </tr>`;
      });

      body.innerHTML = rows.join('');

      body.querySelectorAll('[data-school-status]').forEach(button => {
        button.onclick = () => setSchoolStatus(button);
      });
      body.querySelectorAll('[data-subscription-status]').forEach(button => {
        button.onclick = () => setSubscriptionStatus(button);
      });
      body.querySelectorAll('[data-edit-plan]').forEach(button => {
        button.onclick = () => openPlanModal(button);
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

    const [summaryResult, schoolsResult, auditResult, jobsResult] = await Promise.all([
      db.rpc('platform_dashboard_summary'),
      db.rpc('platform_list_schools_with_counts_v3'),
      db.rpc('platform_list_audit', { p_limit:50 }),
      db.from('platform_school_deletion_jobs').select('school_id, status, error_message, updated_at')
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
    const jobsBySchoolId = {};
    if (!jobsResult.error) {
      (jobsResult.data || []).forEach(job => { jobsBySchoolId[job.school_id] = job; });
    }

    renderStats(summary);
    renderSchools(schoolsResult.data || [], jobsBySchoolId);
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
