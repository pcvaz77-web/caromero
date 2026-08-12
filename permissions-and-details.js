document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    #permissionsModal .modal { width:min(1160px, calc(100vw - 36px)); max-height:90vh; }
    #permissionsModal .form { padding:24px 28px 30px; }
    .permission-search-form { display:flex; gap:10px; margin:0 0 18px; }
    .permission-search { flex:1; min-height:48px; }
    .counselor-management { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:15px 16px; border:1px solid #cbdcff; background:#f5f8ff; border-radius:11px; }
    .counselor-management b { display:block; }
    #permissionsList { display:grid; gap:12px; }
    .perm { display:grid; grid-template-columns:minmax(230px,1fr) minmax(170px,.72fr) minmax(220px,1fr); gap:16px; align-items:center; padding:18px; border:1px solid var(--line); border-radius:12px; }
    .permission-user b { display:block; font-size:15px; }
    .permission-user .meta { margin-top:4px; }
    .permission-basic { display:flex; flex-wrap:wrap; gap:8px; }
    .permission-primary .check, .permission-basic .check { min-height:42px; padding:10px 12px; border:1px solid #d9e2f4; border-radius:8px; background:#f7f9fc; }
    .permission-primary .check { background:#e8efff; color:#214dba; }
    .edit-rights { grid-column:1 / -1; display:grid; grid-template-columns:repeat(4, minmax(132px, 1fr)); gap:9px; padding-top:15px; border-top:1px solid var(--line); }
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
      .counselor-management { align-items:stretch; flex-direction:column; }
      .counselor-management .btn { width:100%; }
      .perm { grid-template-columns:1fr; gap:12px; padding:15px; }
      .permission-basic { gap:8px; }
      .edit-rights { grid-column:auto; grid-template-columns:1fr 1fr; padding-top:12px; }
      #studentDetails { width:auto; padding:20px; }
      #studentDetails .detail-head .avatar { width:116px; height:116px; font-size:28px; }
    }
    @media (min-width:801px) and (max-width:1150px) {
      .side { width:210px; }
      .main { margin-left:210px; padding:30px 26px; }
      .student { grid-template-columns:48px minmax(140px,1fr) 82px 120px; gap:10px; }
      .student > :nth-child(4) { display:none; }
      #studentDetails { width:320px; }
    }
    @media (max-width:1150px) {
      #list .student { border-bottom:1px solid #edf0f4 !important; }
      #list .student:last-child { border-bottom:0 !important; }
    }
  `;
  document.head.appendChild(style);

  const isRestrictedCounselor = () => permission.role !== 'admin' && !!window.isCounselorUser?.();
  const canDelete = student => {
    if (isRestrictedCounselor()) return false;
    return permission.role === 'admin' || permission.can_delete_students || permission.can_edit_all;
  };
  const canEdit = () => permission.role === 'admin' || permission.can_edit_all || permission.can_edit_photo || permission.can_edit_name || permission.can_edit_class || permission.can_edit_report;
  const canEditStudent = student => {
    const counselor = window.counselorRightsForClass?.(student?.classId);
    if (isRestrictedCounselor()) return !!(counselor?.can_edit_all || counselor?.can_edit_photo || counselor?.can_edit_name || counselor?.can_edit_report);
    if (canEdit()) return true;
    return !!(counselor?.can_edit_all || counselor?.can_edit_photo || counselor?.can_edit_name || counselor?.can_edit_report);
  };
  const canAdd = () => !isRestrictedCounselor() && (permission.role === 'admin' || permission.can_add_students || permission.can_edit_all);
  const permissionFields = ['can_add_students', 'can_delete_students', 'can_edit_all', 'can_edit_photo', 'can_edit_name', 'can_edit_class', 'can_edit_report'];
  const permissionLabel = item => {
    if (item.role === 'admin') return 'Administrador';
    const counselorLabel = item.user_id === user?.id ? window.counselorAccessLabel?.() : null;
    return counselorLabel || (permissionFields.some(key => item[key]) ? 'Acesso de Editor' : 'Visualizador');
  };
  const hasGrantedPermission = item => item.role === 'admin' || permissionFields.some(key => item[key]);

  function applyCurrentPermission(nextPermission) {
    if (!nextPermission) return;
    permission = nextPermission.role === 'admin' ? { ...nextPermission, can_add_students:true, can_edit_students:true } : nextPermission;
    const admin = permission.role === 'admin';
    document.getElementById('roleLabel').textContent = permissionLabel(permission);
    document.getElementById('permissionsNav').classList.toggle('hidden', !admin);
    syncAddActions();
    render();
    syncStudentActions();
  }

  async function refreshCurrentPermission() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || document.getElementById('app').classList.contains('hidden')) return;
    const { data } = await db.from('user_permissions').select('*').eq('user_id', signedInUser.id).maybeSingle();
    if (!data) return;
    if (permission.role !== data.role || permissionFields.some(key => !!permission[key] !== !!data[key]) || document.getElementById('roleLabel').textContent !== permissionLabel(data)) applyCurrentPermission(data);
  }

  function syncAddActions() {
    ['newStudent', 'newBulk', 'newClass'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !canAdd()));
  }

  function syncStudentActions() {
    document.querySelectorAll('.student').forEach(card => {
      const id = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      if (!id) return;
      const student = students.find(item => item.id === id);
      const studentCanEdit = canEditStudent(student);
      let actions = card.querySelector('.actions-small');
      if (!actions && (studentCanEdit || canDelete(student))) {
        const placeholder = card.lastElementChild;
        actions = placeholder?.tagName === 'DIV' && !placeholder.textContent.trim() ? placeholder : document.createElement('div');
        actions.className = 'actions-small';
        if (!actions.parentElement) card.appendChild(actions);
      }
      if (!actions) return;
      const edit = actions.querySelector('.edit');
      const remove = actions.querySelector('.delete');
      if (edit) edit.hidden = !studentCanEdit;
      if (remove) remove.hidden = !canDelete(student);
      if (canDelete(student) && !remove) { const button = document.createElement('button'); button.className = 'delete'; button.textContent = 'Excluir'; button.onclick = event => { event.stopPropagation(); window.deleteStudent(id); }; actions.appendChild(button); }
    });
    const classDelete = document.getElementById('deleteClass');
    if (classDelete && selectedClassId) classDelete.classList.toggle('hidden', !canDelete());
  }
  new MutationObserver(syncStudentActions).observe(document.getElementById('list'), { childList:true });
  syncStudentActions();
  new MutationObserver(syncAddActions).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });
  syncAddActions();

  async function openPermissions() {
    const { data, error } = await db.from('user_permissions').select('user_id,role,can_add_students,can_delete_students,can_edit_all,can_edit_photo,can_edit_name,can_edit_class,can_edit_report,profiles(email,full_name)');
    if (error) { toast(error.message); return; }
    const check = (item, key, label, admin) => `<label class="check"><input ${admin ? 'disabled' : ''} type="checkbox" ${item[key] ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','${key}',this.checked)"> ${label}</label>`;
    const sortedUsers = [...(data || [])].sort((first, second) => {
      const permissionOrder = Number(hasGrantedPermission(second)) - Number(hasGrantedPermission(first));
      if (permissionOrder) return permissionOrder;
      const firstName = first.profiles?.full_name?.trim() || first.profiles?.email || '';
      const secondName = second.profiles?.full_name?.trim() || second.profiles?.email || '';
      return firstName.localeCompare(secondName, 'pt-BR', { sensitivity:'base' });
    });
    const cards = sortedUsers.map(item => {
      const admin = item.role === 'admin';
      const name = item.profiles?.full_name?.trim() || 'Nome não informado';
      const email = item.profiles?.email || 'Usuário';
      return `<article class="perm" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)}${admin ? ' · Administrador principal' : ''}</div></div><div class="permission-primary">${check(item,'can_edit_all','Editar tudo',admin)}</div><div class="permission-basic">${check(item,'can_add_students','Pode adicionar',admin)}${check(item,'can_delete_students','Pode excluir',admin)}</div><div class="edit-rights">${check(item,'can_edit_photo','Editar somente foto',admin)}${check(item,'can_edit_name','Editar somente nome',admin)}${check(item,'can_edit_class','Editar somente mudança de turma',admin)}${check(item,'can_edit_report','Pode editar observações do aluno',admin)}</div></article>`;
    }).join('');
    const counselorManager = `<section class="counselor-management"><div><b>Conselheiros de turma</b><div class="meta">Cadastre, edite ou exclua conselheiros e as permissões por turma.</div></div><button id="openCounselors" type="button" class="btn secondary">Gerenciar conselheiros</button></section>`;
    document.getElementById('permissionsList').innerHTML = `${counselorManager}<form id="permissionSearchForm" class="permission-search-form"><input id="permissionSearch" class="permission-search" placeholder="Buscar por nome ou e-mail"><button class="btn primary" type="submit">Buscar</button></form>${cards}<div id="permissionEmpty" class="empty hidden">Nenhum usuário encontrado.</div>`;
    document.getElementById('openCounselors').onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.openCounselorManager !== 'function') { toast('O gerenciador está sendo carregado. Tente novamente em alguns segundos.'); return; }
      document.getElementById('permissionsModal').classList.add('hidden');
      window.openCounselorManager();
    };
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
    const { error } = await db.from('user_permissions').update(update).eq('user_id',id);
    if (error) toast(error.message); else { toast('Permissão atualizada.'); openPermissions(); }
  };
  document.getElementById('permissionsNav').onclick = openPermissions;
  db.auth.getUser().then(({ data: { user: signedInUser } }) => {
    if (!signedInUser) return;
    if (db.channel) db.channel(`permission-live-${signedInUser.id}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'user_permissions', filter:`user_id=eq.${signedInUser.id}` },
      () => { refreshCurrentPermission(); }
    ).subscribe();
  });
  setInterval(refreshCurrentPermission, 4000);
});
