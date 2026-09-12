document.addEventListener('DOMContentLoaded', () => {
  const navHost = document.querySelector('.side .nav');
  if (!navHost || document.getElementById('cepiNav')) return;

  const escapeHtml = value => {
    const node = document.createElement('div');
    node.textContent = value ?? '';
    return node.innerHTML;
  };
  const roleLabel = role => ({ school_admin:'Administrador(a)', coordinator:'Coordenador(a)', teacher:'Professor(a)' }[role] || role || 'Usuário');
  let access = { enabled:false, can_manage:false, tutor_id:null };
  let tutors = [];
  let assignments = [];
  let candidates = [];
  let activityByStudent = new Map();
  const collapsedTutorIds = new Set();
  let accessRefreshPromise = null;
  let accessPollTimer = null;
  let tutorLabelsSchoolId = null;
  let tutorLabelsLoadRequest = null;

  const cepiNav = document.createElement('button');
  cepiNav.id = 'cepiNav';
  cepiNav.type = 'button';
  cepiNav.className = 'hidden';
  cepiNav.innerHTML = '<span>CEPI</span>';
  navHost.insertBefore(cepiNav, document.getElementById('permissionsNav'));

  const modal = document.createElement('div');
  modal.id = 'cepiModal';
  modal.className = 'modal-bg cepi-modal hidden';
  modal.innerHTML = `<section class="modal cepi-dialog">
    <div class="modal-head"><div><span class="cepi-kicker">ESPAÇO CEPI</span><h3 id="cepiTitle">CEPI</h3><div id="cepiSubtitle" class="meta">Funcionalidades específicas da escola de período integral.</div></div><button class="close" id="closeCepi" type="button" aria-label="Fechar">×</button></div>
    <div id="cepiHome" class="form cepi-home">
      <button id="openTutoring" class="cepi-feature-card" type="button"><span class="cepi-feature-icon" aria-hidden="true">◎</span><span><b>Tutoria</b><small>Organize tutores e seus alunos tutorandos.</small></span><strong aria-hidden="true">→</strong></button>
      <button id="openTutoringReport" class="cepi-feature-card" type="button"><span class="cepi-feature-icon" aria-hidden="true">▤</span><span><b>Relatório</b><small>Gere a ficha individual dos atendimentos em PDF.</small></span><strong aria-hidden="true">→</strong></button>
    </div>
    <div id="cepiTutoring" class="form hidden">
      <div class="cepi-toolbar"><button id="backToCepi" type="button" class="btn secondary">← CEPI</button><div id="cepiManagementActions" class="cepi-actions hidden"><button id="newTutor" type="button" class="btn secondary">＋ Tutor</button><button id="newAssignment" type="button" class="btn primary">＋ Distribuir alunos</button></div></div>
      <div class="cepi-filters"><div class="field"><label for="cepiTutorFilter">Tutor</label><input id="cepiTutorFilter" placeholder="Buscar tutor"></div><div class="field"><label for="cepiStudentFilter">Aluno tutorando</label><input id="cepiStudentFilter" placeholder="Buscar aluno"></div><div class="field"><label for="cepiClassFilter">Turma</label><select id="cepiClassFilter"><option value="">Todas as turmas</option></select></div></div>
      <div class="cepi-summary" id="cepiSummary"></div>
      <div id="cepiAssignments" class="cepi-assignment-list"></div>
    </div>
  </section>`;
  document.body.appendChild(modal);

  const tutorModal = document.createElement('div');
  tutorModal.id = 'cepiTutorModal';
  tutorModal.className = 'modal-bg cepi-modal hidden';
  tutorModal.innerHTML = `<section class="modal small"><div class="modal-head"><div><h3 id="cepiTutorModalTitle">Cadastrar tutor</h3><div class="meta">O tutor pode ter ou não acesso ao CARÔMETRO.</div></div><button class="close" type="button" data-cepi-close="cepiTutorModal">×</button></div><form id="cepiTutorForm" class="form"><input id="cepiTutorId" type="hidden">
    <div class="field"><label for="cepiTutorType">Tipo de tutor</label><select id="cepiTutorType"><option value="internal">Usuário do CARÔMETRO</option><option value="external">Sem acesso ao CARÔMETRO</option></select></div>
    <div id="cepiInternalTutorField" class="field"><label for="cepiTutorMember">Usuário</label><select id="cepiTutorMember" required></select></div>
    <div id="cepiExternalTutorFields" class="hidden"><div class="field"><label for="cepiTutorName">Nome completo</label><input id="cepiTutorName" maxlength="160"></div><div class="field"><label for="cepiTutorEmail">E-mail (opcional)</label><input id="cepiTutorEmail" type="email" maxlength="320"></div><div class="hint">Este cadastro serve apenas como registro. A pessoa não receberá acesso nem notificação no sistema.</div></div>
    <div class="actions"><button class="btn secondary" type="button" data-cepi-close="cepiTutorModal">Cancelar</button><button class="btn primary" type="submit">Salvar tutor</button></div>
  </form></section>`;
  document.body.appendChild(tutorModal);

  const assignmentModal = document.createElement('div');
  assignmentModal.id = 'cepiAssignmentModal';
  assignmentModal.className = 'modal-bg cepi-modal hidden';
  assignmentModal.innerHTML = `<section class="modal"><div class="modal-head"><div><h3>Distribuir alunos</h3><div class="meta">Selecione um tutor e alunos de quaisquer turmas.</div></div><button class="close" type="button" data-cepi-close="cepiAssignmentModal">×</button></div><form id="cepiAssignmentForm" class="form">
    <div class="field"><label for="cepiAssignmentTutor">Tutor</label><select id="cepiAssignmentTutor" required></select></div>
    <div class="cepi-filter-grid"><div class="field"><label for="cepiAssignmentClass">Turma</label><select id="cepiAssignmentClass"><option value="">Todas as turmas</option></select></div><div class="field"><label for="cepiAssignmentName">Nome do aluno</label><input id="cepiAssignmentName" placeholder="Buscar por nome"></div></div>
    <div class="field"><label for="cepiAssignmentStudents">Alunos tutorandos</label><select id="cepiAssignmentStudents" class="cepi-student-select" multiple size="10" required></select><div class="meta">No computador, use Ctrl para selecionar vários alunos.</div></div>
    <div class="actions"><button class="btn secondary" type="button" data-cepi-close="cepiAssignmentModal">Cancelar</button><button class="btn primary" type="submit">Confirmar distribuição</button></div>
  </form></section>`;
  document.body.appendChild(assignmentModal);

  const reportModal = document.createElement('div');
  reportModal.id = 'cepiReportModal';
  reportModal.className = 'modal-bg cepi-modal hidden';
  reportModal.innerHTML = `<section class="modal small"><div class="modal-head"><div><h3>Relatório da Tutoria</h3><div class="meta">Ficha individual com atendimentos, perguntas e respostas.</div></div><button class="close" type="button" data-cepi-close="cepiReportModal">×</button></div><form id="cepiReportForm" class="form">
    <div class="field"><label for="cepiReportTutor">Tutor</label><select id="cepiReportTutor"><option value="">Todos os tutores</option></select></div>
    <div class="cepi-filter-grid"><div class="field"><label for="cepiReportName">Nome do aluno</label><input id="cepiReportName" placeholder="Buscar por nome"></div><div class="field"><label for="cepiReportClass">Turma</label><select id="cepiReportClass"><option value="">Todas as turmas</option></select></div></div>
    <div class="field"><label for="cepiReportStudent">Aluno tutorando</label><select id="cepiReportStudent" required></select></div>
    <div class="hint">O PDF contém somente foto, nome, turma, datas dos atendimentos e as perguntas e respostas das fichas.</div>
    <div class="actions"><button class="btn secondary" type="button" data-cepi-close="cepiReportModal">Cancelar</button><button class="btn primary" type="submit">Gerar PDF</button></div>
  </form></section>`;
  document.body.appendChild(reportModal);

  const transferModal = document.createElement('div');
  transferModal.id = 'cepiTransferModal';
  transferModal.className = 'modal-bg cepi-modal hidden';
  transferModal.innerHTML = `<section class="modal small"><div class="modal-head"><div><h3>Trocar tutor</h3><div class="meta" id="cepiTransferStudentName"></div></div><button class="close" type="button" data-cepi-close="cepiTransferModal">×</button></div><form id="cepiTransferForm" class="form"><input id="cepiTransferAssignment" type="hidden"><div class="field"><label for="cepiTransferTutor">Novo tutor</label><select id="cepiTransferTutor" required></select></div><div class="actions"><button class="btn secondary" type="button" data-cepi-close="cepiTransferModal">Cancelar</button><button class="btn primary" type="submit">Confirmar troca</button></div></form></section>`;
  document.body.appendChild(transferModal);

  const formModal = document.createElement('div');
  formModal.id = 'cepiFormModal';
  formModal.className = 'modal-bg cepi-modal hidden';
  formModal.innerHTML = `<section class="modal cepi-form-dialog"><div class="modal-head"><div><span class="cepi-kicker">FICHA INDIVIDUAL</span><h3 id="cepiFormTitle">Novo atendimento</h3><div class="cepi-form-student"><strong id="cepiFormStudentName"></strong><span class="meta" id="cepiFormStudentClass"></span><div id="cepiFormStudentLabels" class="cepi-form-student-labels"></div></div></div><button class="close" type="button" data-cepi-close="cepiFormModal">×</button></div><form id="cepiAttendanceForm" class="form"><input id="cepiFormAssignment" type="hidden"><input id="cepiFormId" type="hidden">
    <div class="cepi-form-section"><h4>Identificação e projetos</h4><div class="cepi-filter-grid"><div class="field"><label for="cepiFormDate">Data do atendimento</label><input id="cepiFormDate" type="date" required></div><div class="field"><label>Turma</label><input id="cepiFormClass" readonly></div></div><div class="cepi-filter-grid"><div class="field"><label for="cepiScientific">Iniciação Científica (EF)</label><input id="cepiScientific"></div><div class="field"><label for="cepiLifeProject">Projeto de Vida (EM)</label><input id="cepiLifeProject"></div></div><h4>Projeto de Eletiva</h4><div class="cepi-project-terms"><div class="field"><label for="cepiElective1">1º semestre</label><input id="cepiElective1"></div><div class="field"><label for="cepiElective2">2º semestre</label><input id="cepiElective2"></div></div><h4>PJ</h4><div class="cepi-project-terms"><div class="field"><label for="cepiPj1">1º semestre</label><input id="cepiPj1"></div><div class="field"><label for="cepiPj2">2º semestre</label><input id="cepiPj2"></div></div></div>
    <div class="cepi-form-section"><h4>Desenvolvimento do estudante</h4><div class="field"><label>Competências trabalhadas</label><div class="cepi-competencies"><label><input type="checkbox" name="cepiCompetency" value="Pessoal — Aprender a ser"> Pessoal — Aprender a ser</label><label><input type="checkbox" name="cepiCompetency" value="Social-relacional — Aprender a conviver"> Social-relacional — Aprender a conviver</label><label><input type="checkbox" name="cepiCompetency" value="Cognitiva — Aprender a conhecer"> Cognitiva — Aprender a conhecer</label><label><input type="checkbox" name="cepiCompetency" value="Produtiva — Aprender a fazer"> Produtiva — Aprender a fazer</label></div></div><div class="field"><label for="cepiNarrative">Relato do atendimento</label><textarea id="cepiNarrative" required></textarea></div><div class="field"><label for="cepiAgreements">Orientações e combinados</label><textarea id="cepiAgreements" required></textarea></div></div>
    <div class="cepi-form-section"><h4>Dificuldades no desenvolvimento acadêmico</h4><div class="cepi-filter-grid"><div class="field"><label for="cepiSubject">Componente curricular</label><input id="cepiSubject"></div><div class="field"><label for="cepiTerm">Bimestre</label><select id="cepiTerm"><option value="">Selecione</option><option>1º bimestre</option><option>2º bimestre</option><option>3º bimestre</option><option>4º bimestre</option></select></div></div><div class="field"><label for="cepiDifficulty">Dificuldade identificada</label><textarea id="cepiDifficulty"></textarea></div><div class="field"><label for="cepiDirections">Direcionamentos</label><textarea id="cepiDirections"></textarea></div></div>
    <div class="cepi-form-section"><h4>Ciência do tutorando</h4><label class="cepi-ack"><input id="cepiAcknowledged" type="checkbox"> O registro foi lido e discutido com o tutorando</label><div class="field"><label for="cepiAcknowledgedName">Nome do estudante</label><input id="cepiAcknowledgedName" readonly></div><div class="field"><label for="cepiInternalNotes">Observações internas do tutor <span class="meta">(não aparecem no PDF)</span></label><textarea id="cepiInternalNotes"></textarea></div></div>
    <div class="actions"><button id="saveCepiDraft" class="btn secondary" type="button">Salvar rascunho</button><button class="btn primary" type="submit">Concluir ficha</button></div></form></section>`;
  document.body.appendChild(formModal);

  const historyModal = document.createElement('div');
  historyModal.id = 'cepiHistoryModal';
  historyModal.className = 'modal-bg cepi-modal hidden';
  historyModal.innerHTML = `<section class="modal cepi-form-dialog"><div class="modal-head"><div><h3>Histórico de atendimentos</h3><div id="cepiHistoryStudent" class="meta"></div></div><button class="close" type="button" data-cepi-close="cepiHistoryModal">×</button></div><div id="cepiHistoryList" class="form"></div></section>`;
  document.body.appendChild(historyModal);

  const style = document.createElement('style');
  style.textContent = `
    #cepiNav{border:1px solid #7187b1;background:#243654;color:#fff;letter-spacing:.08em}#cepiNav:hover,#cepiNav:focus{background:#38527e}
    .cepi-modal{z-index:220}.cepi-dialog{width:min(1040px,100%)}.cepi-form-dialog{width:min(880px,100%)}.cepi-form-section{padding:16px;border:1px solid var(--line);border-radius:12px;background:#fbfcff;margin-bottom:14px}.cepi-form-section h4{margin:0 0 14px}.cepi-competencies{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cepi-competencies label,.cepi-ack{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #dfe5ef;border-radius:9px;background:#fff;font-weight:650}.cepi-competencies input,.cepi-ack input{width:auto;min-height:0}.cepi-history-item{border:1px solid var(--line);border-radius:11px;padding:14px;margin-bottom:10px}.cepi-history-head{display:flex;justify-content:space-between;gap:10px}.cepi-history-body{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}.cepi-history-body dl{display:grid;grid-template-columns:190px 1fr;gap:8px;margin:0}.cepi-history-body dt{font-weight:750}.cepi-history-body dd{margin:0;white-space:pre-wrap}.cepi-kicker{display:block;color:var(--blue);font-size:11px;font-weight:850;letter-spacing:.12em;margin-bottom:4px}.cepi-home{min-height:280px;display:grid;grid-template-columns:repeat(2,minmax(0,430px));align-content:start;gap:14px}.cepi-feature-card{width:100%;display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:16px;text-align:left;padding:22px;border:1px solid #d8e1f1;border-radius:16px;background:linear-gradient(145deg,#fff,#f4f7ff);color:var(--navy);box-shadow:0 10px 28px #173b8f12}.cepi-feature-card:hover{border-color:#8ca9ed;transform:translateY(-1px)}.cepi-feature-card b,.cepi-feature-card small{display:block}.cepi-feature-card b{font-size:18px}.cepi-feature-card small{color:var(--muted);margin-top:5px}.cepi-feature-icon{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:#e8efff;color:#315dbb;font-size:27px}.cepi-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px}.cepi-actions,.cepi-tutor-actions{display:flex;gap:8px;align-items:center}.cepi-filters{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cepi-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cepi-filters .field{margin-bottom:10px}.cepi-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}.cepi-summary article{padding:14px;border:1px solid var(--line);border-radius:10px;background:#f8faff}.cepi-summary b{display:block;font-size:23px;margin-top:5px}.cepi-assignment-list{display:grid;gap:14px}.cepi-tutor-group{border:1px solid var(--line);border-radius:12px;overflow:hidden}.cepi-tutor-head{padding:15px 17px;background:#f7f9fc;display:flex;align-items:center;justify-content:space-between;gap:12px}.cepi-tutor-head b,.cepi-tutor-head small{display:block}.cepi-tutor-head small{color:var(--muted);margin-top:3px}.cepi-students{padding:7px 17px}.cepi-student-row{display:grid;grid-template-columns:92px minmax(190px,1fr) minmax(260px,auto);gap:16px;align-items:start;padding:18px 0;border-bottom:1px solid #edf0f4}.cepi-student-row:last-child{border:0}.cepi-student-photo{width:84px;height:84px;border-radius:50%;background:#e8efff;display:grid;place-items:center;overflow:hidden;font-size:20px;font-weight:850;color:#315dbb}.cepi-student-photo img{width:100%;height:100%;object-fit:cover}.cepi-student-info b,.cepi-student-info small{display:block}.cepi-student-info b{font-size:16px}.cepi-student-info small{color:var(--muted);margin-top:3px}.cepi-student-labels,.cepi-student-status{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cepi-student-labels span,.cepi-student-status span{padding:5px 8px;border-radius:8px;background:#f4f6fa;font-size:12px}.cepi-row-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.cepi-student-expanded{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:12px;border-radius:10px;background:#f8faff}.cepi-student-expanded section{padding:12px;background:#fff;border:1px solid var(--line);border-radius:9px}.cepi-student-expanded ul{margin:8px 0 0;padding-left:18px;color:#536178;font-size:12px;line-height:1.5}.cepi-student-select{min-height:230px;padding:8px}.cepi-empty{padding:34px;text-align:center;color:var(--muted)}.student-tutor-label{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:99px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:750}
    .cepi-project-terms{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.cepi-form-student{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px}.cepi-form-student>strong{font-size:18px;line-height:1.25;color:var(--navy)}.cepi-form-student-labels{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.cepi-form-student-labels span{display:inline-flex;align-items:center;padding:4px 8px;border-radius:99px;background:#d1fae5;color:#047857;font-size:12px;font-weight:750}.cepi-student-labels .cepi-leadership-label{background:#d1fae5;color:#047857;font-weight:800}.student-tutor-detail-label{margin-left:7px;vertical-align:middle}
    @media(max-width:800px){.cepi-modal{padding:8px;align-items:start;overflow:auto}.cepi-dialog{max-height:calc(100dvh - 16px)}.cepi-home,.cepi-filters,.cepi-filter-grid,.cepi-competencies,.cepi-project-terms{grid-template-columns:1fr}.cepi-toolbar{align-items:stretch;flex-direction:column}.cepi-actions{display:grid;grid-template-columns:1fr 1fr}.cepi-summary{grid-template-columns:1fr}.cepi-student-row{grid-template-columns:76px 1fr}.cepi-student-photo{width:68px;height:68px;font-size:17px}.cepi-row-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr}.cepi-row-actions .btn{width:100%}.cepi-tutor-head{align-items:flex-start;flex-direction:column}.cepi-tutor-actions{width:100%;flex-wrap:wrap}.cepi-student-expanded{grid-template-columns:1fr}.cepi-history-body dl{grid-template-columns:1fr}.cepi-history-body dd{margin-bottom:8px}}
  `;
  document.head.appendChild(style);

  const closeModal = id => document.getElementById(id)?.classList.add('hidden');
  document.querySelectorAll('[data-cepi-close]').forEach(button => button.onclick = () => closeModal(button.dataset.cepiClose));
  [modal, tutorModal, assignmentModal, reportModal, transferModal, formModal, historyModal].forEach(item => item.onclick = event => { if (event.target === item) closeModal(item.id); });
  document.getElementById('closeCepi').onclick = () => closeModal('cepiModal');

  async function refreshAccess() {
    if (accessRefreshPromise) return accessRefreshPromise;
    accessRefreshPromise = (async () => {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) { access = { enabled:false, can_manage:false, tutor_id:null }; cepiNav.classList.add('hidden'); return; }
    const { data, error } = await db.rpc('get_cepi_access_context', { p_school_id:schoolId });
    if (error) { access = { enabled:false, can_manage:false, tutor_id:null }; cepiNav.classList.add('hidden'); return; }
    access = (Array.isArray(data) ? data[0] : data) || { enabled:false, can_manage:false, tutor_id:null };
    cepiNav.classList.toggle('hidden', access.enabled !== true);
    document.getElementById('cepiManagementActions').classList.toggle('hidden', access.can_manage !== true);
    if (access.enabled) await loadTutorLabels();
    else {
      tutorLabelsSchoolId = null;
      tutors = [];
      assignments = [];
      decorateMainStudentCards();
      closeModal('cepiModal');
    }
    })().finally(() => { accessRefreshPromise = null; });
    return accessRefreshPromise;
  }

  const startAccessPolling = () => {
    if (accessPollTimer) clearInterval(accessPollTimer);
    accessPollTimer = setInterval(() => {
      if (!document.hidden && !document.getElementById('app')?.classList.contains('hidden')) refreshAccess();
    }, 2500);
  };

  function showCepiHome() {
    document.getElementById('cepiTitle').textContent = 'CEPI';
    document.getElementById('cepiSubtitle').textContent = 'Funcionalidades específicas da escola de período integral.';
    document.getElementById('cepiHome').classList.remove('hidden');
    document.getElementById('cepiTutoring').classList.add('hidden');
  }

  async function loadTutorLabels() {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !access.enabled) return;
    if (tutorLabelsSchoolId === schoolId) { decorateMainStudentCards(); return; }
    if (tutorLabelsLoadRequest?.schoolId === schoolId) return tutorLabelsLoadRequest.promise;
    const promise = (async () => {
      const [tutorResult, assignmentResult] = await Promise.all([
        db.from('cepi_tutors').select('id,display_name').eq('school_id', schoolId).eq('active', true).order('display_name'),
        db.from('cepi_tutor_students').select('id,tutor_id,student_id').eq('school_id', schoolId).eq('active', true).order('assigned_at')
      ]);
      if (tutorResult.error || assignmentResult.error || window.getActiveSchoolId?.() !== schoolId) return;
      tutors = tutorResult.data || [];
      assignments = assignmentResult.data || [];
      tutorLabelsSchoolId = schoolId;
      decorateMainStudentCards();
    })();
    tutorLabelsLoadRequest = { schoolId, promise };
    try { return await promise; }
    finally { if (tutorLabelsLoadRequest?.promise === promise) tutorLabelsLoadRequest = null; }
  }

  async function loadTutoring() {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !access.enabled) return;
    const jobs = [
      db.from('cepi_tutors').select('*').eq('school_id', schoolId).eq('active', true).order('display_name'),
      db.from('cepi_tutor_students').select('*,students(full_name,class_name,class_id,has_report)').eq('school_id', schoolId).eq('active', true).order('assigned_at')
    ];
    if (access.can_manage) jobs.push(db.rpc('list_cepi_tutor_candidates', { p_school_id:schoolId }));
    const [tutorResult, assignmentResult, candidateResult] = await Promise.all(jobs);
    if (tutorResult.error || assignmentResult.error || candidateResult?.error) {
      toast('Não foi possível carregar a Tutoria agora.');
      return;
    }
    tutors = tutorResult.data || [];
    assignments = assignmentResult.data || [];
    tutorLabelsSchoolId = schoolId;
    candidates = candidateResult?.data || [];
    const studentIds = assignments.map(item => item.student_id);
    if (studentIds.length) {
      const { data:activityRows, error:activityError } = await db.rpc('get_cepi_tutored_student_activity', { p_school_id:schoolId, p_student_ids:studentIds });
      activityByStudent = activityError ? new Map() : new Map((activityRows || []).map(item => [item.student_id, item]));
    } else activityByStudent = new Map();
    renderTutoring();
    document.getElementById('cepiClassFilter').innerHTML = classOptionsHtml(assignments);
    decorateMainStudentCards();
  }

  const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const studentSortName = value => normalizeSearch(value).replace(/^\d+\s*[.)ºª-]?\s*/, '');
  const compareStudentNames = (a,b) => studentSortName(a).localeCompare(studentSortName(b), 'pt-BR', { sensitivity:'base' });
  const distinctClasses = items => [...new Map(items.map(item => {
    const student = students.find(entry => entry.id === item.student_id);
    return [student?.classId || item.students?.class_id, student?.className || item.students?.class_name];
  }).filter(([id]) => id)).entries()].sort((a,b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR', { numeric:true }));
  const classOptionsHtml = (items, firstLabel='Todas as turmas') => `<option value="">${firstLabel}</option>` + distinctClasses(items).map(([id,name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name || 'Sem turma')}</option>`).join('');
  const attendanceLabel = status => ({ frequent:'Frequente', absent:'Faltoso', active_search:'Busca ativa' }[status] || 'Sem frequência informada');
  function tutorStatusHtml(student, activity) {
    const uniform = window.uniformStateByStudent?.get(student?.id) || student || {};
    const uniformState = window.deriveUniformPendingState?.(uniform) || '';
    const materialPending = window.isUniformMaterialPending?.(uniform) || false;
    const attendance = activity?.attendance?.[0];
    const latestBook = activity?.livro_revisa?.[0];
    return [
      `Ocorrências: ${activity?.occurrences?.length || 0}`,
      `Frequência: ${attendance ? `${attendanceLabel(attendance.status)} · ${attendance.percentage}%` : 'sem informação'}`,
      `Uniforme: ${['uniform','both'].includes(uniformState) ? 'pendente' : 'recebido'}`,
      `Tênis: ${['shoes','both'].includes(uniformState) ? 'pendente' : 'recebido'}`,
      `Material: ${materialPending ? 'pendente' : 'recebido'}`,
      `Livro/Revisa: ${latestBook ? `${latestBook.status} · ${latestBook.bimester}º bim.` : 'sem informação'}`
    ].map(label => `<span>${escapeHtml(label)}</span>`).join('');
  }

  function decorateMainStudentCards() {
    const tutorByStudent = new Map(assignments.map(item => [item.student_id, tutors.find(tutor => tutor.id === item.tutor_id)?.display_name]).filter(([, name]) => name));
    document.querySelectorAll('#list .student').forEach(card => {
      const studentId = card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
      const existing = card.querySelector('.student-tutor-label');
      const tutorName = tutorByStudent.get(studentId);
      if (!tutorName) { existing?.remove(); return; }
      if (existing?.textContent === `Tutor(a): ${tutorName}`) return;
      existing?.remove();
      const label = document.createElement('span');
      label.className = 'student-tutor-label';
      label.textContent = `Tutor(a): ${tutorName}`;
      card.querySelector('.name')?.parentElement?.appendChild(label);
    });
    decorateStudentDetails();
  }

  function decorateStudentDetails() {
    const detail = document.getElementById('studentDetails');
    const name = detail?.querySelector('.detail-head h3')?.textContent.trim();
    const classRow = [...(detail?.querySelectorAll('.detail-row') || [])].find(row => row.querySelector('b')?.textContent.trim() === 'Turma');
    const existing = classRow?.querySelector('.student-tutor-detail-label');
    if (!name || !classRow) { existing?.remove(); return; }
    const className = [...classRow.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())?.textContent.trim();
    const student = students.find(item => item.name === name && (!className || item.className === className));
    const assignment = assignments.find(item => item.student_id === student?.id);
    const tutorName = tutors.find(item => item.id === assignment?.tutor_id)?.display_name;
    if (!tutorName) { existing?.remove(); return; }
    const labelText = `Tutor(a): ${tutorName}`;
    const counselor = classRow.querySelector('.counselor-label');
    if (existing?.textContent === labelText) {
      if (counselor && counselor.nextElementSibling !== existing) counselor.insertAdjacentElement('afterend', existing);
      return;
    }
    existing?.remove();
    const label = document.createElement('span');
    label.className = 'representative-label student-tutor-label student-tutor-detail-label';
    label.textContent = labelText;
    counselor ? counselor.insertAdjacentElement('afterend', label) : classRow.appendChild(label);
  }

  function renderTutoring() {
    const target = document.getElementById('cepiAssignments');
    const activeTutorIds = new Set(assignments.map(item => item.tutor_id));
    const tutorQuery = normalizeSearch(document.getElementById('cepiTutorFilter').value);
    const studentQuery = normalizeSearch(document.getElementById('cepiStudentFilter').value);
    const classId = document.getElementById('cepiClassFilter').value;
    const filteredAssignments = assignments.filter(item => {
      const tutor = tutors.find(entry => entry.id === item.tutor_id);
      const student = students.find(entry => entry.id === item.student_id);
      return (!tutorQuery || normalizeSearch(tutor?.display_name).includes(tutorQuery))
        && (!studentQuery || normalizeSearch(student?.name || item.students?.full_name).includes(studentQuery))
        && (!classId || (student?.classId || item.students?.class_id) === classId);
    });
    const visibleTutors = tutors.filter(tutor => (!tutorQuery || normalizeSearch(tutor.display_name).includes(tutorQuery)) && (!studentQuery && !classId || filteredAssignments.some(item => item.tutor_id === tutor.id)));
    document.getElementById('cepiSummary').innerHTML = `<article><span class="meta">Tutores ativos</span><b>${tutors.length}</b></article><article><span class="meta">Alunos tutorandos</span><b>${assignments.length}</b></article><article><span class="meta">Turmas alcançadas</span><b>${new Set(assignments.map(item => item.students?.class_id).filter(Boolean)).size}</b></article>`;
    if (!tutors.length) {
      target.innerHTML = `<div class="cepi-empty">${access.can_manage ? 'Cadastre o primeiro tutor para começar a distribuição dos alunos.' : 'Nenhum aluno tutorando foi atribuído a você.'}</div>`;
      return;
    }
    target.innerHTML = visibleTutors.map(tutor => {
      const tutorAssignments = filteredAssignments.filter(item => item.tutor_id === tutor.id).sort((a,b) => {
        const studentA = students.find(entry => entry.id === a.student_id);
        const studentB = students.find(entry => entry.id === b.student_id);
        const leadershipA = window.studentHasLeadershipObservation?.(studentA?.report ?? a.students?.has_report) === true;
        const leadershipB = window.studentHasLeadershipObservation?.(studentB?.report ?? b.students?.has_report) === true;
        if (leadershipA !== leadershipB) return leadershipA ? -1 : 1;
        return compareStudentNames(studentA?.name || a.students?.full_name, studentB?.name || b.students?.full_name);
      });
      if (!access.can_manage && !activeTutorIds.has(tutor.id)) return '';
      const type = tutor.tutor_type === 'external' ? 'Sem acesso ao CARÔMETRO' : 'Usuário do CARÔMETRO';
      const rows = tutorAssignments.length ? tutorAssignments.map(item => {
        const student = students.find(entry => entry.id === item.student_id) || { id:item.student_id, name:item.students?.full_name, className:item.students?.class_name };
        const activity = activityByStudent.get(item.student_id) || {};
        const counselorNames = activity.counselors?.map(entry => entry.name).filter(Boolean) || window.counselorNamesForClass?.(student.classId || item.students?.class_id) || [];
        const photo = student.photoUrl ? `<img src="${escapeHtml(student.photoUrl)}" alt="">` : initials(student.name);
        const occurrences = activity.occurrences?.length ? activity.occurrences.map(entry => `<li><b>${escapeHtml(new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${entry.date}T00:00:00Z`)))}</b> — ${escapeHtml(entry.text)}</li>`).join('') : '<li>Nenhuma ocorrência registrada.</li>';
        const attendance = activity.attendance?.length ? activity.attendance.map(entry => `<li>${escapeHtml(entry.subject)} · ${escapeHtml(entry.term)} — ${escapeHtml(attendanceLabel(entry.status))} (${escapeHtml(entry.percentage)}%)</li>`).join('') : '<li>Sem histórico de frequência.</li>';
        const books = activity.livro_revisa?.length ? activity.livro_revisa.map(entry => `<li>${escapeHtml(entry.school_year)} · ${escapeHtml(entry.bimester)}º bimestre — ${escapeHtml(entry.status)}</li>`).join('') : '<li>Sem registros de Livro/Revisa.</li>';
        const observationSource = student.report ?? item.students?.has_report;
        const leadershipLabels = window.studentLeadershipObservations?.(observationSource) || [];
        const otherLabels = (window.decodeObservationValues?.(observationSource) || []).filter(label => !leadershipLabels.includes(label));
        const observationBadges = leadershipLabels.map(label => `<span class="cepi-leadership-label">${escapeHtml(label)}</span>`).join('') + otherLabels.map(label => `<span>${escapeHtml(label)}</span>`).join('');
        return `<div class="cepi-student-row"><div class="cepi-student-photo">${photo}</div><div class="cepi-student-info"><b>${escapeHtml(student.name || 'Aluno')}</b><small>${escapeHtml(student.className || 'Turma não informada')}</small><div class="cepi-student-labels">${observationBadges}<span>Tutor(a): ${escapeHtml(tutor.display_name)}</span><span>Conselheiro(a): ${escapeHtml(counselorNames.join(' · ') || 'não definido')}</span></div><div class="cepi-student-status">${tutorStatusHtml(student, activity)}</div></div><div class="cepi-row-actions"><button class="btn primary" type="button" data-new-cepi-form="${escapeHtml(item.id)}">Nova ficha</button><button class="btn secondary" type="button" data-cepi-history="${escapeHtml(item.student_id)}">Histórico</button><button class="btn secondary" type="button" data-tutoring-details="${escapeHtml(item.student_id)}">Ver detalhes</button>${access.can_manage ? `<button class="btn secondary" type="button" data-transfer-assignment="${escapeHtml(item.id)}">Trocar tutor</button><button class="btn secondary" type="button" data-end-assignment="${escapeHtml(item.id)}">Encerrar vínculo</button>` : ''}</div><div class="cepi-student-expanded hidden" data-tutoring-panel="${escapeHtml(item.student_id)}"><section><b>Ocorrências</b><ul>${occurrences}</ul></section><section><b>Frequência</b><ul>${attendance}</ul></section><section><b>Livro/Revisa</b><ul>${books}</ul></section></div></div>`;
      }).join('') : '<div class="cepi-empty">Nenhum tutorando atribuído.</div>';
      const collapsed = collapsedTutorIds.has(tutor.id);
      return `<section class="cepi-tutor-group"><div class="cepi-tutor-head"><div><b>${escapeHtml(tutor.display_name)}</b><small>${escapeHtml(type)}${tutor.email ? ` · ${escapeHtml(tutor.email)}` : ''}</small></div><div class="cepi-tutor-actions"><span class="pill light">${tutorAssignments.length} tutorando(s)</span><button class="btn secondary" type="button" data-toggle-tutor="${escapeHtml(tutor.id)}" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? 'Expandir lista' : 'Retrair lista'}</button>${access.can_manage ? `<button class="btn secondary" type="button" data-edit-tutor="${escapeHtml(tutor.id)}">Editar</button><button class="btn secondary" type="button" data-remove-tutor="${escapeHtml(tutor.id)}">Remover</button>` : ''}</div></div><div class="cepi-students ${collapsed ? 'hidden' : ''}">${rows}</div></section>`;
    }).join('') || '<div class="cepi-empty">Nenhum resultado para os filtros informados.</div>';
    target.querySelectorAll('[data-end-assignment]').forEach(button => button.onclick = () => endAssignment(button.dataset.endAssignment));
    target.querySelectorAll('[data-transfer-assignment]').forEach(button => button.onclick = () => openTransferForm(button.dataset.transferAssignment));
    target.querySelectorAll('[data-edit-tutor]').forEach(button => button.onclick = () => openTutorForm(button.dataset.editTutor));
    target.querySelectorAll('[data-remove-tutor]').forEach(button => button.onclick = () => removeTutor(button.dataset.removeTutor));
    target.querySelectorAll('[data-toggle-tutor]').forEach(button => button.onclick = () => {
      const tutorId = button.dataset.toggleTutor;
      if (collapsedTutorIds.has(tutorId)) collapsedTutorIds.delete(tutorId); else collapsedTutorIds.add(tutorId);
      renderTutoring();
    });
    target.querySelectorAll('[data-new-cepi-form]').forEach(button => button.onclick = () => openAttendanceForm(button.dataset.newCepiForm));
    target.querySelectorAll('[data-cepi-history]').forEach(button => button.onclick = () => openAttendanceHistory(button.dataset.cepiHistory));
    target.querySelectorAll('[data-tutoring-details]').forEach(button => button.onclick = () => {
      const panel = target.querySelector(`[data-tutoring-panel="${CSS.escape(button.dataset.tutoringDetails)}"]`);
      panel?.classList.toggle('hidden');
      button.textContent = panel?.classList.contains('hidden') ? 'Ver detalhes' : 'Ocultar detalhes';
    });
  }

  function openTutorForm(tutorId='') {
    const tutor = tutors.find(item => item.id === tutorId);
    document.getElementById('cepiTutorForm').reset();
    document.getElementById('cepiTutorId').value = tutor?.id || '';
    document.getElementById('cepiTutorModalTitle').textContent = tutor ? 'Editar tutor' : 'Cadastrar tutor';
    document.getElementById('cepiTutorMember').innerHTML = '<option value="">Selecione</option>' + candidates.map(item => `<option value="${escapeHtml(item.member_id)}">${escapeHtml(item.full_name || item.email)} — ${escapeHtml(roleLabel(item.role))}</option>`).join('');
    if (tutor) {
      document.getElementById('cepiTutorType').value = tutor.tutor_type;
      document.getElementById('cepiTutorType').disabled = true;
      document.getElementById('cepiTutorMember').value = tutor.member_id || '';
      document.getElementById('cepiTutorMember').disabled = tutor.tutor_type === 'internal';
      document.getElementById('cepiTutorName').value = tutor.display_name || '';
      document.getElementById('cepiTutorEmail').value = tutor.email || '';
    } else {
      document.getElementById('cepiTutorType').disabled = false;
      document.getElementById('cepiTutorMember').disabled = false;
    }
    syncTutorType();
    tutorModal.classList.remove('hidden');
  }

  function syncTutorType() {
    const internal = document.getElementById('cepiTutorType').value === 'internal';
    document.getElementById('cepiInternalTutorField').classList.toggle('hidden', !internal);
    document.getElementById('cepiExternalTutorFields').classList.toggle('hidden', internal);
    document.getElementById('cepiTutorMember').required = internal;
    document.getElementById('cepiTutorName').required = !internal;
  }

  document.getElementById('cepiTutorType').onchange = syncTutorType;
  document.getElementById('cepiTutorForm').onsubmit = async event => {
    event.preventDefault();
    const schoolId = window.getActiveSchoolId?.();
    const { data:{ user:signedInUser } } = await db.auth.getUser();
    const tutorId = document.getElementById('cepiTutorId').value;
    const type = document.getElementById('cepiTutorType').value;
    let row;
    if (type === 'internal') {
      const candidate = candidates.find(item => item.member_id === document.getElementById('cepiTutorMember').value);
      if (!candidate) { toast('Selecione um usuário válido.'); return; }
      row = { school_id:schoolId, member_id:candidate.member_id, tutor_type:'internal', display_name:candidate.full_name || candidate.email, email:candidate.email, created_by:signedInUser?.id };
    } else {
      row = { school_id:schoolId, member_id:null, tutor_type:'external', display_name:document.getElementById('cepiTutorName').value.trim(), email:document.getElementById('cepiTutorEmail').value.trim() || null, created_by:signedInUser?.id };
    }
    const { error } = tutorId
      ? await db.rpc('update_cepi_tutor', { p_school_id:schoolId, p_tutor_id:tutorId, p_display_name:row.display_name, p_email:row.email })
      : await db.from('cepi_tutors').insert(row);
    if (error) { toast(error.code === '23505' ? 'Este usuário já está cadastrado como tutor.' : error.message); return; }
    closeModal('cepiTutorModal'); toast(tutorId ? 'Tutor atualizado.' : 'Tutor cadastrado.'); await loadTutoring();
  };

  function openAssignmentForm() {
    const alreadyAssigned = new Set(assignments.map(item => item.student_id));
    document.getElementById('cepiAssignmentTutor').innerHTML = '<option value="">Selecione</option>' + tutors.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name)}</option>`).join('');
    document.getElementById('cepiAssignmentClass').innerHTML = '<option value="">Todas as turmas</option>' + [...new Map(students.map(item => [item.classId, item.className]).filter(([id]) => id)).entries()].sort((a,b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR', { numeric:true })).map(([id,name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name || 'Sem turma')}</option>`).join('');
    document.getElementById('cepiAssignmentName').value = '';
    const renderAvailableStudents = () => {
      const classId = document.getElementById('cepiAssignmentClass').value;
      const name = normalizeSearch(document.getElementById('cepiAssignmentName').value);
      document.getElementById('cepiAssignmentStudents').innerHTML = students.filter(item => !alreadyAssigned.has(item.id) && (!classId || item.classId === classId) && (!name || normalizeSearch(item.name).includes(name))).sort((a,b) => compareStudentNames(a.name, b.name)).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} — ${escapeHtml(item.className || 'Sem turma')}</option>`).join('');
    };
    document.getElementById('cepiAssignmentClass').onchange = renderAvailableStudents;
    document.getElementById('cepiAssignmentName').oninput = renderAvailableStudents;
    renderAvailableStudents();
    assignmentModal.classList.remove('hidden');
  }

  document.getElementById('cepiAssignmentForm').onsubmit = async event => {
    event.preventDefault();
    const schoolId = window.getActiveSchoolId?.();
    const { data:{ user:signedInUser } } = await db.auth.getUser();
    const tutorId = document.getElementById('cepiAssignmentTutor').value;
    const studentIds = [...document.getElementById('cepiAssignmentStudents').selectedOptions].map(option => option.value);
    if (!tutorId || !studentIds.length) { toast('Selecione o tutor e ao menos um aluno.'); return; }
    const rows = studentIds.map(studentId => ({ school_id:schoolId, tutor_id:tutorId, student_id:studentId, assigned_by:signedInUser?.id }));
    const { error } = await db.from('cepi_tutor_students').insert(rows);
    if (error) { toast(error.code === '23505' ? 'Um dos alunos já possui tutor ativo.' : error.message); return; }
    closeModal('cepiAssignmentModal'); toast(`${studentIds.length} aluno(s) distribuído(s).`); await loadTutoring();
  };

  async function endAssignment(id) {
    if (!confirm('Encerrar este vínculo de tutoria? O histórico será preservado.')) return;
    const { data:{ user:signedInUser } } = await db.auth.getUser();
    const { error } = await db.from('cepi_tutor_students').update({ active:false, ended_at:new Date().toISOString(), ended_by:signedInUser?.id }).eq('id', id).eq('school_id', window.getActiveSchoolId?.());
    if (error) { toast(error.message); return; }
    toast('Vínculo encerrado.'); await loadTutoring();
  }

  function openTransferForm(assignmentId) {
    const assignment = assignments.find(item => item.id === assignmentId);
    const student = students.find(item => item.id === assignment?.student_id);
    if (!assignment) return;
    document.getElementById('cepiTransferAssignment').value = assignment.id;
    document.getElementById('cepiTransferStudentName').textContent = student?.name || assignment.students?.full_name || 'Aluno tutorando';
    document.getElementById('cepiTransferTutor').innerHTML = '<option value="">Selecione</option>' + tutors.filter(item => item.id !== assignment.tutor_id).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name)}</option>`).join('');
    transferModal.classList.remove('hidden');
  }

  document.getElementById('cepiTransferForm').onsubmit = async event => {
    event.preventDefault();
    const assignmentId = document.getElementById('cepiTransferAssignment').value;
    const tutorId = document.getElementById('cepiTransferTutor').value;
    if (!assignmentId || !tutorId) { toast('Selecione o novo tutor.'); return; }
    const { error } = await db.rpc('transfer_cepi_student', { p_school_id:window.getActiveSchoolId?.(), p_assignment_id:assignmentId, p_new_tutor_id:tutorId });
    if (error) { toast(error.message); return; }
    closeModal('cepiTransferModal'); toast('Tutor do aluno alterado.'); await loadTutoring();
  };

  async function removeTutor(tutorId) {
    const tutor = tutors.find(item => item.id === tutorId);
    if (!tutor || !confirm(`Remover ${tutor.display_name} da Tutoria? Os vínculos ativos serão encerrados e o histórico será preservado.`)) return;
    const { error } = await db.rpc('deactivate_cepi_tutor', { p_school_id:window.getActiveSchoolId?.(), p_tutor_id:tutorId });
    if (error) { toast(error.message); return; }
    toast('Tutor removido. Histórico preservado.'); await loadTutoring();
  }

  const attendanceSchema = [
    { id:'scientific_initiation', label:'Iniciação Científica (EF)' },
    { id:'life_project', label:'Projeto de Vida (EM)' },
    { id:'elective_1', label:'Projeto de Eletiva — 1º semestre' },
    { id:'elective_2', label:'Projeto de Eletiva — 2º semestre' },
    { id:'pj_1', label:'PJ — 1º semestre' },
    { id:'pj_2', label:'PJ — 2º semestre' },
    { id:'competencies', label:'Competências trabalhadas' },
    { id:'narrative', label:'Relato do atendimento' },
    { id:'agreements', label:'Orientações e combinados' },
    { id:'subject', label:'Componente curricular' },
    { id:'term', label:'Bimestre' },
    { id:'difficulty', label:'Dificuldade identificada' },
    { id:'directions', label:'Direcionamentos' },
    { id:'acknowledged', label:'Ciência do tutorando' },
    { id:'acknowledged_name', label:'Nome do estudante' },
    { id:'internal_notes', label:'Observações internas do tutor', include_in_report:false }
  ];

  const formFieldMap = {
    scientific_initiation:'cepiScientific', life_project:'cepiLifeProject', elective_1:'cepiElective1', elective_2:'cepiElective2',
    pj_1:'cepiPj1', pj_2:'cepiPj2', narrative:'cepiNarrative', agreements:'cepiAgreements', subject:'cepiSubject',
    term:'cepiTerm', difficulty:'cepiDifficulty', directions:'cepiDirections', acknowledged_name:'cepiAcknowledgedName', internal_notes:'cepiInternalNotes'
  };

  function fillAttendanceAnswers(answers={}) {
    Object.entries(formFieldMap).forEach(([key,id]) => { document.getElementById(id).value = answers[key] || ''; });
    document.querySelectorAll('[name="cepiCompetency"]').forEach(input => { input.checked = (answers.competencies || []).includes(input.value); });
    document.getElementById('cepiAcknowledged').checked = answers.acknowledged === true || answers.acknowledged === 'Sim';
  }

  function collectAttendanceAnswers() {
    const answers = {};
    Object.entries(formFieldMap).forEach(([key,id]) => { answers[key] = document.getElementById(id).value.trim(); });
    answers.competencies = [...document.querySelectorAll('[name="cepiCompetency"]:checked')].map(input => input.value);
    answers.acknowledged = document.getElementById('cepiAcknowledged').checked ? 'Sim' : 'Não';
    return answers;
  }

  async function openAttendanceForm(assignmentId, existingForm=null) {
    const assignment = assignments.find(item => item.id === assignmentId);
    const student = students.find(item => item.id === assignment?.student_id);
    if (!assignment || !student) { toast('Vínculo de tutoria não encontrado.'); return; }
    document.getElementById('cepiAttendanceForm').reset();
    document.getElementById('cepiFormAssignment').value = assignment.id;
    document.getElementById('cepiFormId').value = existingForm?.id || '';
    document.getElementById('cepiFormTitle').textContent = existingForm ? 'Editar rascunho' : 'Novo atendimento';
    document.getElementById('cepiFormStudentName').textContent = student.name;
    document.getElementById('cepiFormStudentClass').textContent = student.className || 'Turma não informada';
    const labels = window.studentPinnedLabels?.(student) || [];
    document.getElementById('cepiFormStudentLabels').innerHTML = labels.map(label => `<span>${escapeHtml(label)}</span>`).join('');
    document.getElementById('cepiFormClass').value = student.className || '';
    document.getElementById('cepiFormDate').value = existingForm?.reference_date || new Date().toISOString().slice(0,10);
    document.getElementById('cepiAcknowledgedName').value = student.name;
    if (existingForm) fillAttendanceAnswers(existingForm.answers || {});
    else {
      const { data:lastForms } = await db.from('cepi_tutoring_forms').select('answers').eq('school_id', window.getActiveSchoolId?.()).eq('student_id', student.id).order('reference_date', { ascending:false }).limit(1);
      const previous = lastForms?.[0]?.answers || {};
      fillAttendanceAnswers({ scientific_initiation:previous.scientific_initiation, life_project:previous.life_project, elective_1:previous.elective_1, elective_2:previous.elective_2, pj_1:previous.pj_1, pj_2:previous.pj_2, acknowledged_name:student.name });
    }
    formModal.classList.remove('hidden');
  }

  async function saveAttendanceForm(status) {
    const assignment = assignments.find(item => item.id === document.getElementById('cepiFormAssignment').value);
    if (!assignment) { toast('Vínculo de tutoria não encontrado.'); return; }
    const answers = collectAttendanceAnswers();
    if (status === 'completed' && (!answers.competencies.length || !answers.narrative || !answers.agreements)) { toast('Informe competência, relato e orientações antes de concluir.'); return; }
    if (status === 'completed' && answers.acknowledged !== 'Sim') { toast('Confirme que a ficha foi lida com o tutorando.'); return; }
    const { data:{ user:signedInUser } } = await db.auth.getUser();
    const formId = document.getElementById('cepiFormId').value;
    const row = { school_id:window.getActiveSchoolId?.(), assignment_id:assignment.id, tutor_id:assignment.tutor_id, student_id:assignment.student_id, reference_date:document.getElementById('cepiFormDate').value, form_schema:attendanceSchema, answers, status, created_by:signedInUser?.id };
    const result = formId ? await db.from('cepi_tutoring_forms').update(row).eq('id', formId).eq('status', 'draft') : await db.from('cepi_tutoring_forms').insert(row);
    if (result.error) { toast(result.error.message); return; }
    closeModal('cepiFormModal'); toast(status === 'completed' ? 'Ficha concluída.' : 'Rascunho salvo.');
  }

  document.getElementById('saveCepiDraft').onclick = () => saveAttendanceForm('draft');
  document.getElementById('cepiAttendanceForm').onsubmit = event => { event.preventDefault(); saveAttendanceForm('completed'); };

  async function openAttendanceHistory(studentId) {
    const student = students.find(item => item.id === studentId);
    const target = document.getElementById('cepiHistoryList');
    document.getElementById('cepiHistoryStudent').textContent = student?.name || 'Aluno tutorando';
    target.innerHTML = '<div class="meta">Carregando atendimentos...</div>';
    historyModal.classList.remove('hidden');
    const { data:forms, error } = await db.from('cepi_tutoring_forms').select('id,assignment_id,reference_date,form_schema,answers,status,created_at,completed_at').eq('school_id', window.getActiveSchoolId?.()).eq('student_id', studentId).order('reference_date', { ascending:false });
    if (error) { target.innerHTML = '<div class="error">Não foi possível carregar o histórico.</div>'; return; }
    if (!forms?.length) { target.innerHTML = '<div class="cepi-empty">Nenhum atendimento registrado.</div>'; return; }
    target.innerHTML = forms.map(form => {
      const date = new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${form.reference_date}T00:00:00Z`));
      const competencies = Array.isArray(form.answers?.competencies) ? form.answers.competencies.join(' · ') : 'Competência não informada';
      const details = (form.form_schema || []).filter(question => question.include_in_report !== false && !['scientific_initiation','life_project','elective_1','elective_2','elective_3','elective_4','pj_1','pj_2','pj_3','pj_4'].includes(question.id)).map(question => `<dt>${escapeHtml(question.label)}</dt><dd>${escapeHtml(Array.isArray(form.answers?.[question.id]) ? form.answers[question.id].join(', ') : (form.answers?.[question.id] || 'Não informado'))}</dd>`).join('');
      return `<article class="cepi-history-item"><div class="cepi-history-head"><div><b>${escapeHtml(date)}</b><div class="meta">${escapeHtml(competencies)}</div></div><div><span class="pill ${form.status === 'completed' ? 'light' : ''}">${form.status === 'completed' ? 'Concluída' : 'Rascunho'}</span>${form.status === 'draft' ? ` <button class="btn secondary" type="button" data-edit-cepi-form="${escapeHtml(form.id)}">Editar</button>` : ''}</div></div><div class="cepi-history-body"><dl>${details}</dl></div></article>`;
    }).join('');
    target.querySelectorAll('[data-edit-cepi-form]').forEach(button => button.onclick = () => {
      const form = forms.find(item => item.id === button.dataset.editCepiForm);
      closeModal('cepiHistoryModal'); openAttendanceForm(form.assignment_id, form);
    });
  }

  async function imageAsDataUrl(url) {
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  function openReportForm() {
    document.getElementById('cepiReportTutor').innerHTML = '<option value="">Todos os tutores</option>' + tutors.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name)}</option>`).join('');
    document.getElementById('cepiReportClass').innerHTML = classOptionsHtml(assignments);
    document.getElementById('cepiReportName').value = '';
    renderReportStudents();
    reportModal.classList.remove('hidden');
  }

  function renderReportStudents() {
    const tutorId = document.getElementById('cepiReportTutor').value;
    const classId = document.getElementById('cepiReportClass').value;
    const name = normalizeSearch(document.getElementById('cepiReportName').value);
    const filtered = assignments.filter(item => {
      const student = students.find(entry => entry.id === item.student_id);
      return (!tutorId || item.tutor_id === tutorId) && (!classId || (student?.classId || item.students?.class_id) === classId) && (!name || normalizeSearch(student?.name || item.students?.full_name).includes(name));
    }).sort((a,b) => {
      const studentA = students.find(entry => entry.id === a.student_id);
      const studentB = students.find(entry => entry.id === b.student_id);
      return compareStudentNames(studentA?.name || a.students?.full_name, studentB?.name || b.students?.full_name);
    });
    document.getElementById('cepiReportStudent').innerHTML = '<option value="">Selecione</option>' + filtered.map(item => {
      const student = students.find(entry => entry.id === item.student_id);
      const tutor = tutors.find(entry => entry.id === item.tutor_id);
      return `<option value="${escapeHtml(item.student_id)}">${escapeHtml(student?.name || item.students?.full_name || 'Aluno')} — ${escapeHtml(student?.className || item.students?.class_name || 'Sem turma')}${access.can_manage ? ` — ${escapeHtml(tutor?.display_name || 'Tutor')}` : ''}</option>`;
    }).join('');
  }

  document.getElementById('cepiReportTutor').onchange = renderReportStudents;
  document.getElementById('cepiReportClass').onchange = renderReportStudents;
  document.getElementById('cepiReportName').oninput = renderReportStudents;

  document.getElementById('cepiReportForm').onsubmit = async event => {
    event.preventDefault();
    if (!window.jspdf?.jsPDF) { toast('Não foi possível carregar o gerador de PDF.'); return; }
    const studentId = document.getElementById('cepiReportStudent').value;
    const assignment = assignments.find(item => item.student_id === studentId);
    const student = students.find(item => item.id === studentId);
    if (!assignment || !student) { toast('Selecione um aluno tutorando válido.'); return; }
    const { data:forms, error } = await db.from('cepi_tutoring_forms').select('reference_date,form_schema,answers,status').eq('school_id', window.getActiveSchoolId?.()).eq('student_id', studentId).order('reference_date');
    if (error) { toast('Não foi possível carregar as fichas deste aluno.'); return; }
    if (!forms?.length) { toast('Este aluno ainda não possui ficha de atendimento preenchida.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const margin = 18;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 18;
    const ensureSpace = height => { if (y + height <= pageHeight - 16) return; doc.addPage(); y = 18; };
    const write = (text, { size=10, bold=false, gap=5 } = {}) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text ?? ''), pageWidth - margin * 2);
      ensureSpace(lines.length * gap + 2); doc.text(lines, margin, y); y += lines.length * gap + 2;
    };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Relatório da Tutoria', margin, y); y += 10;
    const photoData = await imageAsDataUrl(student.photoUrl);
    if (photoData) { try { doc.addImage(photoData, String(photoData).startsWith('data:image/png') ? 'PNG' : 'JPEG', margin, y, 28, 28); } catch {} }
    const textX = photoData ? margin + 34 : margin;
    doc.setFontSize(12); doc.text(String(student.name || ''), textX, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Turma: ${student.className || 'Não informada'}`, textX, y + 16); y += 36;

    forms.forEach((form, formIndex) => {
      const date = new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${form.reference_date}T00:00:00Z`));
      write(`Atendimento ${formIndex + 1} — ${date}`, { size:12, bold:true, gap:5.5 });
      const schema = Array.isArray(form.form_schema) ? form.form_schema : [];
      const answers = form.answers && typeof form.answers === 'object' ? form.answers : {};
      const questions = (schema.length ? schema : Object.keys(answers).map(key => ({ id:key, label:key }))).filter(question => question.include_in_report !== false);
      if (!questions.length) write('Ficha sem perguntas registradas.', { size:10 });
      questions.forEach((question, questionIndex) => {
        const key = String(question.id ?? question.key ?? questionIndex);
        const answer = answers[key];
        write(`${questionIndex + 1}. ${question.label || question.question || key}`, { size:10, bold:true });
        write(Array.isArray(answer) ? answer.join(', ') : (answer ?? 'Sem resposta'), { size:10, gap:4.5 });
      });
      y += 3;
    });
    const safeName = String(student.name || 'aluno').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    doc.save(`tutoria-${safeName || 'aluno'}.pdf`);
    closeModal('cepiReportModal');
    toast('Relatório da Tutoria gerado.');
  };

  cepiNav.onclick = () => { showCepiHome(); modal.classList.remove('hidden'); };
  document.getElementById('backToCepi').onclick = showCepiHome;
  document.getElementById('openTutoring').onclick = async () => {
    document.getElementById('cepiTitle').textContent = 'Tutoria';
    document.getElementById('cepiSubtitle').textContent = 'Tutores e tutorandos, inclusive entre turmas diferentes.';
    document.getElementById('cepiHome').classList.add('hidden');
    document.getElementById('cepiTutoring').classList.remove('hidden');
    await loadTutoring();
  };
  document.getElementById('openTutoringReport').onclick = async () => { await loadTutoring(); openReportForm(); };
  document.getElementById('newTutor').onclick = () => openTutorForm();
  document.getElementById('newAssignment').onclick = openAssignmentForm;
  document.getElementById('cepiTutorFilter').oninput = renderTutoring;
  document.getElementById('cepiStudentFilter').oninput = renderTutoring;
  document.getElementById('cepiClassFilter').onchange = renderTutoring;
  document.addEventListener('carometro:school-context-ready', refreshAccess);
  document.addEventListener('carometro:cepi-settings-changed', refreshAccess);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccess(); });
  new MutationObserver(() => { decorateMainStudentCards(); refreshAccess(); }).observe(document.getElementById('list'), { childList:true, subtree:true });
  new MutationObserver(decorateStudentDetails).observe(document.getElementById('studentDetails'), { childList:true, subtree:true });
  startAccessPolling();
  document.getElementById('signOut')?.addEventListener('click', () => {
    access = { enabled:false, can_manage:false, tutor_id:null };
    tutorLabelsSchoolId = null;
    tutors = [];
    assignments = [];
    cepiNav.classList.add('hidden');
    closeModal('cepiModal');
  }, { capture:true });

  // Área CEPI no Painel do Proprietário. Ela é separada dos planos: o dono
  // habilita a função por escola, exatamente como decisão comercial manual.
  function installOwnerCepiPage(platformModal) {
    if (platformModal.querySelector('[data-platform-page="cepi"]')) return;
    const platformNav = platformModal.querySelector('.platform-nav');
    const reference = platformNav.querySelector('[data-platform-page="plans"]');
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.platformPage = 'cepi';
    button.innerHTML = '<span class="platform-nav-icon">◎</span>CEPI';
    platformNav.insertBefore(button, reference);
    const page = document.createElement('section');
    page.className = 'platform-page'; page.dataset.platformSection = 'cepi';
    page.innerHTML = '<div class="platform-page-heading"><div><h3>CEPI</h3><p>Libere o espaço CEPI somente para as escolas que utilizam esse modelo.</p></div></div><section class="platform-panel"><div class="platform-panel-head"><div><h4>Acesso por escola</h4><p>A liberação é independente do plano contratado.</p></div></div><div id="platformCepiSchools" class="platform-panel-body"></div></section>';
    platformModal.querySelector('.platform-content').appendChild(page);
    button.onclick = async () => {
      platformModal.querySelectorAll('[data-platform-section]').forEach(section => section.classList.toggle('active', section === page));
      platformModal.querySelectorAll('[data-platform-page]').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById('platformPageTitle').textContent = 'CEPI';
      document.getElementById('platformPageSubtitle').textContent = 'Habilitação das funções de período integral por escola.';
      platformModal.querySelector('.platform-workspace')?.classList.remove('menu-open');
      await loadOwnerCepiSettings();
    };
  }

  async function loadOwnerCepiSettings() {
    const target = document.getElementById('platformCepiSchools');
    if (!target) return;
    target.innerHTML = '<div class="meta">Carregando escolas...</div>';
    const { data, error } = await db.rpc('platform_list_cepi_settings');
    if (error) { target.innerHTML = '<div class="error">Não foi possível carregar as configurações CEPI.</div>'; return; }
    const activeSchools = (data || []).filter(item => item.school_status !== 'archived');
    target.innerHTML = activeSchools.length ? `<div class="cepi-owner-list">${activeSchools.map(item => `<label class="cepi-owner-row"><span><b>${escapeHtml(item.school_name)}</b><small>${item.cepi_enabled ? 'CEPI liberado' : 'CEPI não liberado'}</small></span><span class="platform-switch"><input type="checkbox" data-cepi-school="${escapeHtml(item.school_id)}" ${item.cepi_enabled ? 'checked' : ''}><span></span></span></label>`).join('')}</div>` : '<div class="empty">Nenhuma escola ativa cadastrada.</div>';
    target.querySelectorAll('[data-cepi-school]').forEach(input => input.onchange = async () => {
      input.disabled = true;
      const { error:saveError } = await db.rpc('platform_set_cepi_enabled', { p_school_id:input.dataset.cepiSchool, p_enabled:input.checked });
      input.disabled = false;
      if (saveError) { input.checked = !input.checked; toast(saveError.message); return; }
      toast(input.checked ? 'Área CEPI liberada para a escola.' : 'Área CEPI ocultada para a escola.');
      input.closest('.cepi-owner-row').querySelector('small').textContent = input.checked ? 'CEPI liberado' : 'CEPI não liberado';
    });
  }

  const ownerStyle = document.createElement('style');
  ownerStyle.textContent = '.cepi-owner-list{display:grid;gap:10px}.cepi-owner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px;border:1px solid #e2e8f2;border-radius:11px}.cepi-owner-row b,.cepi-owner-row small{display:block}.cepi-owner-row small{color:#667085;margin-top:4px}';
  document.head.appendChild(ownerStyle);
  const observer = new MutationObserver(() => {
    const platformModal = document.getElementById('platformDashboardModal');
    if (platformModal) installOwnerCepiPage(platformModal);
  });
  observer.observe(document.body, { childList:true, subtree:false });
  const existingPlatformModal = document.getElementById('platformDashboardModal');
  if (existingPlatformModal) installOwnerCepiPage(existingPlatformModal);
});
