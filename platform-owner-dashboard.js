// CARÔMETRO COMERCIAL
// Painel do proprietário da plataforma

(() => {

  const PLAN_LABELS = {
    free: 'Gratuito',
    paid: 'Pago'
  };

  const STATUS_LABELS = {
    active: 'Ativa',
    suspended: 'Suspensa',
    cancelled: 'Cancelada'
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
      .platform-modal .form { padding: 23px 24px; }
      .platform-stats { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:24px; }
      .platform-stats .stat strong { font-size:24px; }
      .platform-table { width:100%; border-collapse:collapse; }
      .platform-table th, .platform-table td { text-align:left; padding:11px 10px; border-bottom:1px solid var(--line); font-size:14px; }
      .platform-table th { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
      .platform-badge { font-size:12px; font-weight:750; border-radius:99px; padding:4px 9px; display:inline-flex; }
      .platform-badge.active { background:#eaf8f1; color:#08784b; }
      .platform-badge.suspended, .platform-badge.cancelled { background:#fee4e2; color:#b42318; }
      .platform-badge.free { background:#f1f4f8; color:#40516f; }
      .platform-badge.paid { background:#eaf1ff; color:#315dbb; }
      @media(max-width:800px) {
        .platform-stats { grid-template-columns:repeat(2,1fr); }
        .platform-table { display:block; overflow-x:auto; }
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
          <section class="panel">
            <div class="head">
              <h3>Escolas cadastradas</h3>
            </div>
            <div style="padding:8px 22px 20px">
              <table class="platform-table">
                <thead>
                  <tr>
                    <th>Escola</th>
                    <th>Plano</th>
                    <th>Status</th>
                    <th>Usuários</th>
                    <th>Alunos</th>
                  </tr>
                </thead>
                <tbody id="platformSchoolsBody"></tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
    modal.onclick = event => {
      if (event.target === modal) {
        modal.classList.add('hidden');
      }
    };

    return modal;

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


  async function renderSchools(schools) {

    const body = document.getElementById('platformSchoolsBody');

    if (!body) {
      return;
    }

    if (!schools.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty">Nenhuma escola cadastrada.</td></tr>';
      return;
    }

    body.innerHTML = '<tr><td colspan="5" class="meta">Carregando escolas...</td></tr>';

    const rows = await Promise.all(schools.map(async school => {

      const [userCountResult, studentCountResult] = await Promise.all([
        db.rpc('platform_school_user_count', { target_school_id: school.school_id }),
        db.rpc('platform_school_student_count', { target_school_id: school.school_id })
      ]);

      const plan = school.plan || 'free';
      const status = school.school_status || 'active';

      return `<tr>
        <td>${esc(school.school_name)}</td>
        <td><span class="platform-badge ${esc(plan)}">${esc(PLAN_LABELS[plan] || plan)}</span></td>
        <td><span class="platform-badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span></td>
        <td>${esc(userCountResult.data ?? 0)}</td>
        <td>${esc(studentCountResult.data ?? 0)}</td>
      </tr>`;

    }));

    body.innerHTML = rows.join('');

  }


  async function openDashboard() {

    const modal = createDashboardModal();
    modal.classList.remove('hidden');

    const statsTarget = document.getElementById('platformStats');
    const bodyTarget = document.getElementById('platformSchoolsBody');

    if (statsTarget) {
      statsTarget.innerHTML = '<div class="meta">Carregando resumo...</div>';
    }

    if (bodyTarget) {
      bodyTarget.innerHTML = '<tr><td colspan="5" class="meta">Carregando escolas...</td></tr>';
    }

    const [summaryResult, schoolsResult] = await Promise.all([
      db.rpc('platform_dashboard_summary'),
      db.rpc('platform_list_schools')
    ]);

    if (summaryResult.error || schoolsResult.error) {
      if (statsTarget) {
        statsTarget.innerHTML = '';
      }
      if (bodyTarget) {
        bodyTarget.innerHTML = '<tr><td colspan="5" class="error">Não foi possível carregar os dados da plataforma.</td></tr>';
      }
      return;
    }

    const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;

    renderStats(summary);
    await renderSchools(schoolsResult.data || []);

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
    button.innerHTML = '👑 &nbsp; Plataforma';
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


    const { data, error } = await db
      .from('platform_admins')
      .select('role,status')
      .eq('user_id', user.id)
      .maybeSingle();


    if (error || !data) {
      button.classList.add('hidden');
      return;
    }


    const owner =
      data.role === 'owner' &&
      data.status === 'active';


    button.classList.toggle(
      'hidden',
      !owner
    );

  }


  function start() {

    injectStyle();
    createPlatformNavigation();

    setTimeout(
      checkPlatformOwner,
      1000
    );

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
