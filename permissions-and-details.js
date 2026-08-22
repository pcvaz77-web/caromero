document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    #permissionsModal .modal { display:flex; flex-direction:column; width:min(1160px, calc(100vw - 36px)); height:min(900px,90dvh); max-height:90dvh; overflow:hidden; }
    #permissionsModal .modal-head { position:sticky; top:0; z-index:3; flex:none; background:#fff; }
    #permissionsModal .form { flex:1; min-height:0; padding:24px 28px 30px; overflow-y:auto; overscroll-behavior:contain; }
    .permission-search-form { display:flex; gap:10px; margin:0 0 18px; }
    .permission-search { flex:1; min-height:48px; }
    .counselor-management { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:15px 16px; border:1px solid #cbdcff; background:#f5f8ff; border-radius:11px; }
    .counselor-management b { display:block; }
    .coordinator-management { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:15px 16px; border:1px solid #b9d4ff; background:#eef5ff; border-radius:11px; }
    .coordinator-management b { display:block; }
    .coordinator-modal { z-index:105; }.coordinator-modal .modal { width:min(720px,100%); }.coordinator-form-grid { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:end; }.coordinator-list { display:grid; gap:9px; margin-top:20px; }.coordinator-item { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:13px; border:1px solid var(--line); border-radius:9px; }.coordinator-badge { display:inline-flex; margin-top:5px; padding:4px 8px; border-radius:99px; background:#e8efff; color:#214dba; font-size:11px; font-weight:800; }
    .coordinator-permissions { margin-top:15px; padding:16px; border:1px solid #cbdcff; background:#f7f9ff; border-radius:11px; }.coordinator-permissions h4 { margin:0 0 5px; font-size:15px; }.coordinator-permission-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:13px; }.coordinator-permission-options .check { align-items:flex-start; min-height:40px; padding:9px 10px; border:1px solid #d9e2f4; background:#fff; border-radius:8px; font-size:12px; line-height:1.25; }.coordinator-permission-options .check:has(input:checked) { background:#e8efff; color:#214dba; }
    .advanced-permissions { border:1px solid #cbdcff; background:#f7f9ff; border-radius:12px; padding:14px; }.advanced-permissions summary { list-style:none; display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; font-weight:800; color:#1f3d78; }.advanced-permissions summary::-webkit-details-marker { display:none; }.advanced-permissions summary::after { content:'⌄'; font-size:20px; }.advanced-permissions[open] summary::after { content:'⌃'; }.advanced-permissions .advanced-content { display:grid; gap:12px; padding-top:14px; }.permissions-heading { margin:8px 0 0; font-size:15px; }.permissions-heading .meta { margin-top:3px; }
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
    .coordinator-right-group { grid-column:1 / -1; border:1px solid #d9e2f4; border-radius:10px; overflow:hidden; }
    .coordinator-right-group summary { cursor:pointer; padding:11px 13px; background:#f7f9fc; font-size:13px; font-weight:800; }
    .coordinator-right-group .edit-rights { border-top:1px solid #d9e2f4; padding:12px; }
    #studentDetails { width:460px; padding:28px; }
    #studentDetails .detail-head { gap:20px; }
    #studentDetails .detail-head .avatar { width:180px; height:180px; font-size:38px; }
    #studentDetails .detail-head h3 { font-size:24px; }
    #studentDetails .detail-row { font-size:16px; padding:15px 0; }
    @media (max-width:800px) {
      #permissionsModal { padding:10px; align-items:start; overflow:auto; }
      #permissionsModal .modal { width:100%; max-height:calc(100vh - 20px); margin:auto 0; }
      #permissionsModal .form { padding:16px; }
      .counselor-management { align-items:stretch; flex-direction:column; }
      .counselor-management .btn { width:100%; }
      .coordinator-management { align-items:stretch; flex-direction:column; }
      .coordinator-management .btn { width:100%; }
      .coordinator-modal { padding:10px; align-items:start; overflow:auto; }.coordinator-modal .modal { width:100%; max-height:calc(100vh - 20px); margin:auto 0; }.coordinator-modal .form { padding:16px; }.coordinator-form-grid { grid-template-columns:1fr; gap:8px; }.coordinator-item { align-items:flex-start; flex-direction:column; }.coordinator-item .btn { width:100%; }.coordinator-permission-options { grid-template-columns:1fr; }
      .permission-search-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; margin-bottom:12px; }
      .permission-search { min-width:0; min-height:42px; padding:9px 11px; font-size:14px; }
      .permission-search-form .btn { min-height:42px; padding:9px 12px; font-size:13px; }
      .perm { grid-template-columns:1fr; gap:10px; padding:13px; min-width:0; }
      .permission-primary, .permission-basic, .edit-rights { display:grid; grid-template-columns:1fr; gap:7px; min-width:0; }
      .edit-rights { grid-column:auto; padding-top:10px; }
      .coordinator-right-group { grid-column:auto; }
      .coordinator-right-group .edit-rights { padding:8px; }
      .permission-primary .check, .permission-basic .check, .edit-rights .check { min-height:36px; padding:8px 10px; font-size:12px; line-height:1.25; overflow-wrap:anywhere; }
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
  style.textContent += `
    .coordinator-modal .modal { display:flex; flex-direction:column; max-height:90dvh; overflow:hidden; }
    .coordinator-modal .modal-head { position:sticky; top:0; z-index:3; flex:none; background:#fff; }
    .coordinator-modal .form { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
  `;
  document.head.appendChild(style);

  const isAdvancedUser = () => permission.role === 'admin' || !!permission.is_coordinator;
  const isGeneralTeacher = () => permission.role !== 'admin' && !permission.is_coordinator;
  const canDelete = student => {
    return permission.role === 'admin' || (isGeneralTeacher() && !!permission.can_edit_students) || (isAdvancedUser() && (!!permission.can_delete_students || !!permission.can_edit_all));
  };
  const canEdit = () => permission.role === 'admin' || (isGeneralTeacher() && !!permission.can_edit_students) || (isAdvancedUser() && (!!permission.can_edit_all || !!permission.can_edit_photo || !!permission.can_edit_name || !!permission.can_edit_class || !!permission.can_edit_report));
  const canEditStudent = student => {
    return canEdit();
  };
  const canAdd = () => permission.role === 'admin' || !!permission.can_add_students || (isAdvancedUser() && !!permission.can_edit_all);
  const permissionFields = ['can_add_students', 'can_delete_students', 'can_edit_all', 'can_edit_photo', 'can_edit_name', 'can_edit_class', 'can_edit_report', 'can_view_uniform', 'can_edit_uniform', 'can_mark_all_uniform_received', 'can_view_occurrences', 'can_register_occurrences', 'can_edit_occurrences', 'can_delete_occurrences', 'can_manage_counselors'];
  // Estas 4 são geridas fora de user_permissions: a RLS real de
  // student_occurrences lê school_member_permissions, não esta tabela. Ver
  // occCheck/setOccurrencePermission abaixo.
  const OCCURRENCE_PERMISSION_KEYS = ['can_view_occurrences', 'can_register_occurrences', 'can_edit_occurrences', 'can_delete_occurrences'];
  // Estas 3 também são geridas fora de user_permissions: a RLS/RPC real de
  // Uniforme lê school_member_permissions, não esta tabela. Ver
  // uniformCheck/setUniformPermission abaixo.
  const UNIFORM_PERMISSION_KEYS = ['can_view_uniform', 'can_edit_uniform', 'can_mark_all_uniform_received'];
  const isCoordinator = item => item?.role === 'admin' || !!item?.is_coordinator;
  const permissionLabel = item => {
    if (item.role === 'admin') return 'Administrador';
    if (item.is_coordinator) return 'Coordenador';
    return 'Acesso de professor(a)';
  };
  const hasGrantedPermission = item => item.role === 'admin' || permissionFields.some(key => item[key]);

  // Resolve o vínculo comercial ativo (school_members) do usuário logado.
  // Não fixa nenhuma escola específica: cada usuário só enxerga, via RLS, o
  // próprio vínculo — funciona igual para qualquer escola do sistema comercial.
  async function currentSchoolMembership() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return null;
    const { data } = await db.from('school_members').select('id,school_id,role').eq('user_id', signedInUser.id).eq('status', 'active').limit(1).maybeSingle();
    return data || null;
  }

  // Mapa user_id -> permissões de ocorrência (school_member_permissions) de
  // todos os membros ativos da escola informada.
  async function loadSchoolOccurrencePermissions(schoolId) {
    const { data, error } = await db.from('school_members').select('id,user_id,role,school_member_permissions(can_view_occurrences,can_register_occurrences,can_edit_occurrences,can_delete_occurrences,can_edit_all)').eq('school_id', schoolId).eq('status', 'active');
    if (error) { toast(error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach(item => {
      const perms = item.school_member_permissions || {};
      map.set(item.user_id, { memberId:item.id, role:item.role, can_view_occurrences:!!perms.can_view_occurrences, can_register_occurrences:!!perms.can_register_occurrences, can_edit_occurrences:!!perms.can_edit_occurrences, can_delete_occurrences:!!perms.can_delete_occurrences, can_edit_all:!!perms.can_edit_all });
    });
    return map;
  }

  // Mapa user_id -> permissões de uniforme (school_member_permissions) de
  // todos os membros ativos da escola informada.
  async function loadSchoolUniformPermissions(schoolId) {
    const { data, error } = await db.from('school_members').select('id,user_id,role,school_member_permissions(can_view_uniform,can_edit_uniform,can_mark_all_uniform_received,can_edit_all)').eq('school_id', schoolId).eq('status', 'active');
    if (error) { toast(error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach(item => {
      const perms = item.school_member_permissions || {};
      map.set(item.user_id, { memberId:item.id, role:item.role, can_view_uniform:!!perms.can_view_uniform, can_edit_uniform:!!perms.can_edit_uniform, can_mark_all_uniform_received:!!perms.can_mark_all_uniform_received, can_edit_all:!!perms.can_edit_all });
    });
    return map;
  }

  async function findSchoolMemberId(userId, schoolId) {
    if (!schoolId) return null;
    const { data } = await db.from('school_members').select('id').eq('user_id', userId).eq('school_id', schoolId).eq('status', 'active').maybeSingle();
    return data?.id || null;
  }

  // Promove/rebaixa via a RPC comercial existente (hierarquia, anti-escalada
  // e a limpeza automática de permissões administrativas exclusivas de
  // coordenador ao rebaixar já são feitas pela própria função no banco).
  // Não substitui a escrita legada em user_permissions.is_coordinator — a
  // Paulo Freire ainda depende parcialmente dela — só mantém school_members.role
  // sincronizado com a decisão tomada nesta mesma tela.
  async function applySchoolMemberRole(userId, schoolId, newRole) {
    const memberId = await findSchoolMemberId(userId, schoolId);
    if (!memberId) return 'Sem vínculo comercial ativo nesta escola para atualizar o papel.';
    const { error } = await db.rpc('set_school_member_role', { target_member_id:memberId, new_role:newRole });
    return error ? error.message : null;
  }

  // Aplica as 4 flags de ocorrência via a RPC comercial (hierarquia e
  // anti-escalada já garantidas pela própria função no banco).
  async function applyOccurrencePermissions(userId, schoolId, flags) {
    const memberId = await findSchoolMemberId(userId, schoolId);
    if (!memberId) return 'Sem vínculo comercial ativo nesta escola para aplicar as permissões de ocorrência.';
    for (const key of OCCURRENCE_PERMISSION_KEYS) {
      const { error } = await db.rpc('set_school_member_permission', { target_member_id:memberId, permission_name:key, permission_value:!!flags[key] });
      if (error) return error.message;
    }
    return null;
  }

  // Aplica as 3 flags de uniforme via a RPC comercial (hierarquia e
  // anti-escalada já garantidas pela própria função no banco).
  async function applyUniformPermissions(userId, schoolId, flags) {
    const memberId = await findSchoolMemberId(userId, schoolId);
    if (!memberId) return 'Sem vínculo comercial ativo nesta escola para aplicar as permissões de uniforme.';
    for (const key of UNIFORM_PERMISSION_KEYS) {
      const { error } = await db.rpc('set_school_member_permission', { target_member_id:memberId, permission_name:key, permission_value:!!flags[key] });
      if (error) return error.message;
    }
    return null;
  }

  const occCheck = (item, occMap, key, label) => {
    const admin = item.role === 'admin';
    const target = occMap.get(item.user_id);
    const disabled = admin || !target;
    const checked = !!target && (target.can_edit_all || target[key]);
    const hint = !target ? ' title="Sem vínculo comercial ativo nesta escola"' : '';
    return `<label class="check"${hint}><input ${disabled ? 'disabled' : ''} type="checkbox" ${checked ? 'checked' : ''} onchange="setOccurrencePermission('${target ? target.memberId : ''}','${key}',this.checked)"> ${label}</label>`;
  };
  window.setOccurrencePermission = async (memberId, key, value) => {
    if (!memberId) { toast('Sem vínculo comercial ativo nesta escola para aplicar esta permissão.'); return; }
    const { error } = await db.rpc('set_school_member_permission', { target_member_id:memberId, permission_name:key, permission_value:value });
    if (error) { toast(error.message); return; }
    toast('Permissão atualizada.');
    openPermissions();
  };

  const uniformCheck = (item, uniformMap, key, label) => {
    const admin = item.role === 'admin';
    const target = uniformMap.get(item.user_id);
    const disabled = admin || !target;
    const checked = !!target && (target.can_edit_all || target[key]);
    const hint = !target ? ' title="Sem vínculo comercial ativo nesta escola"' : '';
    return `<label class="check"${hint}><input ${disabled ? 'disabled' : ''} type="checkbox" ${checked ? 'checked' : ''} onchange="setUniformPermission('${target ? target.memberId : ''}','${key}',this.checked)"> ${label}</label>`;
  };
  window.setUniformPermission = async (memberId, key, value) => {
    if (!memberId) { toast('Sem vínculo comercial ativo nesta escola para aplicar esta permissão.'); return; }
    const { error } = await db.rpc('set_school_member_permission', { target_member_id:memberId, permission_name:key, permission_value:value });
    if (error) { toast(error.message); return; }
    toast('Permissão atualizada.');
    openPermissions();
  };

  function applyCurrentPermission(nextPermission) {
    if (!nextPermission) return;
    permission = nextPermission.role === 'admin' ? { ...nextPermission, can_add_students:true, can_edit_students:true } : nextPermission;
    const admin = permission.role === 'admin';
    document.getElementById('roleLabel').textContent = permissionLabel(permission);
    document.getElementById('permissionsNav').classList.toggle('hidden', !admin);
    document.getElementById('counselorNav')?.classList.toggle('hidden', !(permission.is_coordinator && (permission.can_edit_all || permission.can_manage_counselors)));
    syncAddActions();
    render();
    syncStudentActions();
    document.dispatchEvent(new CustomEvent('carometro:permission-refresh'));
  }
  window.applyCarometroPermission = applyCurrentPermission;

  async function refreshCurrentPermission() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || document.getElementById('app').classList.contains('hidden')) return;
    const { data } = await db.from('user_permissions').select('*').eq('user_id', signedInUser.id).maybeSingle();
    if (!data) return;
    const counselorShouldBeVisible = !!data.is_coordinator && !!(data.can_edit_all || data.can_manage_counselors);
    const counselorNavigationOutOfSync = document.getElementById('counselorNav')?.classList.contains('hidden') === counselorShouldBeVisible;
    if (permission.role !== data.role || !!permission.is_coordinator !== !!data.is_coordinator || permissionFields.some(key => !!permission[key] !== !!data[key]) || document.getElementById('roleLabel').textContent !== permissionLabel(data) || counselorNavigationOutOfSync) applyCurrentPermission(data);
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

  const coordinatorModal = document.createElement('div');
  coordinatorModal.id = 'coordinatorModal';
  coordinatorModal.className = 'modal-bg coordinator-modal hidden';
  coordinatorModal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Coordenadores</h3><div class="meta">Somente coordenadores podem receber permissões avançadas.</div></div><button class="close" type="button" aria-label="Fechar">×</button></div><div class="form"><div class="hint">Ao promover um usuário, as permissões gerais de editar e excluir são removidas. Ele só terá as opções avançadas que você marcar abaixo.</div><div class="coordinator-form-grid"><div class="field"><label for="coordinatorUser">Usuário cadastrado</label><select id="coordinatorUser"><option value="">Selecione um usuário</option></select></div><button id="addCoordinator" type="button" class="btn primary">Adicionar coordenador</button></div><div id="coordinatorList" class="coordinator-list"></div></div></div>`;
  document.body.appendChild(coordinatorModal);
  coordinatorModal.querySelector('.close').onclick = () => coordinatorModal.classList.add('hidden');
  coordinatorModal.onclick = event => { if (event.target === coordinatorModal) coordinatorModal.classList.add('hidden'); };

  const coordinatorPermissionOptions = [
    ['can_edit_all', 'Editar tudo'],
    ['can_add_students', 'Adicionar alunos e turmas'],
    ['can_delete_students', 'Excluir alunos e turmas'],
    ['can_edit_photo', 'Editar somente foto'],
    ['can_edit_name', 'Editar somente nome'],
    ['can_edit_class', 'Mudar aluno de turma'],
    ['can_edit_report', 'Editar observações do aluno'],
    ['can_view_uniform', 'Visualizar Uniforme'],
    ['can_edit_uniform', 'Editar Uniforme e material'],
    ['can_mark_all_uniform_received', 'Marcar todos como receberam'],
    ['can_manage_counselors', 'Gerenciar conselheiros de turma'],
    ['can_view_occurrences', 'Visualizar Ocorrências'],
    ['can_register_occurrences', 'Registrar Ocorrência'],
    ['can_edit_occurrences', 'Editar todas as ocorrências'],
    ['can_delete_occurrences', 'Excluir todas as ocorrências']
  ];
  coordinatorModal.querySelector('.form').insertAdjacentHTML('beforeend', `<section id="coordinatorPermissions" class="coordinator-permissions hidden"><h4>Permissões avançadas</h4><div class="meta">Escolha exatamente o que este coordenador poderá fazer.</div><div id="coordinatorPermissionOptions" class="coordinator-permission-options"></div></section>`);
  const renderCoordinatorPermissionOptions = () => {
    const id = document.getElementById('coordinatorUser').value;
    const area = document.getElementById('coordinatorPermissions');
    const button = document.getElementById('addCoordinator');
    area.classList.toggle('hidden', !id);
    button.disabled = !id;
    if (!id) { document.getElementById('coordinatorPermissionOptions').innerHTML = ''; return; }
    document.getElementById('coordinatorPermissionOptions').innerHTML = coordinatorPermissionOptions.map(([key, label]) => `<label class="check"><input type="checkbox" data-coordinator-permission="${key}"> ${label}</label>`).join('');
  };
  document.getElementById('coordinatorUser').onchange = renderCoordinatorPermissionOptions;
  document.getElementById('coordinatorPermissionOptions').onchange = event => {
    if (!event.target.matches('[data-coordinator-permission="can_edit_all"]')) return;
    document.querySelectorAll('[data-coordinator-permission]').forEach(input => { input.checked = event.target.checked; });
  };

  async function openCoordinatorManager() {
    if (permission.role !== 'admin') return;
    const { data, error } = await db.from('user_permissions').select('user_id,role,is_coordinator,profiles(email,full_name)').order('updated_at');
    if (error) { toast(error.message); return; }
    const users = [...(data || [])].sort((first, second) => {
      const firstName = first.profiles?.full_name?.trim() || first.profiles?.email || '';
      const secondName = second.profiles?.full_name?.trim() || second.profiles?.email || '';
      return firstName.localeCompare(secondName, 'pt-BR', { sensitivity:'base' });
    });
    const nameFor = item => item.profiles?.full_name?.trim() || item.profiles?.email || 'Usuário';
    const available = users.filter(item => item.role !== 'admin' && !item.is_coordinator);
    const coordinators = users.filter(item => item.role !== 'admin' && item.is_coordinator);
    document.getElementById('coordinatorUser').innerHTML = '<option value="">Selecione um usuário</option>' + available.map(item => `<option value="${item.user_id}">${esc(nameFor(item))}</option>`).join('');
    document.getElementById('coordinatorPermissions').classList.add('hidden');
    document.getElementById('coordinatorPermissionOptions').innerHTML = '';
    document.getElementById('addCoordinator').disabled = true;
    document.getElementById('coordinatorList').innerHTML = coordinators.length ? coordinators.map(item => `<article class="coordinator-item"><div><b>${esc(nameFor(item))}</b><div class="meta">${esc(item.profiles?.email || '')}</div><span class="coordinator-badge">Coordenador</span></div><button type="button" class="btn danger-outline" data-remove-coordinator="${item.user_id}">Remover coordenador</button></article>`).join('') : '<div class="empty">Nenhum coordenador cadastrado.</div>';
    coordinatorModal.classList.remove('hidden');
  }
  // Ordem deliberada em ambos os handlers abaixo: a RPC comercial de papel
  // (set_school_member_role) roda PRIMEIRO, porque é ela quem valida a
  // hierarquia (auto-alteração, admin×admin, coordenador sem
  // can_manage_member_permissions). Só escrevemos o legado e as flags de
  // ocorrência depois dela ter tido sucesso — assim uma recusa de hierarquia
  // nunca deixa user_permissions divergente de school_members.role, e uma
  // falha em qualquer etapa interrompe o restante com um aviso específico.
  document.getElementById('addCoordinator').onclick = async () => {
    const id = document.getElementById('coordinatorUser').value;
    if (!id) { toast('Selecione um usuário cadastrado.'); return; }
    const selectedRights = Object.fromEntries(permissionFields.map(key => [key, !!document.querySelector(`[data-coordinator-permission="${key}"]`)?.checked]));
    // can_view/register/edit/delete_occurrences e can_view/edit_uniform/
    // can_mark_all_uniform_received não vão para user_permissions: são
    // aplicadas à parte, em school_member_permissions, via RPC comercial.
    const legacyRights = Object.fromEntries(permissionFields.filter(key => !OCCURRENCE_PERMISSION_KEYS.includes(key) && !UNIFORM_PERMISSION_KEYS.includes(key)).map(key => [key, selectedRights[key]]));
    const occurrenceRights = Object.fromEntries(OCCURRENCE_PERMISSION_KEYS.map(key => [key, selectedRights[key]]));
    const uniformRights = Object.fromEntries(UNIFORM_PERMISSION_KEYS.map(key => [key, selectedRights[key]]));
    const membership = await currentSchoolMembership();
    if (!membership) { toast('Sem vínculo comercial ativo para atualizar o papel.'); return; }
    const roleError = await applySchoolMemberRole(id, membership.school_id, 'coordinator');
    if (roleError) { toast(`Não foi possível promover: ${roleError}`); return; }
    const { error } = await db.from('user_permissions').update({ is_coordinator:true, can_edit_students:false, ...legacyRights, updated_at:new Date().toISOString() }).eq('user_id', id);
    if (error) { toast(`O papel comercial foi alterado para coordenador, mas a atualização do cadastro legado falhou: ${error.message}`); await openCoordinatorManager(); await openPermissions(); return; }
    const occurrenceError = await applyOccurrencePermissions(id, membership.school_id, occurrenceRights);
    if (occurrenceError) { toast(`Coordenador promovido e cadastro legado atualizado, mas houve falha ao aplicar as permissões de ocorrência: ${occurrenceError}`); await openCoordinatorManager(); await openPermissions(); return; }
    const uniformError = await applyUniformPermissions(id, membership.school_id, uniformRights);
    if (uniformError) { toast(`Coordenador promovido e permissões de ocorrência aplicadas, mas houve falha ao aplicar as permissões de uniforme: ${uniformError}`); await openCoordinatorManager(); await openPermissions(); return; }
    toast('Coordenador adicionado com as permissões avançadas escolhidas.');
    await openCoordinatorManager();
    await openPermissions();
  };
  document.getElementById('coordinatorList').onclick = async event => {
    const id = event.target.closest('[data-remove-coordinator]')?.dataset.removeCoordinator;
    if (!id || !confirm('Remover este coordenador? Todas as permissões avançadas dele serão revogadas.')) return;
    const clearedRights = Object.fromEntries(permissionFields.filter(key => !OCCURRENCE_PERMISSION_KEYS.includes(key) && !UNIFORM_PERMISSION_KEYS.includes(key)).map(key => [key, false]));
    const membership = await currentSchoolMembership();
    if (!membership) { toast('Sem vínculo comercial ativo para atualizar o papel.'); return; }
    const roleError = await applySchoolMemberRole(id, membership.school_id, 'teacher');
    if (roleError) { toast(`Não foi possível remover a coordenação: ${roleError}`); return; }
    const { error } = await db.from('user_permissions').update({ ...clearedRights, is_coordinator:false, updated_at:new Date().toISOString() }).eq('user_id', id);
    if (error) { toast(`O papel comercial foi alterado para professor, mas a atualização do cadastro legado falhou: ${error.message}`); await openCoordinatorManager(); await openPermissions(); return; }
    // Padrão de professor ao rebaixar: visualizar e registrar continuam
    // liberados; editar/excluir ficam a cargo exclusivamente da autoria
    // (created_by = auth.uid()) na RLS — não do zeramento das 4 flags.
    const teacherDefaultOccurrenceRights = { can_view_occurrences:true, can_register_occurrences:true, can_edit_occurrences:false, can_delete_occurrences:false };
    const occurrenceError = await applyOccurrencePermissions(id, membership.school_id, teacherDefaultOccurrenceRights);
    if (occurrenceError) { toast(`Coordenador removido e cadastro legado atualizado, mas houve falha ao aplicar as permissões de ocorrência: ${occurrenceError}`); await openCoordinatorManager(); await openPermissions(); return; }
    // Redundante com a limpeza que set_school_member_role já faz ao rebaixar,
    // mas mantém simetria defensiva com o padrão de ocorrências acima.
    const defaultUniformRights = { can_view_uniform:false, can_edit_uniform:false, can_mark_all_uniform_received:false };
    const uniformError = await applyUniformPermissions(id, membership.school_id, defaultUniformRights);
    if (uniformError) { toast(`Coordenador removido e permissões de ocorrência atualizadas, mas houve falha ao revogar as permissões de uniforme: ${uniformError}`); await openCoordinatorManager(); await openPermissions(); return; }
    toast('Coordenador removido e permissões avançadas revogadas.');
    await openCoordinatorManager();
    await openPermissions();
  };

  async function openPermissions() {
    const canManageCounselors = permission.is_coordinator && (permission.can_edit_all || permission.can_manage_counselors);
    if (permission.role !== 'admin') {
      if (!canManageCounselors) return;
      document.getElementById('permissionsList').innerHTML = `<details class="advanced-permissions" open><summary>Permissões avançadas</summary><div class="advanced-content"><section class="counselor-management"><div><b>Conselheiros de turma</b><div class="meta">Escolha, troque ou remova o conselheiro responsável por cada turma.</div></div><button id="openCounselors" type="button" class="btn secondary">Gerenciar conselheiros</button></section></div></details>`;
      document.getElementById('openCounselors').onclick = event => {
        event.preventDefault();
        document.getElementById('permissionsModal').classList.add('hidden');
        window.openCounselorManager?.();
      };
      document.getElementById('permissionsModal').classList.remove('hidden');
      return;
    }
    const { data, error } = await db.from('user_permissions').select('user_id,role,is_coordinator,can_add_students,can_edit_students,can_delete_students,can_edit_all,can_edit_photo,can_edit_name,can_edit_class,can_edit_report,can_view_occurrences,can_register_occurrences,can_edit_occurrences,can_delete_occurrences,can_manage_counselors,profiles(email,full_name)');
    if (error) { toast(error.message); return; }
    // can_view/register/edit/delete_occurrences e can_view/edit_uniform/
    // can_mark_all_uniform_received vêm de school_member_permissions (fonte
    // real da RLS/RPC), não das colunas homônimas de user_permissions —
    // essas colunas legadas continuam existindo só para não quebrar leituras antigas.
    const membership = await currentSchoolMembership();
    const occMap = membership ? await loadSchoolOccurrencePermissions(membership.school_id) : new Map();
    const uniformMap = membership ? await loadSchoolUniformPermissions(membership.school_id) : new Map();
    const fullAccessWithoutCounselorManagement = (data || []).filter(item => item.is_coordinator && item.can_edit_all && !item.can_manage_counselors);
    if (fullAccessWithoutCounselorManagement.length) {
      const results = await Promise.all(fullAccessWithoutCounselorManagement.map(item => db.from('user_permissions').update({ can_manage_counselors:true, updated_at:new Date().toISOString() }).eq('user_id', item.user_id)));
      const updateError = results.find(result => result.error)?.error;
      if (updateError) { toast(updateError.message); return; }
      fullAccessWithoutCounselorManagement.forEach(item => { item.can_manage_counselors = true; });
    }
    const check = (item, key, label, admin) => `<label class="check"><input ${admin || (item.can_edit_all && key !== 'can_edit_all') ? 'disabled' : ''} type="checkbox" ${item[key] || (item.can_edit_all && key !== 'can_edit_all') ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','${key}',this.checked)"> ${label}</label>`;
    const sortedUsers = [...(data || [])].sort((first, second) => {
      const firstName = first.profiles?.full_name?.trim() || first.profiles?.email || '';
      const secondName = second.profiles?.full_name?.trim() || second.profiles?.email || '';
      return firstName.localeCompare(secondName, 'pt-BR', { sensitivity:'base' });
    });
    const cards = sortedUsers.map(item => {
      const admin = item.role === 'admin';
      const name = item.profiles?.full_name?.trim() || 'Nome não informado';
      const email = item.profiles?.email || 'Usuário';
      if (!isCoordinator(item)) return `<article class="perm" data-permission-scope="general" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)} · Acesso de professor(a)</div></div><div class="permission-basic">${check(item,'can_add_students','Pode adicionar',false).replace('setUserPermission','setGeneralPermission')}${check(item,'can_edit_students','Pode editar e excluir',false).replace('setUserPermission','setGeneralPermission')}</div></article>`;
      return `<article class="perm" data-permission-scope="advanced" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)}${admin ? ' · Administrador principal' : ' · Coordenador'}</div></div><div class="permission-primary">${check(item,'can_edit_all','Editar tudo',admin)}</div><div class="permission-basic">${check(item,'can_add_students','Pode adicionar',admin)}${check(item,'can_delete_students','Pode excluir',admin)}</div><details class="coordinator-right-group"><summary>Cadastro, uniforme e ocorrências</summary><div class="edit-rights">${check(item,'can_edit_photo','Editar somente foto',admin)}${check(item,'can_edit_name','Editar somente nome',admin)}${check(item,'can_edit_class','Editar somente mudança de turma',admin)}${check(item,'can_edit_report','Pode editar observações do aluno',admin)}${uniformCheck(item,uniformMap,'can_view_uniform','Visualizar Uniforme')}${uniformCheck(item,uniformMap,'can_edit_uniform','Editar Uniforme e material')}${uniformCheck(item,uniformMap,'can_mark_all_uniform_received','Marcar todos como receberam')}${check(item,'can_manage_counselors','Gerenciar conselheiros de turma',admin)}${occCheck(item,occMap,'can_view_occurrences','Visualizar Ocorrências')}${occCheck(item,occMap,'can_register_occurrences','Registrar Ocorrência')}${occCheck(item,occMap,'can_edit_occurrences','Editar todas as ocorrências')}${occCheck(item,occMap,'can_delete_occurrences','Excluir todas as ocorrências')}</div></details></article>`;
    }).join('');
    const coordinatorManager = `<section class="coordinator-management"><div><b>Coordenadores</b><div class="meta">Escolha usuários cadastrados e libere permissões avançadas somente para eles.</div></div><button id="openCoordinators" type="button" class="btn secondary">Gerenciar coordenadores</button></section>`;
    const advancedPermissions = `<details class="advanced-permissions" open><summary>Permissões avançadas</summary><div class="advanced-content">${coordinatorManager}<div id="advancedCoordinatorCards"></div></div></details>`;
    document.getElementById('permissionsList').innerHTML = `${advancedPermissions}<section><div class="permissions-heading"><b>Permissões gerais</b><div class="meta">Usuários cadastrados e seus acessos atuais.</div></div><form id="permissionSearchForm" class="permission-search-form"><input id="permissionSearch" class="permission-search" placeholder="Buscar por nome ou e-mail"><button class="btn primary" type="submit">Buscar</button></form>${cards}<div id="permissionEmpty" class="empty hidden">Nenhum usuário encontrado.</div></section>`;
    const advancedCardTarget = document.getElementById('advancedCoordinatorCards');
    document.querySelectorAll('#permissionsList .perm[data-permission-scope="advanced"]').forEach(card => advancedCardTarget.appendChild(card));
    document.getElementById('openCoordinators').onclick = event => { event.preventDefault(); event.stopPropagation(); openCoordinatorManager(); };
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
    const update = key === 'can_edit_all' && value
      ? { ...Object.fromEntries(permissionFields.map(permissionKey => [permissionKey, true])), updated_at:new Date().toISOString() }
      : key === 'can_edit_all'
        ? { ...Object.fromEntries(permissionFields.map(permissionKey => [permissionKey, false])), updated_at:new Date().toISOString() }
        : { [key]: value, updated_at:new Date().toISOString() };
    const { error } = await db.from('user_permissions').update(update).eq('user_id',id);
    if (error) toast(error.message); else { toast('Permissão atualizada.'); openPermissions(); }
  };
  window.setGeneralPermission = async (id, key, value) => {
    const update = { [key]: value, updated_at:new Date().toISOString() };
    const { error } = await db.from('user_permissions').update(update).eq('user_id', id);
    if (error) { toast(error.message); return; }
    toast('Permissão geral atualizada.');
    openPermissions();
  };
  document.getElementById('permissionsNav').onclick = openPermissions;
  document.addEventListener('carometro:permissions-changed', () => {
    refreshCurrentPermission();
    if (!document.getElementById('permissionsModal').classList.contains('hidden') && permission.role === 'admin') openPermissions();
  });
  document.addEventListener('carometro:profiles-changed', () => {
    if (!document.getElementById('permissionsModal').classList.contains('hidden') && permission.role === 'admin') openPermissions();
  });
  db.auth.getUser().then(({ data: { user: signedInUser } }) => {
    if (!signedInUser) return;
    if (db.channel) db.channel(`permission-live-${signedInUser.id}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'user_permissions', filter:`user_id=eq.${signedInUser.id}` },
      () => { refreshCurrentPermission(); }
    ).subscribe();
  });
  setInterval(refreshCurrentPermission, 1000);
});
