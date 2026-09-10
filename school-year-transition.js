document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `#schoolYearModal .modal{width:min(980px,100%)}.year-grid{display:grid;grid-template-columns:minmax(180px,1fr) 160px minmax(180px,1fr) 150px;gap:8px;align-items:center}.year-grid>div{padding:7px 0;border-bottom:1px solid var(--line)}.year-class-default{display:grid;grid-template-columns:1fr 1fr 140px auto;gap:8px;margin-bottom:8px;align-items:center}.year-summary{margin-top:16px;padding:14px;border:1px solid var(--line);border-radius:9px;background:#f8faff}@media(max-width:800px){.year-grid,.year-class-default{grid-template-columns:1fr}.year-class-default{padding:12px;border:1px solid var(--line);border-radius:9px}.year-grid .year-label{padding-bottom:0;border:0}.year-grid select,.year-grid input{margin-bottom:7px}}`;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'schoolYearNav'; button.type = 'button'; button.className = 'hidden';
  button.textContent = 'Preparar novo ano letivo';
  document.querySelector('.side .nav')?.appendChild(button);

  const modal = document.createElement('div');
  modal.id = 'schoolYearModal'; modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Preparar novo ano letivo</h3><div class="meta">Preserva alunos, fotos e ocorrências. As turmas anteriores serão arquivadas.</div></div><button class="close" type="button" data-year-close>×</button></div><div class="form"><div class="field"><label for="schoolYearTarget">Novo ano letivo</label><input id="schoolYearTarget" type="number" min="2020" max="2200"></div><div id="schoolYearClassDefaults"></div><div class="year-grid" id="schoolYearRows"></div><div class="actions"><button id="schoolYearAnalyze" class="btn secondary" type="button">Analisar</button><button id="schoolYearConfirm" class="btn primary" type="button" disabled>Confirmar transição</button></div><div id="schoolYearResult" class="year-summary hidden"></div></div></div>`;
  document.body.appendChild(modal);

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const canPrepare = () => permission?.role === 'admin' || (permission?.is_coordinator && permission?.can_prepare_school_year);
  const rows = () => [...modal.querySelectorAll('[data-student-row]')];
  let analyzed = null;

  function renderRows() {
    document.getElementById('schoolYearClassDefaults').innerHTML = `<div class="meta" style="margin-bottom:8px">Preencha uma turma inteira de uma vez e ajuste abaixo somente as exceções.</div>${classes.map(item => `<div class="year-class-default"><b>${esc(item.name)}</b><input data-group-class="${esc(item.id)}" placeholder="Nova turma"><select data-group-shift="${esc(item.id)}"><option>Matutino</option><option>Vespertino</option><option>Noturno</option></select><button class="btn secondary" type="button" data-apply-group="${esc(item.id)}">Aplicar à turma</button></div>`).join('')}`;
    document.getElementById('schoolYearRows').innerHTML = students.map(student => `<div class="year-label" data-student-row data-student-id="${esc(student.id)}" data-current-class-id="${esc(student.classId)}"><b>${esc(student.name)}</b><div class="meta">${esc(student.className)}</div></div><div><select data-year-status><option value="pending">Situação ainda não definida</option><option value="active">Remanejar</option><option value="repeated">Repetente</option><option value="transferred">Transferir e retirar da lista</option></select></div><div><input data-year-class placeholder="Nova turma (ex.: 7º A)" disabled></div><div><select data-year-shift disabled><option>Matutino</option><option>Vespertino</option><option>Noturno</option></select></div>`).join('');
    modal.querySelectorAll('[data-year-status]').forEach(select => select.onchange = () => {
      const start = [...modal.querySelectorAll('[data-student-row]')].indexOf(select.closest('div').previousElementSibling);
      const classInput = modal.querySelectorAll('[data-year-class]')[start];
      const shiftInput = modal.querySelectorAll('[data-year-shift]')[start];
      const active = select.value === 'active' || select.value === 'repeated'; classInput.disabled = !active; shiftInput.disabled = !active;
      analyzed = null; document.getElementById('schoolYearConfirm').disabled = true;
    });
    modal.querySelectorAll('input,select').forEach(input => input.addEventListener('input', () => { analyzed = null; document.getElementById('schoolYearConfirm').disabled = true; }));
    modal.querySelectorAll('[data-apply-group]').forEach(apply => apply.onclick = () => {
      const classId = apply.dataset.applyGroup;
      const destination = modal.querySelector(`[data-group-class="${classId}"]`).value.trim();
      const shift = modal.querySelector(`[data-group-shift="${classId}"]`).value;
      if (!destination) { toast('Informe a nova turma antes de aplicar.'); return; }
      rows().forEach((row, index) => {
        if (row.dataset.currentClassId !== classId) return;
        modal.querySelectorAll('[data-year-status]')[index].value = 'active';
        modal.querySelectorAll('[data-year-class]')[index].value = destination;
        modal.querySelectorAll('[data-year-shift]')[index].value = shift;
      });
      analyzed = null; document.getElementById('schoolYearConfirm').disabled = true;
    });
  }

  function collect() {
    const labels = rows(), statuses = modal.querySelectorAll('[data-year-status]'), names = modal.querySelectorAll('[data-year-class]'), shifts = modal.querySelectorAll('[data-year-shift]');
    return labels.map((row, index) => ({ student_id:row.dataset.studentId, status:statuses[index].value, class_name:names[index].value.trim(), shift:shifts[index].value }));
  }
  function refreshVisibility() { button.classList.toggle('hidden', !canPrepare()); if (!canPrepare()) modal.classList.add('hidden'); }

  button.onclick = () => { if (!canPrepare()) return; document.getElementById('schoolYearTarget').value = new Date().getFullYear() + 1; renderRows(); analyzed = null; document.getElementById('schoolYearResult').classList.add('hidden'); document.getElementById('schoolYearConfirm').disabled = true; modal.classList.remove('hidden'); };
  document.getElementById('schoolYearAnalyze').onclick = () => {
    const year = Number(document.getElementById('schoolYearTarget').value), assignments = collect();
    const pending = assignments.filter(item => item.status === 'pending');
    const missing = assignments.filter(item => (item.status === 'active' || item.status === 'repeated') && !item.class_name);
    if (!Number.isInteger(year) || year < 2020 || year > 2200) { toast('Informe um ano letivo válido.'); return; }
    if (missing.length) { toast(`Informe a nova turma de ${missing.length} aluno${missing.length === 1 ? '' : 's'}.`); return; }
    const classKeys = new Set(assignments.filter(item => item.status === 'active' || item.status === 'repeated').map(item => `${normalize(item.class_name)}|${item.shift}`));
    const moved = assignments.filter(item => item.status === 'active').length;
    const repeated = assignments.filter(item => item.status === 'repeated').length;
    const transferred = assignments.filter(item => item.status === 'transferred').length;
    document.getElementById('schoolYearResult').innerHTML = `<b>Prévia — nenhuma alteração realizada</b><div>${moved} aluno(s) remanejados e ${repeated} repetente(s), em ${classKeys.size} turma(s) de ${year}.</div><div>${transferred} aluno(s) transferido(s), com todo o histórico preservado.</div><div>${pending.length} aluno(s) com situação ainda não definida.</div><div>As turmas anteriores serão arquivadas, nunca excluídas.</div>`;
    document.getElementById('schoolYearResult').classList.remove('hidden');
    analyzed = pending.length ? null : { year, assignments };
    document.getElementById('schoolYearConfirm').disabled = pending.length > 0;
    if (pending.length) toast('Resolva as situações ainda não definidas antes de confirmar.');
  };
  document.getElementById('schoolYearConfirm').onclick = async () => {
    if (!analyzed || !canPrepare()) return;
    if (!confirm(`Confirmar a preparação do ano letivo de ${analyzed.year}? Esta ação movimentará todos os alunos ativos da escola.`)) return;
    const schoolId = window.getActiveSchoolId?.(); if (!schoolId) return;
    document.getElementById('schoolYearConfirm').disabled = true;
    const { data, error } = await db.rpc('apply_school_year_transition', { target_school_id:schoolId, target_school_year:analyzed.year, assignments:analyzed.assignments });
    if (error) { toast(error.message); return; }
    let photoCleanupFailed = false;
    if (data.removed_photo_paths?.length) {
      const { error:photoError } = await db.storage.from('student-photos').remove(data.removed_photo_paths);
      photoCleanupFailed = !!photoError;
    }
    modal.classList.add('hidden'); await load();
    toast(photoCleanupFailed ? `Ano ${data.school_year} preparado. Algumas fotos de transferidos permaneceram no armazenamento.` : `Ano ${data.school_year} preparado: ${data.students_moved} aluno(s) remanejados.`);
  };
  modal.querySelector('[data-year-close]').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  document.addEventListener('carometro:school-context-ready', refreshVisibility);
  document.addEventListener('carometro:permission-refresh', refreshVisibility);
});
