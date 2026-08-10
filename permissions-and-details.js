document.addEventListener('DOMContentLoaded', () => {
  const detailsStyle = document.createElement('style');
  detailsStyle.textContent = `
    .perm { grid-template-columns: 1fr 112px 115px 105px 110px; }
    #studentDetails { width: 460px; padding: 28px; }
    #studentDetails .detail-head { gap: 20px; }
    #studentDetails .detail-head .avatar { width: 180px; height: 180px; font-size: 38px; }
    #studentDetails .detail-head h3 { font-size: 24px; }
    #studentDetails .detail-row { font-size: 16px; padding: 15px 0; }
    @media (max-width:800px) {
      .perm { grid-template-columns: 1fr 1fr; }
      .perm > div:first-child { grid-column: span 2; }
      #studentDetails { width: auto; padding: 20px; }
      #studentDetails .detail-head .avatar { width: 116px; height: 116px; font-size: 28px; }
    }
  `;
  document.head.appendChild(detailsStyle);

  const canDelete = () => permission.role === 'admin' || permission.can_delete_students;
  const canEdit = () => permission.role === 'admin' || permission.can_edit_students;

  function syncStudentActions() {
    document.querySelectorAll('.student').forEach(card => {
      const id = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      if (!id) return;
      let actions = card.querySelector('.actions-small');
      if (!actions && canDelete()) {
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
      .select('user_id,role,can_add_students,can_edit_students,can_delete_students,profiles(email)')
      .order('updated_at');
    if (error) { toast(error.message); return; }
    document.getElementById('permissionsList').innerHTML = (data || []).map(item => {
      const admin = item.role === 'admin';
      return `<div class="perm"><div><b>${esc(item.profiles?.email || 'Usuário')}</b><div class="meta">${admin ? 'Administrador principal' : ''}</div></div><select ${admin ? 'disabled' : ''} onchange="setUserPermission('${item.user_id}','role',this.value)"><option value="viewer" ${item.role === 'viewer' ? 'selected' : ''}>Visualizador</option><option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Editor</option></select><label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item.can_add_students ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','can_add_students',this.checked)"> Pode adicionar</label><label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item.can_edit_students ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','can_edit_students',this.checked)"> Pode editar</label><label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item.can_delete_students ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','can_delete_students',this.checked)"> Pode excluir</label></div>`;
    }).join('');
    document.getElementById('permissionsModal').classList.remove('hidden');
  }

  window.setUserPermission = async (id, key, value) => {
    const update = { [key]: value, updated_at: new Date().toISOString() };
    if (key === 'role' && value === 'viewer') update.can_add_students = false;
    const { error } = await db.from('user_permissions').update(update).eq('user_id', id);
    if (error) toast(error.message); else { toast('Permissão atualizada.'); openPermissions(); }
  };

  document.getElementById('permissionsNav').onclick = openPermissions;
});
