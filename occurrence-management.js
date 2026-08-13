document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const uniformNav = document.getElementById('uniformNav');
  if (!nav || !uniformNav) return;

  const occurrenceButton = document.createElement('button');
  occurrenceButton.id = 'occurrenceNav';
  occurrenceButton.type = 'button';
  occurrenceButton.innerHTML = '<span>● &nbsp; Ocorrência</span>';
  uniformNav.insertAdjacentElement('afterend', occurrenceButton);

  const modal = document.createElement('div');
  modal.id = 'occurrenceModal';
  modal.className = 'modal-bg occurrence-modal hidden';
  modal.innerHTML = `<section class="modal occurrence-dialog"><div class="modal-head"><div><h3>Ocorrência</h3><div class="meta">Registre e consulte ocorrências por aluno e por data.</div></div><button class="close" id="closeOccurrence" type="button" aria-label="Fechar">×</button></div><div class="form occurrence-form"><div class="occurrence-grid"><div class="field"><label for="occurrenceClass">Turma</label><select id="occurrenceClass"><option value="">Selecione uma turma</option></select></div><div class="field"><label for="occurrenceStudent">Aluno</label><select id="occurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></div></div><div class="field occurrence-date-field"><label for="occurrenceDate">Data da nova ocorrência</label><input id="occurrenceDate" type="date"></div><div class="field"><label for="occurrenceText">Descrição</label><textarea id="occurrenceText" maxlength="500" placeholder="Descreva a ocorrência em até 500 caracteres."></textarea><div class="occurrence-text-meta"><span id="occurrenceTextCount">0/500</span><span>A ocorrência fica visível somente nesta aba.</span></div></div><div class="actions occurrence-actions"><button class="btn secondary" id="searchOccurrences" type="button" aria-expanded="false">Buscar Ocorrência</button><button class="btn primary" id="saveOccurrence" type="button">Salvar ocorrência</button></div><div id="occurrenceDateFilters" class="occurrence-date-filters hidden"><div class="occurrence-grid occurrence-dates"><div class="field"><label for="occurrenceStart">Buscar a partir de</label><input id="occurrenceStart" type="date"></div><div class="field"><label for="occurrenceEnd">Buscar até</label><input id="occurrenceEnd" type="date"></div></div><div class="occurrence-grid occurrence-search-fields"><div class="field"><label for="occurrenceSearchClass">Buscar por turma</label><select id="occurrenceSearchClass"><option value="">Todas as turmas</option></select></div><div class="field"><label for="occurrenceSearchName">Buscar por nome</label><input id="occurrenceSearchName" placeholder="Digite o nome do aluno"></div></div><div class="meta">Os resultados são atualizados assim que você escolher os filtros.</div></div><section class="occurrence-history"><div class="occurrence-history-head"><div><b>Ocorrências registradas</b><div class="meta" id="occurrenceHistoryMeta">Selecione uma turma ou aluno para consultar.</div></div></div><div id="occurrenceHistoryList" class="occurrence-history-list"></div></section></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #occurrenceNav { border:0; background:#2b3c5d; color:#fff; } #occurrenceNav:hover { background:#38527e; }
    .occurrence-modal { z-index:112; }.occurrence-dialog { width:min(820px,100%); }.occurrence-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:12px; }.occurrence-dates,.occurrence-search-fields { grid-template-columns:1fr 1fr; }.occurrence-date-field { max-width:260px; }.occurrence-date-filters { margin-top:14px; padding:14px; border:1px solid #dbe4f5; border-radius:10px; background:#f8faff; }.occurrence-date-filters .field { margin-bottom:7px; }.occurrence-form textarea { min-height:120px; }.occurrence-text-meta { display:flex; justify-content:space-between; gap:10px; margin-top:6px; color:var(--muted); font-size:12px; }.occurrence-actions { justify-content:space-between; }.occurrence-history { margin-top:22px; border-top:1px solid var(--line); padding-top:18px; }.occurrence-history-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:11px; }.occurrence-history-list { display:grid; gap:9px; max-height:290px; overflow:auto; padding-right:3px; }.occurrence-item { border:1px solid var(--line); border-radius:9px; padding:12px; background:#fafbfc; }.occurrence-item-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:7px; }.occurrence-item-date { color:#344054; font-size:13px; font-weight:800; }.occurrence-item-actions { display:flex; gap:6px; margin-left:auto; }.occurrence-item-actions button { min-height:29px; padding:5px 8px; border-radius:6px; font-size:12px; font-weight:750; }.occurrence-edit { background:#e8efff; color:#214dba; }.occurrence-delete { background:#fff0ed; color:#b42318; }.occurrence-item-student { color:var(--muted); font-size:12px; }.occurrence-item-text { white-space:pre-wrap; line-height:1.45; font-size:14px; }.occurrence-responsible { display:inline-flex; width:max-content; max-width:100%; margin-top:9px; padding:4px 8px; border-radius:99px; background:#172b4d; color:#fff; font-size:11px; font-weight:800; line-height:1.25; overflow-wrap:anywhere; }.occurrence-empty { padding:23px 10px; color:var(--muted); text-align:center; }.occurrence-label { display:inline-flex; width:max-content; margin-top:6px; padding:4px 8px; border-radius:99px; background:#101828; color:#fff; font-size:11px; font-weight:800; line-height:1.15; }.occurrence-detail-label { margin-top:7px; }
    @media(max-width:800px) { .side .nav #occurrenceNav { flex:1 1 0!important; min-width:0; }.occurrence-modal { padding:10px; align-items:center; }.occurrence-dialog { width:100%; max-height:calc(100dvh - 20px); }.occurrence-dialog .modal-head { padding:16px; }.occurrence-form { padding:16px; }.occurrence-grid,.occurrence-dates { grid-template-columns:1fr; gap:0; }.occurrence-actions { display:grid; grid-template-columns:1fr; gap:8px; }.occurrence-actions .btn { width:100%; }.occurrence-text-meta { flex-direction:column; gap:3px; }.occurrence-history-list { max-height:34vh; }.occurrence-item-head { flex-direction:column; gap:3px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const isCoordinator = () => !!permission?.is_coordinator;
  const hasOccurrencePermission = key => isAdmin() || (isCoordinator() && !!(permission?.can_edit_all || permission?.[key]));
  const canRegisterOccurrence = () => hasOccurrencePermission('can_register_occurrences');
  const canEditOccurrence = item => isAdmin() || (item.created_by === user?.id && hasOccurrencePermission('can_edit_occurrences'));
  const canDeleteOccurrence = item => isAdmin() || (item.created_by === user?.id && hasOccurrencePermission('can_delete_occurrences'));
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const today = () => new Date().toISOString().slice(0, 10);
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00`)) : 'Sem data';
  let occurrenceStudentIds = new Set();
  let occurrenceCounts = new Map();
  let tableErrorShown = false;
  let historyRecords = new Map();
  let editingOccurrence = null;

  function selectedClass() { return get('occurrenceClass').value; }
  function selectedStudent() { return get('occurrenceStudent').value; }
  function syncSaveAction() {
    const button = get('saveOccurrence');
    const allowed = editingOccurrence ? canEditOccurrence(editingOccurrence) : canRegisterOccurrence();
    button.disabled = !selectedClass() || !allowed;
    button.title = button.disabled ? 'O administrador precisa liberar a permissão de Ocorrência para esta turma.' : '';
  }
  function fillClasses() {
    const select = get('occurrenceClass');
    const current = select.value || selectedClassId || '';
    select.innerHTML = '<option value="">Selecione uma turma</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (classes.some(item => item.id === current)) select.value = current;
  }
  function fillSearchClasses() {
    const select = get('occurrenceSearchClass');
    const current = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (classes.some(item => item.id === current)) select.value = current;
  }
  function fillStudents() {
    const classId = selectedClass();
    const select = get('occurrenceStudent');
    const current = select.value;
    // Alguns cadastros trazem a numeração da chamada antes do nome. Preserve
    // essa numeração no seletor, mas ordene pelo nome do aluno.
    const nameForSort = value => String(value || '').replace(/^\s*\d+\s*[.)-]?\s*/, '');
    const classStudents = students.filter(item => item.classId === classId).sort((a, b) => nameForSort(a.name).localeCompare(nameForSort(b.name), 'pt-BR', { sensitivity:'base', numeric:true }));
    select.disabled = !classId;
    select.innerHTML = classId
      ? '<option value="">Selecione um aluno</option>' + classStudents.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('')
      : '<option value="">Selecione a turma primeiro</option>';
    if (classStudents.some(item => item.id === current)) select.value = current;
    syncSaveAction();
  }
  function paintStudentCards() {
    document.querySelectorAll('#list .student').forEach(card => {
      const studentId = card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
      const existing = card.querySelector('.occurrence-label');
      if (!occurrenceStudentIds.has(studentId)) { existing?.remove(); return; }
      if (existing) return;
      const holder = card.querySelector('.name')?.parentElement;
      if (!holder) return;
      const label = document.createElement('span');
      label.className = 'occurrence-label';
      label.textContent = 'Ocorrência';
      holder.appendChild(label);
    });
    const detail = get('studentDetails');
    const detailLabel = detail.querySelector('.occurrence-detail-label');
    if (!detailStudentId || !occurrenceStudentIds.has(detailStudentId)) {
      detailLabel?.remove();
      return;
    }
    const count = occurrenceCounts.get(detailStudentId) || 0;
    if (detailLabel) {
      const labelText = `Ocorrência · ${count}`;
      if (detailLabel.textContent !== labelText) detailLabel.textContent = labelText;
      return;
    }
    const detailHolder = detail.querySelector('.detail-head > div:last-child');
    if (!detailHolder) return;
    const label = document.createElement('span');
    label.className = 'occurrence-label occurrence-detail-label';
    label.textContent = `Ocorrência · ${count}`;
    detailHolder.appendChild(label);
  }
  async function refreshLabelState() {
    const { data, error } = await db.from('student_occurrences').select('student_id');
    if (error) {
      if (!tableErrorShown) {
        tableErrorShown = true;
        toast('O controle de Ocorrências ainda não foi instalado no banco. Execute o script supabase-occurrences.sql.');
      }
      return;
    }
    tableErrorShown = false;
    occurrenceCounts = new Map();
    (data || []).forEach(item => occurrenceCounts.set(item.student_id, (occurrenceCounts.get(item.student_id) || 0) + 1));
    occurrenceStudentIds = new Set(occurrenceCounts.keys());
    paintStudentCards();
  }
  async function refreshHistory() {
    const classId = selectedClass();
    const studentId = selectedStudent();
    const searchClassId = get('occurrenceSearchClass').value;
    const startDate = get('occurrenceStart').value;
    const endDate = get('occurrenceEnd').value;
    const normalizedName = get('occurrenceSearchName').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    const hasSearchFilter = !!(startDate || endDate || searchClassId || normalizedName);
    const list = get('occurrenceHistoryList');
    if (!hasSearchFilter) {
      historyRecords = new Map();
      get('occurrenceHistoryMeta').textContent = 'Use Buscar Ocorrência para consultar os registros.';
      list.innerHTML = '<div class="occurrence-empty">Preencha ao menos um filtro para ver as ocorrências.</div>';
      return;
    }
    let query = db.from('student_occurrences')
      .select('id,student_id,class_id,class_name,occurred_on,occurrence_text,created_at,created_by,created_by_name,students(full_name)')
      .order('occurred_on', { ascending:false })
      .order('created_at', { ascending:false });
    if (normalizedName) {
      const matches = students.filter(item => String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedName) && (!searchClassId || item.classId === searchClassId));
      if (!matches.length) {
        get('occurrenceHistoryMeta').textContent = 'Nenhum aluno encontrado com esse nome.';
        get('occurrenceHistoryList').innerHTML = '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
        return;
      }
      query = query.in('student_id', matches.map(item => item.id));
    } else if (searchClassId) query = query.eq('class_id', searchClassId);
    else if (studentId) query = query.eq('student_id', studentId);
    else if (classId) query = query.eq('class_id', classId);
    if (startDate) query = query.gte('occurred_on', startDate);
    if (endDate) query = query.lte('occurred_on', endDate);
    const { data, error } = await query;
    if (error) {
      list.innerHTML = '<div class="occurrence-empty">Não foi possível consultar as ocorrências.</div>';
      get('occurrenceHistoryMeta').textContent = error.message;
      return;
    }
    const records = data || [];
    historyRecords = new Map(records.map(item => [item.id, item]));
    get('occurrenceHistoryMeta').textContent = records.length ? `${records.length} ocorrência${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}.` : 'Nenhuma ocorrência no filtro selecionado.';
    list.innerHTML = records.length ? records.map(item => `<article class="occurrence-item"><div class="occurrence-item-head"><span class="occurrence-item-date">${formatDate(item.occurred_on)}</span><div class="occurrence-item-actions">${canEditOccurrence(item) ? `<button class="occurrence-edit" type="button" data-occurrence-edit="${item.id}">Editar</button>` : ''}${canDeleteOccurrence(item) ? `<button class="occurrence-delete" type="button" data-occurrence-delete="${item.id}">Excluir</button>` : ''}</div><span class="occurrence-item-student">${escape(item.students?.full_name || 'Aluno removido')} · ${escape(item.class_name || 'Turma não informada')}</span></div><div class="occurrence-item-text">${escape(item.occurrence_text)}</div><span class="occurrence-responsible">Responsável: ${escape(item.created_by_name || 'Não informado')}</span></article>`).join('') : '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
  }
  async function open() {
    modal.classList.remove('hidden');
    await load();
    fillClasses();
    fillSearchClasses();
    fillStudents();
    await refreshLabelState();
    await refreshHistory();
    syncSaveAction();
  }
  function resetOccurrenceScreen() {
    editingOccurrence = null;
    get('occurrenceClass').value = '';
    fillStudents();
    get('occurrenceDate').value = '';
    get('occurrenceText').value = '';
    get('occurrenceTextCount').textContent = '0/500';
    get('occurrenceStart').value = '';
    get('occurrenceEnd').value = '';
    get('occurrenceSearchClass').value = '';
    get('occurrenceSearchName').value = '';
    get('occurrenceDateFilters').classList.add('hidden');
    get('searchOccurrences').setAttribute('aria-expanded', 'false');
    get('saveOccurrence').textContent = 'Salvar ocorrência';
    refreshHistory();
    syncSaveAction();
  }
  async function save() {
    const classId = selectedClass();
    const studentId = selectedStudent();
    const text = get('occurrenceText').value.trim();
    const occurrenceDate = get('occurrenceDate').value;
    const classItem = classes.find(item => item.id === classId);
    if (!editingOccurrence && (!classItem || !studentId)) { toast('Selecione a turma e o aluno.'); return; }
    if (!editingOccurrence && !canRegisterOccurrence()) { toast('Sem permissão para registrar ocorrência.'); return; }
    if (editingOccurrence && !canEditOccurrence(editingOccurrence)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    if (!occurrenceDate) { toast('Selecione a data da ocorrência.'); return; }
    if (!text) { toast('Digite a descrição da ocorrência.'); return; }
    const button = get('saveOccurrence');
    button.disabled = true;
    const { error } = editingOccurrence
      ? await db.from('student_occurrences').update({ occurred_on:occurrenceDate, occurrence_text:text }).eq('id', editingOccurrence.id)
      : await db.from('student_occurrences').insert({ student_id:studentId, class_id:classId, class_name:classItem.name, occurred_on:occurrenceDate, occurrence_text:text });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    const wasEditing = !!editingOccurrence;
    if (!wasEditing) {
      occurrenceStudentIds.add(studentId);
      occurrenceCounts.set(studentId, (occurrenceCounts.get(studentId) || 0) + 1);
    }
    paintStudentCards();
    if (!wasEditing) resetOccurrenceScreen();
    else {
      get('occurrenceText').value = '';
      get('occurrenceTextCount').textContent = '0/500';
      editingOccurrence = null;
      get('saveOccurrence').textContent = 'Salvar ocorrência';
    }
    toast(wasEditing ? 'Ocorrência atualizada.' : 'Ocorrência salva. A etiqueta foi atualizada no card do aluno.');
    await refreshHistory();
  }

  function editOccurrence(item) {
    if (!canEditOccurrence(item)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    editingOccurrence = item;
    get('occurrenceClass').value = item.class_id || '';
    fillStudents();
    get('occurrenceStudent').value = item.student_id;
    get('occurrenceDate').value = item.occurred_on;
    get('occurrenceText').value = item.occurrence_text;
    get('occurrenceTextCount').textContent = `${item.occurrence_text.length}/500`;
    get('saveOccurrence').textContent = 'Salvar alterações';
    syncSaveAction();
    get('occurrenceText').focus();
  }
  async function deleteOccurrence(item) {
    if (!canDeleteOccurrence(item)) { toast('Sem permissão para excluir esta ocorrência.'); return; }
    if (!confirm(`Excluir a ocorrência de ${formatDate(item.occurred_on)}?`)) return;
    const { error } = await db.from('student_occurrences').delete().eq('id', item.id);
    if (error) { toast(error.message); return; }
    const nextCount = Math.max(0, (occurrenceCounts.get(item.student_id) || 1) - 1);
    if (nextCount) occurrenceCounts.set(item.student_id, nextCount);
    else { occurrenceCounts.delete(item.student_id); occurrenceStudentIds.delete(item.student_id); }
    if (editingOccurrence?.id === item.id) {
      editingOccurrence = null;
      get('saveOccurrence').textContent = 'Salvar ocorrência';
      get('occurrenceText').value = '';
      get('occurrenceTextCount').textContent = '0/500';
    }
    paintStudentCards();
    resetOccurrenceScreen();
    toast('Ocorrência excluída.');
  }

  occurrenceButton.onclick = open;
  const closeOccurrence = () => { resetOccurrenceScreen(); modal.classList.add('hidden'); };
  get('closeOccurrence').onclick = closeOccurrence;
  modal.onclick = event => { if (event.target === modal) closeOccurrence(); };
  get('occurrenceClass').onchange = async () => { fillStudents(); await refreshHistory(); };
  get('occurrenceStudent').onchange = refreshHistory;
  get('searchOccurrences').onclick = () => {
    const filters = get('occurrenceDateFilters');
    const opening = filters.classList.contains('hidden');
    filters.classList.toggle('hidden', !opening);
    get('searchOccurrences').setAttribute('aria-expanded', String(opening));
  };
  get('saveOccurrence').onclick = save;
  get('occurrenceText').oninput = () => { get('occurrenceTextCount').textContent = `${get('occurrenceText').value.length}/500`; };
  get('occurrenceText').onkeydown = event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    // O campo de descrição aceita parágrafos; Enter nunca dispara salvamento.
    event.preventDefault();
    const input = get('occurrenceText');
    if (input.value.length >= 500) return;
    input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles:true }));
  };
  ['occurrenceStart', 'occurrenceEnd'].forEach(id => { get(id).onchange = refreshHistory; });
  get('occurrenceSearchClass').onchange = refreshHistory;
  let nameSearchTimer;
  get('occurrenceSearchName').oninput = () => { clearTimeout(nameSearchTimer); nameSearchTimer = setTimeout(refreshHistory, 250); };
  get('occurrenceHistoryList').onclick = event => {
    const editId = event.target.closest('[data-occurrence-edit]')?.dataset.occurrenceEdit;
    const deleteId = event.target.closest('[data-occurrence-delete]')?.dataset.occurrenceDelete;
    if (editId && historyRecords.has(editId)) editOccurrence(historyRecords.get(editId));
    if (deleteId && historyRecords.has(deleteId)) deleteOccurrence(historyRecords.get(deleteId));
  };
  new MutationObserver(paintStudentCards).observe(get('list'), { childList:true });
  new MutationObserver(paintStudentCards).observe(get('studentDetails'), { childList:true, subtree:true });
  new MutationObserver(() => {
    if (!get('app').classList.contains('hidden')) refreshLabelState();
  }).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  document.addEventListener('carometro:occurrences-changed', async () => {
    await refreshLabelState();
    if (!modal.classList.contains('hidden')) await refreshHistory();
  });
  document.addEventListener('carometro:permission-refresh', () => {
    syncSaveAction();
    if (!modal.classList.contains('hidden')) refreshHistory();
  });

  document.addEventListener('carometro:data-loaded', async () => {
    // Recursos adicionais recebem a conclusão da carga central sem encadear
    // wrappers em window.load, o que evita respostas fora de ordem.
    await refreshLabelState();
    if (!modal.classList.contains('hidden')) {
      fillClasses();
      fillSearchClasses();
      fillStudents();
      await refreshHistory();
    }
  });
});
