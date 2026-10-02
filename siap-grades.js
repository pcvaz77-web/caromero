// Notas finais lidas da tela autenticada do SIAP. Nenhum dado é enviado antes
// da prévia e da ação explícita de importar no Carômetro.
document.addEventListener('DOMContentLoaded', () => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizeStudentName = value => String(value || '').replace(/^\s*\d+\s*[.\-)–—:]\s*/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeClass = value => normalize(value).replace(/\s+/g, '');
  const normalizeSchool = value => normalize(value).replace(/\bcol\b/g, 'colegio').replace(/\best\b/g, 'estadual');
  const escape = value => {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  };
  const subjectLabel = value => String(value || '').replace(/^\d+\s*-\s*/, '').trim();
  const tone = percentage => percentage < 60 ? 'red' : percentage < 70 ? 'yellow' : 'green';
  const scoreText = value => Number(value).toFixed(1).replace('.', ',');
  const dateText = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(date);
  };
  const canCapture = classId => window.getActiveSchoolRole?.() === 'teacher' && !!window.counselorRightsForClass?.(classId);
  const schoolId = () => window.getActiveSchoolId?.() || null;
  let batches = [];
  let entries = [];
  let loadToken = 0;
  let capture = null;
  let selectedClassId = null;

  async function fetchPages(table, columns, activeSchool) {
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from(table).select(columns).eq('school_id', activeSchool).range(offset, offset + 999);
      if (error) throw error;
      all.push(...(data || []));
      if ((data || []).length < 1000) return all;
    }
  }

  async function loadGrades() {
    const token = ++loadToken;
    const activeSchool = schoolId();
    if (!activeSchool) { batches = []; entries = []; window.render?.(); return; }
    try {
      const [nextBatches, nextEntries] = await Promise.all([
        fetchPages('siap_grade_batches', 'id,school_id,class_id,academic_year,bimester,subject,source_kind,show_on_card,imported_at', activeSchool),
        fetchPages('siap_grade_entries', 'batch_id,school_id,student_id,score,imported_at', activeSchool)
      ]);
      if (token !== loadToken || activeSchool !== schoolId()) return;
      batches = nextBatches;
      entries = nextEntries;
      window.render?.();
      if (selectedClassId && !document.getElementById('classroomMapModal')?.classList.contains('hidden')) mountPanel(selectedClassId);
    } catch (error) {
      if (token !== loadToken) return;
      batches = []; entries = [];
      console.warn('Não foi possível carregar as notas bimestrais:', error);
    }
  }

  window.getStudentGradeDetails = studentId => {
    const byId = new Map(batches.filter(batch => batch.show_on_card).map(batch => [batch.id, batch]));
    return entries.filter(entry => entry.student_id === studentId && byId.has(entry.batch_id))
      .map(entry => ({ ...entry, batch:byId.get(entry.batch_id) }))
      .sort((left, right) => right.batch.academic_year - left.batch.academic_year ||
        right.batch.bimester - left.batch.bimester || left.batch.subject.localeCompare(right.batch.subject))
      .map(({ score, batch, imported_at }) => {
        const percentage = Math.round(Number(score) * 10);
        const display = scoreText(score);
        return `<div class="grade-card-row"><div><strong>${escape(subjectLabel(batch.subject))}</strong><small class="grade-card-score">Nota final: <b>${escape(display)}</b> · ${batch.bimester}º bimestre/${batch.academic_year}</small><small><b>Fonte:</b> SIAP · ${batch.source_kind === 'secretary' ? 'Secretaria' : 'Professor/disciplina'}</small><small><b>Atualizado em:</b> ${escape(dateText(imported_at))}</small></div><span class="grade-ring grade-${tone(percentage)}" style="--grade-value:${percentage}" role="img" aria-label="Nota ${escape(display)}, ${percentage}%"><span>${percentage}%</span></span></div>`;
      }).join('');
  };

  window.getSiapGradePanelAction = ({ classId } = {}) => canCapture(classId)
    ? '<button id="openSiapGrades" type="button" class="btn primary">Extrair notas do SIAP</button>' : '';
  window.bindSiapGradePanelAction = ({ classId, className } = {}) => {
    const control = document.getElementById('openSiapGrades');
    if (control) control.onclick = () => openCapture(classId, className);
  };

  const dialog = document.createElement('div');
  dialog.id = 'siapGradesModal';
  dialog.className = 'modal-bg hidden';
  dialog.innerHTML = `<section class="modal siap-grades-dialog"><div class="modal-head"><h3>Notas finais do SIAP</h3><button type="button" class="close" data-grade-close aria-label="Fechar">×</button></div>
    <div class="form"><p class="sub">Abra no SIAP a página Notas da turma, disciplina e bimestre desejados. A leitura usa somente “Média Bimestral Final”.</p>
    <div data-grade-context class="meta"></div><div class="actions"><button type="button" class="btn secondary" data-grade-capture>Capturar tela aberta</button></div>
    <p data-grade-status class="meta" role="status"></p><div data-grade-preview></div>
    <label class="check grade-card-choice"><input type="checkbox" data-grade-visible> Mostrar estas notas no card dos alunos</label>
    <div class="actions"><button type="button" class="btn secondary" data-grade-close>Fechar</button><button type="button" class="btn primary" data-grade-import disabled>Importar notas conferidas</button></div></div></section>`;
  document.body.appendChild(dialog);
  const status = message => { dialog.querySelector('[data-grade-status]').textContent = message; };
  const close = () => dialog.classList.add('hidden');
  dialog.querySelectorAll('[data-grade-close]').forEach(button => button.onclick = close);
  dialog.onclick = event => { if (event.target === dialog) close(); };

  function previewRows(snapshot, classId) {
    const candidates = students.filter(student => student.classId === classId);
    const byName = new Map();
    candidates.forEach(student => {
      const key = normalizeStudentName(student.name);
      byName.set(key, [...(byName.get(key) || []), student]);
    });
    return snapshot.entries.map(entry => {
      const matches = byName.get(normalizeStudentName(entry.name)) || [];
      return { ...entry, studentId:matches.length === 1 ? matches[0].id : null, matchCount:matches.length };
    });
  }

  function renderPreview() {
    const host = dialog.querySelector('[data-grade-preview]');
    const importButton = dialog.querySelector('[data-grade-import]');
    if (!capture) { host.innerHTML = ''; importButton.disabled = true; return; }
    const { snapshot, classId } = capture;
    const rows = previewRows(snapshot, classId);
    const eligible = rows.filter(row => row.studentId && !row.blocked && row.score !== null);
    const missing = rows.filter(row => row.score === null).length;
    const unmatched = rows.filter(row => row.score !== null && !row.studentId).length;
    host.innerHTML = `<p class="meta">${eligible.length} notas identificadas · ${missing} sem nota · ${unmatched} sem vínculo único. Nota 0,0 exige seleção manual.</p>
      <div class="siap-grade-preview-list">${rows.map((row, index) => {
        const valid = row.studentId && !row.blocked && row.score !== null;
        const reason = row.score === null ? 'Sem nota' : row.blocked ? 'Matrícula bloqueada no SIAP' :
          !row.studentId ? row.matchCount ? 'Nome duplicado no Carômetro' : 'Não identificado no Carômetro' : '';
        return `<label class="siap-grade-preview-row"><input type="checkbox" data-grade-row="${index}" ${valid && row.score > 0 ? 'checked' : ''} ${valid ? '' : 'disabled'}>
          <span>${escape(row.name)}<small>${escape(reason)}</small></span><b>${row.score === null ? '—' : escape(scoreText(row.score))}</b></label>`;
      }).join('')}</div>`;
    importButton.disabled = !eligible.length;
  }

  function openCapture(classId, className) {
    if (!canCapture(classId)) { toast('Somente o conselheiro desta turma pode importar notas.'); return; }
    capture = null;
    selectedClassId = classId;
    dialog.dataset.classId = classId;
    dialog.dataset.className = className || '';
    dialog.querySelector('[data-grade-context]').textContent = `Turma ${className || ''}`;
    dialog.querySelector('[data-grade-visible]').checked = false;
    dialog.classList.remove('hidden');
    status('Nenhuma nota capturada.');
    renderPreview();
  }

  function requestCapture() {
    return new Promise(resolve => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { window.removeEventListener('message', receive); resolve({ ok:false, message:'A extensão demorou para responder.' }); }, 25000);
      function receive(event) {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin ||
            data?.source !== 'CAROMETRO_GRADES_EXTENSION' || data?.type !== 'CAROMETRO_GRADES_CAPTURE_RESULT' ||
            data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        resolve(data.response || { ok:false, message:'Resposta vazia da extensão.' });
      }
      window.addEventListener('message', receive);
      window.postMessage({ source:'CAROMETRO_WEB', type:'CAROMETRO_GRADES_CAPTURE_REQUEST', requestId }, location.origin);
    });
  }

  dialog.querySelector('[data-grade-capture]').onclick = async () => {
    const button = dialog.querySelector('[data-grade-capture]');
    button.disabled = true;
    status('Lendo somente as médias bimestrais finais da tela aberta…');
    try {
      const response = await requestCapture();
      if (!response.ok) throw new Error(response.message || 'A leitura falhou.');
      const snapshot = response.result;
      const className = dialog.dataset.className;
      const activeMembership = window.getActiveSchoolMembership?.();
      const activeSchoolName = activeMembership?.schools?.name || activeMembership?.name || '';
      if (!snapshot.schoolName || !activeSchoolName ||
          normalizeSchool(snapshot.schoolName) !== normalizeSchool(activeSchoolName))
        throw new Error(`A escola aberta no SIAP (${snapshot.schoolName || 'não identificada'}) não corresponde à escola ativa no Carômetro (${activeSchoolName || 'não identificada'}).`);
      if (normalizeClass(snapshot.context?.className) !== normalizeClass(className))
        throw new Error(`A tela do SIAP não pertence à turma ${className}.`);
      const targetClass = classes.find(item => item.id === dialog.dataset.classId);
      if (!targetClass || (targetClass.shift && normalize(snapshot.context?.shift) !== normalize(targetClass.shift)))
        throw new Error('O turno da tela do SIAP não corresponde à turma selecionada.');
      const bimester = Number(String(snapshot.context.term).match(/^([1-4])º?\s*Bimestre/i)?.[1]);
      const year = Number(snapshot.context.year);
      if (!Number.isInteger(bimester) || !Number.isInteger(year) || !snapshot.context.subject)
        throw new Error('Ano, bimestre ou disciplina não identificados na tela do SIAP.');
      capture = { snapshot, classId:dialog.dataset.classId, year, bimester, subject:snapshot.context.subject };
      dialog.querySelector('[data-grade-context]').textContent =
        `${className} · ${subjectLabel(capture.subject)} · ${bimester}º bimestre/${year}`;
      renderPreview();
      status('Confira os nomes, as notas e a opção do card antes de importar.');
    } catch (error) { capture = null; renderPreview(); status(error.message); }
    finally { button.disabled = false; }
  };

  dialog.querySelector('[data-grade-import]').onclick = async () => {
    if (!capture || !canCapture(capture.classId)) { status('A captura não está disponível para esta turma.'); return; }
    const rows = previewRows(capture.snapshot, capture.classId);
    const selected = [...dialog.querySelectorAll('[data-grade-row]:checked')].map(input => rows[Number(input.dataset.gradeRow)])
      .filter(row => row?.studentId && !row.blocked && row.score !== null);
    if (!selected.length) { status('Selecione ao menos uma nota válida.'); return; }
    const button = dialog.querySelector('[data-grade-import]');
    button.disabled = true;
    status('Importando notas conferidas…');
    try {
      const { data, error } = await db.rpc('import_siap_bimester_grades', {
        p_school_id:schoolId(), p_class_id:capture.classId, p_year:capture.year,
        p_bimester:capture.bimester, p_subject:capture.subject,
        p_rows:selected.map(row => ({ student_id:row.studentId, score:row.score })),
        p_show_on_card:dialog.querySelector('[data-grade-visible]').checked
      });
      if (error) throw error;
      status(`${data} notas importadas. Os campos não selecionados e as notas vazias não foram alterados.`);
      await loadGrades();
    } catch (error) { status(`Nenhuma importação concluída: ${error.message}`); }
    finally { button.disabled = false; }
  };

  function gradeRowsForClass(classId, year, bimester) {
    const sets = batches.filter(batch => batch.class_id === classId && batch.academic_year === year && batch.bimester === bimester);
    return sets.map(batch => ({ batch, scores:entries.filter(entry => entry.batch_id === batch.id).map(entry => Number(entry.score)) }));
  }

  async function setVisibility(batchId, visible) {
    const batch = batches.find(item => item.id === batchId);
    if (!batch || !canCapture(batch.class_id)) return;
    const { error } = await db.rpc('set_siap_grade_card_visibility', { p_batch_id:batchId, p_visible:visible });
    if (error) { toast(`Não foi possível alterar o card: ${error.message}`); return; }
    await loadGrades();
  }

  function mountPanel(classId) {
    const host = document.getElementById('classroomMapContent');
    const panelModal = document.getElementById('classroomMapModal');
    if (!host || !classId || !panelModal?.classList.contains('classroom-panel-mode') || panelModal.classList.contains('hidden')) return;
    let section = host.querySelector('[data-siap-grade-panel]');
    if (!section) {
      section = document.createElement('section');
      section.className = 'classroom-panel-card siap-grade-panel';
      section.dataset.siapGradePanel = '';
      host.appendChild(section);
    }
    const classBatches = batches.filter(batch => batch.class_id === classId);
    if (!classBatches.length) {
      section.innerHTML = '<h4>Notas por disciplina</h4><p>O conselheiro ainda não importou notas finais desta turma.</p>';
      return;
    }
    const periods = [...new Set(classBatches.map(batch => `${batch.academic_year}|${batch.bimester}`))]
      .sort((a,b) => b.localeCompare(a, 'pt-BR', { numeric:true }));
    const previous = section.querySelector('[data-grade-period]')?.value;
    const chosen = periods.includes(previous) ? previous : periods[0];
    const [year, bimester] = chosen.split('|').map(Number);
    const rows = gradeRowsForClass(classId, year, bimester);
    const allScores = rows.flatMap(row => row.scores);
    const overall = allScores.length ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length * 10) : null;
    section.innerHTML = `<div class="siap-grade-panel-head"><div><h4>Desempenho da turma</h4><p>Notas finais disponíveis · Fonte: SIAP</p></div>
      <select data-grade-period aria-label="Ano e bimestre">${periods.map(value => {
        const [y,b] = value.split('|');
        return `<option value="${value}" ${value === chosen ? 'selected' : ''}>${b}º bimestre/${y}</option>`;
      }).join('')}</select></div>
      <div class="siap-grade-dashboard"><div class="siap-grade-summary"><span class="siap-grade-eyebrow">Média geral</span>
        <div class="siap-grade-overall ${overall === null ? '' : `grade-text-${tone(overall)}`}">${overall === null ? 'Sem notas' : `${overall}%`}</div>
        <p>Média simples das notas finais disponíveis no período.</p></div>
      <div class="siap-grade-chart"><div class="siap-grade-chart-head"><h5>Média por disciplina</h5><span>${rows.length} disciplina${rows.length === 1 ? '' : 's'}</span></div>
      <div class="siap-grade-bars">${rows.sort((a,b) => a.batch.subject.localeCompare(b.batch.subject)).map(({ batch, scores }) => {
        const percent = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) : null;
        return `<div class="siap-grade-bar-row"><strong>${escape(subjectLabel(batch.subject))}</strong><span class="siap-grade-bar">${percent === null ? '' : `<i class="grade-${tone(percent)}" style="width:${percent}%"></i>`}</span>
          <b>${percent === null ? 'Sem notas' : `${percent}%`}</b><small>${scores.length} aluno${scores.length === 1 ? '' : 's'}</small>
          ${canCapture(classId) ? `<label><input type="checkbox" data-grade-toggle="${batch.id}" ${batch.show_on_card ? 'checked' : ''}> No card</label>` : ''}</div>`;
      }).join('')}</div><div class="siap-grade-legend">Vermelho: abaixo de 60% · Amarelo: 60% a 69% · Verde: 70% ou mais</div></div></div>`;
    section.querySelector('[data-grade-period]').onchange = () => mountPanel(classId);
    section.querySelectorAll('[data-grade-toggle]').forEach(input => {
      input.onchange = () => setVisibility(input.dataset.gradeToggle, input.checked);
    });
  }
  window.mountSiapGradePanel = ({ classId } = {}) => { selectedClassId = classId; mountPanel(classId); };

  document.addEventListener('carometro:data-loaded', loadGrades);
  document.addEventListener('carometro:school-context-ready', loadGrades);
  db.auth.onAuthStateChange((_event, session) => { if (!session) { ++loadToken; batches=[]; entries=[]; } });
});
