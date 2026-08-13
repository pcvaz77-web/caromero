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
  modal.innerHTML = `<section class="modal uniform-dialog"><div class="modal-head"><div><h3>Uniforme</h3><div class="meta">Escolha a turma e veja claramente a situação de cada aluno.</div></div><button class="close" type="button" id="closeUniform">×</button></div><div class="uniform-summary"><div><span>Sem uniforme</span><b id="pendingUniform">0</b></div><div><span>Sem tênis</span><b id="pendingShoes">0</b></div><div><span>Sem os dois</span><b id="pendingBoth">0</b></div></div><div class="uniform-bulk-action"><button id="markAllUniformReceived" class="btn secondary" type="button">✓ Marcar todos como receberam</button></div><div class="uniform-controls"><select id="uniformClass"><option value="">Selecione uma turma</option></select><select id="uniformView"><option value="all">Todos os alunos da turma</option><option value="pending">Somente alunos pendentes</option><option value="uniform">Somente sem uniforme</option><option value="shoes">Somente sem tênis</option><option value="both">Sem uniforme e tênis</option></select><input id="uniformSearch" placeholder="Buscar aluno"></div><div class="uniform-columns"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="uniformList" class="uniform-list"></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; } #uniformNav:hover { background:#38527e; } #toast { z-index:220!important; }
    .uniform-modal { z-index:110; padding:20px; overscroll-behavior:none; }.uniform-dialog { width:min(930px,100%); height:min(720px,calc(100dvh - 40px)); max-height:calc(100dvh - 40px); min-height:0; display:flex; flex-direction:column; overflow:hidden; }.uniform-dialog .modal-head { position:relative!important; top:auto!important; flex:none; }
    .uniform-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:15px 22px; border-bottom:1px solid var(--line); background:#f8faff; }.uniform-summary div { padding:10px; border:1px solid #dbe4f5; border-radius:9px; background:#fff; }.uniform-summary span { display:block; color:var(--muted); font-size:12px; font-weight:700; }.uniform-summary b { font-size:24px; color:#b42318; }
    .uniform-summary,.uniform-bulk-action,.uniform-controls,.uniform-columns { flex:none; }.uniform-bulk-action { display:flex; justify-content:flex-end; padding:12px 22px 0; }.uniform-bulk-action .btn { min-height:38px; font-size:13px; }.uniform-controls { display:grid; grid-template-columns:1fr 1.15fr .9fr; gap:10px; padding:15px 22px; }.uniform-controls input,.uniform-controls select { min-width:0; min-height:42px; padding:8px 10px; }.uniform-columns { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; padding:0 22px 9px; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }.uniform-list { flex:1 1 auto; min-height:90px; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); }.uniform-student b { display:block; }.uniform-student .meta { margin-top:4px; }.uniform-status { display:inline-flex; width:max-content; padding:6px 9px; border-radius:99px; font-size:12px; font-weight:800; }.uniform-status.received { background:#dcfae6; color:#087443; }.uniform-status.pending { background:#fee4e2; color:#b42318; }.uniform-action { display:grid; gap:6px; }.uniform-action select { min-height:37px; padding:6px 8px; font-size:13px; }.uniform-save { min-height:37px; padding:7px 10px; font-size:13px; }.uniform-card-label { margin-left:0; max-width:100%; white-space:normal; line-height:1.25; }.uniform-card-label.uniform-pending { background:#fee4e2; color:#b42318; }.uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media(max-width:800px) { .side .nav #uniformNav { flex:1 1 0!important; min-width:0; }.uniform-modal { padding:10px; align-items:center; }.uniform-dialog { width:100%; height:calc(100dvh - 20px); max-height:none; }.uniform-dialog .modal-head { padding:15px; }.uniform-summary { padding:10px 14px; gap:7px; }.uniform-summary div { padding:8px; }.uniform-summary span { font-size:10px; }.uniform-summary b { font-size:20px; }.uniform-bulk-action { padding:10px 14px 0; }.uniform-bulk-action .btn { width:100%; }.uniform-controls { grid-template-columns:1fr; padding:12px 14px; gap:7px; }.uniform-columns { display:none; }.uniform-list { min-height:72px; padding:0 14px 14px; }.uniform-row { grid-template-columns:1fr; gap:8px; }.uniform-card-label { font-size:11px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const isCounselor = () => !isAdmin() && !!window.isCounselorUser?.();
  const canRegisterUniform = student => {
    if (isAdmin()) return true;
    if (isCounselor()) {
      const rights = window.counselorRightsForClass?.(student?.classId);
      return !!(rights?.can_edit_all || rights?.can_edit_uniform);
    }
    return !!(permission?.can_edit_all || permission?.can_edit_uniform);
  };
  const bulkUniformAccess = () => {
    if (isAdmin()) return { allowed:true, ids:null };
    if (isCounselor()) {
      const classId = get('uniformClass').value;
      const rights = window.counselorRightsForClass?.(classId);
      const allowed = !!classId && !!rights?.can_mark_all_uniform_received;
      return { allowed, classId, ids:(classStudents || []).map(item => item.id) };
    }
    return { allowed:!!permission?.can_mark_all_uniform_received, classId:null, ids:null };
  };
  const escape = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const labels = { uniform:'Não recebeu uniforme', shoes:'Não recebeu tênis', both:'Não recebeu uniforme e tênis' };
  const pending = student => {
    const explicit = student?.uniform_pending || '';
    if (['uniform', 'shoes', 'both'].includes(explicit)) return explicit;

    // Os primeiros registros de uniforme foram salvos nos dois campos
    // booleanos. Use-os como fonte principal quando não houver a marcação
    // mais recente em uniform_pending.
    const needsUniform = student?.uniform_received === false;
    const needsShoes = student?.shoes_received === false;
    if (needsUniform && needsShoes) return 'both';
    if (needsUniform) return 'uniform';
    if (needsShoes) return 'shoes';
    return '';
  };
  const studentId = card => card.dataset.studentId || card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  let classStudents = null;
  let classStudentsRequest = 0;
  let uniformRecords = [];
  let uniformStateRequest = 0;
  let uniformStateErrorShown = false;

  function syncUniformState(records) {
    uniformRecords = records || [];
    const stateByStudent = new Map(uniformRecords.map(item => [item.id, item]));
    // Exponha a fonte canônica por aluno para a lista e o card principal.
    // Dessa forma uma etiqueta nunca usa uma cópia antiga do objeto do aluno.
    window.uniformStateByStudent = stateByStudent;
    students.forEach(student => {
      const state = stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
    });
    classStudents?.forEach(student => {
      const state = stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
    });
    // Recrie a lista e o card com o estado de Uniforme que acabou de chegar.
    // Isso evita que uma renderização anterior (sem esses campos) deixe de
    // mostrar as etiquetas, mesmo quando os contadores já estão corretos.
    // A lista principal já usa estes dados em memória. Não a redesenhe a
    // cada resposta de Uniforme: isso evitou a piscada da tela inteira.
  }
  async function refreshUniformState() {
    const requestId = ++uniformStateRequest;
    const { data, error } = await db.from('students').select('id,uniform_pending,uniform_received,shoes_received');
    if (requestId !== uniformStateRequest) return;
    if (error) {
      // Sem a coluna no banco, não há como calcular nem mostrar a situação.
      // Avise de forma explícita, em vez de deixar contadores silenciosamente em zero.
      if (!uniformStateErrorShown) {
        uniformStateErrorShown = true;
        toast(error.message.includes('uniform_pending')
          ? 'O controle de Uniforme ainda não foi instalado no banco. Execute o arquivo supabase-uniform-management.sql.'
          : `Não foi possível atualizar o Uniforme: ${error.message}`);
      }
      return;
    }
    uniformStateErrorShown = false;
    syncUniformState(data || []);
    if (!modal.classList.contains('hidden')) render();
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
    select.innerHTML = '<option value="">Selecione uma turma</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }
  function render() {
    classOptions();
    const bulkAccess = bulkUniformAccess();
    get('markAllUniformReceived').classList.toggle('hidden', !bulkAccess.allowed);
    // Os contadores são sempre gerais; os filtros abaixo servem apenas para
    // definir quais alunos aparecem na lista.
    const globalStudents = uniformRecords.length ? uniformRecords : students;
    get('pendingUniform').textContent = globalStudents.filter(item => pending(item) === 'uniform').length;
    get('pendingShoes').textContent = globalStudents.filter(item => pending(item) === 'shoes').length;
    get('pendingBoth').textContent = globalStudents.filter(item => pending(item) === 'both').length;
    const classId = get('uniformClass').value, view = get('uniformView').value, query = get('uniformSearch').value.trim().toLocaleLowerCase('pt-BR');
    const selectedClass = classes.find(item => item.id === classId);
    if (!classId) { get('uniformList').innerHTML = '<div class="uniform-empty">Escolha uma turma para ver os alunos.</div>'; return; }
    if (classStudents === null) { get('uniformList').innerHTML = '<div class="uniform-empty">Carregando alunos da turma…</div>'; return; }
    // A tela de Uniforme deve manter todos os alunos da turma juntos e em
    // ordem alfabética, independentemente da data em que foram cadastrados.
    const visible = classStudents.filter(item => {
      const type = pending(item);
      if (query && !item.name.toLocaleLowerCase('pt-BR').includes(query)) return false;
      if (view === 'all') return true;
      if (view === 'pending') return !!type;
      return type === view;
    }).sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));
    get('uniformList').innerHTML = visible.length ? visible.map(item => {
      const type = pending(item);
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student"><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div><div>${type ? `<span class="uniform-status pending">${labels[type]}</span>` : '<span class="uniform-status received">✓ Recebeu</span>'}</div>${canRegisterUniform(item) ? `<div class="uniform-action"><select class="uniform-select" aria-label="Registrar situação de uniforme"><option value="" ${!type ? 'selected' : ''}>Recebeu</option><option value="uniform" ${type === 'uniform' ? 'selected' : ''}>Não recebeu uniforme</option><option value="shoes" ${type === 'shoes' ? 'selected' : ''}>Não recebeu tênis</option><option value="both" ${type === 'both' ? 'selected' : ''}>Não recebeu uniforme e tênis</option></select></div>` : '<div class="meta">Consulta disponível.</div>'}</article>`;
    }).join('') : `<div class="uniform-empty">Nenhum aluno corresponde a este filtro.<br><br>${view !== 'all' ? 'Use “Todos os alunos da turma” para ver cada aluno e registrar a situação.' : 'Esta turma ainda não possui alunos cadastrados.'}</div>`;
    setTimeout(paintStudentCards, 0);
  }
  async function loadClassStudents() {
    const classId = get('uniformClass').value;
    const requestId = ++classStudentsRequest;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = selectedClassName(classes.find(item => item.id === classId)?.name);
    if (!classId) {
      classStudents = [];
      render();
      return;
    }
    // A lista principal já contém todos os alunos. Reaproveitá-la evita uma
    // segunda consulta completa que desmontava a janela e causava piscadas.
    classStudents = students
      .filter(item => item.classId === classId || selectedClassName(item.className) === selectedTargetName)
      .map(item => ({ ...item }));
    if (requestId === classStudentsRequest) render();
    return;
    classStudents = null;
    render();
    // Carregue sempre o conjunto completo antes de decidir a turma exibida.
    // Assim os contadores e as etiquetas usam a mesma fonte de dados que
    // funciona ao selecionar uma turma, inclusive com o filtro vazio.
    const { data, error } = await db.from('students')
      .select('id,full_name,class_id,class_name,uniform_pending,uniform_received,shoes_received')
      .order('full_name', { ascending:true });
    if (requestId !== classStudentsRequest) return;
    if (error) { classStudents = []; render(); toast('Não foi possível carregar os alunos desta turma.'); return; }
    // Há cadastros antigos que guardam somente o nome da turma. Considerar o
    // identificador e o nome impede que esses alunos fiquem fora do Uniforme.
    const normalizeClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const targetName = normalizeClassName(classes.find(item => item.id === classId)?.name);
    syncUniformState(data || []);
    if (!classId) {
      classStudents = [];
      render();
      return;
    }
    classStudents = (data || [])
      .filter(item => item.class_id === classId || normalizeClassName(item.class_name) === targetName)
      .map(item => ({
        id: item.id,
        name: item.full_name,
        classId: item.class_id,
        className: classes.find(cls => cls.id === item.class_id)?.name || item.class_name,
        uniform_pending: item.uniform_pending,
        uniform_received: item.uniform_received,
        shoes_received: item.shoes_received
      }));
    render();
  }
  async function open() {
    modal.classList.remove('hidden');
    await refreshUniformState();
    classOptions();
    render();
    if (get('uniformClass').value) await loadClassStudents();
    return;
    await load();
    // Mesmo sem selecionar turma, consulte todos os alunos antes de montar
    // os três contadores e as etiquetas da lista/cards.
    await refreshUniformState();
    classOptions();
    render();
    await loadClassStudents();
  }
  uniformButton.onclick = open; get('closeUniform').onclick = () => modal.classList.add('hidden'); modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('uniformClass').onchange = loadClassStudents;
  get('uniformView').onchange = render;
  get('uniformSearch').oninput = render;
  get('uniformList').onchange = async event => {
    const select = event.target.closest('.uniform-select'); if (!select) return;
    const row = select.closest('.uniform-row'); const student = classStudents?.find(item => item.id === row.dataset.id) || students.find(item => item.id === row.dataset.id);
    if (!canRegisterUniform(student)) return;
    const type = select.value;
    select.disabled = true;
    const nextState = {
      uniform_pending: type || null,
      uniform_received: type !== 'uniform' && type !== 'both',
      shoes_received: type !== 'shoes' && type !== 'both'
    };
    const { error } = await db.from('students').update(nextState).eq('id', row.dataset.id);
    if (error) { toast(error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message); select.disabled = false; return; }
    // Atualização imediata: contadores, lista e etiqueta não dependem de uma
    // nova abertura da janela nem de uma atualização posterior da página.
    const newStatus = type || '';
    const updateLocalStatus = item => {
      if (item?.id !== row.dataset.id) return;
      item.uniform_pending = newStatus;
      item.uniform_received = nextState.uniform_received;
      item.shoes_received = nextState.shoes_received;
    };
    students.forEach(updateLocalStatus);
    classStudents?.forEach(updateLocalStatus);
    uniformRecords.forEach(updateLocalStatus);
    window.uniformStateByStudent ||= new Map();
    window.uniformStateByStudent.set(row.dataset.id, { id:row.dataset.id, ...nextState });
    render();
    toast(type ? 'Pendência registrada.' : 'Aluno marcado como recebeu.');
    return;
    // A lista e o card principal renderizam a etiqueta diretamente a partir
    // do estado do aluno. Recrie-os agora, na mesma interação do select.
    window.render?.();
    render();
    paintStudentCards();
    toast(type ? 'Pendência registrada no card do aluno.' : 'Aluno marcado como recebeu.');
    await load();
    await loadClassStudents();
  };
  get('markAllUniformReceived').onclick = async () => {
    const access = bulkUniformAccess();
    if (!access.allowed) return;
    const targetIsClass = Array.isArray(access.ids);
    if (targetIsClass && !access.ids.length) { toast('Selecione uma turma com alunos para usar esta ação.'); return; }
    if (!confirm(targetIsClass ? 'Marcar todos os alunos desta turma como receberam uniforme e tênis?' : 'Marcar todos os alunos como receberam uniforme e tênis?')) return;
    const button = get('markAllUniformReceived');
    button.disabled = true;
    const nextState = { uniform_pending:null, uniform_received:true, shoes_received:true };
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
    };
    const affectedIds = targetIsClass ? new Set(access.ids) : null;
    const markAffectedReceived = item => { if (!affectedIds || affectedIds.has(item?.id)) markReceived(item); };
    students.forEach(markAffectedReceived);
    uniformRecords.forEach(markAffectedReceived);
    classStudents?.forEach(markAffectedReceived);
    window.uniformStateByStudent = new Map(students.map(item => [item.id, item]));
    // Atualização visual imediata: não espere uma consulta, evento em tempo
    // real ou troca de turma para refletir a alteração concluída.
    render();
    button.disabled = false;
    toast(targetIsClass ? 'Todos os alunos da turma foram marcados como receberam.' : 'Todos os alunos foram marcados como receberam.');
  };
  document.addEventListener('carometro:uniform-refresh', () => {
    refreshUniformState().then(() => {
      if (!modal.classList.contains('hidden')) { classOptions(); loadClassStudents(); }
      else paintStudentCards();
    });
  });
  document.addEventListener('carometro:permission-refresh', () => {
    if (!modal.classList.contains('hidden')) render();
  });

  // Este arquivo é carregado antes dos aprimoramentos que definem a versão
  // final de window.load. Aguarde o fim dos listeners de inicialização e só
  // então envolva a função definitiva; desse modo login, edição e realtime
  // sempre atualizam o estado global de Uniforme antes de redesenhar a tela.
  setTimeout(() => {
    const finalLoad = window.load;
    if (typeof finalLoad !== 'function' || finalLoad.__uniformWrapped) return;
    const wrappedLoad = async (...args) => {
      const result = await finalLoad(...args);
      await refreshUniformState();
      if (!modal.classList.contains('hidden')) render();
      return result;
    };
    wrappedLoad.__uniformWrapped = true;
    window.load = wrappedLoad;
  }, 0);
});
