document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const uniformButton = document.createElement('button');
  uniformButton.id = 'uniformNav';
  uniformButton.type = 'button';
  uniformButton.innerHTML = '<span>▣ &nbsp; Uniforme</span>';
  nav.insertBefore(uniformButton, document.getElementById('profileNav') || null);

  const modal = document.createElement('div');
  modal.id = 'uniformModal';
  modal.className = 'modal-bg uniform-modal hidden';
  modal.innerHTML = `<section class="modal uniform-dialog"><div class="modal-head"><div><h3>Uniforme</h3><div class="meta">Consulte a situação por turno, turma ou aluno.</div></div><button class="close" type="button" id="closeUniform">×</button></div><div class="uniform-summary"><div><span>Sem uniforme</span><b id="pendingUniform">0</b></div><div><span>Sem tênis</span><b id="pendingShoes">0</b></div><div><span>Sem os dois</span><b id="pendingBoth">0</b></div><div><span>Sem material</span><b id="pendingMaterial">0</b></div></div><section class="uniform-shift-section" aria-label="Contagem por turno"><span class="uniform-shift-title">Contagem por turno</span><div id="uniformShiftSummary" class="uniform-shift-summary"></div></section><div class="uniform-bulk-action"><button id="markAllUniformReceived" class="btn secondary" type="button">✓ Marcar todos como receberam</button></div><div class="uniform-controls"><select id="uniformShift"><option value="">Todos os turnos</option><option value="Matutino">Matutino</option><option value="Vespertino">Vespertino</option><option value="Noturno">Noturno</option></select><select id="uniformClass"><option value="">Todas as turmas</option></select><select id="uniformView"><option value="all">Todos os alunos</option><option value="pending">Somente alunos pendentes</option><option value="uniform">Somente sem uniforme</option><option value="shoes">Somente sem tênis</option><option value="both">Sem uniforme e tênis</option><option value="material">Somente sem material</option></select><input id="uniformSearch" placeholder="Buscar aluno"></div><div class="uniform-columns"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="uniformList" class="uniform-list"></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; } #uniformNav:hover { background:#38527e; } #toast { z-index:220!important; }
    .uniform-modal { z-index:110; padding:12px 20px; overscroll-behavior:none; }.uniform-dialog { width:min(1040px,100%); height:min(960px,calc(100dvh - 24px)); max-height:calc(100dvh - 24px); min-height:0; display:flex; flex-direction:column; overflow:hidden; }.uniform-dialog .modal-head { position:relative!important; top:auto!important; flex:none; }
    .uniform-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:10px 22px; border-bottom:1px solid var(--line); background:#f8faff; }.uniform-summary div { padding:7px 9px; border:1px solid #dbe4f5; border-radius:9px; background:#fff; }.uniform-summary span { display:block; color:var(--muted); font-size:11px; font-weight:700; }.uniform-summary b { font-size:20px; color:#b42318; }
    .uniform-shift-section { padding:8px 22px; border-bottom:1px solid var(--line); background:#fff; }.uniform-shift-title { display:block; margin-bottom:6px; color:var(--muted); font-size:10px; font-weight:850; letter-spacing:.05em; text-transform:uppercase; }.uniform-shift-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }.uniform-shift-card { border:1px solid #dbe4f5; border-radius:9px; padding:7px; background:#f8faff; }.uniform-shift-card b { display:block; font-size:12px; margin-bottom:5px; }.uniform-shift-values { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; }.uniform-shift-values span { color:var(--muted); font-size:10px; line-height:1.15; }.uniform-shift-values strong { display:block; margin-top:2px; color:#b42318; font-size:16px; }
    .uniform-summary,.uniform-shift-section,.uniform-bulk-action,.uniform-controls,.uniform-columns { flex:none; }.uniform-bulk-action { display:flex; justify-content:flex-end; padding:12px 22px 0; }.uniform-bulk-action .btn { min-height:38px; font-size:13px; }.uniform-controls { display:grid; grid-template-columns:.85fr .85fr 1.15fr .9fr; gap:10px; padding:15px 22px; }.uniform-controls input,.uniform-controls select { min-width:0; min-height:42px; padding:8px 10px; }.uniform-columns { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; padding:0 22px 9px; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }.uniform-list { flex:1 1 auto; min-height:430px; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); }.uniform-student b { display:block; }.uniform-student .meta { margin-top:4px; }.uniform-statuses { display:flex; flex-wrap:wrap; gap:5px; }.uniform-status { display:inline-flex; width:max-content; padding:6px 9px; border-radius:99px; font-size:12px; font-weight:800; }.uniform-status.received { background:#dcfae6; color:#087443; }.uniform-status.pending { background:#fee4e2; color:#b42318; }.uniform-action { display:grid; gap:6px; }.uniform-action select { min-height:37px; padding:6px 8px; font-size:13px; }.uniform-save { min-height:37px; padding:7px 10px; font-size:13px; }.uniform-card-label { margin-left:0; max-width:100%; white-space:normal; line-height:1.25; }.uniform-card-label.uniform-pending { background:#fee4e2; color:#b42318; }.uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media(max-width:800px) { .side .nav #uniformNav { flex:1 1 0!important; min-width:0; }.uniform-modal { padding:6px; align-items:center; }.uniform-dialog { width:100%; height:calc(100dvh - 12px); max-height:none; }.uniform-dialog .modal-head { padding:11px 14px; }.uniform-summary { grid-template-columns:repeat(2,1fr); padding:7px 12px; gap:5px; }.uniform-summary div { padding:6px; }.uniform-summary span { font-size:9px; }.uniform-summary b { font-size:18px; }.uniform-shift-section { padding:7px 12px; }.uniform-shift-title { margin-bottom:5px; font-size:9px; }.uniform-shift-summary { grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; }.uniform-shift-card { display:block; min-width:0; padding:6px 3px; text-align:center; }.uniform-shift-card b { margin:0 0 4px; font-size:10px; }.uniform-shift-values { gap:1px; }.uniform-shift-values span { font-size:7px; overflow-wrap:anywhere; }.uniform-shift-values strong { font-size:14px; }.uniform-bulk-action { padding:7px 12px 0; }.uniform-bulk-action .btn { width:100%; min-height:34px; }.uniform-controls { grid-template-columns:1fr 1fr; padding:9px 12px; gap:6px; }.uniform-controls input,.uniform-controls select { min-height:38px; padding:7px 8px; font-size:13px; }.uniform-columns { display:none; }.uniform-list { min-height:190px; padding:0 12px 12px; }.uniform-row { grid-template-columns:1fr; gap:6px; padding:10px 0; }.uniform-card-label { font-size:11px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const isCoordinator = () => !!permission?.is_coordinator;
  const canAccessUniform = () => isAdmin() || (isCoordinator() && !!(permission?.can_edit_all || permission?.can_edit_uniform || permission?.can_mark_all_uniform_received));
  const canRegisterUniform = student => {
    if (isAdmin()) return true;
    return isCoordinator() && !!(permission?.can_edit_all || permission?.can_edit_uniform);
  };
  const bulkUniformAccess = () => {
    if (isAdmin()) return { allowed:true, ids:null };
    return { allowed:isCoordinator() && !!permission?.can_mark_all_uniform_received, classId:null, ids:null };
  };
  const escape = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const labels = { uniform:'Não recebeu uniforme', shoes:'Não recebeu tênis', both:'Não recebeu uniforme e tênis', material:'Não recebeu material' };
  const shifts = ['Matutino', 'Vespertino', 'Noturno'];
  const shiftForClass = classId => classes.find(item => item.id === classId)?.shift || 'Matutino';
  const shiftForStudent = student => {
    const className = String(student?.className || '').trim().toLocaleLowerCase('pt-BR');
    const schoolClass = classes.find(item => item.id === student?.classId || (className && String(item.name || '').trim().toLocaleLowerCase('pt-BR') === className));
    return schoolClass?.shift || 'Matutino';
  };
  const pending = student => {
    // Toda a tela consulta primeiro o último estado confirmado do aluno.
    // Isso protege a contagem contra uma carga antiga que termine depois de
    // o usuário alterar o seletor.
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    const explicit = String(source?.uniform_pending || '').trim().toLocaleLowerCase('pt-BR');
    if (['uniform', 'shoes', 'both'].includes(explicit)) return explicit;

    // Os primeiros registros de uniforme foram salvos nos dois campos
    // booleanos. Use-os como fonte principal quando não houver a marcação
    // mais recente em uniform_pending.
    const needsUniform = source?.uniform_received === false || source?.uniform_received === 'false';
    const needsShoes = source?.shoes_received === false || source?.shoes_received === 'false';
    if (needsUniform && needsShoes) return 'both';
    if (needsUniform) return 'uniform';
    if (needsShoes) return 'shoes';
    return '';
  };
  const materialPending = student => {
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    return source?.material_received === false || source?.material_received === 'false';
  };
  const statusesFor = student => {
    const status = pending(student);
    return [...(status ? [status] : []), ...(materialPending(student) ? ['material'] : [])];
  };
  const studentId = card => card.dataset.studentId || card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  let classStudents = null;
  let classStudentsRequest = 0;
  let uniformRecords = [];
  let canonicalUniformState = new Map();
  let locallyUpdatedUniformIds = new Set();
  let uniformStateRequest = 0;
  let uniformStateErrorShown = false;

  // Os três totais não dependem da turma, dos filtros nem da lista visível.
  // Mantê-los em uma função própria evita que uma falha ao montar a lista
  // deixe os números em zero, apesar de os dados já terem sido carregados.
  function updateUniformSummary(records = uniformRecords) {
    // A lista principal sempre representa todos os alunos que o usuário pode
    // visualizar. A resposta exclusiva de Uniforme pode chegar incompleta ou
    // antes de uma alteração recente; use-a apenas antes da carga principal.
    const source = students.length ? students : records;
    const totals = { uniform:0, shoes:0, both:0, material:0 };
    source.forEach(student => {
      const status = pending(student);
      if (status) totals[status] += 1;
      if (materialPending(student)) totals.material += 1;
    });
    get('pendingUniform').textContent = totals.uniform;
    get('pendingShoes').textContent = totals.shoes;
    get('pendingBoth').textContent = totals.both;
    get('pendingMaterial').textContent = totals.material;
    get('uniformShiftSummary').innerHTML = shifts.map(shift => {
      const shiftTotals = { uniform:0, shoes:0, both:0, material:0 };
      source.forEach(student => {
        if (shiftForStudent(student) !== shift) return;
        const status = pending(student);
        if (status) shiftTotals[status] += 1;
        if (materialPending(student)) shiftTotals.material += 1;
      });
      return `<article class="uniform-shift-card"><b>${shift}</b><div class="uniform-shift-values"><span>Uniforme<strong>${shiftTotals.uniform}</strong></span><span>Tênis<strong>${shiftTotals.shoes}</strong></span><span>Os dois<strong>${shiftTotals.both}</strong></span><span>Material<strong>${shiftTotals.material}</strong></span></div></article>`;
    }).join('');
  }

  function syncUniformState(records, { preserveLocal = false } = {}) {
    uniformRecords = records || [];
    const stateByStudent = new Map(uniformRecords.map(item => [item.id, item]));
    stateByStudent.forEach((state, id) => {
      if (preserveLocal && locallyUpdatedUniformIds.has(id)) return;
      canonicalUniformState.set(id, { id, ...state });
      if (!preserveLocal) locallyUpdatedUniformIds.delete(id);
    });
    // Exponha a fonte canônica por aluno para a lista e o card principal.
    // Dessa forma uma etiqueta nunca usa uma cópia antiga do objeto do aluno.
    window.uniformStateByStudent = new Map(canonicalUniformState);
    students.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    updateUniformSummary();
    classStudents?.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    // Recrie a lista e o card com o estado de Uniforme que acabou de chegar.
    // Isso evita que uma renderização anterior (sem esses campos) deixe de
    // mostrar as etiquetas, mesmo quando os contadores já estão corretos.
    // A lista principal já usa estes dados em memória. Não a redesenhe a
    // cada resposta de Uniforme: isso evitou a piscada da tela inteira.
  }
  async function refreshUniformState({ renderWhenOpen = true } = {}) {
    const requestId = ++uniformStateRequest;
    const { data, error } = await db.from('students').select('id,uniform_pending,uniform_received,shoes_received,material_received');
    if (requestId !== uniformStateRequest) return false;
    if (error) {
      // Sem a coluna no banco, não há como calcular nem mostrar a situação.
      // Avise de forma explícita, em vez de deixar contadores silenciosamente em zero.
      if (!uniformStateErrorShown) {
        uniformStateErrorShown = true;
        toast(error.message.includes('material_received')
          ? 'Execute o novo script supabase-uniform-material.sql no Supabase para ativar o controle de material.'
          : error.message.includes('uniform_pending')
          ? 'O controle de Uniforme ainda não foi instalado no banco. Execute o arquivo supabase-uniform-management.sql.'
          : `Não foi possível atualizar o Uniforme: ${error.message}`);
      }
      updateUniformSummary(students);
      return false;
    }
    uniformStateErrorShown = false;
    syncUniformState(data || []);
    if (renderWhenOpen && !modal.classList.contains('hidden')) render();
    return true;
  }

  function uniformStatusFor(studentId) {
    // O retorno específico de Uniforme é a fonte autoritativa. A lista
    // principal pode terminar de carregar depois dele e conter estado antigo.
    const source = uniformRecords.find(item => item.id === studentId)
      || students.find(item => item.id === studentId)
      || classStudents?.find(item => item.id === studentId);
    return pending(source);
  }

  // As etiquetas de situação ficam exclusivamente dentro desta tela.
  // A lista de alunos e o card de detalhes mantêm suas informações próprias.
  function paintStudentCards() {}

  function classOptions() {
    const select = get('uniformClass'); const current = select.value;
    const selectedShift = get('uniformShift').value;
    const available = classes.filter(item => !selectedShift || (item.shift || 'Matutino') === selectedShift);
    select.innerHTML = '<option value="">Todas as turmas</option>' + available.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }
  function render() {
    classOptions();
    const bulkAccess = bulkUniformAccess();
    get('markAllUniformReceived').classList.toggle('hidden', !bulkAccess.allowed);
    // Os contadores são sempre gerais; os filtros abaixo servem apenas para
    // definir quais alunos aparecem na lista.
    updateUniformSummary();
    const shift = get('uniformShift').value, classId = get('uniformClass').value, view = get('uniformView').value, query = get('uniformSearch').value.trim().toLocaleLowerCase('pt-BR');
    if (!shift && !classId) { get('uniformList').innerHTML = '<div class="uniform-empty">Escolha um turno ou uma turma para ver os alunos.</div>'; return; }
    if (classStudents === null) { get('uniformList').innerHTML = '<div class="uniform-empty">Carregando alunos da turma…</div>'; return; }
    // A tela de Uniforme deve manter todos os alunos da turma juntos e em
    // ordem alfabética, independentemente da data em que foram cadastrados.
    const visible = classStudents.filter(item => {
      const type = pending(item);
      const missingMaterial = materialPending(item);
      if (query && !item.name.toLocaleLowerCase('pt-BR').includes(query)) return false;
      if (view === 'all') return true;
      if (view === 'pending') return !!type || missingMaterial;
      if (view === 'material') return missingMaterial;
      return type === view;
    }).sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));
    get('uniformList').innerHTML = visible.length ? visible.map(item => {
      const type = pending(item), missingMaterial = materialPending(item), statuses = statusesFor(item);
      const statusHtml = statuses.length ? `<div class="uniform-statuses">${statuses.map(status => `<span class="uniform-status pending">${labels[status]}</span>`).join('')}</div>` : '<span class="uniform-status received">✓ Recebeu</span>';
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student"><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div><div>${statusHtml}</div>${canRegisterUniform(item) ? `<div class="uniform-action"><select class="uniform-select" aria-label="Registrar situação de uniforme e tênis"><option value="" ${!type ? 'selected' : ''}>Uniforme e tênis: recebeu</option><option value="uniform" ${type === 'uniform' ? 'selected' : ''}>Não recebeu uniforme</option><option value="shoes" ${type === 'shoes' ? 'selected' : ''}>Não recebeu tênis</option><option value="both" ${type === 'both' ? 'selected' : ''}>Não recebeu uniforme e tênis</option></select><select class="material-select" aria-label="Registrar situação de material"><option value="" ${!missingMaterial ? 'selected' : ''}>Material: recebeu</option><option value="material" ${missingMaterial ? 'selected' : ''}>Não recebeu material</option></select></div>` : '<div class="meta">Consulta disponível.</div>'}</article>`;
    }).join('') : `<div class="uniform-empty">Nenhum aluno corresponde a este filtro.<br><br>${view !== 'all' ? 'Use “Todos os alunos da turma” para ver cada aluno e registrar a situação.' : 'Esta turma ainda não possui alunos cadastrados.'}</div>`;
    setTimeout(paintStudentCards, 0);
  }
  async function loadClassStudents() {
    const classId = get('uniformClass').value;
    const shift = get('uniformShift').value;
    const requestId = ++classStudentsRequest;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = selectedClassName(classes.find(item => item.id === classId)?.name);
    if (!classId && !shift) {
      classStudents = [];
      render();
      return;
    }
    // A lista principal já contém todos os alunos. Reaproveitá-la evita uma
    // segunda consulta completa que desmontava a janela e causava piscadas.
    classStudents = students
      .filter(item => (!classId || item.classId === classId || selectedClassName(item.className) === selectedTargetName) && (!shift || shiftForStudent(item) === shift))
      .map(item => ({ ...item }));
    if (requestId === classStudentsRequest) render();
  }
  async function open() {
    if (!canAccessUniform()) { toast('O administrador precisa liberar o acesso ao Uniforme para este coordenador.'); return; }
    // Garanta que a lista principal e os dados exclusivos de Uniforme estejam
    // atualizados antes de exibir os totais. Assim a janela nunca abre em 0
    // por estar usando uma cópia antiga do carregamento anterior.
    uniformButton.disabled = true;
    try {
      await window.load?.();
      await refreshUniformState({ renderWhenOpen:false });
      classOptions();
      modal.classList.remove('hidden');
      if (get('uniformClass').value || get('uniformShift').value) await loadClassStudents();
      else classStudents = [];
      render();
    } finally {
      uniformButton.disabled = false;
    }
  }
  const syncUniformNavigation = () => {
    const allowed = canAccessUniform();
    uniformButton.classList.toggle('hidden', !allowed);
    uniformButton.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };
  uniformButton.onclick = open; get('closeUniform').onclick = () => modal.classList.add('hidden'); modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('uniformShift').onchange = () => { classOptions(); loadClassStudents(); };
  get('uniformClass').onchange = loadClassStudents;
  get('uniformView').onchange = render;
  get('uniformSearch').oninput = render;
  get('uniformList').onchange = async event => {
    const select = event.target.closest('.uniform-select, .material-select'); if (!select) return;
    const row = select.closest('.uniform-row'); const student = classStudents?.find(item => item.id === row.dataset.id) || students.find(item => item.id === row.dataset.id);
    if (!canRegisterUniform(student)) return;
    const isMaterial = select.classList.contains('material-select');
    const type = select.value;
    select.disabled = true;
    const nextState = isMaterial
      ? { material_received:type !== 'material' }
      : {
          uniform_pending: type || null,
          uniform_received: type !== 'uniform' && type !== 'both',
          shoes_received: type !== 'shoes' && type !== 'both'
        };
    const { error } = await db.from('students').update(nextState).eq('id', row.dataset.id);
    if (error) { toast(error.message.includes('material_received') ? 'Execute o script supabase-uniform-material.sql no Supabase.' : error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message); select.disabled = false; return; }
    // Atualização imediata: contadores, lista e etiqueta não dependem de uma
    // nova abertura da janela nem de uma atualização posterior da página.
    const updateLocalStatus = item => {
      if (item?.id !== row.dataset.id) return;
      Object.assign(item, nextState);
      if (!isMaterial) item.uniform_pending = type || '';
    };
    students.forEach(updateLocalStatus);
    classStudents?.forEach(updateLocalStatus);
    uniformRecords.forEach(updateLocalStatus);
    // Invalida qualquer consulta iniciada antes desta alteração. Ela não pode
    // mais voltar e desfazer apenas o contador deste aluno.
    uniformStateRequest += 1;
    locallyUpdatedUniformIds.add(row.dataset.id);
    canonicalUniformState.set(row.dataset.id, { id:row.dataset.id, ...(canonicalUniformState.get(row.dataset.id) || {}), ...nextState, ...(!isMaterial ? { uniform_pending:type || '' } : {}) });
    window.uniformStateByStudent ||= new Map();
    window.uniformStateByStudent.set(row.dataset.id, canonicalUniformState.get(row.dataset.id));
    updateUniformSummary();
    render();
    toast(type ? 'Pendência registrada.' : 'Aluno marcado como recebeu.');
  };
  get('markAllUniformReceived').onclick = async () => {
    const access = bulkUniformAccess();
    if (!access.allowed) return;
    const targetIsClass = Array.isArray(access.ids);
    if (targetIsClass && !access.ids.length) { toast('Selecione uma turma com alunos para usar esta ação.'); return; }
    if (!confirm(targetIsClass ? 'Marcar todos os alunos desta turma como receberam uniforme, tênis e material?' : 'Marcar todos os alunos como receberam uniforme, tênis e material?')) return;
    const button = get('markAllUniformReceived');
    button.disabled = true;
    const nextState = { uniform_pending:null, uniform_received:true, shoes_received:true, material_received:true };
    const { error } = await db.rpc('mark_all_uniform_received', { target_class_id:access.classId || null });
    if (error) {
      button.disabled = false;
      toast(error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message);
      return;
    }
    const markReceived = item => {
      if (!item) return;
      item.uniform_pending = '';
      item.uniform_received = true;
      item.shoes_received = true;
      item.material_received = true;
    };
    const affectedIds = targetIsClass ? new Set(access.ids) : null;
    const markAffectedReceived = item => { if (!affectedIds || affectedIds.has(item?.id)) markReceived(item); };
    students.forEach(markAffectedReceived);
    uniformRecords.forEach(markAffectedReceived);
    classStudents?.forEach(markAffectedReceived);
    uniformStateRequest += 1;
    students.forEach(item => {
      if (!affectedIds || affectedIds.has(item?.id)) {
        locallyUpdatedUniformIds.add(item.id);
        canonicalUniformState.set(item.id, { id:item.id, ...nextState });
      }
    });
    window.uniformStateByStudent = new Map(canonicalUniformState);
    // Atualização visual imediata: não espere uma consulta, evento em tempo
    // real ou troca de turma para refletir a alteração concluída.
    updateUniformSummary();
    render();
    button.disabled = false;
    toast(targetIsClass ? 'Todos os alunos da turma foram marcados como receberam.' : 'Todos os alunos foram marcados como receberam.');
  };
  document.addEventListener('carometro:data-loaded', () => {
    // O carregamento principal já trouxe os campos de Uniforme. Reutilize-o
    // em vez de iniciar uma segunda consulta que possa chegar fora de ordem.
    syncUniformState(students.map(student => ({
      id:student.id,
      uniform_pending:student.uniform_pending,
      uniform_received:student.uniform_received,
      shoes_received:student.shoes_received,
      material_received:student.material_received
    })), { preserveLocal:true });
    if (!modal.classList.contains('hidden')) { classOptions(); loadClassStudents(); }
  });
  document.addEventListener('carometro:permission-refresh', () => {
    syncUniformNavigation();
    if (!modal.classList.contains('hidden')) render();
  });
  new MutationObserver(syncUniformNavigation).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  setTimeout(syncUniformNavigation, 0);

});
