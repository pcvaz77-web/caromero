document.addEventListener('DOMContentLoaded', () => {
  const counselorFields = [
    ['can_edit_all', 'Editar tudo'],
    ['can_edit_photo', 'Editar foto'],
    ['can_edit_name', 'Editar nome'],
    ['can_edit_report', 'Editar observações']
  ];
  let assignments = [];
  let registeredUsers = [];
  window.counselorRightsForClass = classId => assignments.find(item => item.class_id === classId) || null;

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
    @media (max-width:800px), (hover:none) and (pointer:coarse) { .counselor-entry, .counselor-modal { display:none !important; } }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'counselorModal';
  modal.className = 'modal-bg counselor-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Conselheiros de turma</h3><div class="meta">Permissões limitadas apenas à turma escolhida.</div></div><button class="close" type="button" id="closeCounselors">×</button></div><div class="form"><form id="counselorForm"><div class="counselor-form-grid"><div class="field"><label for="counselorUser">Conselheiro cadastrado</label><input id="counselorUser" list="counselorUsers" required placeholder="Digite o nome do usuário"><datalist id="counselorUsers"></datalist></div><div class="field"><label for="counselorClass">Turma</label><select id="counselorClass" required></select></div></div><label>Permissões para esta turma</label><div id="counselorPermissions" class="counselor-permissions"></div><div class="actions"><button type="button" class="btn secondary" id="cancelCounselor">Cancelar</button><button class="btn primary">Salvar conselheiro</button></div></form><div id="counselorList" class="counselor-list"></div></div></div>`;
  document.body.appendChild(modal);

  const closeManager = () => modal.classList.add('hidden');
  document.getElementById('closeCounselors').onclick = closeManager;
  document.getElementById('cancelCounselor').onclick = closeManager;
  modal.onclick = event => { if (event.target === modal) closeManager(); };

  const escapeHtml = value => { const element = document.createElement('div'); element.textContent = value || ''; return element.innerHTML; };
  const counselorName = item => item.profiles?.full_name?.trim() || item.profiles?.email || 'Usuário';
  const assignmentText = item => counselorFields.filter(([key]) => item[key]).map(([, label]) => label).join(' · ') || 'Sem permissão selecionada';

  async function refreshAssignments() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || document.getElementById('app').classList.contains('hidden')) return;
    const { data, error } = await db.from('class_counselors').select('*').eq('counselor_user_id', signedInUser.id);
    if (error) return;
    const previous = JSON.stringify(assignments);
    assignments = data || [];
    if (previous !== JSON.stringify(assignments)) render();
  }

  function renderManager() {
    const classSelect = document.getElementById('counselorClass');
    classSelect.innerHTML = '<option value="" selected disabled>Selecione a turma</option>' + classes.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    document.getElementById('counselorUsers').innerHTML = registeredUsers.map(item => `<option value="${escapeHtml(counselorName(item))}" data-id="${item.user_id}">${escapeHtml(item.profiles?.email || '')}</option>`).join('');
    document.getElementById('counselorPermissions').innerHTML = counselorFields.map(([key, label]) => `<label class="check"><input type="checkbox" name="${key}"> ${label}</label>`).join('');
    document.getElementById('counselorList').innerHTML = assignments.length ? assignments.map(item => {
      const person = registeredUsers.find(userItem => userItem.user_id === item.counselor_user_id);
      const currentClass = classes.find(classItem => classItem.id === item.class_id);
      return `<article class="counselor-item"><div><b>${escapeHtml(counselorName(person || {}))}</b><div class="meta">${escapeHtml(currentClass?.name || 'Turma removida')} · ${escapeHtml(assignmentText(item))}</div></div><button class="delete" type="button" data-counselor-id="${item.id}">Remover</button></article>`;
    }).join('') : '<div class="empty">Nenhum conselheiro cadastrado.</div>';
  }

  window.openCounselorManager = async () => {
    if (permission.role !== 'admin' || window.matchMedia('(max-width:800px), (hover:none) and (pointer:coarse)').matches) return;
    const [{ data: users, error: usersError }, { data: dataAssignments, error: assignmentsError }] = await Promise.all([
      db.from('user_permissions').select('user_id,profiles(email,full_name)'),
      db.from('class_counselors').select('*')
    ]);
    if (usersError || assignmentsError) { toast((usersError || assignmentsError).message); return; }
    registeredUsers = users || [];
    assignments = dataAssignments || [];
    renderManager();
    modal.classList.remove('hidden');
  };

  document.getElementById('counselorForm').onsubmit = async event => {
    event.preventDefault();
    const typedName = document.getElementById('counselorUser').value.trim();
    const selectedUser = registeredUsers.find(item => counselorName(item) === typedName || item.profiles?.email === typedName);
    if (!selectedUser) { toast('Selecione um usuário já cadastrado.'); return; }
    const row = { counselor_user_id:selectedUser.user_id, class_id:document.getElementById('counselorClass').value };
    counselorFields.forEach(([key]) => { row[key] = document.querySelector(`#counselorPermissions input[name="${key}"]`).checked; });
    if (!counselorFields.some(([key]) => row[key])) { toast('Selecione ao menos uma permissão.'); return; }
    const { error } = await db.from('class_counselors').upsert(row, { onConflict:'counselor_user_id,class_id' });
    if (error) { toast(error.message); return; }
    toast('Conselheiro salvo.');
    window.openCounselorManager();
  };

  document.getElementById('counselorList').onclick = async event => {
    const button = event.target.closest('[data-counselor-id]');
    if (!button || !confirm('Remover este conselheiro da turma?')) return;
    const { error } = await db.from('class_counselors').delete().eq('id', button.dataset.counselorId);
    if (error) { toast(error.message); return; }
    toast('Conselheiro removido.');
    window.openCounselorManager();
  };

  const permissionListObserver = new MutationObserver(() => {
    if (permission.role !== 'admin' || document.getElementById('openCounselors')) return;
    const list = document.getElementById('permissionsList');
    if (!list.children.length) return;
    const button = document.createElement('button');
    button.id = 'openCounselors';
    button.type = 'button';
    button.className = 'btn secondary counselor-entry';
    button.textContent = 'Conselheiros de turma';
    button.onclick = window.openCounselorManager;
    list.prepend(button);
  });
  permissionListObserver.observe(document.getElementById('permissionsList'), { childList:true });
  setInterval(refreshAssignments, 4000);
});
