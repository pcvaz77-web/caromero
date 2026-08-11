document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    #permissionsModal .modal { width:min(1160px, calc(100vw - 36px)); max-height:90vh; }
    #permissionsModal .form { padding:24px 28px 30px; }
    .permission-search-form { display:flex; gap:10px; margin:0 0 18px; }
    .permission-search { flex:1; min-height:48px; }
    #permissionsList { display:grid; gap:12px; }
    .perm { display:grid; grid-template-columns:minmax(230px,1fr) 130px auto; gap:16px; align-items:center; padding:18px; border:1px solid var(--line); border-radius:12px; }
    .permission-user b { display:block; font-size:15px; }
    .permission-user .meta { margin-top:4px; }
    .permission-basic { display:flex; flex-wrap:wrap; gap:10px; }
    .edit-rights { grid-column:1 / -1; display:grid; grid-template-columns:repeat(5, minmax(132px, 1fr)); gap:9px; padding-top:15px; border-top:1px solid var(--line); }
    .edit-rights .check { align-items:flex-start; padding:9px; border-radius:8px; background:#f7f9fc; font-size:12px; }
    .edit-rights .check:has(input:checked) { background:#e8efff; color:#214dba; }
    #studentDetails { width:460px; padding:28px; }
    #studentDetails .detail-head { gap:20px; }
    #studentDetails .detail-head .avatar { width:180px; height:180px; font-size:38px; }
    #studentDetails .detail-head h3 { font-size:24px; }
    #studentDetails .detail-row { font-size:16px; padding:15px 0; }
    @media (max-width:800px) {
      #permissionsModal .modal { width:100%; }
      #permissionsModal .form { padding:18px; }
      .perm { grid-template-columns:1fr; gap:12px; padding:15px; }
      .permission-basic { gap:8px; }
      .edit-rights { grid-column:auto; grid-template-columns:1fr 1fr; padding-top:12px; }
      #studentDetails { width:auto; padding:20px; }
      #studentDetails .detail-head .avatar { width:116px; height:116px; font-size:28px; }
    }
  `;
  document.head.appendChild(style);

  const canDelete = () => permission.role === 'admin' || permission.can_delete_students || permission.can_edit_all;
  const canEdit = () => permission.role === 'admin' || permission.can_edit_all || permission.can_edit_photo || permission.can_edit_name || permission.can_edit_class || permission.can_edit_report;
  const canAdd = () => permission.role === 'admin' || permission.can_add_students || permission.can_edit_all;

  function syncAddActions() {
    ['newStudent', 'newBulk', 'newClass'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !canAdd()));
  }

  function syncStudentActions() {
    document.querySelectorAll('.student').forEach(card => {
      const id = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      if (!id) return;
      let actions = card.querySelector('.actions-small');
      if (!actions && (canEdit() || canDelete())) { actions = document.createElement('div'); actions.className = 'actions-small'; card.appendChild(actions); }
      if (!actions) return;
      const edit = actions.querySelector('.edit');
      const remove = actions.querySelector('.delete');
      if (edit) edit.hidden = !canEdit();
      if (remove) remove.hidden = !canDelete();
      if (canDelete() && !remove) { const button = document.createElement('button'); button.className = 'delete'; button.textContent = 'Excluir'; button.onclick = event => { event.stopPropagation(); window.deleteStudent(id); }; actions.appendChild(button); }
    });
    const classDelete = document.getElementById('deleteClass');
    if (classDelete && selectedClassId) classDelete.classList.toggle('hidden', !canDelete());
  }
  new MutationObserver(syncStudentActions).observe(document.getElementById('list'), { childList:true });
  syncStudentActions();
  new MutationObserver(syncAddActions).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });
  syncAddActions();

  async function openPermissions() {
    const { data, error } = await db.from('user_permissions').select('user_id,role,can_add_students,can_delete_students,can_edit_all,can_edit_photo,can_edit_name,can_edit_class,can_edit_report,profiles(email,full_name)').order('updated_at');
    if (error) { toast(error.message); return; }
    const check = (item, key, label, admin) => `<label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item[key] ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','${key}',this.checked)"> ${label}</label>`;
    const cards = (data || []).map(item => {
      const admin = item.role === 'admin';
      const name = item.profiles?.full_name?.trim() || 'Nome não informado';
      const email = item.profiles?.email || 'Usuário';
      return `<article class="perm" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)}${admin ? ' · Administrador principal' : ''}</div></div><select ${admin ? 'disabled' : ''} onchange="setUserPermission('${item.user_id}','role',this.value)"><option value="viewer" ${item.role === 'viewer' ? 'selected' : ''}>Visualizador</option><option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Editor</option></select><div class="permission-basic">${check(item,'can_add_students','Pode adicionar',admin)}${check(item,'can_delete_students','Pode excluir',admin)}</div><div class="edit-rights">${check(item,'can_edit_all','Editar tudo: adicionar aluno/turma e excluir aluno',admin)}${check(item,'can_edit_photo','Editar somente foto',admin)}${check(item,'can_edit_name','Editar somente nome',admin)}${check(item,'can_edit_class','Editar somente mudança de turma',admin)}${check(item,'can_edit_report','Editar “se possui Laudo”',admin)}</div></article>`;
    }).join('');
    document.getElementById('permissionsList').innerHTML = `<form id="permissionSearchForm" class="permission-search-form"><input id="permissionSearch" class="permission-search" placeholder="Buscar por nome ou e-mail"><button class="btn primary" type="submit">Buscar</button></form>${cards}<div id="permissionEmpty" class="empty hidden">Nenhum usuário encontrado.</div>`;
    const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    window.filterPermissionUsers = value => {
      const query = normalizeSearch(value).trim();
      let visible = 0;
      document.querySelectorAll('#permissionsList .perm').forEach(card => {
        const matches = normalizeSearch(card.textContent).includes(query);
        card.style.display = matches ? '' : 'none';
        if (matches) visible++;
      });
      document.getElementById('permissionEmpty').style.display = visible ? 'none' : 'block';
    };
    const searchInput = document.getElementById('permissionSearch');
    searchInput.oninput = () => window.filterPermissionUsers(searchInput.value);
    searchInput.onkeyup = () => window.filterPermissionUsers(searchInput.value);
    document.getElementById('permissionSearchForm').onsubmit = event => { event.preventDefault(); window.filterPermissionUsers(searchInput.value); };
    document.getElementById('permissionsModal').classList.remove('hidden');
  }

  window.setUserPermission = async (id, key, value) => {
    const update = { [key]: value, updated_at:new Date().toISOString() };
    if (key === 'role' && value === 'viewer') Object.assign(update, { can_add_students:false, can_delete_students:false, can_edit_all:false, can_edit_photo:false, can_edit_name:false, can_edit_class:false, can_edit_report:false });
    const { error } = await db.from('user_permissions').update(update).eq('user_id',id);
    if (error) toast(error.message); else { toast('Permissão atualizada.'); openPermissions(); }
  };
  document.getElementById('permissionsNav').onclick = openPermissions;
});
