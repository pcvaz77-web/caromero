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
  modal.innerHTML = `<section class="modal uniform-dialog"><div class="modal-head"><div><h3>Uniforme</h3><div class="meta">Escolha a turma e veja claramente a situação de cada aluno.</div></div><button class="close" type="button" id="closeUniform">×</button></div><div class="uniform-summary"><div><span>Sem uniforme</span><b id="pendingUniform">0</b></div><div><span>Sem tênis</span><b id="pendingShoes">0</b></div><div><span>Sem os dois</span><b id="pendingBoth">0</b></div></div><div class="uniform-controls"><select id="uniformClass"><option value="">Selecione uma turma</option></select><select id="uniformView"><option value="all">Todos os alunos da turma</option><option value="pending">Somente alunos pendentes</option><option value="uniform">Somente sem uniforme</option><option value="shoes">Somente sem tênis</option><option value="both">Sem uniforme e tênis</option></select><input id="uniformSearch" placeholder="Buscar aluno"></div><div class="uniform-columns"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="uniformList" class="uniform-list"></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; } #uniformNav:hover { background:#38527e; } #toast { z-index:220!important; }
    .uniform-modal { z-index:110; padding:20px; overscroll-behavior:none; }.uniform-dialog { width:min(930px,100%); height:min(720px,calc(100dvh - 40px)); max-height:calc(100dvh - 40px); display:flex; flex-direction:column; overflow:hidden; }
    .uniform-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:15px 22px; border-bottom:1px solid var(--line); background:#f8faff; }.uniform-summary div { padding:10px; border:1px solid #dbe4f5; border-radius:9px; background:#fff; }.uniform-summary span { display:block; color:var(--muted); font-size:12px; font-weight:700; }.uniform-summary b { font-size:24px; color:#b42318; }
    .uniform-controls { display:grid; grid-template-columns:1fr 1.15fr .9fr; gap:10px; padding:15px 22px; }.uniform-controls input,.uniform-controls select { min-width:0; min-height:42px; padding:8px 10px; }.uniform-columns { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; padding:0 22px 9px; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }.uniform-list { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); }.uniform-student b { display:block; }.uniform-student .meta { margin-top:4px; }.uniform-status { display:inline-flex; width:max-content; padding:6px 9px; border-radius:99px; font-size:12px; font-weight:800; }.uniform-status.received { background:#dcfae6; color:#087443; }.uniform-status.pending { background:#fee4e2; color:#b42318; }.uniform-action { display:grid; gap:6px; }.uniform-action select { min-height:37px; padding:6px 8px; font-size:13px; }.uniform-save { min-height:37px; padding:7px 10px; font-size:13px; }.uniform-card-label { margin-left:5px; }.uniform-card-label.uniform-pending { background:#fee4e2; color:#b42318; }.uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media(max-width:800px) { .side .nav #uniformNav { flex:1 1 0!important; min-width:0; }.uniform-modal { padding:10px; align-items:center; }.uniform-dialog { width:100%; height:calc(100dvh - 20px); max-height:none; }.uniform-dialog .modal-head { padding:15px; }.uniform-summary { padding:10px 14px; gap:7px; }.uniform-summary div { padding:8px; }.uniform-summary span { font-size:10px; }.uniform-summary b { font-size:20px; }.uniform-controls { grid-template-columns:1fr; padding:12px 14px; gap:7px; }.uniform-columns { display:none; }.uniform-list { padding:0 14px 14px; }.uniform-row { grid-template-columns:1fr; gap:8px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const escape = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const labels = { uniform:'Não recebeu uniforme', shoes:'Não recebeu tênis', both:'Não recebeu uniforme e tênis' };
  const pending = student => student?.uniform_pending || '';
  const studentId = card => card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  let classStudents = null;
  let classStudentsRequest = 0;

  function paintStudentCards() {
    document.querySelectorAll('#list .student').forEach(card => {
      const existing = card.querySelector('.uniform-card-label');
      const student = students.find(item => item.id === studentId(card));
      const type = pending(student);
      const meta = card.querySelector(':scope > div:nth-child(2) .meta');
      if (!meta) return;
      if (!type) {
        existing?.remove();
        if (!meta.textContent.trim()) meta.textContent = 'Cadastro individual';
        return;
      }
      if (existing?.textContent === labels[type]) return;
      existing?.remove();
      // A etiqueta substitui "Cadastro individual", sem ocupar uma linha extra.
      if (meta.textContent.trim() === 'Cadastro individual') meta.textContent = '';
      const tag = document.createElement('span');
      tag.className = 'representative-label uniform-card-label uniform-pending';
      tag.textContent = labels[type];
      meta.appendChild(tag);
    });
    const detail = students.find(item => item.id === detailStudentId);
    const existing = document.querySelector('#studentDetails .uniform-detail-row');
    if (!pending(detail)) { existing?.remove(); return; }
    if (existing) { const tag = existing.querySelector('.uniform-card-label'); if (tag) tag.textContent = labels[pending(detail)]; return; }
    const row = document.createElement('div');
    row.className = 'detail-row uniform-detail-row';
    row.innerHTML = '<b>Uniforme</b>';
    const tag = document.createElement('span');
    tag.className = 'representative-label uniform-card-label uniform-pending';
    tag.textContent = labels[pending(detail)];
    row.appendChild(tag);
    document.getElementById('studentDetails').appendChild(row);
  }
  new MutationObserver(() => setTimeout(paintStudentCards, 0)).observe(get('list'), { childList:true, subtree:true });
  new MutationObserver(() => setTimeout(paintStudentCards, 0)).observe(get('studentDetails'), { childList:true, subtree:true });

  function classOptions() {
    const select = get('uniformClass'); const current = select.value;
    select.innerHTML = '<option value="">Selecione uma turma</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }
  function render() {
    classOptions();
    const records = students;
    get('pendingUniform').textContent = records.filter(item => pending(item) === 'uniform').length;
    get('pendingShoes').textContent = records.filter(item => pending(item) === 'shoes').length;
    get('pendingBoth').textContent = records.filter(item => pending(item) === 'both').length;
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
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student"><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div><div>${type ? `<span class="uniform-status pending">${labels[type]}</span>` : '<span class="uniform-status received">✓ Recebeu</span>'}</div>${isAdmin() ? `<div class="uniform-action"><select class="uniform-select" aria-label="Registrar situação de uniforme"><option value="" ${!type ? 'selected' : ''}>Recebeu</option><option value="uniform" ${type === 'uniform' ? 'selected' : ''}>Não recebeu uniforme</option><option value="shoes" ${type === 'shoes' ? 'selected' : ''}>Não recebeu tênis</option><option value="both" ${type === 'both' ? 'selected' : ''}>Não recebeu uniforme e tênis</option></select></div>` : '<div class="meta">Consulta disponível.</div>'}</article>`;
    }).join('') : `<div class="uniform-empty">Nenhum aluno corresponde a este filtro.<br><br>${view !== 'all' ? 'Use “Todos os alunos da turma” para ver cada aluno e registrar a situação.' : 'Esta turma ainda não possui alunos cadastrados.'}</div>`;
    setTimeout(paintStudentCards, 0);
  }
  async function loadClassStudents() {
    const classId = get('uniformClass').value;
    const requestId = ++classStudentsRequest;
    classStudents = null;
    render();
    if (!classId) return;
    const { data, error } = await db.from('students')
      .select('id,full_name,class_id,class_name,uniform_pending')
      .order('full_name', { ascending:true });
    if (requestId !== classStudentsRequest) return;
    if (error) { classStudents = []; render(); toast('Não foi possível carregar os alunos desta turma.'); return; }
    // Há cadastros antigos que guardam somente o nome da turma. Considerar o
    // identificador e o nome impede que esses alunos fiquem fora do Uniforme.
    const normalizeClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const targetName = normalizeClassName(classes.find(item => item.id === classId)?.name);
    classStudents = (data || [])
      .filter(item => item.class_id === classId || normalizeClassName(item.class_name) === targetName)
      .map(item => ({
        id: item.id,
        name: item.full_name,
        classId: item.class_id,
        className: classes.find(cls => cls.id === item.class_id)?.name || item.class_name,
        uniform_pending: item.uniform_pending
      }));
    render();
  }
  async function open() {
    modal.classList.remove('hidden');
    await load();
    classOptions();
    await loadClassStudents();
  }
  uniformButton.onclick = open; get('closeUniform').onclick = () => modal.classList.add('hidden'); modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('uniformClass').onchange = loadClassStudents;
  get('uniformView').onchange = render;
  get('uniformSearch').oninput = render;
  get('uniformList').onchange = async event => {
    const select = event.target.closest('.uniform-select'); if (!select || !isAdmin()) return;
    const row = select.closest('.uniform-row'); const type = select.value;
    select.disabled = true;
    const { error } = await db.from('students').update({ uniform_pending:type || null }).eq('id', row.dataset.id);
    if (error) { toast(error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message); select.disabled = false; return; }
    toast(type ? 'Pendência registrada no card do aluno.' : 'Aluno marcado como recebeu.');
    await load();
    await loadClassStudents();
  };
  document.addEventListener('carometro:uniform-refresh', () => {
    if (!modal.classList.contains('hidden')) { classOptions(); loadClassStudents(); }
    else paintStudentCards();
  });
});
