document.addEventListener('DOMContentLoaded', () => {
  const counselorFields = [
    ['can_edit_all', 'Editar tudo'],
    ['can_edit_photo', 'Editar foto'],
    ['can_edit_name', 'Editar nome'],
    ['can_edit_report', 'Editar observações']
  ];
  let assignments = [];
  let ownAssignments = [];
  let registeredUsers = [];
  let editingCounselorId = null;
  let lastLoadError = '';
  window.counselorRightsForClass = classId => ownAssignments.find(item => item.class_id === classId) || null;
  window.counselorHasEditPermission = () => ownAssignments.some(item => counselorFields.some(([key]) => !!item[key]));

  const style = document.createElement('style');
  style.textContent = `
    .counselor-entry { margin-left:auto; }
    .counselor-modal { z-index:28; }
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
    .toast { z-index:100 !important; }
    @media (max-width:800px) { .counselor-entry, .counselor-modal { display:none !important; } }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'counselorModal';
  modal.className = 'modal-bg counselor-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Conselheiros de turma</h3><div class="meta">Permissões limitadas apenas à turma escolhida.</div></div><button class="close" type="button" id="closeCounselors">×</button></div><div class="form"><form id="counselorForm"><div class="counselor-form-grid"><div class="field"><label for="counselorUser">Nome do conselheiro</label><input id="counselorUser" list="counselorUsers" required placeholder="Digite ou selecione um usuário"><datalist id="counselorUsers"></datalist><div id="counselorAccountHint" class="meta">Selecione um usuário cadastrado para liberar permissões.</div></div><div class="field"><label for="counselorClass">Turma</label><select id="counselorClass" required></select></div></div><div id="counselorPermissionArea"><label>Permissões para esta turma</label><div id="counselorPermissions" class="counselor-permissions"></div></div><div class="actions"><button type="button" class="btn secondary" id="cancelCounselor">Cancelar</button><button class="btn primary">Salvar conselheiro</button></div></form><div id="counselorList" class="counselor-list"></div></div></div>`;
  document.body.appendChild(modal);

  const closeManager = () => modal.classList.add('hidden');
  document.getElementById('closeCounselors').onclick = closeManager;
  document.getElementById('cancelCounselor').onclick = closeManager;
  modal.onclick = event => { if (event.target === modal) closeManager(); };

  const escapeHtml = value => { const element = document.createElement('div'); element.textContent = value || ''; return element.innerHTML; };
  const counselorName = item => item.counselor_name?.trim() || item.profiles?.full_name?.trim() || item.profiles?.email || 'Usuário';
  const assignmentText = item => counselorFields.filter(([key]) => item[key]).map(([, label]) => label).join(' · ') || 'Sem permissão selecionada';
  const hasCounselorPermission = item => counselorFields.some(([key]) => !!item[key]);
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
    const counselorCanEdit = ownAssignments.some(hasCounselorPermission);
    if (permission.role !== 'admin' && !Object.keys(permission).some(key => key.startsWith('can_') && permission[key])) {
      document.getElementById('roleLabel').textContent = counselorCanEdit ? 'Acesso de Editor' : 'Visualizador';
    }
    if (previous !== JSON.stringify(assignments)) render();
    drawCounselorLabels();
  }

  function resetCounselorForm() {
    editingCounselorId = null;
    const form = document.getElementById('counselorForm');
    if (!form) return;
    form.reset();
    const saveButton = form.querySelector('button.primary');
    if (saveButton) saveButton.textContent = 'Salvar conselheiro';
    const permissionArea = document.getElementById('counselorPermissionArea');
    if (permissionArea) permissionArea.classList.remove('hidden');
    const accountHint = document.getElementById('counselorAccountHint');
    if (accountHint) accountHint.textContent = 'Selecione um usuário cadastrado para liberar permissões.';
  }

  function renderManager() {
    const classSelect = document.getElementById('counselorClass');
    classSelect.innerHTML = '<option value="" selected disabled>Selecione a turma</option>' + classes.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    document.getElementById('counselorUsers').innerHTML = registeredUsers.map(item => `<option value="${escapeHtml(counselorName(item))}" data-id="${item.user_id}">${escapeHtml(item.profiles?.email || '')}</option>`).join('');
    document.getElementById('counselorPermissions').innerHTML = counselorFields.map(([key, label]) => `<label class="check"><input type="checkbox" name="${key}"> ${label}</label>`).join('');
    document.getElementById('counselorList').innerHTML = assignments.length ? assignments.map(item => {
      const person = registeredUsers.find(userItem => userItem.user_id === item.counselor_user_id);
      const currentClass = classes.find(classItem => classItem.id === item.class_id);
      const registered = !!item.counselor_user_id;
      return `<article class="counselor-item"><div><b>${escapeHtml(counselorName(person || item))}</b><div class="meta">${escapeHtml(currentClass?.name || 'Turma removida')} · ${registered ? escapeHtml(assignmentText(item)) : 'Sem conta — registro da turma'}</div></div><div class="counselor-actions"><button class="btn secondary" type="button" data-edit-counselor-id="${item.id}">Editar</button><button class="delete" type="button" data-counselor-id="${item.id}">Excluir</button></div></article>`;
    }).join('') : '<div class="empty">Nenhum conselheiro cadastrado.</div>';
  }

  window.openCounselorManager = async () => {
    if (permission.role !== 'admin' || window.matchMedia('(max-width:800px)').matches) return;
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
      const counselorInput = document.getElementById('counselorUser');
      if (!counselorInput) { toast('Não foi possível preparar o formulário de conselheiros.'); return; }
      counselorInput.oninput = () => {
        const value = counselorInput.value.trim();
        const registered = registeredUsers.some(item => counselorName(item) === value || item.profiles?.email === value);
        document.getElementById('counselorPermissionArea')?.classList.toggle('hidden', !registered && !!value);
        const accountHint = document.getElementById('counselorAccountHint');
        if (accountHint) accountHint.textContent = registered ? 'Usuário com conta: escolha as permissões para a turma.' : 'Sem conta: será apenas um registro do conselheiro na turma, sem acesso ao sistema.';
      };
      modal.classList.remove('hidden');
    } catch (error) {
      toast(`Não foi possível abrir os conselheiros: ${error.message || 'erro inesperado'}`);
    }
  };

  document.getElementById('counselorForm').onsubmit = async event => {
    event.preventDefault();
    const typedName = document.getElementById('counselorUser').value.trim();
    const selectedUser = registeredUsers.find(item => counselorName(item) === typedName || item.profiles?.email === typedName);
    if (!typedName || typedName.length < 3) { toast('Informe o nome do conselheiro.'); return; }
    const row = { class_id:document.getElementById('counselorClass').value };
    if (selectedUser) {
      row.counselor_user_id = selectedUser.user_id;
      row.counselor_name = counselorName(selectedUser);
      counselorFields.forEach(([key]) => { row[key] = document.querySelector(`#counselorPermissions input[name="${key}"]`).checked; });
    } else {
      row.counselor_name = typedName;
      row.counselor_user_id = null;
      counselorFields.forEach(([key]) => { row[key] = false; });
    }
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
      editingCounselorId = item.id;
      document.getElementById('counselorUser').value = counselorName(registeredUsers.find(userItem => userItem.user_id === item.counselor_user_id) || item);
      document.getElementById('counselorClass').value = item.class_id;
      const registered = !!item.counselor_user_id;
      document.getElementById('counselorPermissionArea').classList.toggle('hidden', !registered);
      counselorFields.forEach(([key]) => { document.querySelector(`#counselorPermissions input[name="${key}"]`).checked = !!item[key]; });
      document.getElementById('counselorAccountHint').textContent = registered ? 'Edite as permissões para esta turma.' : 'Sem conta: este registro não libera acesso ao sistema.';
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

  new MutationObserver(drawCounselorLabels).observe(document.getElementById('classList'), { childList:true });
  new MutationObserver(drawCounselorLabels).observe(document.getElementById('studentDetails'), { childList:true, subtree:true });
  refreshAssignments();
  setInterval(refreshAssignments, 4000);
});
