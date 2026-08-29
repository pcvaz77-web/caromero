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
    .member-access { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
    .member-status { display:inline-flex; padding:5px 9px; border-radius:99px; font-size:11px; font-weight:800; }
    .member-status.active { background:#eaf8f1; color:#08784b; }
    .member-status.suspended { background:#fee4e2; color:#b42318; }
    .perm.member-suspended { background:#fafafa; }
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
  const permissionFields = ['can_add_students', 'can_edit_students', 'can_delete_students', 'can_edit_all', 'can_edit_photo', 'can_edit_name', 'can_edit_class', 'can_edit_report', 'can_manage_observation_options', 'can_invite_teachers', 'can_manage_member_permissions', 'can_view_uniform', 'can_edit_uniform', 'can_mark_all_uniform_received', 'can_view_occurrences', 'can_register_occurrences', 'can_edit_occurrences', 'can_delete_occurrences', 'can_manage_counselors'];
  const dormantPermissionFields = ['can_view_dashboard', 'can_view_history', 'can_manage_alerts', 'can_record_followups', 'can_export_reports', 'can_use_bulk_actions', 'can_view_audit', 'can_view_class_summary'];
  const rolePermissionFields = [...permissionFields, ...dormantPermissionFields];
  const isCoordinator = item => item?.role === 'admin' || !!item?.is_coordinator;
  const permissionLabel = item => {
    if (item.role === 'admin') return 'Administrador';
    if (item.is_coordinator) return 'Coordenador';
    return 'Acesso de professor(a)';
  };
  const hasGrantedPermission = item => item.role === 'admin' || permissionFields.some(key => item[key]);

  const schoolPermissionSelect = 'can_add_students,can_edit_students,can_delete_students,can_edit_all,can_edit_photo,can_edit_name,can_edit_class,can_edit_report,can_manage_observation_options,can_invite_teachers,can_manage_member_permissions,can_view_uniform,can_edit_uniform,can_mark_all_uniform_received,can_view_occurrences,can_register_occurrences,can_edit_occurrences,can_delete_occurrences,can_manage_counselors';
  const permissionFromMembership = membership => {
    if (!membership) return null;
    const rights = Array.isArray(membership.school_member_permissions)
      ? (membership.school_member_permissions[0] || {})
      : (membership.school_member_permissions || {});
    return {
      ...rights,
      member_id:membership.id,
      school_id:membership.school_id,
      user_id:membership.user_id,
      role:membership.role === 'school_admin' ? 'admin' : 'viewer',
      is_coordinator:membership.role === 'coordinator',
      profiles:membership.profiles
    };
  };

  // Consulta o vínculo comercial ativo (school_members) do usuário logado e
  // devolve o resultado desta chamada específica — sem nenhum estado
  // compartilhado entre chamadas concorrentes. Não fixa nenhuma escola
  // específica: cada usuário só enxerga, via RLS, o próprio vínculo.
  async function fetchCurrentSchoolMembership(retried) {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return { membership: null, queryFailed: false };
    const activeSchoolId = window.getActiveSchoolId?.() || null;
    if (!activeSchoolId) return { membership: null, queryFailed: false };
    const { data, error } = await db.from('school_members').select(`id,school_id,user_id,role,school_member_permissions(${schoolPermissionSelect})`).eq('user_id', signedInUser.id).eq('school_id', activeSchoolId).eq('status', 'active').maybeSingle();
    if (error) {
      // Falha transitória (rede, sessão em renovação etc.) nunca deve virar
      // "sem vínculo" sem pelo menos uma nova tentativa (no máximo 1 retry).
      if (!retried) return fetchCurrentSchoolMembership(true);
      return { membership: null, queryFailed: true };
    }
    return { membership: data || null, queryFailed: false };
  }

  // Contrato preservado para todos os call sites já existentes: sempre
  // retorna Membership | null, nunca lança.
  async function currentSchoolMembership() {
    const { membership } = await fetchCurrentSchoolMembership();
    return membership;
  }

  // Usada pelos pontos que hoje mostram "Selecione uma escola ativa." —
  // diferencia, para a própria chamada (sem depender de estado global), "não
  // há vínculo real" (mesma mensagem de sempre) de "não deu para confirmar
  // agora" (mensagem distinta, sem sugerir trocar de escola).
  async function currentSchoolMembershipOrWarn() {
    const { membership, queryFailed } = await fetchCurrentSchoolMembership();
    if (!membership) {
      toast(queryFailed
        ? 'Não foi possível confirmar seu acesso a esta escola agora. Tente novamente.'
        : 'Selecione uma escola ativa.');
      return null;
    }
    return membership;
  }

  // Mapa user_id -> permissões de ocorrência (school_member_permissions) de
  // todos os membros ativos da escola informada.
  async function loadSchoolPermissions(schoolId) {
    const { data, error } = await db.rpc('list_school_member_directory_v2', { target_school_id:schoolId });
    if (error) { toast(error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach(item => {
      const normalized = {
        ...item,
        member_id:item.member_id,
        school_id:schoolId,
        member_status:item.member_status || 'active',
        role:item.member_role === 'school_admin' ? 'admin' : 'viewer',
        is_coordinator:item.member_role === 'coordinator',
        profiles:{ email:item.email, full_name:item.full_name }
      };
      map.set(item.user_id, { ...normalized, memberId:item.member_id });
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
  // A fonte comercial é school_members.role; não há escrita paralela no
  // papel global legado, que não representa corretamente contas multi-escola.
  // Aplica o conjunto inteiro em uma única transação no banco. Se qualquer
  // flag falhar na validação, nenhuma permissão do lote é modificada.
  async function applySchoolPermissions(userId, schoolId, flags) {
    const memberId = await findSchoolMemberId(userId, schoolId);
    if (!memberId) return 'Sem vínculo comercial ativo nesta escola para aplicar as permissões.';
    const permissions = Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, !!value]));
    const { error } = await db.rpc('set_school_member_permissions_batch', {
      target_member_id:memberId,
      p_permissions:permissions
    });
    return error ? error.message : null;
  }

  async function configureSchoolMemberRole(userId, schoolId, newRole, flags) {
    const memberId = await findSchoolMemberId(userId, schoolId);
    if (!memberId) return 'Sem vínculo comercial ativo nesta escola para atualizar o papel.';
    const permissions = Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, !!value]));
    const { error } = await db.rpc('configure_school_member_role', {
      target_member_id:memberId,
      new_role:newRole,
      p_permissions:permissions
    });
    return error ? error.message : null;
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
    const disabled = admin || !target || target.member_status !== 'active';
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
    const canManageTeachers = !!data.is_coordinator && !!data.can_manage_member_permissions;
    document.getElementById('permissionsNav').classList.toggle('hidden', !(admin || canManageTeachers || window.counselorCanManage?.()));
    // counselorNav não é mais controlado aqui: class-counselors.js é o dono
    // exclusivo dessa visibilidade, com a fonte comercial real
    // (can_manage_class_counselors(target_school_id), role='coordinator' —
    // Migrations 029/030) — evita duas lógicas competindo pelo mesmo
    // elemento com fontes diferentes.
    syncAddActions();
    render();
    syncStudentActions();
    document.dispatchEvent(new CustomEvent('carometro:permission-refresh'));
  }
  window.applyCarometroPermission = applyCurrentPermission;

  async function refreshCurrentPermission() {
    const membership = await currentSchoolMembership();
    const data = permissionFromMembership(membership);
    if (!data) { window.resetCarometroSchoolState?.(); return; }
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
    ['can_manage_observation_options', 'Gerenciar opções de observação'],
    ['can_invite_teachers', 'Convidar professores'],
    ['can_manage_member_permissions', 'Gerenciar permissões de professores'],
    ['can_view_uniform', 'Visualizar Uniforme'],
    ['can_edit_uniform', 'Editar Uniforme e material'],
    ['can_mark_all_uniform_received', 'Marcar todos como receberam'],
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
    const membership = await currentSchoolMembershipOrWarn();
    if (!membership) return;
    const schoolPermissionMap = await loadSchoolPermissions(membership.school_id);
    const users = [...schoolPermissionMap.values()].sort((first, second) => {
      const firstName = first.profiles?.full_name?.trim() || first.profiles?.email || '';
      const secondName = second.profiles?.full_name?.trim() || second.profiles?.email || '';
      return firstName.localeCompare(secondName, 'pt-BR', { sensitivity:'base' });
    });
    const nameFor = item => item.profiles?.full_name?.trim() || item.profiles?.email || 'Usuário';
    const available = users.filter(item => item.member_status === 'active' && item.role !== 'admin' && !item.is_coordinator);
    const coordinators = users.filter(item => item.member_status === 'active' && item.role !== 'admin' && item.is_coordinator);
    document.getElementById('coordinatorUser').innerHTML = '<option value="">Selecione um usuário</option>' + available.map(item => `<option value="${item.user_id}">${esc(nameFor(item))}</option>`).join('');
    document.getElementById('coordinatorPermissions').classList.add('hidden');
    document.getElementById('coordinatorPermissionOptions').innerHTML = '';
    document.getElementById('addCoordinator').disabled = true;
    document.getElementById('coordinatorList').innerHTML = coordinators.length ? coordinators.map(item => `<article class="coordinator-item"><div><b>${esc(nameFor(item))}</b><div class="meta">${esc(item.profiles?.email || '')}</div><span class="coordinator-badge">Coordenador</span></div><button type="button" class="btn danger-outline" data-remove-coordinator="${item.user_id}">Remover coordenador</button></article>`).join('') : '<div class="empty">Nenhum coordenador cadastrado.</div>';
    coordinatorModal.classList.remove('hidden');
  }
  // A RPC de papel roda primeiro porque valida hierarquia, autoalteração e
  // escola. As permissões são aplicadas depois, sempre no mesmo vínculo.
  document.getElementById('addCoordinator').onclick = async () => {
    const id = document.getElementById('coordinatorUser').value;
    if (!id) { toast('Selecione um usuário cadastrado.'); return; }
    const selectedRights = Object.fromEntries(rolePermissionFields.map(key => [key, !!document.querySelector(`[data-coordinator-permission="${key}"]`)?.checked]));
    const membership = await currentSchoolMembership();
    if (!membership) { toast('Sem vínculo comercial ativo para atualizar o papel.'); return; }
    const commercialError = await configureSchoolMemberRole(id, membership.school_id, 'coordinator', selectedRights);
    if (commercialError) { toast(`Não foi possível promover: ${commercialError}`); return; }
    toast('Coordenador adicionado com as permissões avançadas escolhidas.');
    await openCoordinatorManager();
    await openPermissions();
  };
  document.getElementById('coordinatorList').onclick = async event => {
    const id = event.target.closest('[data-remove-coordinator]')?.dataset.removeCoordinator;
    if (!id || !confirm('Remover este coordenador? Todas as permissões avançadas dele serão revogadas.')) return;
    const membership = await currentSchoolMembership();
    if (!membership) { toast('Sem vínculo comercial ativo para atualizar o papel.'); return; }
    // Padrão de professor ao rebaixar: visualizar e registrar continuam
    // liberados; editar/excluir ficam a cargo exclusivamente da autoria
    // (created_by = auth.uid()) na RLS — não de permissões avançadas antigas.
    const teacherDefaultOccurrenceRights = { can_view_occurrences:true, can_register_occurrences:true, can_edit_occurrences:false, can_delete_occurrences:false };
    const commercialRights = { ...Object.fromEntries(rolePermissionFields.map(key => [key, false])), ...teacherDefaultOccurrenceRights };
    const commercialError = await configureSchoolMemberRole(id, membership.school_id, 'teacher', commercialRights);
    if (commercialError) { toast(`Não foi possível remover a coordenação: ${commercialError}`); return; }
    toast('Coordenador removido e permissões avançadas revogadas.');
    await openCoordinatorManager();
    await openPermissions();
  };

  async function openPermissions() {
    // Fonte única: a mesma checagem comercial (window.counselorCanManage,
    // que já delega para can_manage_class_counselors(target_school_id) em
    // class-counselors.js) usada para o botão real "Gerenciar
    // Conselheiros" — nunca uma segunda lógica paralela que possa divergir
    // dela.
    const membership = await currentSchoolMembershipOrWarn();
    if (!membership) return;
    if (permission.role !== 'admin') {
      const canManageTeachers = !!permission.is_coordinator && !!permission.can_manage_member_permissions;
      const canManageCounselors = !!window.counselorCanManage?.();
      if (!canManageTeachers && !canManageCounselors) return;
      const schoolPermissionMap = canManageTeachers ? await loadSchoolPermissions(membership.school_id) : new Map();
      const schoolScopedData = [...schoolPermissionMap.values()];
      const teachers = schoolScopedData.filter(item => !item.is_coordinator && item.role !== 'admin');
      const teacherCards = teachers.map(item => {
        const name = item.profiles?.full_name?.trim() || 'Nome não informado';
        const email = item.profiles?.email || 'Usuário';
        const active = item.member_status === 'active';
        return `<article class="perm ${active ? '' : 'member-suspended'}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)} · Professor(a)</div></div><div></div><div class="member-access"><span class="member-status ${active ? 'active' : 'suspended'}">${active ? 'Acesso ativo' : 'Acesso suspenso'}</span><button type="button" class="btn secondary" data-member-id="${esc(item.member_id)}" data-member-status="${active ? 'suspended' : 'active'}" data-member-email="${esc(email)}">${active ? 'Suspender' : 'Reativar'}</button><button type="button" class="btn danger-outline" data-remove-member-id="${esc(item.member_id)}" data-remove-member-email="${esc(email)}">Remover da escola</button></div></article>`;
      }).join('');
      const teacherSection = canManageTeachers ? `<section><div class="permissions-heading"><b>Professores</b><div class="meta">Suspenda ou remova somente o vínculo com esta escola. A conta e o histórico serão preservados.</div></div>${teacherCards || '<div class="empty">Nenhum professor cadastrado.</div>'}</section>` : '';
      const counselorSection = canManageCounselors ? `<details class="advanced-permissions" open><summary>Permissões avançadas</summary><div class="advanced-content"><section class="counselor-management"><div><b>Conselheiros de turma</b><div class="meta">Escolha, troque ou remova o conselheiro responsável por cada turma.</div></div><button id="openCounselors" type="button" class="btn secondary">Gerenciar conselheiros</button></section></div></details>` : '';
      document.getElementById('permissionsList').innerHTML = `${counselorSection}${teacherSection}`;
      if (canManageCounselors) document.getElementById('openCounselors').onclick = event => {
        event.preventDefault();
        document.getElementById('permissionsModal').classList.add('hidden');
        window.openCounselorManager?.();
      };
      bindMemberAccountActions();
      document.getElementById('permissionsModal').classList.remove('hidden');
      return;
    }
    const schoolPermissionMap = await loadSchoolPermissions(membership.school_id);
    const schoolScopedData = [...schoolPermissionMap.values()];
    const occMap = schoolPermissionMap;
    const check = (item, key, label, admin) => `<label class="check"><input ${admin || item.member_status !== 'active' || (item.can_edit_all && key !== 'can_edit_all') ? 'disabled' : ''} type="checkbox" ${item[key] || (item.can_edit_all && key !== 'can_edit_all') ? 'checked' : ''} onchange="setUserPermission('${item.user_id}','${key}',this.checked)"> ${label}</label>`;
    const sortedUsers = [...schoolScopedData].sort((first, second) => {
      const firstName = first.profiles?.full_name?.trim() || first.profiles?.email || '';
      const secondName = second.profiles?.full_name?.trim() || second.profiles?.email || '';
      return firstName.localeCompare(secondName, 'pt-BR', { sensitivity:'base' });
    });
    const cards = sortedUsers.map(item => {
      const admin = item.role === 'admin';
      const name = item.profiles?.full_name?.trim() || 'Nome não informado';
      const email = item.profiles?.email || 'Usuário';
      const active = item.member_status === 'active';
      const access = `<div class="member-access"><span class="member-status ${active ? 'active' : 'suspended'}">${active ? 'Acesso ativo' : 'Acesso suspenso'}</span>${admin ? '' : `<button type="button" class="btn secondary" data-member-id="${esc(item.member_id)}" data-member-status="${active ? 'suspended' : 'active'}" data-member-email="${esc(email)}">${active ? 'Suspender' : 'Reativar'}</button><button type="button" class="btn danger-outline" data-remove-member-id="${esc(item.member_id)}" data-remove-member-email="${esc(email)}">Remover da escola</button>`}</div>`;
      if (!isCoordinator(item)) return `<article class="perm ${active ? '' : 'member-suspended'}" data-permission-scope="general" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)} · Acesso de professor(a)</div></div><div class="permission-basic">${check(item,'can_add_students','Pode adicionar',false).replace('setUserPermission','setGeneralPermission')}${check(item,'can_edit_students','Pode editar e excluir',false).replace('setUserPermission','setGeneralPermission')}</div>${access}</article>`;
      return `<article class="perm ${active ? '' : 'member-suspended'}" data-permission-scope="advanced" data-search="${esc(`${name} ${email}`.toLowerCase())}"><div class="permission-user"><b>${esc(name)}</b><div class="meta">${esc(email)}${admin ? ' · Administrador principal' : ' · Coordenador'}</div></div><div class="permission-primary">${check(item,'can_edit_all','Editar tudo',admin)}</div>${access}<div class="permission-basic">${check(item,'can_add_students','Pode adicionar',admin)}${check(item,'can_delete_students','Pode excluir',admin)}</div><details class="coordinator-right-group"><summary>Cadastro, gestão, uniforme e ocorrências</summary><div class="edit-rights">${check(item,'can_edit_photo','Editar somente foto',admin)}${check(item,'can_edit_name','Editar somente nome',admin)}${check(item,'can_edit_class','Editar somente mudança de turma',admin)}${check(item,'can_edit_report','Pode editar observações do aluno',admin)}${check(item,'can_manage_observation_options','Gerenciar opções de observação',admin)}${check(item,'can_invite_teachers','Convidar professores',admin)}${check(item,'can_manage_member_permissions','Gerenciar permissões de professores',admin)}${check(item,'can_view_uniform','Visualizar Uniforme',admin)}${check(item,'can_edit_uniform','Editar Uniforme e material',admin)}${check(item,'can_mark_all_uniform_received','Marcar todos como receberam',admin)}${check(item,'can_manage_counselors','Gerenciar conselheiros de turma',admin)}${occCheck(item,occMap,'can_view_occurrences','Visualizar Ocorrências')}${occCheck(item,occMap,'can_register_occurrences','Registrar Ocorrência')}${occCheck(item,occMap,'can_edit_occurrences','Editar todas as ocorrências')}${occCheck(item,occMap,'can_delete_occurrences','Excluir todas as ocorrências')}</div></details></article>`;
    }).join('');
    const coordinatorManager = `<section class="coordinator-management"><div><b>Coordenadores</b><div class="meta">Escolha usuários cadastrados e libere permissões avançadas somente para eles.</div></div><button id="openCoordinators" type="button" class="btn secondary">Gerenciar coordenadores</button></section>`;
    const schoolCalendarManager = `<section class="coordinator-management"><div><b>Calendário letivo</b><div class="meta">Datas de início e fim de cada bimestre, usadas pelo Livro/Revisa.</div></div><button id="openSchoolCalendar" type="button" class="btn secondary">Calendário letivo</button></section>`;
    const advancedPermissions = `<details class="advanced-permissions" open><summary>Permissões avançadas</summary><div class="advanced-content">${coordinatorManager}${schoolCalendarManager}<div id="advancedCoordinatorCards"></div></div></details>`;
    document.getElementById('permissionsList').innerHTML = `${advancedPermissions}<section><div class="permissions-heading"><b>Permissões gerais</b><div class="meta">Usuários cadastrados e seus acessos atuais.</div></div><form id="permissionSearchForm" class="permission-search-form"><input id="permissionSearch" class="permission-search" placeholder="Buscar por nome ou e-mail"><button class="btn primary" type="submit">Buscar</button></form>${cards}<div id="permissionEmpty" class="empty hidden">Nenhum usuário encontrado.</div></section>`;
    const advancedCardTarget = document.getElementById('advancedCoordinatorCards');
    document.querySelectorAll('#permissionsList .perm[data-permission-scope="advanced"]').forEach(card => advancedCardTarget.appendChild(card));
    bindMemberAccountActions();
    document.getElementById('openCoordinators').onclick = event => { event.preventDefault(); event.stopPropagation(); openCoordinatorManager(); };
    document.getElementById('openSchoolCalendar').onclick = event => {
      event.preventDefault(); event.stopPropagation();
      document.getElementById('permissionsModal').classList.add('hidden');
      window.openSchoolCalendarManager?.();
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

  // can_manage_counselors nunca entra no bulk de "Editar tudo": não é mais
  // uma permissão selecionável — é papel de coordenador, derivada
  // estruturalmente por role (Migrations 029/030), sem nenhum checkbox
  // individual nem escrita via este bulk.
  const legacyBulkFields = permissionFields.filter(field => field !== 'can_manage_counselors');
  window.setUserPermission = async (id, key, value) => {
    const membership = await currentSchoolMembershipOrWarn();
    if (!membership) return;
    const memberId = await findSchoolMemberId(id, membership.school_id);
    if (!memberId) { toast('Este usuário não pertence à escola ativa.'); return; }
    const commercialUpdates = key === 'can_edit_all'
      ? permissionFields.map(permissionKey => [permissionKey, value])
      : [[key, value]];
    const { error } = await db.rpc('set_school_member_permissions_batch', {
      target_member_id:memberId,
      p_permissions:Object.fromEntries(commercialUpdates)
    });
    if (error) { toast(error.message); return; }
    toast('Permissão atualizada.');
    openPermissions();
  };
  window.setGeneralPermission = async (id, key, value) => {
    const membership = await currentSchoolMembershipOrWarn();
    if (!membership) return;
    const memberId = await findSchoolMemberId(id, membership.school_id);
    if (!memberId) { toast('Este usuário não pertence à escola ativa.'); return; }
    const { error:commercialError } = await db.rpc('set_school_member_permission', { target_member_id:memberId, permission_name:key, permission_value:value });
    if (commercialError) { toast(commercialError.message); return; }
    toast('Permissão geral atualizada.');
    openPermissions();
  };
  window.setSchoolMemberStatus = async (memberId, status, email) => {
    const action = status === 'suspended' ? 'suspender' : 'reativar';
    if (!confirm(`Deseja ${action} o acesso de ${email} somente nesta escola? Nenhum dado será excluído.`)) return;
    const { error } = await db.rpc('set_school_member_status', {
      target_member_id:memberId,
      new_status:status
    });
    if (error) { toast(error.message); return; }
    toast(status === 'suspended' ? 'Acesso suspenso somente nesta escola.' : 'Acesso reativado nesta escola.');
    openPermissions();
  };
  function bindMemberAccountActions() {
    document.querySelectorAll('#permissionsList [data-member-status]').forEach(button => {
      button.onclick = () => window.setSchoolMemberStatus(button.dataset.memberId, button.dataset.memberStatus, button.dataset.memberEmail);
    });
    document.querySelectorAll('#permissionsList [data-remove-member-id]').forEach(button => {
      button.onclick = () => window.removeSchoolMember(button.dataset.removeMemberId, button.dataset.removeMemberEmail);
    });
  }
  window.removeSchoolMember = async (memberId, email) => {
    if (!confirm(`Remover ${email} desta escola? A conta, o histórico e os vínculos com outras escolas serão preservados.`)) return;
    const { error } = await db.rpc('remove_school_member', { target_member_id:memberId });
    if (error) { toast(error.message); return; }
    toast('Professor(a) removido(a) somente desta escola.');
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
  let permissionChannel = null;
  let permissionChannelMemberId = null;
  async function startPermissionRealtime() {
    if (!db.channel) return;
    const membership = await currentSchoolMembership();
    if (!membership || permissionChannelMemberId === membership.id) return;
    if (permissionChannel) await db.removeChannel(permissionChannel);
    permissionChannelMemberId = membership.id;
    const onMembershipChange = async payload => {
      if (payload.new?.status && payload.new.status !== 'active') {
        window.clearActiveSchoolContext?.();
        location.reload();
        return;
      }
      await refreshCurrentPermission();
    };
    permissionChannel = db.channel(`school-permission-live-${membership.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'school_member_permissions', filter:`member_id=eq.${membership.id}` }, refreshCurrentPermission)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'school_members', filter:`id=eq.${membership.id}` }, onMembershipChange)
      .subscribe();
  }
  window.refreshCarometroSchoolPermission = refreshCurrentPermission;
  // Expõe a MESMA promessa que carometro:data-loaded já dispara aqui, para
  // que o bootstrap (commercial-login-fix.js) possa aguardar essa
  // resolução em andamento em vez de chamar refreshCurrentPermission() de
  // novo — dispatchEvent() é síncrono, mas o listener é assíncrono, então
  // sem isso não haveria garantia de que a permissão já foi aplicada no
  // momento em que o evento termina de disparar.
  let pendingCarometroPermissionRefresh = null;
  window.__waitForCarometroPermission = () => pendingCarometroPermissionRefresh || Promise.resolve();
  document.addEventListener('carometro:data-loaded', () => {
    pendingCarometroPermissionRefresh = refreshCurrentPermission();
    startPermissionRealtime();
  });
  startPermissionRealtime();
});
