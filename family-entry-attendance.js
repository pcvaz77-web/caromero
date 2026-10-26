// Frequência de entrada: leituras da carteirinha, separadas da frequência SIAP.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const escape = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const schoolId = () => window.getActiveSchoolId?.() || null;
  const today = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const displayDate = value => value ? value.split('-').reverse().join('/') : '';
  const periodLabel = row => `${displayDate(row.period_start)} a ${displayDate(row.period_end)}`;
  let activeClass = null;
  let request = 0;
  let cardsRequest = 0;
  let cardRows = new Map();
  let publishedSchool = null;

  const originalDetails = window.getStudentAttendanceDetails;
  window.getStudentAttendanceDetails = studentId => {
    const details = originalDetails?.(studentId) || [];
    const row = publishedSchool === schoolId() ? cardRows.get(studentId) : null;
    if (!row) return details;
    return [...details, {
      label:'Frequência de entrada', source:'Leitura da carteirinha', className:'attendance-entry',
      status:'entry', percentage:row.percentage, period:periodLabel(row), updatedAt:row.published_at,
      summary:`${row.entry_days} de ${row.observed_days} dias com leitura na turma`
    }];
  };

  async function loadCards() {
    const currentSchool = schoolId();
    const token = ++cardsRequest;
    publishedSchool = null;
    cardRows = new Map();
    if (!currentSchool) return;
    const { data, error } = await db.rpc('family_entry_attendance_cards', { p_school_id:currentSchool });
    if (token !== cardsRequest || currentSchool !== schoolId()) return;
    if (error) return;
    cardRows = new Map((data || []).map(row => [row.student_id, row]));
    publishedSchool = currentSchool;
    window.render?.();
  }

  function panel() {
    const host = document.getElementById('classroomMapContent');
    const modal = document.getElementById('classroomMapModal');
    if (!host || !modal || modal.classList.contains('hidden') || !modal.classList.contains('classroom-panel-mode')) return null;
    let section = host.querySelector('[data-family-entry-attendance]');
    if (!section) {
      section = document.createElement('section');
      section.className = 'classroom-panel-card family-entry-attendance';
      section.dataset.familyEntryAttendance = '';
      host.appendChild(section);
    }
    return section;
  }

  async function refresh() {
    const section = panel();
    const context = activeClass;
    const currentSchool = schoolId();
    if (!section || !context || !currentSchool) return;
    const from = section.querySelector('[data-entry-from]')?.value || `${today().slice(0,7)}-01`;
    const to = section.querySelector('[data-entry-to]')?.value || today();
    const token = ++request;
    const canPublish = permission.role === 'admin' || !!permission.is_coordinator ||
      (window.getActiveSchoolRole?.() === 'teacher' && !!permission.can_publish_family_entry_attendance);
    section.innerHTML = `<div class="family-entry-head"><div><h4>Frequência de entrada</h4><p>Leituras da carteirinha · Turma ${escape(context.className)}</p></div>
      <div class="family-entry-dates"><label>De <input type="date" data-entry-from value="${escape(from)}" max="${today()}"></label><label>Até <input type="date" data-entry-to value="${escape(to)}" max="${today()}"></label><button class="btn secondary" type="button" data-entry-refresh>Atualizar</button></div></div>
      <div data-entry-body role="status">Carregando entradas da turma…</div>`;
    section.querySelector('[data-entry-refresh]').onclick = refresh;
    if (from > to || to > today()) {
      section.querySelector('[data-entry-body]').textContent = 'Selecione um período válido até a data de hoje.';
      return;
    }
    const { data, error } = await db.rpc('family_entry_attendance_preview', {
      p_school_id:currentSchool, p_class_id:context.classId, p_from:from, p_to:to
    });
    if (token !== request || currentSchool !== schoolId() || context.classId !== activeClass?.classId || !section.isConnected) return;
    const body = section.querySelector('[data-entry-body]');
    if (error) { body.textContent = `Não foi possível consultar a frequência de entrada: ${error.message}`; return; }
    const rows = data || [];
    const days = rows[0]?.observed_days || 0;
    const average = days && rows.length ? Math.round(rows.reduce((sum,row) => sum + Number(row.percentage || 0),0) / rows.length) : null;
    const scanned = rows.filter(row => row.entry_days > 0).length;
    const pending = rows.filter(row => row.published_at && (row.entry_days !== row.published_entry_days || row.observed_days !== row.published_observed_days)).length;
    body.innerHTML = `<div class="family-entry-dashboard"><div class="family-entry-summary"><span>MÉDIA DA TURMA</span><strong>${average === null ? '—' : `${average}%`}</strong><small>${days} dia${days === 1 ? '' : 's'} com leitura na turma<br>${scanned} de ${rows.length} aluno${rows.length === 1 ? '' : 's'} com entrada registrada</small></div>
      <div class="family-entry-list"><div class="family-entry-list-head"><strong>Por aluno</strong><span>${rows.length} aluno${rows.length === 1 ? '' : 's'}</span></div>
      <div class="family-entry-rows">${rows.map(row => `<div class="family-entry-row"><span>${escape(row.student_name)}</span><b>${days ? `${Math.round(Number(row.percentage || 0))}%` : '—'}</b><small>${row.entry_days}/${days} dias</small></div>`).join('') || '<p>Nenhum aluno ativo nesta turma.</p>'}</div></div></div>
      <p class="family-entry-note">Taxa de entradas registradas: dias em que o aluno teve leitura ÷ dias com alguma leitura nesta turma. Não representa a frequência escolar oficial nem confirma faltas.</p>
      ${canPublish ? `<div class="family-entry-actions"><button class="btn primary" type="button" data-entry-publish ${!days || !rows.length ? 'disabled' : ''}>Enviar resultados aos cards</button><span>${pending ? `${pending} resultado(s) publicado(s) desatualizado(s).` : rows.some(row => row.published_at) ? 'Há resultados deste período nos cards.' : 'Os cards ainda não têm resultados deste período.'}</span></div>` : ''}`;
    const publish = body.querySelector('[data-entry-publish]');
    if (publish) publish.onclick = async () => {
      if (!confirm(`Enviar a frequência de entrada de ${rows.length} aluno(s) aos cards para ${displayDate(from)} a ${displayDate(to)}?`)) return;
      publish.disabled = true;
      const { error:publishError } = await db.rpc('family_entry_attendance_publish', {
        p_school_id:currentSchool, p_class_id:context.classId, p_from:from, p_to:to
      });
      if (publishError) { publish.disabled = false; alert(`Não foi possível enviar aos cards: ${publishError.message}`); return; }
      await Promise.all([loadCards(), refresh()]);
    };
  }

  window.mountFamilyEntryAttendancePanel = context => { activeClass = context; refresh(); };
  document.addEventListener('carometro:school-context-ready', loadCards);
  document.addEventListener('carometro:data-loaded', loadCards);
  document.addEventListener('carometro:family-entry-recorded', () => { if (activeClass) refresh(); });
  setInterval(() => {
    const section = panel();
    if (activeClass && section && !section.contains(document.activeElement)) refresh();
  }, 30000);
  db.auth.onAuthStateChange((_event, session) => { if (!session) { ++cardsRequest; publishedSchool = null; cardRows.clear(); } });
  loadCards();
});
