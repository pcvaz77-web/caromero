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

  document.querySelector('.top-actions')?.prepend(panelButton);

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
    .classroom-map-suggestion { margin:0 0 14px; padding:12px 14px; border:1px solid #bfd0f5; border-radius:10px; background:#f5f8ff; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .classroom-map-suggestion strong, .classroom-map-suggestion span { display:block; }
    .classroom-map-suggestion strong { margin-bottom:3px; font-size:13px; }
    .classroom-map-suggestion span { color:#52627c; font-size:12px; }
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
    .classroom-map-print-actions { display:flex; align-items:center; gap:9px; }
    .classroom-panel-card { padding:18px; border:1px solid var(--line); border-radius:12px; background:#f8faff; }
    .classroom-panel-card h4 { margin:0 0 6px; font-size:17px; }
    .classroom-panel-card p { margin:0 0 15px; color:var(--muted); font-size:13px; }
    .classroom-panel-actions { display:flex; gap:9px; flex-wrap:wrap; }
    .classroom-panel-actions .btn { min-width:150px; }
    @media(max-width:800px) {
      .classroom-map-modal { padding:8px; align-items:start; overflow:auto; }
      .classroom-map-modal .modal { max-height:calc(100dvh - 16px); }
      .classroom-map-shell { padding:15px; }
      .classroom-map-stage { padding:12px; }
      .classroom-seat { min-height:102px; }
      .classroom-map-suggestion { align-items:stretch; flex-direction:column; }
      .classroom-map-suggestion .btn { width:100%; }
      .classroom-unassigned-list { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
      .classroom-unassigned .classroom-student { width:auto; min-width:0; padding:5px 2px; gap:4px; }
      .classroom-unassigned .classroom-student-avatar { width:38px; height:38px; font-size:11px; }
      .classroom-unassigned .classroom-student-name { max-width:100%; font-size:10px; overflow-wrap:anywhere; }
      #classPanelButton, #classroomMapButton { flex:1 1 auto; }
    }
    @media print {
      @page { size:landscape; margin:8mm; }
      body.classroom-map-printing { background:#fff !important; }
      body.classroom-map-printing > *:not(#classroomMapModal) { display:none !important; }
      body.classroom-map-printing #classroomMapModal { position:static !important; inset:auto !important; display:block !important; padding:0 !important; background:#fff !important; }
      body.classroom-map-printing #classroomMapModal .modal { width:100% !important; max-height:none !important; overflow:visible !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }
      body.classroom-map-printing #classroomMapModal .modal-head { padding:0 0 10px !important; border-bottom:1px solid #9aa4b2 !important; }
      body.classroom-map-printing #classroomMapModal .modal-head .close,
      body.classroom-map-printing .classroom-map-toolbar,
      body.classroom-map-printing .classroom-map-suggestion,
      body.classroom-map-printing .classroom-map-instructions,
      body.classroom-map-printing .classroom-unassigned { display:none !important; }
      body.classroom-map-printing .classroom-student.selected { outline:none !important; }
      body.classroom-map-printing .classroom-map-shell { padding:12px 0 0 !important; }
      body.classroom-map-printing .classroom-map-stage { padding:0 !important; overflow:visible !important; border:0 !important; background:#fff !important; }
      body.classroom-map-printing .classroom-room-plan { width:100% !important; min-width:0 !important; }
      body.classroom-map-printing .classroom-file-row-labels,
      body.classroom-map-printing .classroom-map-grid { grid-template-columns:repeat(var(--map-columns), minmax(0,1fr)) !important; gap:5px !important; }
      body.classroom-map-printing .classroom-room-top { grid-template-columns:1fr minmax(220px,2fr) 1fr !important; margin-bottom:12px !important; }
      body.classroom-map-printing .classroom-room-landmark { min-height:38px !important; padding:5px !important; font-size:9px !important; }
      body.classroom-map-printing .classroom-map-front { padding:7px !important; font-size:9px !important; }
      body.classroom-map-printing .classroom-seat { min-height:76px !important; padding:18px 3px 3px !important; break-inside:avoid; }
      body.classroom-map-printing .classroom-seat-coordinate { top:3px; left:4px; font-size:7px; }
      body.classroom-map-printing .classroom-student { gap:3px; }
      body.classroom-map-printing .classroom-student-avatar { width:34px; height:34px; font-size:9px; }
      body.classroom-map-printing .classroom-student-avatar img { display:block !important; width:100% !important; height:100% !important; object-fit:cover !important; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      body.classroom-map-printing .classroom-student-name { max-width:100%; font-size:7px; line-height:1.15; }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'classroomMapModal';
  modal.className = 'modal-bg classroom-map-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3 id="classroomMapTitle">Mapeamento da sala</h3><div id="classroomMapMeta" class="meta"></div></div><button class="close" type="button" data-map-close>×</button></div><div id="classroomMapContent" class="classroom-map-shell"></div></div>`;
  document.body.appendChild(modal);

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
  const recommendedLayout = classId => {
    const count = classStudents(classId).length;
    if (!count) return { rows:6, columns:5, assignments:[] };
    const columns = Math.min(20, Math.max(1, Math.ceil(Math.sqrt(count))));
    const rows = Math.min(30, Math.max(1, Math.ceil(count / columns)));
    return { rows, columns, assignments:[] };
  };
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
    const canViewPanel = permission?.role === 'admin' || !!permission?.can_view_class_summary || activeCanEdit;
    if (!canViewPanel) return;
    panelButton.classList.remove('hidden');
    try {
      const published = await fetchMap(classId, false);
      if (generation !== availabilityGeneration || classId !== selectedClassId) return;
      if (published) publishedByClass.set(classId, published); else publishedByClass.delete(classId);
    } catch {
      publishedByClass.delete(classId);
    }
  }

  function renderMap(layout, editable, statusText, printable = false) {
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
    const allClassStudents = classStudents(activeClassId);
    const unassigned = allClassStudents.filter(student => !assignedIds.has(student.id));
    const recommendation = recommendedLayout(activeClassId);
    const recommendedCapacity = recommendation.rows * recommendation.columns;
    const roomWidth = Math.max(620, editingLayout.columns * 100 + (editingLayout.columns - 1) * 13);
    document.getElementById('classroomMapContent').innerHTML = `
      ${editable ? `<div class="classroom-map-toolbar"><div class="classroom-map-toolbar-group"><label>Fileiras <select id="mapColumns">${fileRowOptions.map(value => `<option ${value === editingLayout.columns ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Mesas por fileira <select id="mapRows">${deskOptions.map(value => `<option ${value === editingLayout.rows ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="classroom-map-toolbar-group"><span class="classroom-map-status">${esc(statusText)}</span><button id="resetMap" type="button" class="btn secondary">Resetar mapeamento</button><button id="saveMapDraft" type="button" class="btn secondary">Salvar rascunho</button><button id="publishMap" type="button" class="btn primary">Publicar mapeamento</button></div></div>` : `<div class="classroom-map-toolbar"><span class="classroom-map-status">${esc(statusText)}</span>${printable ? '<div class="classroom-map-print-actions"><button id="editPublishedClassroomMap" type="button" class="btn secondary">Editar mapeamento</button><button id="printClassroomMap" type="button" class="btn primary">Imprimir mapeamento</button></div>' : ''}</div>`}
      ${editable ? `<div class="classroom-map-suggestion"><div><strong>Sugestão automática para ${allClassStudents.length} aluno${allClassStudents.length === 1 ? '' : 's'}</strong><span>${recommendation.columns} fileira${recommendation.columns === 1 ? '' : 's'} × ${recommendation.rows} mesa${recommendation.rows === 1 ? '' : 's'} por fileira (${recommendedCapacity} lugares).</span></div><button id="applyMapSuggestion" type="button" class="btn secondary">Aplicar sugestão</button></div>` : ''}
      ${editable ? '<div class="classroom-map-instructions">Clique no aluno para selecioná-lo e depois clique na carteira de destino. Para deixá-lo sem lugar, clique em “Sem carteira”. No computador, também é possível arrastar; ao alcançar a borda, a tela rola automaticamente.</div>' : ''}
      <div class="classroom-map-stage ${editable ? '' : 'classroom-map-readonly'}"><div class="classroom-room-plan" style="--map-columns:${editingLayout.columns};width:${roomWidth}px"><div class="classroom-room-top"><div class="classroom-room-landmark classroom-teacher-desk"><span aria-hidden="true">▰</span> MESA DO PROFESSOR</div><div class="classroom-map-front">QUADRO · FRENTE DA SALA</div><div class="classroom-room-landmark classroom-door"><span aria-hidden="true">🚪</span> PORTA</div></div><div class="classroom-file-row-labels" style="grid-template-columns:repeat(${editingLayout.columns}, minmax(100px, 1fr))">${fileRowLabels}</div><div class="classroom-map-grid" style="grid-template-columns:repeat(${editingLayout.columns}, minmax(100px, 1fr))">${seats}</div></div></div>
      ${editable ? `<section class="classroom-unassigned" data-unassigned><h4>Alunos ainda sem lugar (${unassigned.length})</h4><div class="classroom-unassigned-dropzone" data-unassigned-dropzone>Sem carteira · clique aqui para retirar o aluno selecionado da sala</div><div class="classroom-unassigned-list">${unassigned.length ? unassigned.map(student => studentCard(student, true)).join('') : '<span class="meta">Todos os alunos estão posicionados.</span>'}</div></section>` : ''}`;
    if (editable) bindEditor();
    if (printable) {
      document.getElementById('editPublishedClassroomMap').onclick = openEditor;
      document.getElementById('printClassroomMap').onclick = () => printPublishedMap(activeClassId);
    }
  }

  async function canPrintPublishedMap(classId) {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !classId) return false;
    const { data, error } = await db.rpc('can_edit_classroom_map', { target_school_id:schoolId, target_class_id:classId });
    return !error && !!data;
  }

  async function printPublishedMap(classId = activeClassId) {
    try {
      if (!await canPrintPublishedMap(classId)) {
        toast('Somente o conselheiro da turma ou a gestão podem imprimir este mapeamento.');
        return;
      }
      const current = publishedByClass.get(classId) || await fetchMap(classId, false);
      if (!current) { toast('Esta turma ainda não possui um mapeamento publicado.'); return; }
      activeClassId = classId;
      publishedByClass.set(classId, current);
      const selected = classes.find(item => item.id === activeClassId);
      document.getElementById('classroomMapTitle').textContent = 'Mapeamento da sala';
      document.getElementById('classroomMapMeta').textContent = `${selected?.name || 'Turma'} · versão ${current.version}`;
      await refreshClassPhotos(activeClassId);
      renderMap(current.layout, false, `Mapeamento publicado · versão ${current.version}`, true);
      modal.classList.remove('hidden');
      await printVisibleMap();
    } catch (error) { toast(error.message || 'Não foi possível preparar a impressão agora.'); }
  }

  async function printVisibleMap() {
      const mapImages = [...document.querySelectorAll('#classroomMapModal .classroom-student-avatar img')];
      await Promise.all(mapImages.map(image => {
        if (image.complete && image.naturalWidth > 0) return image.decode?.().catch(() => {}) || Promise.resolve();
        return new Promise(resolve => {
          const done = () => resolve();
          image.addEventListener('load', done, { once:true });
          image.addEventListener('error', done, { once:true });
          setTimeout(done, 4000);
        });
      }));
      const finishPrinting = () => document.body.classList.remove('classroom-map-printing');
      window.addEventListener('afterprint', finishPrinting, { once:true });
      document.body.classList.add('classroom-map-printing');
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
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
    document.getElementById('applyMapSuggestion').onclick = () => {
      const recommendation = recommendedLayout(activeClassId);
      resizeLayout(recommendation.rows, recommendation.columns);
    };
    document.getElementById('resetMap').onclick = async event => {
      if (editingLayout.assignments.length && !confirm('Esvaziar todas as mesas e apagar as posições salvas neste rascunho?')) return;
      const resetButton = event.currentTarget;
      resetButton.disabled = true;
      resetButton.textContent = 'Resetando…';
      const clearedLayout = { ...editingLayout, assignments:[] };
      const { error } = await db.rpc('save_classroom_map_draft', { target_class_id:activeClassId, target_layout:clearedLayout });
      if (error) {
        resetButton.disabled = false;
        resetButton.textContent = 'Resetar mapeamento';
        toast(error.message);
        return;
      }
      editingLayout = clearedLayout;
      renderMap(editingLayout, true, 'Rascunho resetado e salvo');
      toast('Mapeamento resetado. Todas as posições salvas foram removidas.');
    };
    document.getElementById('saveMapDraft').onclick = saveDraft;
    const printDraftButton = document.createElement('button');
    printDraftButton.id = 'printEditingClassroomMap';
    printDraftButton.type = 'button';
    printDraftButton.className = 'btn secondary';
    printDraftButton.textContent = 'Imprimir mapeamento';
    document.getElementById('saveMapDraft').after(printDraftButton);
    printDraftButton.onclick = async () => {
      printDraftButton.disabled = true;
      try {
        if (!await canPrintPublishedMap(activeClassId)) {
          toast('Somente o conselheiro da turma ou a gestão podem imprimir este mapeamento.');
          return;
        }
        await printVisibleMap();
      } catch (error) {
        toast(error.message || 'Não foi possível preparar a impressão agora.');
      } finally { printDraftButton.disabled = false; }
    };
    document.getElementById('publishMap').onclick = publishMap;
  }

  function resizeLayout(rows, columns) {
    const previousRows = editingLayout.rows;
    const assignments = editingLayout.assignments.flatMap(item => {
      const fileRowIndex = Math.floor(item.seatIndex / previousRows);
      const deskIndex = item.seatIndex % previousRows;
      return fileRowIndex < columns && deskIndex < rows
        ? [{ studentId:item.studentId, seatIndex:fileRowIndex * rows + deskIndex }]
        : [];
    });
    editingLayout = { rows, columns, assignments };
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
    const current = await fetchMap(activeClassId, false);
    if (current) {
      publishedByClass.set(activeClassId, current);
      const selected = classes.find(item => item.id === activeClassId);
      document.getElementById('classroomMapTitle').textContent = 'Editar mapeamento';
      document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
      renderMap(current.layout, true, `Mapeamento publicado · versão ${current.version}`);
    } else renderMap(editingLayout, true, 'Mapeamento publicado');
    refreshButtons();
  }

  async function openClassPanel() {
    if (!selectedClassId) return;
    activeClassId = selectedClassId;
    const selected = classes.find(item => item.id === activeClassId);
    document.getElementById('classroomMapTitle').textContent = 'Painel da turma';
    document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
    modal.classList.remove('hidden');
    const content = document.getElementById('classroomMapContent');
    const siapActions = window.getSiapPanelActions?.({ permission, canManageClass:activeCanEdit }) || '';
    if (activeCanEdit) {
      content.innerHTML = `<div class="classroom-panel-actions"><button id="editClassroomMap" type="button" class="btn primary">Editar mapeamento</button>${siapActions}</div>`;
      document.getElementById('editClassroomMap').onclick = openEditor;
      window.bindSiapPanelActions?.({ classId:activeClassId, className:selected?.name || 'Turma' });
      return;
    }
    content.innerHTML = '<div class="empty">Consultando o mapeamento publicado…</div>';
    try {
      const published = publishedByClass.get(activeClassId) || await fetchMap(activeClassId, false);
      if (!published) {
        content.innerHTML = `<div class="classroom-panel-card"><h4>Mapeamento da sala</h4><p>O mapeamento desta turma ainda não foi publicado pelo conselheiro ou pela gestão.</p>${siapActions ? `<div class="classroom-panel-actions">${siapActions}</div>` : ''}</div>`;
        window.bindSiapPanelActions?.({ classId:activeClassId, className:selected?.name || 'Turma' });
        return;
      }
      publishedByClass.set(activeClassId, published);
      content.innerHTML = `<div class="classroom-panel-card"><h4>Mapeamento da sala</h4><p>Consulte onde cada estudante se senta no mapeamento atualmente publicado.</p><div class="classroom-panel-actions"><button id="viewPublishedClassroomMap" type="button" class="btn primary">Ver mapeamento</button>${siapActions}</div></div>`;
      document.getElementById('viewPublishedClassroomMap').onclick = () => openViewer(activeClassId);
      window.bindSiapPanelActions?.({ classId:activeClassId, className:selected?.name || 'Turma' });
    } catch {
      content.innerHTML = '<div class="classroom-panel-card"><h4>Mapeamento da sala</h4><p>Não foi possível consultar o mapeamento agora. Tente novamente.</p></div>';
    }
  }

  async function openEditor() {
    const selected = classes.find(item => item.id === activeClassId);
    document.getElementById('classroomMapTitle').textContent = 'Editar mapeamento';
    document.getElementById('classroomMapMeta').textContent = selected?.name || 'Turma';
    document.getElementById('classroomMapContent').innerHTML = '<div class="empty">Carregando mapeamento…</div>';
    try {
      const [current] = await Promise.all([fetchMap(activeClassId, true), refreshClassPhotos(activeClassId)]);
      const layout = current?.layout || recommendedLayout(activeClassId);
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
      const [current, printable] = await Promise.all([fetchMap(activeClassId, false), canPrintPublishedMap(activeClassId), refreshClassPhotos(activeClassId)]);
      if (!current) { closeModal(); toast('Esta turma ainda não possui um mapeamento publicado.'); return; }
      publishedByClass.set(activeClassId, current);
      renderMap(current.layout, false, `Mapeamento publicado · versão ${current.version}`, printable);
    } catch (error) { closeModal(); toast(error.message); }
  }
  window.openClassroomMap = openViewer;

  panelButton.onclick = openClassPanel;
  viewButton.onclick = () => openViewer();

  const baseSelectClass = window.selectClass;
  window.selectClass = id => { baseSelectClass(id); refreshButtons(); };
  document.getElementById('classList')?.addEventListener('click', event => {
    if (!event.target.closest('[data-select-shift],[data-all-students]')) return;
    window.setTimeout(refreshButtons, 0);
  });
  document.addEventListener('carometro:data-loaded', () => setTimeout(async () => {
    refreshButtons();
    const editorIsOpen = !modal.classList.contains('hidden')
      && document.getElementById('classroomMapTitle').textContent === 'Editar mapeamento'
      && editingLayout;
    if (editorIsOpen) {
      await refreshClassPhotos(activeClassId);
      renderMap(editingLayout, true, 'Rascunho ainda não publicado');
    }
  }, 0));
  document.addEventListener('carometro:permission-refresh', refreshButtons);
  document.addEventListener('carometro:school-context-ready', refreshButtons);
  document.addEventListener('carometro:realtime-refresh', refreshButtons);
});
