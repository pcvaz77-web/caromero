document.addEventListener('DOMContentLoaded', () => {
  const detailsStyle = document.createElement('style');
  detailsStyle.textContent = `
    .perm { grid-template-columns: 1fr 112px 115px minmax(360px, 1fr) 110px; }
    .edit-rights { display:flex; flex-wrap:wrap; gap:7px 10px; }
    .edit-rights .check { font-size:12px; }
    #studentDetails { width: 460px; padding: 28px; }
    #studentDetails .detail-head { gap: 20px; }
    #studentDetails .detail-head .avatar { width: 180px; height: 180px; font-size: 38px; }
    #studentDetails .detail-head h3 { font-size: 24px; }
    #studentDetails .detail-row { font-size: 16px; padding: 15px 0; }
    @media (max-width:800px) {
      .perm { grid-template-columns: 1fr 1fr; }
      .perm > div:first-child { grid-column: span 2; }
      .edit-rights { grid-column:span 2; }
      #studentDetails { width: auto; padding: 20px; }
      #studentDetails .detail-head .avatar { width: 116px; height: 116px; font-size: 28px; }
    }
  `;
  document.head.appendChild(detailsStyle);

  const canDelete = () => permission.role === 'admin' || permission.can_delete_students;
  const canEdit = () => permission.role === 'admin' || permission.can_edit_all || permission.can_edit_photo || permission.can_edit_name || permission.can_edit_class || permission.can_edit_report;

  function syncStudentActions() {
    document.querySelectorAll('.student').forEach(card => {
      const id = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      if (!id) return;
      let actions = card.querySelector('.actions-small');
      if (!actions && (canEdit() || canDelete())) {
        actions = document.createElement('div');
        actions.className = 'actions-small';
        card.appendChild(actions);
      }
      if (!actions) return;
      const edit = actions.querySelector('.edit');
      const remove = actions.querySelector('.delete');
      if (edit) edit.hidden = !canEdit();
      if (remove) remove.hidden = !canDelete();
      if (canDelete() && !remove) {
        const button = document.createElement('button');
        button.className = 'delete';
        button.textContent = 'Excluir';
        button.onclick = event => { event.stopPropagation(); window.deleteStudent(id); };
        actions.appendChild(button);
      }
    });
    const classDelete = document.getElementById('deleteClass');
    if (classDelete && selectedClassId) classDelete.classList.toggle('hidden', !canDelete());
  }

  const studentsList = document.getElementById('list');
  new MutationObserver(syncStudentActions).observe(studentsList, { childList: true });
  syncStudentActions();

  async function openPermissions() {
    const { data, error } = await db.from('user_permissions')
      .select('user_id,role,can_add_students,can_delete_students,can_edit_all,can_edit_photo,can_edit_name,can_edit_class,can_edit_report,profiles(email)')
      .order('updated_at');
    if (error) { toast(error.message); return; }
    document.getElementById('permissionsList').innerHTML = (data || []).map(item => {
      const admin = item.role === 'admin';
      const check = (key, label) => `<label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item[key] ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','${key}',this.checked)"> ${label}</label>`;
      return `<div class="perm"><div><b>${esc(item.profiles?.email || 'Usuário')}</b><div class="meta">${admin ? 'Administrador principal' : ''}</div></div><select ${admin ? 'disabled' : ''} onchange="setUserPermission('${item.user_id}','role',this.value)"><option value="viewer" ${item.role === 'viewer' ? 'selected' : ''}>Visualizador</option><option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Editor</option></select>${check('can_add_students','Pode adicionar')}<div class="edit-rights">${check('can_edit_all','Editar tudo')}${check('can_edit_photo','Editar somente foto')}${check('can_edit_name','Editar somente nome')}${check('can_edit_class','Editar somente mudança de turma')}${check('can_edit_report','Editar “se possui Laudo”')}</div>${check('can_delete_students','Pode excluir')}</div>`;
    }).join('');
    document.getElementById('permissionsModal').classList.remove('hidden');
  }

  window.setUserPermission = async (id, key, value) => {
    const update = { [key]: value, updated_at: new Date().toISOString() };
    if (key === 'role' && value === 'viewer') Object.assign(update, { can_add_students: false, can_delete_students: false, can_edit_all: false, can_edit_photo: false, can_edit_name: false, can_edit_class: false, can_edit_report: false });
    const { error } = await db.from('user_permissions').update(update).eq('user_id', id);
    if (error) toast(error.message); else { toast('Permissão atualizada.'); openPermissions(); }
  };

  document.getElementById('permissionsNav').onclick = openPermissions;
});
