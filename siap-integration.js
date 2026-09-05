document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const SHIFTS = ['Matutino','Vespertino','Noturno'];
  const attendanceByStudentId = new Map();
  let activeRequestId = null;
  let returnModal = null;
  let returnFocus = null;
  const modal = document.createElement('div');
  modal.id = 'siapIntegrationModal';
  modal.className = 'modal-bg siap-integration-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'siapIntegrationTitle');
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3 id="siapIntegrationTitle">Assistente SIAP</h3><div id="siapIntegrationMeta" class="meta"></div></div><button class="close" type="button" aria-label="Fechar" data-siap-close>×</button></div><div id="siapIntegrationContent" class="siap-integration-content"></div></div>`;
  document.body.appendChild(modal);
  const style = document.createElement('style');
  style.textContent = `
    body.carometro-modal-open{overflow:hidden!important}.modal-bg{overscroll-behavior:contain}
    .siap-integration-modal{z-index:340!important;overscroll-behavior:contain}.siap-integration-modal .modal{width:min(780px,100%);overscroll-behavior:contain}.siap-integration-content{padding:24px}
    .siap-brand-card{display:grid;grid-template-columns:58px 1fr;gap:15px;align-items:center;padding:18px;border:1px solid #cbd9f6;border-radius:16px;background:linear-gradient(145deg,#f8faff,#edf3ff)}
    .siap-brand-mark{width:58px;height:58px;border-radius:17px;display:grid;place-items:center;background:#17233a;color:#82aeff;font-size:30px;font-weight:900}.siap-brand-card h4{margin:0 0 5px;font-size:18px}.siap-brand-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
    .siap-filter-grid{display:grid;grid-template-columns:1fr 2fr;gap:12px;margin-top:18px}.siap-filter-grid label span{display:block;margin-bottom:7px;font-size:12px;font-weight:800;color:var(--muted)}.siap-filter-grid select{width:100%}
    .siap-months{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:15px 0}.siap-month{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;font-size:13px;font-weight:700}.siap-month input{width:auto;min-height:0}
    .siap-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.siap-feature{padding:15px;border:1px solid var(--line);border-radius:13px;background:#fff}.siap-feature strong{display:block;margin-bottom:4px}.siap-feature span{color:var(--muted);font-size:12px;line-height:1.45}
    .siap-integration-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.siap-integration-note{margin-top:14px;padding:12px 14px;border-radius:11px;background:#fff8e8;color:#7a5313;font-size:12px;line-height:1.5}.siap-integration-note.error{background:#fff0ed;color:#9f271d}.siap-preview-summary{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.siap-preview-table{width:100%;border-collapse:collapse;font-size:13px}.siap-preview-table th,.siap-preview-table td{padding:10px;border-bottom:1px solid var(--line);text-align:left}.siap-preview-table th{color:var(--muted);font-size:11px;text-transform:uppercase}.student-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.siap-attendance-pill{font-size:11px;font-weight:800;border-radius:99px;padding:5px 9px;display:inline-flex;gap:5px;white-space:nowrap}.siap-frequent{background:#e8f7ef;color:#08784b}.siap-attention{background:#fff4d6;color:#815b00}.siap-critical{background:#fee4e2;color:#b42318}.siap-transferred{background:#e9ecf3;color:#40516f}
    .siap-unknown{background:#e9ecf3;color:#40516f}
    @media(max-width:640px){.siap-filter-grid{grid-template-columns:1fr}.siap-months{grid-template-columns:repeat(2,minmax(0,1fr))}.siap-feature-grid{grid-template-columns:1fr}.siap-integration-actions .btn{width:100%}.siap-preview-table{font-size:11px}.siap-preview-table th,.siap-preview-table td{padding:8px 5px}}
  `;
  document.head.appendChild(style);
  const syncModalLock = () => document.body.classList.toggle('carometro-modal-open', !!document.querySelector('.modal-bg:not(.hidden)'));
  new MutationObserver(syncModalLock).observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] });
  syncModalLock();
  const cancelActiveRequest = () => {
    if (!activeRequestId) return;
    window.postMessage({ source:'CAROMETRO_WEB', type:'SIAP_ATTENDANCE_CANCEL', version:1, requestId:activeRequestId }, location.origin);
    activeRequestId = null;
  };
  const closeModal = () => {
    cancelActiveRequest();
    modal.classList.add('hidden');
    if (returnModal?.isConnected) returnModal.classList.remove('hidden');
    returnModal = null;
    returnFocus?.focus?.();
    returnFocus = null;
  };
  modal.querySelector('[data-siap-close]').onclick = closeModal;
  modal.onclick = event => { if (event.target === modal) closeModal(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
  const assistantInstallUrl = () => String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantInstallUrl || '').trim();
  const openModal = (title, className, content) => {
    returnFocus = document.activeElement;
    const classroomModal = document.getElementById('classroomMapModal');
    if (classroomModal && !classroomModal.classList.contains('hidden')) {
      returnModal = classroomModal;
      classroomModal.classList.add('hidden');
    }
    document.getElementById('siapIntegrationTitle').textContent = title;
    document.getElementById('siapIntegrationMeta').textContent = className || 'Turma selecionada';
    document.getElementById('siapIntegrationContent').innerHTML = content;
    modal.classList.remove('hidden');
    modal.querySelector('[data-siap-close]')?.focus();
  };
  const safe = value => esc(String(value || ''));

  window.getSiapAttendanceBadge = studentId => {
    const item = attendanceByStudentId.get(String(studentId));
    if (!item) return '';
    const percentage = item.classification.percentage;
    return `<span class="siap-attendance-pill siap-${item.classification.key}" title="Frequência SIAP · ${safe(item.periodLabel || 'período selecionado')}">${safe(item.classification.label)}${percentage === null ? '' : ` · ${percentage}%`}</span>`;
  };

  function attendanceForm(classId, className) {
    const currentMonth = new Date().getMonth();
    const selectedClass = classes.find(item => String(item.id) === String(classId));
    const currentShift = String(selectedClass?.shift || '').trim();
    const shifts = SHIFTS.map(shift => `<option value="${safe(shift)}" ${shift.toLowerCase() === currentShift.toLowerCase() ? 'selected' : ''}>${safe(shift)}</option>`).join('');
    const checks = MONTHS.map((month, index) => `<label class="siap-month"><input type="checkbox" data-siap-month="${index}" ${index === currentMonth ? 'checked' : ''}><span>${month}</span></label>`).join('');
    openModal('Frequência SIAP', className, `
      <section class="siap-brand-card"><div class="siap-brand-mark">%</div><div><h4>Buscar frequência no SIAP</h4><p>A extensão localizará esta turma na sessão autenticada do SIAP e devolverá uma prévia, sem modificar chamadas.</p></div></section>
      <div class="siap-filter-grid"><label><span>Turno</span><select id="siapAttendanceShift">${currentShift && !SHIFTS.some(item => item.toLowerCase() === currentShift.toLowerCase()) ? `<option value="${safe(currentShift)}" selected>${safe(currentShift)}</option>` : ''}${shifts}</select></label><label><span>Componente curricular</span><select id="siapAttendanceComponent" disabled><option value="">Consulte o SIAP primeiro</option></select></label></div>
      <div class="siap-integration-actions"><button id="requestSiapComponents" class="btn primary" type="button">Consultar componentes no SIAP</button></div>
      <h4 style="margin:18px 0 0">Meses para leitura</h4><div class="siap-months">${checks}</div>
      <div class="siap-integration-note">A correspondência será feita pelo nome, nunca pela posição na lista. Nomes ambíguos ficarão pendentes para conferência.</div>
      <div id="siapAttendanceStatus" aria-live="polite"></div>
      <div class="siap-integration-actions"><button id="requestSiapAttendance" class="btn primary" type="button" disabled>Buscar frequência no SIAP</button><button id="closeSiapAttendance" class="btn secondary" type="button">Voltar</button></div>`);
    document.getElementById('closeSiapAttendance').onclick = closeModal;
    document.getElementById('requestSiapComponents').onclick = () => requestComponents(classId, className);
    document.getElementById('requestSiapAttendance').onclick = () => requestAttendance(classId, className);
    document.getElementById('siapAttendanceShift').onchange = () => {
      const component = document.getElementById('siapAttendanceComponent');
      component.disabled = true;
      component.innerHTML = '<option value="">Consulte o SIAP novamente</option>';
      document.getElementById('requestSiapAttendance').disabled = true;
      setStatus('O turno mudou. Consulte novamente os componentes disponíveis.');
    };
  }

  function setStatus(html, error = false) {
    const target = document.getElementById('siapAttendanceStatus');
    if (target) target.innerHTML = html ? `<div class="siap-integration-note${error ? ' error' : ''}">${html}</div>` : '';
  }

  function clearAttendancePreview() {
    modal.querySelectorAll('.siap-preview-summary,.siap-preview-table').forEach(element => element.remove());
  }

  function requestComponents(classId, className) {
    const shift = document.getElementById('siapAttendanceShift')?.value || '';
    if (!shift) return setStatus('Escolha o turno antes de consultar os componentes.', true);
    cancelActiveRequest();
    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    const component = document.getElementById('siapAttendanceComponent');
    if (component) { component.disabled = true; component.innerHTML = '<option value="">Consultando o SIAP…</option>'; }
    const button = document.getElementById('requestSiapComponents');
    if (button) { button.disabled = true; button.textContent = 'Consultando…'; }
    document.getElementById('requestSiapAttendance').disabled = true;
    setStatus('Localizando a turma e os componentes curriculares no SIAP…');
    window.postMessage({ source:'CAROMETRO_WEB', type:'SIAP_COMPONENTS_REQUEST', version:1, payload:{ requestId, classId:String(classId), className, shift } }, location.origin);
  }

  function requestAttendance(classId, className) {
    const months = [...modal.querySelectorAll('[data-siap-month]:checked')].map(input => Number(input.dataset.siapMonth));
    if (!months.length) return setStatus('Selecione pelo menos um mês.', true);
    const selectedClass = classes.find(item => String(item.id) === String(classId));
    const shift = document.getElementById('siapAttendanceShift')?.value || selectedClass?.shift || '';
    const componentSelect = document.getElementById('siapAttendanceComponent');
    const componentId = componentSelect?.value || '';
    const componentLabel = componentSelect?.selectedOptions?.[0]?.textContent || '';
    if (!shift) return setStatus('Escolha o turno.', true);
    if (!componentId) return setStatus('Consulte o SIAP e escolha um componente curricular.', true);
    cancelActiveRequest();
    students.filter(student => String(student.classId) === String(classId)).forEach(student => attendanceByStudentId.delete(String(student.id)));
    render();
    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    clearAttendancePreview();
    const button = document.getElementById('requestSiapAttendance');
    if (button) { button.disabled = true; button.textContent = 'Procurando o SIAP…'; }
    setStatus('Verificando a extensão e a sessão autenticada do SIAP…');
    window.postMessage({ source:'CAROMETRO_WEB', type:'SIAP_ATTENDANCE_REQUEST', version:1, payload:{ requestId, classId:String(classId), className, shift, componentId, componentLabel, schoolId:window.getActiveSchoolId?.() || '', months, year:new Date().getFullYear() } }, location.origin);
    setTimeout(() => {
      if (activeRequestId !== requestId) return;
      cancelActiveRequest();
      const currentButton = document.getElementById('requestSiapAttendance');
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = 'Tentar novamente'; }
      setStatus('A extensão não respondeu. Confirme se o Assistente SIAP está instalado e atualizado.', true);
    }, 660000);
  }

  function renderPreview(payload) {
    clearAttendancePreview();
    const classStudents = students.filter(student => String(student.classId) === String(payload.classId));
    classStudents.forEach(student => attendanceByStudentId.delete(String(student.id)));
    const result = window.CarometroSiapAttendance.matchStudents(classStudents, payload.students || []);
    result.matches.forEach(item => attendanceByStudentId.set(String(item.student.id), { classification:window.CarometroSiapAttendance.classifyAttendance(item.attendance), periodLabel:payload.periodLabel || '' }));
    render();
    const rows = result.matches.map(item => {
      const classification = window.CarometroSiapAttendance.classifyAttendance(item.attendance);
      return `<tr><td>${safe(item.student.name)}</td><td><span class="siap-attendance-pill siap-${classification.key}">${safe(classification.label)}</span></td><td>${classification.percentage === null ? '—' : `${classification.percentage}%`}</td><td>${item.method === 'exact-name' ? 'Nome confirmado' : 'Nome semelhante'}</td></tr>`;
    }).join('');
    const warnings = result.conflicts.length + result.unmatched.length + result.missing.length;
    setStatus(`<strong>Prévia recebida.</strong> ${result.matches.length} aluno(s) identificado(s) e ${warnings} pendência(s). Esta prévia não foi gravada.`);
    const target = document.getElementById('siapAttendanceStatus');
    if (target) target.insertAdjacentHTML('afterend', `<div class="siap-preview-summary"><span class="pill light">${result.matches.length} identificados</span><span class="pill ${warnings ? 'report' : 'light'}">${warnings} pendências</span></div>${rows ? `<table class="siap-preview-table"><thead><tr><th>Aluno</th><th>Situação</th><th>Presença</th><th>Correspondência</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'ASSISTENTE_SIAP_EXTENSION') return;
    const payload = event.data.payload || {};
    if (!activeRequestId || payload.requestId !== activeRequestId) return;
    if (event.data.type === 'SIAP_COMPONENTS_RESPONSE') {
      const button = document.getElementById('requestSiapComponents');
      if (payload.accepted) {
        if (button) { button.disabled = true; button.textContent = 'Consultando…'; }
        return setStatus(safe(payload.message || 'Consultando os componentes no SIAP…'));
      }
      activeRequestId = null;
      if (button) { button.disabled = false; button.textContent = 'Consultar novamente'; }
      const select = document.getElementById('siapAttendanceComponent');
      if (!payload.ok) {
        if (select) { select.disabled = true; select.innerHTML = '<option value="">Consulta não concluída</option>'; }
        return setStatus(safe(payload.message || 'Não foi possível consultar os componentes no SIAP.'), true);
      }
      const components = Array.isArray(payload.components) ? payload.components : [];
      if (select) {
        select.innerHTML = `<option value="">Escolha o componente</option>${components.map(item => `<option value="${safe(item.id)}">${safe(item.label)}</option>`).join('')}`;
        select.disabled = !components.length;
      }
      document.getElementById('requestSiapAttendance').disabled = !components.length;
      return setStatus(components.length ? `${components.length} componente(s) encontrado(s). Escolha um componente e os meses.` : 'Nenhum componente curricular foi encontrado.', !components.length);
    }
    if (event.data.type !== 'SIAP_ATTENDANCE_RESPONSE') return;
    const button = document.getElementById('requestSiapAttendance');
    if (payload.accepted) {
      if (button) { button.disabled = true; button.textContent = 'Lendo no SIAP…'; }
      return setStatus(safe(payload.message || 'Localizando a turma no SIAP…'));
    }
    activeRequestId = null;
    if (button) { button.disabled = false; button.textContent = 'Buscar novamente'; }
    if (!payload.ok) return setStatus(safe(payload.message || 'Não foi possível ler a frequência no SIAP.'), true);
    renderPreview(payload);
  });

  window.getSiapPanelActions = ({ permission:rights, canManageClass }) => {
    const admin = rights?.role === 'admin';
    return [admin || rights?.can_use_siap_assistant ? '<button id="openSiapAssistant" type="button" class="btn primary">Assistente SIAP</button>' : '', (admin || rights?.can_import_siap_attendance) && canManageClass ? '<button id="openSiapAttendance" type="button" class="btn primary">Frequência SIAP</button>' : ''].join('');
  };

  window.bindSiapPanelActions = ({ classId, className }) => {
    const assistant = document.getElementById('openSiapAssistant');
    const attendance = document.getElementById('openSiapAttendance');
    if (assistant) assistant.onclick = () => {
      const installUrl = assistantInstallUrl();
      openModal('Assistente SIAP', className, `<section class="siap-brand-card"><div class="siap-brand-mark">✦</div><div><h4>Assistente SIAP do Professor</h4><p>Planejamento, conteúdo, frequência e PEI com revisão do professor e sem captura de credenciais.</p></div></section><div class="siap-feature-grid"><div class="siap-feature"><strong>Instalação controlada</strong><span>O acesso aparece somente para usuários autorizados nesta escola.</span></div><div class="siap-feature"><strong>Privacidade</strong><span>Login e senha do SIAP nunca passam pelo Carômetro.</span></div></div><div class="siap-integration-actions">${installUrl ? `<a class="btn primary" href="${safe(installUrl)}" target="_blank" rel="noopener noreferrer">Instalar extensão</a>` : '<button class="btn primary" type="button" disabled>Link de instalação em preparação</button>'}<button id="closeSiapAssistant" class="btn secondary" type="button">Voltar</button></div>${installUrl ? '' : '<div class="siap-integration-note">O endereço oficial de distribuição da extensão ainda precisa ser configurado.</div>'}`);
      document.getElementById('closeSiapAssistant').onclick = closeModal;
    };
    if (attendance) attendance.onclick = () => attendanceForm(classId, className);
  };
});
