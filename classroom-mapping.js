document.addEventListener('DOMContentLoaded', () => {
  const panelButton = document.createElement('button');
  panelButton.id = 'classPanelButton';
  panelButton.type = 'button';
  panelButton.className = 'btn primary hidden';
  panelButton.textContent = 'Painel da turma';

  const viewButton = document.createElement('button');
  viewButton.id = 'classroomMapButton';
  viewButton.type = 'button';
  viewButton.className = 'btn secondary hidden';
  viewButton.textContent = 'Mapeamento';

  const actions = document.querySelector('.top-actions');
  actions?.prepend(viewButton);
  actions?.prepend(panelButton);

  const style = document.createElement('style');
  style.textContent = `
    .classroom-map-modal { z-index:135; }
    .classroom-map-modal .modal { width:min(1080px,100%); }
    .classroom-map-shell { padding:20px 24px 26px; }
    .classroom-map-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
    .classroom-map-toolbar-group { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
    .classroom-map-toolbar label { display:flex; align-items:center; gap:7px; margin:0; font-size:13px; }
    .classroom-map-toolbar select { width:auto; min-width:66px; min-height:39px; padding:7px 9px; }
    .classroom-map-instructions { margin:-4px 0 14px; padding:10px 12px; border-radius:9px; background:#edf3ff; color:#40516f; font-size:12px; line-height:1.45; }
    .classroom-map-stage { border:1px solid #d8dfeb; border-radius:14px; background:#f7f9fd; padding:18px; overflow:auto; }
    .classroom-room-plan { min-width:620px; }
    .classroom-room-top { display:grid; grid-template-columns:1fr minmax(260px,460px) 1fr; align-items:start; gap:14px; margin-bottom:24px; }
    .classroom-map-front { width:min(460px,100%); justify-self:center; padding:10px; border-radius:7px; background:#17233a; color:#fff; text-align:center; font-size:12px; font-weight:850; letter-spacing:.08em; }
    .classroom-room-landmark { min-height:58px; padding:9px 11px; border:2px solid #8392aa; border-radius:9px; background:#fff; color:#344054; display:flex; align-items:center; justify-content:center; gap:8px; text-align:center; font-size:12px; font-weight:850; }
    .classroom-teacher-desk { grid-column:1; width:170px; max-width:100%; justify-self:start; }
    .classroom-door { grid-column:3; width:130px; max-width:100%; justify-self:end; border-color:#b7791f; background:#fff8e8; color:#8a570c; }
    .classroom-file-row-labels { display:grid; gap:13px; margin-bottom:8px; }
    .classroom-file-row-label { color:#52627c; text-align:center; font-size:11px; font-weight:850; letter-spacing:.04em; }
    .classroom-map-grid { display:grid; gap:13px; }
    .classroom-seat { position:relative; min-height:112px; padding:25px 8px 8px; border:2px dashed #cbd5e1; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; color:#8491a6; transition:.15s ease; }
    .classroom-seat-coordinate { position:absolute; top:6px; left:7px; color:#667085; font-size:10px; font-weight:850; }
    .classroom-seat[data-filled="1"] { border-style:solid; border-color:#b9c9ea; color:var(--navy); box-shadow:0 4px 12px #17233a10; }
    .classroom-seat.drag-over { border-color:var(--blue); background:#edf3ff; }
    .classroom-student { width:100%; display:flex; flex-direction:column; align-items:center; gap:7px; text-align:center; cursor:pointer; user-select:none; }
    .classroom-student[draggable="true"]:active { cursor:grabbing; }
    .classroom-student.selected { outline:3px solid #8fb2ff; outline-offset:3px; border-radius:10px; }
    .classroom-student-avatar { width:54px; height:54px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:#dce6ff; color:#315dbb; font-weight:850; flex:none; }
    .classroom-student-avatar img { width:100%; height:100%; object-fit:cover; }
    .classroom-student-name { max-width:120px; font-size:12px; line-height:1.25; font-weight:780; }
    .classroom-unassigned { margin-top:16px; padding:14px; border:1px solid #d8dfeb; border-radius:12px; background:#fff; }
    .classroom-unassigned h4 { margin:0 0 11px; font-size:14px; }
    .classroom-unassigned-list { display:flex; gap:9px; flex-wrap:wrap; min-height:60px; }
    .classroom-unassigned-dropzone { margin-bottom:12px; padding:12px; border:2px dashed #9eabc0; border-radius:10px; color:#52627c; text-align:center; font-size:13px; font-weight:800; cursor:pointer; }
    .classroom-unassigned-dropzone:hover { border-color:var(--blue); background:#edf3ff; }
    .classroom-unassigned .classroom-student { width:112px; padding:8px; border:1px solid #e1e6ef; border-radius:10px; }
    .classroom-map-readonly .classroom-student { cursor:default; }
    .classroom-map-status { font-size:13px; font-weight:750; color:var(--muted); }
    .classroom-panel-card { padding:18px; border:1px solid var(--line); border-radius:12px; background:#f8faff; }
    .classroom-panel-card h4 { margin:0 0 6px; font-size:17px; }
    .classroom-panel-card p { margin:0 0 15px; color:var(--muted); font-size:13px; }
    @media(max-width:800px) {
      .classroom-map-modal { padding:8px; align-items:start; overflow:auto; }
      .classroom-map-modal .modal { max-height:calc(100dvh - 16px); }
      .classroom-map-shell { padding:15px; }
      .classroom-map-stage { padding:12px; }
      .classroom-seat { min-height:102px; }
      #classPanelButton, #classroomMapButton { flex:1 1 auto; }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'classroomMapModal';
  modal.className = 'modal-bg classroom-map-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3 id="classroomMapTitle">Mapeamento da sala</h3><div id="classroomMapMeta" class="meta"></div></div><button class="close" type="button" data-map-close>×</button></div><div id="classroomMapContent" class="classroom-map-shell"></div></div>`;
  document.body.appendChild(modal);

  const defaultLayout = () => ({ rows:6, columns:5, assignments:[] });
  const fileRowOptions = Array.from({ length:20 }, (_, index) => index + 1);
  const deskOptions = Array.from({ length:30 }, (_, index) => index + 1);
  let availabilityGeneration = 0;
  let activeClassId = null;
  let activeCanEdit = false;
  let editingLayout = null;
  let selectedStudentId = null;
  let publishedByClass = new Map();

  const closeModal = () => modal.classList.add('hidden');
  modal.querySelector('[data-map-close]').onclick = closeModal;
  modal.onclick = event => { if (event.target === modal) closeModal(); };

  const classStudents = classId => students
    .filter(student => student.classId === classId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric:true, sensitivity:'base' }));
  const studentCard = (student, draggable) => `<div class="classroom-student" data-student-id="${student.id}" ${draggable ? 'draggable="true"' : ''}><div class="classroom-student-avatar">${student.photoUrl ? `<img src="${student.photoUrl}" alt="" draggable="false">` : ini(student.name)}</div><div class="classroom-student-name">${esc(student.name)}</div></div>`;
  const normalizeLayout = layout => {
    const rows = Math.min(30, Math.max(1, Number(layout?.rows) || 6));
    const columns = Math.min(20, Math.max(1, Number(layout?.columns) || 5));
    const limit = rows * columns;
    const known = new Set(classStudents(activeClassId).map(item => item.id));
    const seenStudents = new Set();
    const seenSeats = new Set();
    const assignments = (Array.isArray(layout?.assignments) ? layout.assignments : []).filter(item => {
      const seatIndex = Number(item?.seatIndex);
      const studentId = String(item?.studentId || '');
      if (!known.has(studentId) || !Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= limit || seenStudents.has(studentId) || seenSeats.has(seatIndex)) return false;
      seenStudents.add(studentId); seenSeats.add(seatIndex); return true;
    }).map(item => ({ studentId:String(item.studentId), seatIndex:Number(item.seatIndex) }));
    return { rows, columns, assignments };
  };

  async function fetchMap(classId, includeDraft) {
    const { data, error } = await db.rpc('get_classroom_map', { target_class_id:classId, include_draft:includeDraft });
    if (error) throw error;
    return data?.[0] || null;
  }

  async function refreshClassPhotos(classId) {
    const withPhoto = classStudents(classId).filter(student => student.photoPath);
    for (let index = 0; index < withPhoto.length; index += 50) {
      const batch = withPhoto.slice(index, index + 50);
      const paths = [...new Set(batch.map(student => student.photoPath))];
      const { data, error } = await db.storage.from('student-photos').createSignedUrls(paths, 3600);
      if (error) continue;
      const signedByPath = new Map((data || []).filter(item => item?.signedUrl).map(item => [item.path, item.signedUrl]));
      batch.forEach(student => {
        const signedUrl = signedByPath.get(student.photoPath);
        if (signedUrl) student.photoUrl = signedUrl;
      });
    }
  }

  async function refreshButtons() {
    const generation = ++availabilityGeneration;
    const classId = selectedClassId;
    panelButton.classList.add('hidden');
    viewButton.classList.add('hidden');
    if (!classId || !window.getActiveSchoolId?.()) return;
    const schoolId = window.getActiveSchoolId();
    const { data:canEdit, error:permissionError } = await db.rpc('can_edit_classroom_map', { target_school_id:schoolId, target_class_id:classId });
    if (generation !== availabilityGeneration || classId !== selectedClassId) return;
    activeCanEdit = !permissionError && !!canEdit;
    panelButton.classList.toggle('hidden', !activeCanEdit);
    try {
      const published = await fetchMap(classId, false);
      if (generation !== availabilityGeneration || classId !== selectedClassId) return;
      if (published) publishedByClass.set(classId, published); else publishedByClass.delete(classId);
      viewButton.classList.toggle('hidden', !published || activeCanEdit);
    } catch {
      publishedByClass.delete(classId);
    }
  }

  function renderMap(layout, editable, statusText) {
    editingLayout = normalizeLayout(layout);
    selectedStudentId = null;
    const assigned = new Map(editingLayout.assignments.map(item => [item.seatIndex, item.studentId]));
    const assignedIds = new Set(editingLayout.assignments.map(item => item.studentId));
    const byId = new Map(classStudents(activeClassId).map(item => [item.id, item]));
    const seats = Array.from({ length:editingLayout.rows }, (_, deskIndex) =>
      Array.from({ length:editingLayout.columns }, (_, fileRowIndex) => {
        const seatIndex = fileRowIndex * editingLayout.rows + deskIndex;
        const student = byId.get(assigned.get(seatIndex));
        return `<div class="classroom-seat" data-seat-index="${seatIndex}" data-filled="${student ? '1' : '0'}"><span class="classroom-seat-coordinate">F${fileRowIndex + 1} · M${deskIndex + 1}</span>${student ? studentCard(student, editable) : `<span>Mesa ${deskIndex + 1}</span>`}</div>`;
      }).join('')
    ).join('');
    const fileRowLabels = Array.from({ length:editingLayout.columns }, (_, index) => `<div class="classroom-file-row-label">FILEIRA ${index + 1}</div>`).join('');
    const unassigned = classStudents(activeClassId).filter(student => !assignedIds.has(student.id));
    const roomWidth = Math.max(620, editingLayout.columns * 100 + (editingLayout.columns - 1) * 13);
    document.getElementById('classroomMapContent').innerHTML = `
      ${editable ? `<div class="classroom-map-toolbar"><div class="classroom-map-toolbar-group"><label>Fileiras <select id="mapColumns">${fileRowOptions.map(value => `<option ${value === editingLayout.columns ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Mesas por fileira <select id="mapRows">${deskOptions.map(value => `<option ${value === editingLayout.rows ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="classroom-map-toolbar-group"><span class="classroom-map-status">${esc(statusText)}</span><button id="saveMapDraft" type="button" class="btn secondary">Salvar rascunho</button><button id="publishMap" type="button" class="btn primary">Publicar mapeamento</button></div></div>` : `<div class="classroom-map-toolbar"><span class="classroom-map-status">${esc(statusText)}</span></div>`}
      ${editable ? '<div class="classroom-map-instructions">Clique no aluno para selecioná-lo e depois clique na carteira de destino. Para deixá-lo sem lugar, clique em “Sem carteira”. No computador, também é possível arrastar; ao alcançar a borda, a tela rola automaticamente.</div>' : ''}
      <div class="classroom-map-stage ${editable ? '' : 'classroom-map-readonly'}"><div class="classroom-room-plan" style="width:${roomWidth}px"><div class="classroom-room-top"><div class="classroom-room-landmark classroom-teacher-desk"><span aria-hidden="true">▰</span> MESA DO PROFESSOR</div><div class="classroom-map-front">QUADRO · FRENTE DA SALA</div><div class="classroom-room-landmark classroom-door"><span aria-hidden="true">🚪</span> PORTA</div></div><div class="classroom-file-row-labels" style="grid-template-columns:repeat(${editingLayout.columns}, minmax(100px, 1fr))">${fileRowLabels}</div><div class="classroom-map-grid" style="grid-template-columns:repeat(${editingLayout.columns}, minmax(100px, 1fr))">${seats}</div></div></div>
      ${editable ? `<section class="classroom-unassigned" data-unassigned><h4>Alunos ainda sem lugar (${unassigned.length})</h4><div class="classroom-unassigned-dropzone" data-unassigned-dropzone>Sem carteira · clique aqui para retirar o aluno selecionado da sala</div><div class="classroom-unassigned-list">${unassigned.length ? unassigned.map(student => studentCard(student, true)).join('') : '<span class="meta">Todos os alunos estão posicionados.</span>'}</div></section>` : ''}`;
    if (editable) bindEditor();
  }

  function moveStudent(studentId, seatIndex) {
    editingLayout.assignments = editingLayout.assignments.filter(item => item.studentId !== studentId && item.seatIndex !== seatIndex);
    if (seatIndex !== null) editingLayout.assignments.push({ studentId, seatIndex });
    renderMap(editingLayout, true, 'Rascunho ainda não publicado');
  }

  function bindEditor() {
    const content = document.getElementById('classroomMapContent');
    const scrollContainer = modal.querySelector('.modal');
    const stage = content.querySelector('.classroom-map-stage');
    let dragPointer = null;
    let autoScrollFrame = null;
    const stopAutoScroll = () => {
      dragPointer = null;
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    };
    const autoScroll = () => {
      if (!dragPointer) { autoScrollFrame = null; return; }
      const edge = 88;
      const verticalBounds = scrollContainer.getBoundingClientRect();
      const horizontalBounds = stage.getBoundingClientRect();
      let deltaY = 0;
      let deltaX = 0;
      if (dragPointer.y < verticalBounds.top + edge) deltaY = -Math.ceil((verticalBounds.top + edge - dragPointer.y) / 5);
      else if (dragPointer.y > verticalBounds.bottom - edge) deltaY = Math.ceil((dragPointer.y - (verticalBounds.bottom - edge)) / 5);
      if (dragPointer.x < horizontalBounds.left + edge) deltaX = -Math.ceil((horizontalBounds.left + edge - dragPointer.x) / 5);
      else if (dragPointer.x > horizontalBounds.right - edge) deltaX = Math.ceil((dragPointer.x - (horizontalBounds.right - edge)) / 5);
      if (deltaY) scrollContainer.scrollTop += Math.max(-20, Math.min(20, deltaY));
      if (deltaX) stage.scrollLeft += Math.max(-20, Math.min(20, deltaX));
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };
    content.ondragover = event => {
      event.preventDefault();
      dragPointer = { x:event.clientX, y:event.clientY };
      if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll);
    };
    content.querySelectorAll('.classroom-student[draggable="true"]').forEach(card => {
      card.ondragstart = event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.studentId);
      };
      card.ondragend = stopAutoScroll;
      card.onclick = event => {
        event.stopPropagation();
        selectedStudentId = selectedStudentId === card.dataset.studentId ? null : card.dataset.studentId;
        content.querySelectorAll('.classroom-student').forEach(item => item.classList.toggle('selected', item.dataset.studentId === selectedStudentId));
      };
    });
    content.querySelectorAll('.classroom-seat').forEach(seat => {
      seat.ondragover = event => { event.preventDefault(); seat.classList.add('drag-over'); };
      seat.ondragleave = () => seat.classList.remove('drag-over');
      seat.ondrop = event => { event.preventDefault(); stopAutoScroll(); moveStudent(event.dataTransfer.getData('text/plain'), Number(seat.dataset.seatIndex)); };
      seat.onclick = () => {
        if (selectedStudentId) moveStudent(selectedStudentId, Number(seat.dataset.seatIndex));
      };
    });
    const pool = content.querySelector('[data-unassigned]');
    const poolDropzone = content.querySelector('[data-unassigned-dropzone]');
    pool.ondragover = event => event.preventDefault();
    pool.ondrop = event => { event.preventDefault(); stopAutoScroll(); moveStudent(event.dataTransfer.getData('text/plain'), null); };
    poolDropzone.onclick = event => {
      event.stopPropagation();
      if (selectedStudentId) moveStudent(selectedStudentId, null);
    };
    pool.onclick = event => {
      if (event.target.closest('.classroom-student') || !selectedStudentId) return;
      moveStudent(selectedStudentId, null);
    };
    document.getElementById('mapRows').onchange = event => resizeLayout(Number(event.target.value), editingLayout.columns);
    document.getElementById('mapColumns').onchange = event => resizeLayout(editingLayout.rows, Number(event.target.value));
    document.getElementById('saveMapDraft').onclick = saveDraft;
    document.getElementById('publishMap').onclick = publishMap;
  }

  function resizeLayout(rows, columns) {
    editingLayout = { rows, columns, assignments:editingLayout.assignments.filter(item => item.seatIndex < rows * columns) };
    renderMap(editingLayout, true, 'Rascunho ainda não publicado');
  }

  async function saveDraft(showSuccess = true) {
    const { error } = await db.rpc('save_classroom_map_draft', { target_class_id:activeClassId, target_layout:editingLayout });
    if (error) { toast(error.message); return false; }
    if (showSuccess) toast('Rascunho do mapeamento salvo. Nenhuma notificação foi enviada.');
    return true;
  }

  async function publishMap() {
    if (!await saveDraft(false)) return;
    if (!confirm('Publicar este mapeamento para todos os professores? Os usuários que acompanham esta turma serão notificados.')) return;
    const { error } = await db.rpc('publish_classroom_map', { target_class_id:activeClassId });
    if (error) { toast(error.message); return; }
    toast('Mapeamento publicado para os professores.');
    closeModal();
    refreshButtons();
  }

  function openClassPanel() {
    if (!selectedClassId) return;
    activeClassId = selectedClassId;
    const selected = classes.find(item => item.id === activeClassId);
    document.getElementById('classroomMapTitle').textContent = 'Painel da turma';
    document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
    document.getElementById('classroomMapContent').innerHTML = '<div class="classroom-panel-card"><h4>Mapeamento da sala</h4><p>Organize visualmente onde cada estudante se senta. O rascunho só será compartilhado quando você publicar.</p><button id="editClassroomMap" type="button" class="btn primary">Editar mapeamento</button></div>';
    modal.classList.remove('hidden');
    document.getElementById('editClassroomMap').onclick = openEditor;
  }

  async function openEditor() {
    const selected = classes.find(item => item.id === activeClassId);
    document.getElementById('classroomMapTitle').textContent = 'Editar mapeamento';
    document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
    document.getElementById('classroomMapContent').innerHTML = '<div class="empty">Carregando mapeamento…</div>';
    try {
      const [current] = await Promise.all([fetchMap(activeClassId, true), refreshClassPhotos(activeClassId)]);
      const layout = current?.layout || defaultLayout();
      renderMap(layout, true, current?.status === 'draft' ? 'Rascunho ainda não publicado' : current ? `Publicado · versão ${current.version}` : 'Novo mapeamento');
    } catch (error) { closeModal(); toast(error.message); }
  }

  async function openViewer(classId = selectedClassId) {
    if (!classId) return;
    activeClassId = classId;
    const selected = classes.find(item => item.id === activeClassId);
    document.getElementById('classroomMapTitle').textContent = 'Mapeamento';
    document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
    document.getElementById('classroomMapContent').innerHTML = '<div class="empty">Carregando mapeamento…</div>';
    modal.classList.remove('hidden');
    try {
      const [current] = await Promise.all([fetchMap(activeClassId, false), refreshClassPhotos(activeClassId)]);
      if (!current) { closeModal(); toast('Esta turma ainda não possui um mapeamento publicado.'); return; }
      renderMap(current.layout, false, `Mapeamento publicado · versão ${current.version}`);
    } catch (error) { closeModal(); toast(error.message); }
  }
  window.openClassroomMap = openViewer;

  panelButton.onclick = openClassPanel;
  viewButton.onclick = () => openViewer();

  const baseSelectClass = window.selectClass;
  window.selectClass = id => { baseSelectClass(id); refreshButtons(); };
  document.addEventListener('carometro:data-loaded', () => setTimeout(refreshButtons, 0));
  document.addEventListener('carometro:permission-refresh', refreshButtons);
  document.addEventListener('carometro:school-context-ready', refreshButtons);
  document.addEventListener('carometro:realtime-refresh', refreshButtons);
});
