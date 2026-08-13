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
  modal.innerHTML = `<section class="modal occurrence-dialog"><div class="modal-head"><div><h3>Ocorrência</h3><div class="meta">Registre e consulte ocorrências por aluno e por data.</div></div><button class="close" id="closeOccurrence" type="button" aria-label="Fechar">×</button></div><div class="form occurrence-form"><div class="occurrence-grid"><div class="field"><label for="occurrenceClass">Turma</label><select id="occurrenceClass"><option value="">Selecione uma turma</option></select></div><div class="field"><label for="occurrenceStudent">Aluno</label><select id="occurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></div></div><div class="occurrence-grid occurrence-dates"><div class="field"><label for="occurrenceDate">Data da nova ocorrência</label><input id="occurrenceDate" type="date"></div><div class="field"><label for="occurrenceStart">Buscar a partir de</label><input id="occurrenceStart" type="date"></div><div class="field"><label for="occurrenceEnd">Buscar até</label><input id="occurrenceEnd" type="date"></div></div><div class="field"><label for="occurrenceText">Descrição</label><textarea id="occurrenceText" maxlength="500" placeholder="Descreva a ocorrência em até 500 caracteres."></textarea><div class="occurrence-text-meta"><span id="occurrenceTextCount">0/500</span><span>A ocorrência fica visível somente nesta aba.</span></div></div><div class="actions occurrence-actions"><button class="btn secondary" id="searchOccurrences" type="button">Buscar por datas</button><button class="btn primary" id="saveOccurrence" type="button">Salvar ocorrência</button></div><section class="occurrence-history"><div class="occurrence-history-head"><div><b>Ocorrências registradas</b><div class="meta" id="occurrenceHistoryMeta">Selecione uma turma ou aluno para consultar.</div></div></div><div id="occurrenceHistoryList" class="occurrence-history-list"></div></section></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #occurrenceNav { border:0; background:#202d47; color:#fff; } #occurrenceNav:hover { background:#34496f; }
    .occurrence-modal { z-index:112; }.occurrence-dialog { width:min(820px,100%); }.occurrence-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:12px; }.occurrence-dates { grid-template-columns:repeat(3,1fr); }.occurrence-form textarea { min-height:120px; }.occurrence-text-meta { display:flex; justify-content:space-between; gap:10px; margin-top:6px; color:var(--muted); font-size:12px; }.occurrence-actions { justify-content:space-between; }.occurrence-history { margin-top:22px; border-top:1px solid var(--line); padding-top:18px; }.occurrence-history-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:11px; }.occurrence-history-list { display:grid; gap:9px; max-height:290px; overflow:auto; padding-right:3px; }.occurrence-item { border:1px solid var(--line); border-radius:9px; padding:12px; background:#fafbfc; }.occurrence-item-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:7px; }.occurrence-item-date { color:#344054; font-size:13px; font-weight:800; }.occurrence-item-student { color:var(--muted); font-size:12px; }.occurrence-item-text { white-space:pre-wrap; line-height:1.45; font-size:14px; }.occurrence-empty { padding:23px 10px; color:var(--muted); text-align:center; }.occurrence-label { display:inline-flex; width:max-content; margin-top:6px; padding:4px 8px; border-radius:99px; background:#101828; color:#fff; font-size:11px; font-weight:800; line-height:1.15; }.occurrence-detail-label { margin-top:7px; }
    @media(max-width:800px) { .side .nav #occurrenceNav { flex:1 1 0!important; min-width:0; }.occurrence-modal { padding:10px; align-items:center; }.occurrence-dialog { width:100%; max-height:calc(100dvh - 20px); }.occurrence-dialog .modal-head { padding:16px; }.occurrence-form { padding:16px; }.occurrence-grid,.occurrence-dates { grid-template-columns:1fr; gap:0; }.occurrence-actions { display:grid; grid-template-columns:1fr; gap:8px; }.occurrence-actions .btn { width:100%; }.occurrence-text-meta { flex-direction:column; gap:3px; }.occurrence-history-list { max-height:34vh; }.occurrence-item-head { flex-direction:column; gap:3px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const today = () => new Date().toISOString().slice(0, 10);
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00`)) : 'Sem data';
  let occurrenceStudentIds = new Set();
  let occurrenceCounts = new Map();
  let tableErrorShown = false;

  function selectedClass() { return get('occurrenceClass').value; }
  function selectedStudent() { return get('occurrenceStudent').value; }
  function fillClasses() {
    const select = get('occurrenceClass');
    const current = select.value || selectedClassId || '';
    select.innerHTML = '<option value="">Selecione uma turma</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (classes.some(item => item.id === current)) select.value = current;
  }
  function fillStudents() {
    const classId = selectedClass();
    const select = get('occurrenceStudent');
    const current = select.value;
    const classStudents = students.filter(item => item.classId === classId).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity:'base' }));
    select.disabled = !classId;
    select.innerHTML = classId
      ? '<option value="">Selecione um aluno</option>' + classStudents.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('')
      : '<option value="">Selecione a turma primeiro</option>';
    if (classStudents.some(item => item.id === current)) select.value = current;
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
    let query = db.from('student_occurrences')
      .select('id,student_id,class_id,class_name,occurred_on,occurrence_text,created_at,students(full_name)')
      .order('occurred_on', { ascending:false })
      .order('created_at', { ascending:false });
    if (classId) query = query.eq('class_id', classId);
    if (studentId) query = query.eq('student_id', studentId);
    if (get('occurrenceStart').value) query = query.gte('occurred_on', get('occurrenceStart').value);
    if (get('occurrenceEnd').value) query = query.lte('occurred_on', get('occurrenceEnd').value);
    const { data, error } = await query;
    const list = get('occurrenceHistoryList');
    if (error) {
      list.innerHTML = '<div class="occurrence-empty">Não foi possível consultar as ocorrências.</div>';
      get('occurrenceHistoryMeta').textContent = error.message;
      return;
    }
    const records = data || [];
    get('occurrenceHistoryMeta').textContent = records.length ? `${records.length} ocorrência${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}.` : 'Nenhuma ocorrência no filtro selecionado.';
    list.innerHTML = records.length ? records.map(item => `<article class="occurrence-item"><div class="occurrence-item-head"><span class="occurrence-item-date">${formatDate(item.occurred_on)}</span><span class="occurrence-item-student">${escape(item.students?.full_name || 'Aluno removido')} · ${escape(item.class_name || 'Turma não informada')}</span></div><div class="occurrence-item-text">${escape(item.occurrence_text)}</div></article>`).join('') : '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
  }
  async function open() {
    modal.classList.remove('hidden');
    await load();
    fillClasses();
    fillStudents();
    get('occurrenceDate').value ||= today();
    await refreshLabelState();
    await refreshHistory();
  }
  async function save() {
    const classId = selectedClass();
    const studentId = selectedStudent();
    const text = get('occurrenceText').value.trim();
    const occurrenceDate = get('occurrenceDate').value;
    const classItem = classes.find(item => item.id === classId);
    if (!classItem || !studentId) { toast('Selecione a turma e o aluno.'); return; }
    if (!occurrenceDate) { toast('Selecione a data da ocorrência.'); return; }
    if (!text) { toast('Digite a descrição da ocorrência.'); return; }
    const button = get('saveOccurrence');
    button.disabled = true;
    const { error } = await db.from('student_occurrences').insert({
      student_id:studentId,
      class_id:classId,
      class_name:classItem.name,
      occurred_on:occurrenceDate,
      occurrence_text:text
    });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    occurrenceStudentIds.add(studentId);
    occurrenceCounts.set(studentId, (occurrenceCounts.get(studentId) || 0) + 1);
    paintStudentCards();
    get('occurrenceText').value = '';
    get('occurrenceTextCount').textContent = '0/500';
    toast('Ocorrência salva. A etiqueta foi atualizada no card do aluno.');
    await refreshHistory();
  }

  occurrenceButton.onclick = open;
  get('closeOccurrence').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('occurrenceClass').onchange = async () => { fillStudents(); await refreshHistory(); };
  get('occurrenceStudent').onchange = refreshHistory;
  get('searchOccurrences').onclick = refreshHistory;
  get('saveOccurrence').onclick = save;
  get('occurrenceText').oninput = () => { get('occurrenceTextCount').textContent = `${get('occurrenceText').value.length}/500`; };
  ['occurrenceStart', 'occurrenceEnd'].forEach(id => { get(id).onchange = refreshHistory; });
  new MutationObserver(paintStudentCards).observe(get('list'), { childList:true });
  new MutationObserver(paintStudentCards).observe(get('studentDetails'), { childList:true, subtree:true });
  new MutationObserver(() => {
    if (!get('app').classList.contains('hidden')) refreshLabelState();
  }).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  document.addEventListener('carometro:occurrences-changed', async () => {
    await refreshLabelState();
    if (!modal.classList.contains('hidden')) await refreshHistory();
  });

  setTimeout(() => {
    const previousLoad = window.load;
    if (typeof previousLoad !== 'function' || previousLoad.__occurrencesWrapped) return;
    const wrappedLoad = async (...args) => {
      const result = await previousLoad(...args);
      await refreshLabelState();
      if (!modal.classList.contains('hidden')) { fillClasses(); fillStudents(); await refreshHistory(); }
      return result;
    };
    wrappedLoad.__occurrencesWrapped = true;
    window.load = wrappedLoad;
  }, 0);
});
