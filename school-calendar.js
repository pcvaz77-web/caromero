document.addEventListener('DOMContentLoaded', () => {
  // Calendário letivo (school_terms) — tela mínima, somente para
  // school_admin. Não cria nenhuma permissão nova. O botão que abre esta
  // tela fica dentro da área já gated por permission.role === 'admin' em
  // permissions-and-details.js (flag legada, não por escola) — isso é uma
  // visibilidade herdada, registrada como limitação pré-existente (mesma
  // classe de problema já conhecida nesse arquivo, fora do escopo desta
  // tela). A AÇÃO real aqui nunca depende dessa flag legada nem de
  // resolução local de escola: usa sempre a escola ativa da sessão
  // (school-context.js) — a mesma que reports.js e uniform-management.js
  // usam. É a escola que o próprio usuário escolheu (ou a única que
  // possui), nunca "a que sou admin" nem "a primeira que o banco
  // devolver".
  const style = document.createElement('style');
  style.textContent = `
    .school-calendar-modal { z-index:106; }
    .school-calendar-modal .modal { width:min(760px,100%); display:flex; flex-direction:column; max-height:90dvh; overflow:hidden; }
    .school-calendar-modal .modal-head { position:sticky; top:0; z-index:3; flex:none; background:#fff; }
    .school-calendar-modal .form { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:24px 28px 28px; }
    .school-calendar-year { max-width:180px; }
    .school-calendar-bimester { display:grid; grid-template-columns:auto 1fr 1fr; gap:12px; align-items:end; padding:13px; border:1px solid var(--line); border-radius:9px; margin-top:10px; }
    .school-calendar-bimester b { min-width:88px; }
    .school-calendar-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
    @media (max-width:800px) {
      .school-calendar-modal { padding:10px; align-items:start; overflow:auto; }
      .school-calendar-modal .modal { width:100%; max-height:calc(100vh - 20px); margin:auto 0; }
      .school-calendar-modal .form { padding:16px; }
      .school-calendar-bimester { grid-template-columns:1fr; gap:8px; }
      .school-calendar-actions .btn { width:100%; }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'schoolCalendarModal';
  modal.className = 'modal-bg school-calendar-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Calendário letivo</h3><div class="meta">Datas de início e fim de cada bimestre — usadas pelo Livro/Revisa para saber quando cada período começa.</div></div><button class="close" type="button" id="closeSchoolCalendar">×</button></div><div class="form"><div class="field"><label for="schoolCalendarYear">Ano letivo</label><input id="schoolCalendarYear" class="school-calendar-year" type="number" min="2000" max="2100" step="1"></div><div id="schoolCalendarBimesters"></div><div class="school-calendar-actions"><button type="button" class="btn secondary" id="cancelSchoolCalendar">Fechar</button><button type="button" class="btn primary" id="saveSchoolCalendar">Salvar calendário</button></div></div></div>`;
  document.body.appendChild(modal);

  const closeManager = () => modal.classList.add('hidden');
  document.getElementById('closeSchoolCalendar').onclick = closeManager;
  document.getElementById('cancelSchoolCalendar').onclick = closeManager;
  modal.onclick = event => { if (event.target === modal) closeManager(); };

  // Escola ativa da sessão + papel do usuário NESSA escola específica
  // (school-context.js). Uma mesma conta pode ser school_admin na Escola A
  // e coordinator/teacher na Escola B — o que importa aqui é sempre o
  // papel na escola ativa, nunca "alguma escola onde eu seja admin".
  function currentSchoolAdminContext() {
    const schoolId = window.getActiveSchoolId?.() || null;
    const isSchoolAdmin = schoolId ? window.getActiveSchoolRole?.() === 'school_admin' : false;
    return { schoolId, isSchoolAdmin };
  }

  let currentSchoolCalendarId = null;
  let currentTerms = new Map(); // bimester -> { starts_on, ends_on }

  function renderBimesters() {
    const container = document.getElementById('schoolCalendarBimesters');
    container.innerHTML = [1, 2, 3, 4].map(bimester => {
      const term = currentTerms.get(bimester);
      return `<div class="school-calendar-bimester" data-bimester="${bimester}"><b>${bimester}º bimestre</b><div class="field"><label>Início</label><input type="date" class="school-calendar-start" value="${term?.starts_on || ''}"></div><div class="field"><label>Fim</label><input type="date" class="school-calendar-end" value="${term?.ends_on || ''}"></div></div>`;
    }).join('');
  }

  async function loadTermsForYear(year) {
    currentTerms = new Map();
    if (!currentSchoolCalendarId || !year) { renderBimesters(); return; }
    const { data, error } = await db.from('school_terms').select('bimester,starts_on,ends_on').eq('school_id', currentSchoolCalendarId).eq('school_year', year);
    if (error) { toast(`Não foi possível carregar o calendário: ${error.message}`); renderBimesters(); return; }
    (data || []).forEach(term => currentTerms.set(term.bimester, term));
    renderBimesters();
  }

  window.openSchoolCalendarManager = async () => {
    const { schoolId, isSchoolAdmin } = await currentSchoolAdminContext();
    if (!isSchoolAdmin) { toast('Somente o administrador da escola pode configurar o calendário letivo.'); return; }
    currentSchoolCalendarId = schoolId;
    if (!currentSchoolCalendarId) { toast('Não foi possível identificar a escola atual.'); return; }
    const yearInput = document.getElementById('schoolCalendarYear');
    if (!yearInput.value) yearInput.value = new Date().getFullYear();
    await loadTermsForYear(Number(yearInput.value));
    modal.classList.remove('hidden');
  };

  document.getElementById('schoolCalendarYear').onchange = () => {
    const year = Number(document.getElementById('schoolCalendarYear').value);
    if (year) loadTermsForYear(year);
  };

  document.getElementById('saveSchoolCalendar').onclick = async () => {
    const { schoolId, isSchoolAdmin } = await currentSchoolAdminContext();
    if (!isSchoolAdmin || schoolId !== currentSchoolCalendarId) { toast('Sua permissão para configurar o calendário foi revogada.'); return; }
    const year = Number(document.getElementById('schoolCalendarYear').value);
    if (!year) { toast('Informe o ano letivo.'); return; }

    // Validação básica no frontend — a validação definitiva (inclusive
    // sobreposição real contra o banco) continua só na RPC.
    const rows = Array.from(document.querySelectorAll('.school-calendar-bimester')).map(row => ({
      bimester: Number(row.dataset.bimester),
      starts_on: row.querySelector('.school-calendar-start').value || null,
      ends_on: row.querySelector('.school-calendar-end').value || null
    }));

    for (const row of rows) {
      if (!!row.starts_on !== !!row.ends_on) {
        toast(`${row.bimester}º bimestre: preencha início e fim, ou deixe os dois em branco.`);
        return;
      }
    }
    const filled = rows.filter(row => row.starts_on && row.ends_on);
    for (const row of filled) {
      if (row.starts_on > row.ends_on) { toast(`${row.bimester}º bimestre: a data de início não pode ser depois da data de término.`); return; }
    }
    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const a = filled[i], b = filled[j];
        if (a.starts_on <= b.ends_on && b.starts_on <= a.ends_on) {
          toast(`${a.bimester}º e ${b.bimester}º bimestres têm datas sobrepostas.`);
          return;
        }
      }
    }
    if (!filled.length) { toast('Preencha ao menos um bimestre para salvar.'); return; }

    // Uma única chamada atômica (upsert_school_terms_batch, migration 023)
    // — os 4 bimestres são validados e gravados dentro da mesma transação
    // no servidor; se qualquer validação falhar, nada é gravado. Nunca
    // mais 4 chamadas independentes de upsert_school_term (que preservamos
    // sem alteração, só para compatibilidade — não é mais usada por esta
    // tela).
    const byBimester = new Map(rows.map(row => [row.bimester, row]));
    const saveButton = document.getElementById('saveSchoolCalendar');
    saveButton.disabled = true;
    try {
      const { error } = await db.rpc('upsert_school_terms_batch', {
        target_school_id: currentSchoolCalendarId,
        p_school_year: year,
        p1_starts_on: byBimester.get(1).starts_on, p1_ends_on: byBimester.get(1).ends_on,
        p2_starts_on: byBimester.get(2).starts_on, p2_ends_on: byBimester.get(2).ends_on,
        p3_starts_on: byBimester.get(3).starts_on, p3_ends_on: byBimester.get(3).ends_on,
        p4_starts_on: byBimester.get(4).starts_on, p4_ends_on: byBimester.get(4).ends_on
      });
      if (error) {
        toast(`Calendário não foi salvo: ${error.message}. Nada foi alterado.`);
        await loadTermsForYear(year);
        return;
      }
      toast('Calendário letivo atualizado.');
      await loadTermsForYear(year);
    } finally {
      saveButton.disabled = false;
    }
  };
});
