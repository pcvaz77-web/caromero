document.addEventListener('DOMContentLoaded', () => {
  let assignments = [];
  let ownAssignments = [];
  let registeredUsers = [];
  let editingCounselorId = null;
  let lastLoadError = '';
  window.counselorRightsForClass = classId => ownAssignments.find(item => item.class_id === classId) || null;
  window.counselorHasPermission = () => false;
  window.counselorHasEditPermission = () => false;
  window.isCounselorUser = () => ownAssignments.length > 0;
  window.counselorAccessLabel = () => null;

  const style = document.createElement('style');
  style.textContent = `
    .counselor-entry { margin-left:auto; }
    .counselor-modal { z-index:100; }
    .counselor-modal .modal { width:min(840px,100%); }
    .counselor-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:15px; }
    .counselor-permissions { display:grid; grid-template-columns:repeat(2,1fr); gap:9px; margin:14px 0; }
    .counselor-permissions .check { padding:10px; border:1px solid var(--line); border-radius:8px; }
    .counselor-list { display:grid; gap:9px; margin-top:22px; }
    .counselor-item { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px; border:1px solid var(--line); border-radius:9px; }
    .counselor-item b { display:block; }
    .counselor-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .counselor-label { margin-left:7px; vertical-align:middle; }
    .class-list .counselor-label { margin:5px 0 0; font-size:11px; white-space:normal; }
    .counselor-title-label { margin-left:10px; vertical-align:middle; font-size:13px; letter-spacing:0; }
    .toast { z-index:100 !important; }
    @media (max-width:800px) {
      .counselor-modal { padding:10px; align-items:start; overflow:auto; }
      .counselor-modal .modal { width:100%; max-height:calc(100vh - 20px); margin:auto 0; }
      .counselor-modal .modal-head { padding:17px; align-items:flex-start; }
      .counselor-modal .form { padding:17px; }
      .counselor-form-grid, .counselor-permissions { grid-template-columns:1fr; gap:10px; }
      .counselor-item { align-items:flex-start; flex-direction:column; gap:10px; }
      .counselor-actions { width:100%; justify-content:stretch; }
      .counselor-actions button { flex:1; }
      .counselor-modal .actions { position:sticky; bottom:0; background:#fff; padding:14px 0 2px; }
      .counselor-modal .actions .btn { flex:1; }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'counselorModal';
  modal.className = 'modal-bg counselor-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Conselheiros de turma</h3><div class="meta">Defina qual usuário cadastrado é conselheiro de cada turma.</div></div><button class="close" type="button" id="closeCounselors">×</button></div><div class="form"><div class="hint">Ser conselheiro não cria permissões próprias. O acesso continua sendo definido pelo perfil do usuário: administrador, coordenador ou acesso de professor(a).</div><form id="counselorForm"><div class="counselor-form-grid"><div class="field"><label for="counselorUser">Usuário conselheiro</label><select id="counselorUser" required></select><div class="meta">Escolha somente um usuário cadastrado no CARÔMETRO.</div></div><div class="field"><label for="counselorClass">Turma</label><select id="counselorClass" required></select></div></div><div class="actions"><button type="button" class="btn secondary" id="cancelCounselor">Cancelar</button><button class="btn primary">Salvar conselheiro</button></div></form><div id="counselorList" class="counselor-list"></div></div></div>`;
  document.body.appendChild(modal);

  const closeManager = () => modal.classList.add('hidden');
  document.getElementById('closeCounselors').onclick = closeManager;
  document.getElementById('cancelCounselor').onclick = closeManager;
  modal.onclick = event => { if (event.target === modal) closeManager(); };

  const escapeHtml = value => { const element = document.createElement('div'); element.textContent = value || ''; return element.innerHTML; };
  const counselorName = item => item.counselor_name?.trim() || item.profiles?.full_name?.trim() || item.profiles?.email || 'Usuário';
  const counselorNamesForClass = classId => assignments.filter(item => item.class_id === classId).map(item => item.counselor_name?.trim()).filter(Boolean);
  const drawCounselorLabels = () => {
    document.querySelectorAll('#classList button').forEach(button => {
      const classId = button.getAttribute('onclick')?.match(/selectClass\('([^']+)'\)/)?.[1];
      const names = counselorNamesForClass(classId);
      const existing = button.querySelector('.counselor-label');
      if (!names.length) { existing?.remove(); return; }
      const labelText = `Conselheiro ${names.join(' · ')}`;
      if (existing?.textContent === labelText) return;
      existing?.remove();
      const tag = document.createElement('span');
      tag.className = 'representative-label observation-custom-4 counselor-label';
      tag.textContent = labelText;
      button.appendChild(tag);
    });
    const student = students.find(item => item.id === detailStudentId);
    const row = document.querySelector('#studentDetails .detail-row');
    if (!student || !row || row.querySelector('b')?.textContent.trim() !== 'Turma') return;
    const names = counselorNamesForClass(student.classId);
    const existing = row.querySelector('.counselor-label');
    if (!names.length) { existing?.remove(); return; }
    const labelText = `Conselheiro ${names.join(' · ')}`;
    if (existing?.textContent === labelText) return;
    existing?.remove();
    const tag = document.createElement('span');
    tag.className = 'representative-label observation-custom-4 counselor-label';
    tag.textContent = labelText;
      row.appendChild(tag);
  };

  const drawCounselorTitle = () => {
    const title = document.getElementById('pageTitle');
    const selectedClass = classes.find(item => item.id === selectedClassId);
    if (!title || !selectedClass) return;
    const names = counselorNamesForClass(selectedClass.id);
    title.textContent = selectedClass.name;
    if (!names.length) return;
    const tag = document.createElement('span');
    tag.className = 'representative-label observation-custom-4 counselor-title-label';
    tag.textContent = `Conselheiro ${names.join(' · ')}`;
    title.appendChild(tag);
  };

  const enforceCounselorInterface = () => {};

  async function refreshAssignments() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || document.getElementById('app').classList.contains('hidden')) return;
    const { data, error } = await db.from('class_counselors').select('*');
    if (error) {
      if (lastLoadError !== error.message) toast(`Não foi possível carregar os conselheiros: ${error.message}`);
      lastLoadError = error.message;
      return;
    }
    lastLoadError = '';
    const previous = JSON.stringify(assignments);
    assignments = data || [];
    ownAssignments = assignments.filter(item => item.counselor_user_id === signedInUser.id);
    if (previous !== JSON.stringify(assignments)) render();
    drawCounselorLabels();
    drawCounselorTitle();
    enforceCounselorInterface();
  }
  window.refreshCounselorAssignments = refreshAssignments;

  function resetCounselorForm() {
    editingCounselorId = null;
    const form = document.getElementById('counselorForm');
    if (!form) return;
    form.reset();
    const saveButton = form.querySelector('button.primary');
    if (saveButton) saveButton.textContent = 'Salvar conselheiro';
  }

  function renderManager() {
    const classSelect = document.getElementById('counselorClass');
    classSelect.innerHTML = '<option value="" selected disabled>Selecione a turma</option>' + classes.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    const sortedUsers = [...registeredUsers].sort((first, second) => counselorName(first).localeCompare(counselorName(second), 'pt-BR', { sensitivity:'base' }));
    document.getElementById('counselorUser').innerHTML = '<option value="" selected disabled>Selecione o usuário</option>' + sortedUsers.map(item => `<option value="${item.user_id}">${escapeHtml(counselorName(item))}</option>`).join('');
    document.getElementById('counselorList').innerHTML = assignments.length ? assignments.map(item => {
      const person = registeredUsers.find(userItem => userItem.user_id === item.counselor_user_id);
      const currentClass = classes.find(classItem => classItem.id === item.class_id);
      const registered = !!item.counselor_user_id;
      return `<article class="counselor-item"><div><b>${escapeHtml(counselorName(person || item))}</b><div class="meta">${escapeHtml(currentClass?.name || 'Turma removida')} · ${registered ? 'Usuário cadastrado' : 'Registro antigo sem conta'}</div></div><div class="counselor-actions">${registered ? `<button class="btn secondary" type="button" data-edit-counselor-id="${item.id}">Editar</button>` : ''}<button class="delete" type="button" data-counselor-id="${item.id}">Excluir</button></div></article>`;
    }).join('') : '<div class="empty">Nenhum conselheiro cadastrado.</div>';
  }

  window.openCounselorManager = async () => {
    if (permission.role !== 'admin') return;
    try {
      const [{ data: users, error: usersError }, { data: dataAssignments, error: assignmentsError }] = await Promise.all([
        db.from('user_permissions').select('user_id,profiles(email,full_name)'),
        db.from('class_counselors').select('*')
      ]);
      if (usersError || assignmentsError) { toast((usersError || assignmentsError).message); return; }
      registeredUsers = users || [];
      assignments = dataAssignments || [];
      drawCounselorLabels();
      renderManager();
      resetCounselorForm();
      modal.classList.remove('hidden');
    } catch (error) {
      toast(`Não foi possível abrir os conselheiros: ${error.message || 'erro inesperado'}`);
    }
  };

  document.getElementById('counselorForm').onsubmit = async event => {
    event.preventDefault();
    const userChoice = document.getElementById('counselorUser').value;
    const selectedUser = registeredUsers.find(item => item.user_id === userChoice);
    if (!selectedUser) { toast('Selecione um usuário cadastrado como conselheiro.'); return; }
    const row = { class_id:document.getElementById('counselorClass').value, counselor_user_id:selectedUser.user_id, counselor_name:counselorName(selectedUser) };
    const request = editingCounselorId
      ? db.from('class_counselors').update(row).eq('id', editingCounselorId)
      : selectedUser
        ? db.from('class_counselors').upsert(row, { onConflict:'counselor_user_id,class_id' })
        : db.from('class_counselors').insert(row);
    const { error } = await request;
    if (error) { toast(error.message); return; }
    toast(editingCounselorId ? 'Conselheiro atualizado.' : 'Conselheiro salvo.');
    await refreshAssignments();
    window.openCounselorManager();
  };

  document.getElementById('counselorList').onclick = async event => {
    const editButton = event.target.closest('[data-edit-counselor-id]');
    if (editButton) {
      const item = assignments.find(assignment => assignment.id === editButton.dataset.editCounselorId);
      if (!item) return;
      if (!item.counselor_user_id) { toast('Este é um registro antigo sem conta. Exclua-o e cadastre um usuário do sistema.'); return; }
      editingCounselorId = item.id;
      document.getElementById('counselorUser').value = item.counselor_user_id;
      document.getElementById('counselorClass').value = item.class_id;
      document.querySelector('#counselorForm button.primary').textContent = 'Salvar alterações';
      document.getElementById('counselorForm').scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    const button = event.target.closest('[data-counselor-id]');
    if (!button || !confirm('Excluir este conselheiro da turma?')) return;
    const { error } = await db.from('class_counselors').delete().eq('id', button.dataset.counselorId);
    if (error) { toast(error.message); return; }
    toast('Conselheiro excluído.');
    await refreshAssignments();
    window.openCounselorManager();
  };

  // Acionamento de reserva para toques no botão do administrador em celulares.
  document.addEventListener('click', event => {
    const button = event.target.closest('#openCounselors');
    if (!button || permission.role !== 'admin') return;
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('permissionsModal')?.classList.add('hidden');
    window.openCounselorManager();
  });

  // Acrescenta o conselheiro sempre que a lista ou o card forem redesenhados.
  // Assim a etiqueta não depende do intervalo de atualização do navegador.
  const baseRender = render;
  render = (...args) => {
    baseRender(...args);
    drawCounselorLabels();
    drawCounselorTitle();
    enforceCounselorInterface();
  };
  const baseEditStudent = window.editStudent;
  window.editStudent = id => {
    const student = students.find(item => item.id === id);
    const coordinatorCanEdit = permission.is_coordinator && (permission.can_edit_all || permission.can_edit_photo || permission.can_edit_name || permission.can_edit_class || permission.can_edit_report);
    if (permission.role !== 'admin' && !( !permission.is_coordinator && permission.can_edit_students) && !coordinatorCanEdit) {
      toast('Sem permissão para editar alunos.');
      return;
    }
    baseEditStudent(id);
  };
  db.auth.getUser().then(({ data: { user: signedInUser } }) => {
    if (!signedInUser || !db.channel) return;
    db.channel(`counselor-live-${signedInUser.id}`).on(
      'postgres_changes',
      { event:'*', schema:'public', table:'class_counselors', filter:`counselor_user_id=eq.${signedInUser.id}` },
      () => { refreshAssignments(); }
    ).subscribe();
  });
  refreshAssignments();
  setInterval(refreshAssignments, 4000);
});
