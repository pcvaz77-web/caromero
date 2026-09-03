document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const uniformNav = document.getElementById('uniformNav');
  if (!nav || !uniformNav) return;

  const occurrenceButton = document.createElement('button');
  occurrenceButton.id = 'occurrenceNav';
  occurrenceButton.type = 'button';
  occurrenceButton.innerHTML = '<span>● &nbsp; Ocorrência</span>';
  uniformNav.insertAdjacentElement('afterend', occurrenceButton);

  const modal = document.createElement('div');
  modal.id = 'occurrenceModal';
  modal.className = 'modal-bg occurrence-modal hidden';
  modal.innerHTML = `<section class="modal occurrence-dialog"><div class="modal-head"><div><h3>Ocorrência</h3><div class="meta">Registre e consulte ocorrências por aluno e por data.</div></div><button class="close" id="closeOccurrence" type="button" aria-label="Fechar">×</button></div><div class="form occurrence-form"><div class="occurrence-grid"><div class="field"><label for="occurrenceClass">Turma</label><select id="occurrenceClass"><option value="">Selecione uma turma</option></select></div><div class="field"><label for="occurrenceStudent">Aluno</label><select id="occurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></div></div><div class="field occurrence-date-field"><label for="occurrenceDate">Data da nova ocorrência</label><input id="occurrenceDate" type="date"></div><div class="field"><label for="occurrenceText">Descrição</label><textarea id="occurrenceText" maxlength="500" placeholder="Descreva a ocorrência em até 500 caracteres."></textarea><div class="occurrence-text-meta"><span id="occurrenceTextCount">0/500</span><span>A ocorrência fica visível somente nesta aba.</span></div></div><div class="actions occurrence-actions"><button class="btn secondary" id="searchOccurrences" type="button" aria-expanded="false">Buscar Ocorrência</button><button class="btn primary" id="saveOccurrence" type="button">Salvar ocorrência</button></div><div id="occurrenceDateFilters" class="occurrence-date-filters hidden"><div class="occurrence-grid occurrence-dates"><div class="field"><label for="occurrenceStart">Buscar a partir de</label><input id="occurrenceStart" type="date"></div><div class="field"><label for="occurrenceEnd">Buscar até</label><input id="occurrenceEnd" type="date"></div></div><div class="occurrence-grid occurrence-search-fields"><div class="field"><label for="occurrenceSearchClass">Buscar por turma</label><select id="occurrenceSearchClass"><option value="">Todas as turmas</option></select></div><div class="field"><label for="occurrenceSearchName">Buscar por nome</label><input id="occurrenceSearchName" placeholder="Digite o nome do aluno"></div></div><div class="meta">Os resultados são atualizados assim que você escolher os filtros.</div></div><section class="occurrence-history"><div class="occurrence-history-head"><div><b>Ocorrências registradas</b><div class="meta" id="occurrenceHistoryMeta">Selecione uma turma ou aluno para consultar.</div></div></div><div id="occurrenceHistoryList" class="occurrence-history-list"></div></section></div></section>`;
  document.body.appendChild(modal);

  // Confirmação de exclusão dedicada: substitui o confirm() nativo, que só
  // mostrava a data, por um resumo que identifica inequivocamente o registro
  // (aluno, data do fato, autor, data/hora real de registro e um trecho do
  // texto) — evita excluir o registro errado quando há ocorrências parecidas
  // para o mesmo aluno. Não altera autoria/permissão nem o DELETE em si,
  // que continua sendo feito pelo id exato da ocorrência sob a RLS existente.
  const deleteConfirmModal = document.createElement('div');
  deleteConfirmModal.id = 'occurrenceDeleteConfirmModal';
  deleteConfirmModal.className = 'modal-bg occurrence-delete-confirm-modal hidden';
  deleteConfirmModal.innerHTML = `<section class="modal occurrence-delete-confirm-dialog"><div class="modal-head"><div><h3>Excluir ocorrência?</h3></div></div><div class="form occurrence-delete-confirm-body"><dl class="occurrence-delete-confirm-details"><div><dt>Aluno</dt><dd id="occurrenceDeleteConfirmStudent"></dd></div><div><dt>Ocorrência</dt><dd id="occurrenceDeleteConfirmDate"></dd></div><div><dt>Registrada por</dt><dd id="occurrenceDeleteConfirmAuthor"></dd></div><div><dt>Registrada em</dt><dd id="occurrenceDeleteConfirmCreatedAt"></dd></div></dl><blockquote id="occurrenceDeleteConfirmText" class="occurrence-delete-confirm-text"></blockquote><p class="occurrence-delete-confirm-warning">Esta ação não poderá ser desfeita.</p><div class="actions occurrence-delete-confirm-actions"><button class="btn secondary" id="occurrenceDeleteConfirmCancel" type="button">Cancelar</button><button class="btn occurrence-delete-confirm-submit" id="occurrenceDeleteConfirmSubmit" type="button">Excluir ocorrência</button></div></div></section>`;
  document.body.appendChild(deleteConfirmModal);

  const style = document.createElement('style');
  style.textContent = `
    #occurrenceNav { border:0; background:#2b3c5d; color:#fff; } #occurrenceNav:hover { background:#38527e; }
    .occurrence-item-focused { outline:2px solid #2b3c5d; box-shadow:0 0 0 3px rgba(43,60,93,.18); }
    #occurrenceDeleteConfirmModal.occurrence-delete-confirm-modal { z-index:240!important; }.occurrence-delete-confirm-dialog { width:min(460px,100%); }.occurrence-delete-confirm-body { padding:20px 24px 24px; }.occurrence-delete-confirm-details { display:grid; gap:7px; margin:0 0 14px; }.occurrence-delete-confirm-details > div { display:flex; justify-content:space-between; align-items:baseline; gap:12px; font-size:13px; }.occurrence-delete-confirm-details dt { margin:0; color:var(--muted); font-weight:650; flex:0 0 auto; }.occurrence-delete-confirm-details dd { margin:0; font-weight:750; text-align:right; }.occurrence-delete-confirm-text { margin:0 0 16px; padding:10px 12px; border-left:3px solid #dbe4f5; border-radius:4px; background:#f8faff; font-size:13px; line-height:1.45; white-space:pre-wrap; color:#344054; }.occurrence-delete-confirm-warning { margin:0 0 16px; font-size:13px; font-weight:750; color:#b42318; }.occurrence-delete-confirm-actions { justify-content:flex-end; gap:10px; }.occurrence-delete-confirm-actions .occurrence-delete-confirm-submit { background:#b42318; color:#fff; }.occurrence-delete-confirm-actions .occurrence-delete-confirm-submit:hover { background:#932016; }
    @media(max-width:800px) { .occurrence-delete-confirm-dialog { width:100%; } .occurrence-delete-confirm-actions { display:grid; grid-template-columns:1fr; gap:8px; } .occurrence-delete-confirm-actions .btn { width:100%; } }
    #occurrenceModal.occurrence-modal { z-index:230!important; }.occurrence-dialog { width:min(820px,100%); }.occurrence-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:12px; }.occurrence-dates,.occurrence-search-fields { grid-template-columns:1fr 1fr; }.occurrence-date-field { max-width:260px; }.occurrence-date-filters { margin-top:14px; padding:14px; border:1px solid #dbe4f5; border-radius:10px; background:#f8faff; }.occurrence-date-filters .field { margin-bottom:7px; }.occurrence-form textarea { min-height:120px; }.occurrence-text-meta { display:flex; justify-content:space-between; gap:10px; margin-top:6px; color:var(--muted); font-size:12px; }.occurrence-actions { justify-content:space-between; }.occurrence-history { margin-top:22px; border-top:1px solid var(--line); padding-top:18px; }.occurrence-history-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:11px; }.occurrence-history-list { display:grid; gap:9px; max-height:290px; overflow:auto; padding-right:3px; }.occurrence-item { border:1px solid var(--line); border-radius:9px; padding:12px; background:#fafbfc; }.occurrence-item-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:7px; }.occurrence-item-date { color:#344054; font-size:13px; font-weight:800; }.occurrence-item-actions { display:flex; gap:6px; margin-left:auto; }.occurrence-item-actions button { min-height:29px; padding:5px 8px; border-radius:6px; font-size:12px; font-weight:750; }.occurrence-edit { background:#e8efff; color:#214dba; }.occurrence-delete { background:#fff0ed; color:#b42318; }.occurrence-item-student { color:var(--muted); font-size:12px; }.occurrence-item-text { white-space:pre-wrap; line-height:1.45; font-size:14px; }.occurrence-responsible { display:inline-flex; width:max-content; max-width:100%; margin-top:9px; padding:4px 8px; border-radius:99px; background:#172b4d; color:#fff; font-size:11px; font-weight:800; line-height:1.25; overflow-wrap:anywhere; }.occurrence-updated { display:inline-flex; width:max-content; max-width:100%; margin-top:6px; margin-left:6px; padding:4px 8px; border-radius:99px; background:#eef2f8; color:#344054; font-size:11px; font-weight:750; line-height:1.25; overflow-wrap:anywhere; }.occurrence-empty { padding:23px 10px; color:var(--muted); text-align:center; }.occurrence-label { display:inline-flex; width:max-content; margin-top:6px; padding:4px 8px; border-radius:99px; background:#101828; color:#fff; font-size:11px; font-weight:800; line-height:1.15; }.occurrence-detail-label { align-items:center; justify-content:center; gap:10px; min-height:44px; margin-top:11px; padding:11px 16px; border:1px solid #294985; border-radius:10px; background:#172b4d; font-family:inherit; font-size:14px; font-weight:850; letter-spacing:.01em; cursor:pointer; box-shadow:0 3px 8px rgba(16,24,40,.22); transition:background-color .16s ease, transform .16s ease, box-shadow .16s ease; }.occurrence-detail-label::after { content:'→'; display:grid; place-items:center; width:23px; height:23px; border-radius:6px; background:rgba(255,255,255,.14); font-size:16px; line-height:1; }.occurrence-detail-label:hover { background:#294985; transform:translateY(-1px); box-shadow:0 5px 12px rgba(16,24,40,.28); }.occurrence-detail-label:active { transform:translateY(0); box-shadow:0 1px 3px rgba(16,24,40,.22); }.occurrence-detail-label:focus-visible { outline:3px solid #82aeff; outline-offset:3px; box-shadow:0 0 0 1px #fff; }
    @media(max-width:800px) { .side .nav #occurrenceNav { flex:1 1 0!important; min-width:0; }.occurrence-modal { padding:10px!important; align-items:center!important; }.occurrence-dialog { width:100%; max-height:calc(100dvh - 20px); }.occurrence-dialog .modal-head { padding:16px; }.occurrence-form { padding:16px; }.occurrence-grid,.occurrence-dates { grid-template-columns:1fr; gap:0; }.occurrence-actions { display:grid; grid-template-columns:1fr; gap:8px; }.occurrence-actions .btn { width:100%; }.occurrence-text-meta { flex-direction:column; gap:3px; }.occurrence-history-list { max-height:34vh; }.occurrence-item-head { flex-direction:column; gap:3px; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  // Fonte de autorização de ocorrências: school_members + school_member_permissions,
  // a mesma fonte usada pela RLS real de student_occurrences — não mais
  // user_permissions (que não tem nenhum efeito sobre essa RLS). Mantidos
  // atualizados por carga inicial + eventos do app (carometro:data-loaded,
  // carometro:permission-refresh) + Realtime nas duas tabelas — sem polling.
  let occurrenceMembership = null;
  let occurrencePermission = { can_view_occurrences:false, can_register_occurrences:false, can_edit_occurrences:false, can_delete_occurrences:false, can_edit_all:false };
  // Um par de canais Realtime por member_id atualmente carregado — nunca mais
  // de um par vivo ao mesmo tempo (ver ensureOccurrenceChannels/teardown abaixo).
  let occurrencePermissionChannel = null;
  let occurrenceMembershipChannel = null;
  let occurrenceChannelMemberId = null;
  const isSchoolAdmin = () => occurrenceMembership?.role === 'school_admin';
  // Espelha a policy "school_members_can_view_occurrences": bypass automático
  // só para school_admin; qualquer outro papel depende só das flags.
  const canViewOccurrences = () => isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_view_occurrences;
  // Espelha "authorized_school_members_can_add_occurrences": além da flag,
  // exige um vínculo ativo (created_by/school_id são resolvidos pela RLS/trigger).
  const canRegisterOccurrence = () => !!occurrenceMembership && (isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_register_occurrences);
  const isOccurrenceAuthor = item => !!item?.created_by && item.created_by === user?.id;
  // Espelha "authorized_school_members_can_edit/delete_occurrences": autoria
  // (created_by = auth.uid()) É, por si só, suficiente — não depende de flag.
  const canEditOccurrence = item => isOccurrenceAuthor(item) || isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_edit_occurrences;
  const canDeleteOccurrence = item => isOccurrenceAuthor(item) || isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_delete_occurrences;
  const emptyOccurrencePermission = () => ({ can_view_occurrences:false, can_register_occurrences:false, can_edit_occurrences:false, can_delete_occurrences:false, can_edit_all:false });
  async function teardownOccurrenceChannels() {
    if (occurrencePermissionChannel) { await db.removeChannel(occurrencePermissionChannel); occurrencePermissionChannel = null; }
    if (occurrenceMembershipChannel) { await db.removeChannel(occurrenceMembershipChannel); occurrenceMembershipChannel = null; }
    occurrenceChannelMemberId = null;
  }
  // Garante exatamente um par de canais vivo, sempre referente ao member_id
  // atual — se o vínculo mudar (ex.: troca de conta), o par anterior é
  // removido antes de assinar o novo, evitando canais duplicados/vazados.
  async function ensureOccurrenceChannels(memberId) {
    if (occurrenceChannelMemberId === memberId && occurrencePermissionChannel && occurrenceMembershipChannel) return;
    await teardownOccurrenceChannels();
    if (!db.channel) return;
    occurrenceChannelMemberId = memberId;
    const onRemoteChange = () => { refreshOccurrenceMembership().then(() => { syncOccurrenceNavigation(); syncSaveAction(); refreshLabelState(); }); };
    // Flags de ocorrência (can_view/register/edit/delete_occurrences, can_edit_all).
    occurrencePermissionChannel = db.channel(`occurrence-permission-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_member_permissions', filter:`member_id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
    // Papel/status do próprio vínculo (ex.: promoção/remoção de coordenador).
    // Filtro restrito ao id do próprio membro — nunca amplia o escopo de dados.
    occurrenceMembershipChannel = db.channel(`occurrence-membership-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_members', filter:`id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
  }
  async function refreshOccurrenceMembership() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) { occurrenceMembership = null; occurrencePermission = emptyOccurrencePermission(); await teardownOccurrenceChannels(); return; }
    const { data: membership } = await db.from('school_members').select('id,school_id,role').eq('user_id', signedInUser.id).eq('school_id', schoolId).eq('status', 'active').maybeSingle();
    if (!membership) { occurrenceMembership = null; occurrencePermission = emptyOccurrencePermission(); await teardownOccurrenceChannels(); return; }
    occurrenceMembership = membership;
    const { data: perms } = await db.from('school_member_permissions').select('can_view_occurrences,can_register_occurrences,can_edit_occurrences,can_delete_occurrences,can_edit_all').eq('member_id', membership.id).maybeSingle();
    occurrencePermission = perms || emptyOccurrencePermission();
    await ensureOccurrenceChannels(membership.id);
  }
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const today = () => new Date().toISOString().slice(0, 10);
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00`)) : 'Sem data';
  // updated_at é timestamptz real (não uma data pura como occurred_on), então
  // aqui usamos o fuso local do navegador em vez de forçar UTC.
  const formatDateTime = value => value ? `${new Intl.DateTimeFormat('pt-BR').format(new Date(value))} ${new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(new Date(value))}` : '';
  let occurrenceStudentIds = new Set();
  let occurrenceCounts = new Map();
  let tableErrorShown = false;
  let historyRecords = new Map();
  let editingOccurrence = null;
  let focusedHistoryStudentId = null;

  function selectedClass() { return get('occurrenceClass').value; }
  function selectedStudent() { return get('occurrenceStudent').value; }
  function syncSaveAction() {
    const button = get('saveOccurrence');
    const allowed = editingOccurrence ? canEditOccurrence(editingOccurrence) : canRegisterOccurrence();
    button.disabled = !selectedClass() || !allowed;
    button.title = button.disabled ? 'O administrador precisa liberar a permissão de Ocorrência para esta turma.' : '';
  }
  function fillClasses() {
    const select = get('occurrenceClass');
    const current = select.value || selectedClassId || '';
    select.innerHTML = '<option value="">Selecione uma turma</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (classes.some(item => item.id === current)) select.value = current;
  }
  function fillSearchClasses() {
    const select = get('occurrenceSearchClass');
    const current = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>' + classes.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (classes.some(item => item.id === current)) select.value = current;
  }
  function fillStudents() {
    const classId = selectedClass();
    const select = get('occurrenceStudent');
    const current = select.value;
    // Alguns cadastros trazem a numeração da chamada antes do nome. Preserve
    // essa numeração no seletor, mas ordene pelo nome do aluno.
    const nameForSort = value => String(value || '').replace(/^\s*\d+\s*[.)-]?\s*/, '');
    const classStudents = students.filter(item => item.classId === classId).sort((a, b) => nameForSort(a.name).localeCompare(nameForSort(b.name), 'pt-BR', { sensitivity:'base', numeric:true }));
    select.disabled = !classId;
    select.innerHTML = classId
      ? '<option value="">Selecione um aluno</option>' + classStudents.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('')
      : '<option value="">Selecione a turma primeiro</option>';
    if (classStudents.some(item => item.id === current)) select.value = current;
    syncSaveAction();
  }
  function paintStudentCards() {
    document.querySelectorAll('#list .student').forEach(card => {
      const studentId = card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
      const existing = card.querySelector('.occurrence-label');
      if (!occurrenceStudentIds.has(studentId)) { existing?.remove(); return; }
      if (existing) return;
      const holder = card.querySelector('.name')?.parentElement;
      if (!holder) return;
      const label = document.createElement('span');
      label.className = 'occurrence-label';
      label.textContent = 'Ocorrência';
      holder.appendChild(label);
    });
    const detail = get('studentDetails');
    let detailLabel = detail.querySelector('.occurrence-detail-label');
    if (!detailStudentId || !occurrenceStudentIds.has(detailStudentId)) {
      detailLabel?.remove();
      return;
    }
    const count = occurrenceCounts.get(detailStudentId) || 0;
    const labelText = `Ver ${count === 1 ? 'ocorrência' : 'ocorrências'} · ${count}`;
    // Versões anteriores criavam uma etiqueta sem interação. Se uma delas
    // ainda estiver renderizada, substitui pelo botão sem esperar o card ser
    // aberto novamente.
    if (detailLabel?.tagName !== 'BUTTON') {
      detailLabel?.remove();
      detailLabel = null;
    }
    if (detailLabel) {
      if (detailLabel.textContent !== labelText) detailLabel.textContent = labelText;
      detailLabel.setAttribute('aria-label', `Ver ${count} ocorrência${count === 1 ? '' : 's'} deste aluno`);
      return;
    }
    const detailHolder = detail.querySelector('.detail-head > div:last-child');
    if (!detailHolder) return;
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'occurrence-label occurrence-detail-label';
    label.textContent = labelText;
    label.setAttribute('aria-label', `Ver ${count} ocorrência${count === 1 ? '' : 's'} deste aluno`);
    detailHolder.appendChild(label);
  }
  // O conteúdo do perfil é recriado a cada renderização. A delegação mantém
  // o clique funcionando no celular e no computador mesmo após esse redraw.
  get('studentDetails').addEventListener('click', event => {
    const button = event.target.closest('.occurrence-detail-label');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const student = students.find(item => item.id === detailStudentId);
    window.openOccurrenceRecord?.({ studentId:detailStudentId, classId:student?.classId, reuseLoadedData:true });
  });
  // Exposta para outros módulos (ex.: filtros de busca) lerem sem fazer uma
  // segunda consulta ao banco — sempre reflete o resultado da última
  // consulta real feita sob a RLS de student_occurrences, nunca um valor
  // adivinhado. Fica vazia sempre que canViewOccurrences() for falso.
  window.canViewOccurrences = canViewOccurrences;
  const publishOccurrenceLabelState = () => {
    window.occurrenceStudentIds = occurrenceStudentIds;
    document.dispatchEvent(new CustomEvent('carometro:occurrence-labels-changed'));
  };
  async function refreshLabelState() {
    if (!canViewOccurrences()) {
      occurrenceStudentIds = new Set();
      occurrenceCounts = new Map();
      paintStudentCards();
      publishOccurrenceLabelState();
      return;
    }
    const { data, error } = await db.from('student_occurrences').select('student_id').eq('school_id', occurrenceMembership.school_id);
    if (error) {
      if (!tableErrorShown) {
        tableErrorShown = true;
        toast('O controle de Ocorrências ainda não foi instalado no banco. Execute o script supabase-occurrences.sql.');
      }
      return;
    }
    tableErrorShown = false;
    occurrenceCounts = new Map();
    (data || []).forEach(item => occurrenceCounts.set(item.student_id, (occurrenceCounts.get(item.student_id) || 0) + 1));
    occurrenceStudentIds = new Set(occurrenceCounts.keys());
    paintStudentCards();
    publishOccurrenceLabelState();
  }
  async function refreshHistory() {
    const classId = selectedClass();
    const studentId = selectedStudent();
    const searchClassId = get('occurrenceSearchClass').value;
    const startDate = get('occurrenceStart').value;
    const endDate = get('occurrenceEnd').value;
    const normalizedName = get('occurrenceSearchName').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    const hasSearchFilter = !!(focusedHistoryStudentId || startDate || endDate || searchClassId || normalizedName);
    const list = get('occurrenceHistoryList');
    if (!hasSearchFilter) {
      historyRecords = new Map();
      get('occurrenceHistoryMeta').textContent = 'Use Buscar Ocorrência para consultar os registros.';
      list.innerHTML = '<div class="occurrence-empty">Preencha ao menos um filtro para ver as ocorrências.</div>';
      return;
    }
    let query = db.from('student_occurrences')
      .select('id,student_id,class_id,class_name,occurred_on,occurrence_text,created_at,created_by,created_by_name,updated_by,updated_by_name,updated_at,students(full_name)')
      .eq('school_id', occurrenceMembership.school_id)
      .order('occurred_on', { ascending:false })
      .order('created_at', { ascending:false });
    if (focusedHistoryStudentId) {
      query = query.eq('student_id', focusedHistoryStudentId);
    } else if (normalizedName) {
      const matches = students.filter(item => String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedName) && (!searchClassId || item.classId === searchClassId));
      if (!matches.length) {
        get('occurrenceHistoryMeta').textContent = 'Nenhum aluno encontrado com esse nome.';
        get('occurrenceHistoryList').innerHTML = '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
        return;
      }
      query = query.in('student_id', matches.map(item => item.id));
    } else if (searchClassId) query = query.eq('class_id', searchClassId);
    else if (studentId) query = query.eq('student_id', studentId);
    else if (classId) query = query.eq('class_id', classId);
    if (startDate) query = query.gte('occurred_on', startDate);
    if (endDate) query = query.lte('occurred_on', endDate);
    const { data, error } = await query;
    if (error) {
      list.innerHTML = '<div class="occurrence-empty">Não foi possível consultar as ocorrências.</div>';
      get('occurrenceHistoryMeta').textContent = error.message;
      return;
    }
    const records = data || [];
    historyRecords = new Map(records.map(item => [item.id, item]));
    get('occurrenceHistoryMeta').textContent = records.length ? `${records.length} ocorrência${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}.` : 'Nenhuma ocorrência no filtro selecionado.';
    list.innerHTML = records.length ? records.map(item => `<article class="occurrence-item" data-occurrence-id="${item.id}"><div class="occurrence-item-head"><span class="occurrence-item-date">${formatDate(item.occurred_on)}</span><div class="occurrence-item-actions">${canEditOccurrence(item) ? `<button class="occurrence-edit" type="button" data-occurrence-edit="${item.id}">Editar</button>` : ''}${canDeleteOccurrence(item) ? `<button class="occurrence-delete" type="button" data-occurrence-delete="${item.id}">Excluir</button>` : ''}</div><span class="occurrence-item-student">${escape(item.students?.full_name || 'Aluno removido')} · ${escape(item.class_name || 'Turma não informada')}</span></div><div class="occurrence-item-text">${escape(item.occurrence_text)}</div><span class="occurrence-responsible">Responsável: ${escape(item.created_by_name || 'Não informado')}</span>${item.updated_at ? `<span class="occurrence-updated">Última edição: ${escape(item.updated_by_name || 'Não informado')} — ${formatDateTime(item.updated_at)}</span>` : ''}</article>`).join('') : '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
  }
  async function open() {
    if (!canViewOccurrences()) { toast('O administrador precisa liberar o acesso a Ocorrências para este usuário.'); return; }
    focusedHistoryStudentId = null;
    modal.classList.remove('hidden');
    await load();
    fillClasses();
    fillSearchClasses();
    fillStudents();
    await refreshLabelState();
    await refreshHistory();
    syncSaveAction();
  }

  // Abre o mesmo modal/lista de ocorrências (nenhum visualizador paralelo),
  // já filtrado no aluno/turma informados, e destaca a ocorrência indicada.
  // Quem chama esta função (notification-center.js) já validou com uma
  // consulta nova ao Supabase que a ocorrência existe e está acessível —
  // aqui só reaproveitamos a busca e a renderização que já existem.
  async function openFocused({ occurrenceId, studentId, classId, reuseLoadedData = false } = {}) {
    if (!canViewOccurrences()) { toast('O administrador precisa liberar o acesso a Ocorrências para este usuário.'); return; }
    focusedHistoryStudentId = studentId || null;
    get('occurrenceHistoryMeta').textContent = 'Carregando ocorrências deste aluno…';
    get('occurrenceHistoryList').innerHTML = '<div class="occurrence-empty">Carregando…</div>';
    modal.classList.remove('hidden');
    if (!reuseLoadedData) await load();
    fillClasses();
    fillSearchClasses();
    get('occurrenceClass').value = classId || '';
    fillStudents();
    if (studentId) get('occurrenceStudent').value = studentId;
    if (!reuseLoadedData) await refreshLabelState();
    const studentName = students.find(item => item.id === studentId)?.name || '';
    get('occurrenceDateFilters').classList.remove('hidden');
    get('searchOccurrences').setAttribute('aria-expanded', 'true');
    get('occurrenceSearchClass').value = classId || '';
    get('occurrenceStart').value = '';
    get('occurrenceEnd').value = '';
    get('occurrenceSearchName').value = studentName;
    await refreshHistory();
    syncSaveAction();
    if (occurrenceId) {
      const article = get('occurrenceHistoryList').querySelector(`[data-occurrence-id="${occurrenceId}"]`);
      if (article) {
        article.scrollIntoView({ behavior: 'smooth', block: 'center' });
        article.classList.add('occurrence-item-focused');
        setTimeout(() => article.classList.remove('occurrence-item-focused'), 2500);
      }
    }
  }
  window.openOccurrenceRecord = openFocused;
  function resetOccurrenceScreen() {
    editingOccurrence = null;
    focusedHistoryStudentId = null;
    get('occurrenceClass').value = '';
    fillStudents();
    get('occurrenceDate').value = '';
    get('occurrenceText').value = '';
    get('occurrenceTextCount').textContent = '0/500';
    get('occurrenceStart').value = '';
    get('occurrenceEnd').value = '';
    get('occurrenceSearchClass').value = '';
    get('occurrenceSearchName').value = '';
    get('occurrenceDateFilters').classList.add('hidden');
    get('searchOccurrences').setAttribute('aria-expanded', 'false');
    get('saveOccurrence').textContent = 'Salvar ocorrência';
    refreshHistory();
    syncSaveAction();
  }
  async function save() {
    const classId = selectedClass();
    const studentId = selectedStudent();
    const text = get('occurrenceText').value.trim();
    const occurrenceDate = get('occurrenceDate').value;
    const classItem = classes.find(item => item.id === classId);
    if (!editingOccurrence && (!classItem || !studentId)) { toast('Selecione a turma e o aluno.'); return; }
    if (!editingOccurrence && !canRegisterOccurrence()) { toast('Sem permissão para registrar ocorrência.'); return; }
    if (editingOccurrence && !canEditOccurrence(editingOccurrence)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    if (!occurrenceDate) { toast('Selecione a data da ocorrência.'); return; }
    if (!text) { toast('Digite a descrição da ocorrência.'); return; }
    const button = get('saveOccurrence');
    button.disabled = true;
    const { error } = editingOccurrence
      ? await db.from('student_occurrences').update({ occurred_on:occurrenceDate, occurrence_text:text }).eq('id', editingOccurrence.id).eq('school_id', occurrenceMembership.school_id)
      : await db.from('student_occurrences').insert({ school_id:occurrenceMembership.school_id, student_id:studentId, class_id:classId, class_name:classItem.name, occurred_on:occurrenceDate, occurrence_text:text });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    const wasEditing = !!editingOccurrence;
    if (!wasEditing) {
      occurrenceStudentIds.add(studentId);
      occurrenceCounts.set(studentId, (occurrenceCounts.get(studentId) || 0) + 1);
    }
    paintStudentCards();
    if (!wasEditing) resetOccurrenceScreen();
    else {
      get('occurrenceText').value = '';
      get('occurrenceTextCount').textContent = '0/500';
      editingOccurrence = null;
      get('saveOccurrence').textContent = 'Salvar ocorrência';
    }
    toast(wasEditing ? 'Ocorrência atualizada.' : 'Ocorrência salva. A etiqueta foi atualizada no card do aluno.');
    await refreshHistory();
  }

  function editOccurrence(item) {
    if (!canEditOccurrence(item)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    editingOccurrence = item;
    get('occurrenceClass').value = item.class_id || '';
    fillStudents();
    get('occurrenceStudent').value = item.student_id;
    get('occurrenceDate').value = item.occurred_on;
    get('occurrenceText').value = item.occurrence_text;
    get('occurrenceTextCount').textContent = `${item.occurrence_text.length}/500`;
    get('saveOccurrence').textContent = 'Salvar alterações';
    syncSaveAction();
    get('occurrenceText').focus();
  }
  // Resolve a Promise pendente de confirmOccurrenceDeletion() abaixo — nunca
  // mais de uma por vez, pois o modal bloqueia o restante da tela enquanto
  // aberto.
  let deleteConfirmResolve = null;
  function closeDeleteConfirm(result) {
    deleteConfirmModal.classList.add('hidden');
    const resolve = deleteConfirmResolve;
    deleteConfirmResolve = null;
    if (resolve) resolve(result);
  }
  // Substitui o confirm() nativo (que só mostrava a data) por um resumo que
  // identifica o registro sem ambiguidade — necessário porque um mesmo aluno
  // pode ter mais de uma ocorrência parecida, e excluir pelo id certo não
  // adianta se o usuário escolheu o item errado na lista. Não muda quem pode
  // excluir nem como o DELETE é feito, só a clareza da confirmação.
  function confirmOccurrenceDeletion(item) {
    get('occurrenceDeleteConfirmStudent').textContent = item.students?.full_name || 'Aluno removido';
    get('occurrenceDeleteConfirmDate').textContent = formatDate(item.occurred_on);
    get('occurrenceDeleteConfirmAuthor').textContent = item.created_by_name || 'Não informado';
    get('occurrenceDeleteConfirmCreatedAt').textContent = formatDateTime(item.created_at) || 'Não informado';
    const text = item.occurrence_text || '';
    const preview = text.length > 220 ? `${text.slice(0, 220).trim()}…` : text;
    get('occurrenceDeleteConfirmText').textContent = `"${preview}"`;
    deleteConfirmModal.classList.remove('hidden');
    return new Promise(resolve => { deleteConfirmResolve = resolve; });
  }
  async function deleteOccurrence(item) {
    if (!canDeleteOccurrence(item)) { toast('Sem permissão para excluir esta ocorrência.'); return; }
      if (!(await confirmOccurrenceDeletion(item))) return;
      const { error } = await db.from('student_occurrences').delete().eq('id', item.id).eq('school_id', occurrenceMembership.school_id);
    if (error) { toast(error.message); return; }
    const nextCount = Math.max(0, (occurrenceCounts.get(item.student_id) || 1) - 1);
    if (nextCount) occurrenceCounts.set(item.student_id, nextCount);
    else { occurrenceCounts.delete(item.student_id); occurrenceStudentIds.delete(item.student_id); }
    if (editingOccurrence?.id === item.id) {
      editingOccurrence = null;
      get('saveOccurrence').textContent = 'Salvar ocorrência';
      get('occurrenceText').value = '';
      get('occurrenceTextCount').textContent = '0/500';
    }
    paintStudentCards();
    resetOccurrenceScreen();
    toast('Ocorrência excluída.');
  }

  const syncOccurrenceNavigation = () => {
    const allowed = canViewOccurrences();
    occurrenceButton.classList.toggle('hidden', !allowed);
    occurrenceButton.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };
  occurrenceButton.onclick = open;
  const closeOccurrence = () => { resetOccurrenceScreen(); modal.classList.add('hidden'); };
  get('closeOccurrence').onclick = closeOccurrence;
  modal.onclick = event => { if (event.target === modal) closeOccurrence(); };
  get('occurrenceDeleteConfirmCancel').onclick = () => closeDeleteConfirm(false);
  get('occurrenceDeleteConfirmSubmit').onclick = () => closeDeleteConfirm(true);
  deleteConfirmModal.onclick = event => { if (event.target === deleteConfirmModal) closeDeleteConfirm(false); };
  get('occurrenceClass').onchange = async () => { focusedHistoryStudentId = null; fillStudents(); await refreshHistory(); };
  get('occurrenceStudent').onchange = () => { focusedHistoryStudentId = null; refreshHistory(); };
  get('searchOccurrences').onclick = () => {
    const filters = get('occurrenceDateFilters');
    const opening = filters.classList.contains('hidden');
    filters.classList.toggle('hidden', !opening);
    get('searchOccurrences').setAttribute('aria-expanded', String(opening));
  };
  get('saveOccurrence').onclick = save;
  get('occurrenceText').oninput = () => { get('occurrenceTextCount').textContent = `${get('occurrenceText').value.length}/500`; };
  get('occurrenceText').onkeydown = event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    // O campo de descrição aceita parágrafos; Enter nunca dispara salvamento.
    event.preventDefault();
    const input = get('occurrenceText');
    if (input.value.length >= 500) return;
    input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles:true }));
  };
  ['occurrenceStart', 'occurrenceEnd'].forEach(id => { get(id).onchange = () => { focusedHistoryStudentId = null; refreshHistory(); }; });
  get('occurrenceSearchClass').onchange = () => { focusedHistoryStudentId = null; refreshHistory(); };
  let nameSearchTimer;
  get('occurrenceSearchName').oninput = () => { focusedHistoryStudentId = null; clearTimeout(nameSearchTimer); nameSearchTimer = setTimeout(refreshHistory, 250); };
  get('occurrenceHistoryList').onclick = event => {
    const editId = event.target.closest('[data-occurrence-edit]')?.dataset.occurrenceEdit;
    const deleteId = event.target.closest('[data-occurrence-delete]')?.dataset.occurrenceDelete;
    if (editId && historyRecords.has(editId)) editOccurrence(historyRecords.get(editId));
    if (deleteId && historyRecords.has(deleteId)) deleteOccurrence(historyRecords.get(deleteId));
  };
  new MutationObserver(paintStudentCards).observe(get('list'), { childList:true });
  new MutationObserver(paintStudentCards).observe(get('studentDetails'), { childList:true, subtree:true });
  new MutationObserver(() => {
    if (!get('app').classList.contains('hidden')) refreshLabelState();
  }).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  document.addEventListener('carometro:occurrences-changed', async () => {
    await refreshLabelState();
    if (!modal.classList.contains('hidden')) await refreshHistory();
  });
  document.addEventListener('carometro:permission-refresh', async () => {
    await refreshOccurrenceMembership();
    syncOccurrenceNavigation();
    syncSaveAction();
    // Sem isto, revogar can_view_occurrences no meio da sessão só escondia o
    // botão de navegação: os badges/occurrenceStudentIds já calculados
    // continuavam expostos até a próxima carga completa.
    refreshLabelState();
    if (!modal.classList.contains('hidden')) refreshHistory();
  });

  document.addEventListener('carometro:data-loaded', async () => {
    // Recursos adicionais recebem a conclusão da carga central sem encadear
    // wrappers em window.load, o que evita respostas fora de ordem.
    await refreshOccurrenceMembership();
    await refreshLabelState();
    if (!modal.classList.contains('hidden')) {
      fillClasses();
      fillSearchClasses();
      fillStudents();
      await refreshHistory();
    }
  });
  new MutationObserver(syncOccurrenceNavigation).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  // Atualização orientada a eventos: carga inicial aqui, mais os listeners de
  // carometro:data-loaded/carometro:permission-refresh acima, mais os dois
  // canais Realtime (flags e papel) assinados dentro de refreshOccurrenceMembership.
  // Sem polling.
  refreshOccurrenceMembership().then(() => { syncOccurrenceNavigation(); syncSaveAction(); });
});
