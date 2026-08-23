document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const uniformButton = document.createElement('button');
  uniformButton.id = 'uniformNav';
  uniformButton.type = 'button';
  uniformButton.innerHTML = '<span>▣ &nbsp; Controle de Itens</span>';
  nav.insertBefore(uniformButton, document.getElementById('profileNav') || null);

  const modal = document.createElement('div');
  modal.id = 'uniformModal';
  modal.className = 'modal-bg uniform-modal hidden';
  modal.innerHTML = `<section class="modal uniform-dialog"><div class="modal-head"><div><h3>Controle de Itens</h3><div class="meta">Consulte a situação por turno, turma ou aluno.</div></div><button class="close" type="button" id="closeUniform">×</button></div><div class="uniform-mode-toggle" role="tablist"><button type="button" id="uniformModeItems" class="uniform-mode-btn active" role="tab" aria-pressed="true">Itens</button><button type="button" id="uniformModeLivroRevisa" class="uniform-mode-btn" role="tab" aria-pressed="false">Livro/Revisa</button></div><div id="uniformItemsPanel"><div class="uniform-summary"><div><span>Sem uniforme</span><b id="pendingUniform">0</b></div><div><span>Sem tênis</span><b id="pendingShoes">0</b></div><div><span>Sem os dois</span><b id="pendingBoth">0</b></div><div><span>Sem material</span><b id="pendingMaterial">0</b></div></div><section class="uniform-shift-section" aria-label="Contagem por turno"><span class="uniform-shift-title">Contagem por turno</span><div id="uniformShiftSummary" class="uniform-shift-summary"></div></section><div class="uniform-bulk-action"><button id="markAllUniformReceived" class="btn secondary" type="button">✓ Marcar todos como receberam</button></div><div class="uniform-controls"><select id="uniformShift"><option value="">Todos os turnos</option><option value="Matutino">Matutino</option><option value="Vespertino">Vespertino</option><option value="Noturno">Noturno</option></select><select id="uniformClass"><option value="">Todas as turmas</option></select><select id="uniformView"><option value="all">Todos os alunos</option><option value="pending">Somente alunos pendentes</option><option value="uniform">Somente sem uniforme</option><option value="shoes">Somente sem tênis</option><option value="both">Sem uniforme e tênis</option><option value="material">Somente sem material</option></select><input id="uniformSearch" placeholder="Buscar aluno"></div><div id="uniformActiveFilter" class="uniform-active-filter hidden" role="status" aria-live="polite"></div><div class="uniform-columns"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="uniformList" class="uniform-list"></div></div><div id="livroRevisaPanel" class="livro-revisa-panel hidden"><div class="livro-revisa-controls"><select id="livroRevisaClass"><option value="">Selecione a turma</option></select><input id="livroRevisaYear" type="number" min="2000" max="2100" placeholder="Ano letivo"><select id="livroRevisaBimester"><option value="">Bimestre</option><option value="1">1º bimestre</option><option value="2">2º bimestre</option><option value="3">3º bimestre</option><option value="4">4º bimestre</option></select></div><div id="livroRevisaNotice" class="livro-revisa-notice hidden"></div><div id="livroRevisaColumns" class="uniform-columns livro-revisa-columns hidden"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="livroRevisaList" class="livro-revisa-list"></div><div class="livro-revisa-actions"><button id="finalizeLivroRevisa" class="btn secondary" type="button" disabled>Finalizar conferência</button></div></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; } #uniformNav:hover { background:#38527e; } #toast { z-index:220!important; }
    .uniform-modal { z-index:110; padding:12px 20px; overscroll-behavior:none; }.uniform-dialog { width:min(1040px,100%); height:min(960px,calc(100dvh - 24px)); max-height:calc(100dvh - 24px); min-height:0; display:flex; flex-direction:column; overflow:hidden; }.uniform-dialog .modal-head { position:relative!important; top:auto!important; flex:none; }
    .uniform-mode-toggle { flex:none; display:flex; gap:8px; padding:9px 22px 0; }.uniform-mode-btn { min-height:32px; padding:6px 16px; border:1px solid #d9e2f4; border-radius:99px; background:#fff; color:var(--muted); font-weight:750; font-size:13px; cursor:pointer; }.uniform-mode-btn.active { background:#2b3c5d; border-color:#2b3c5d; color:#fff; }
    #uniformItemsPanel { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .livro-revisa-panel { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding:0 22px 22px; }.livro-revisa-controls { flex:none; display:grid; grid-template-columns:1.3fr .8fr 1fr; gap:10px; padding:15px 0; }.livro-revisa-controls input,.livro-revisa-controls select { min-width:0; min-height:42px; padding:8px 10px; }.livro-revisa-notice { flex:none; margin-bottom:12px; padding:10px 12px; border-radius:8px; background:#fff4e5; color:#8a5a00; font-size:13px; font-weight:650; }.livro-revisa-columns { flex:none; padding:0 0 9px; }.livro-revisa-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }.livro-revisa-actions { flex:none; display:flex; justify-content:flex-end; padding-top:14px; }.livro-revisa-toggle { display:flex; gap:6px; }.livro-revisa-check,.livro-revisa-cross { min-width:40px; min-height:40px; border-radius:8px; border:1px solid #d9e2f4; background:#fff; font-size:16px; font-weight:800; cursor:pointer; color:var(--muted); }.livro-revisa-check.active { background:#dcfae6; border-color:#087443; color:#087443; }.livro-revisa-cross.active { background:#fee4e2; border-color:#b42318; color:#b42318; }
    .uniform-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:6px 22px; border-bottom:1px solid var(--line); background:#f8faff; }.uniform-summary div { padding:4px 8px; border:1px solid #dbe4f5; border-radius:9px; background:#fff; }.uniform-summary span { display:block; color:var(--muted); font-size:10.5px; font-weight:700; }.uniform-summary b { font-size:16px; color:#b42318; }
    .uniform-shift-section { padding:5px 22px; border-bottom:1px solid var(--line); background:#fff; }.uniform-shift-title { display:block; margin-bottom:3px; color:var(--muted); font-size:10px; font-weight:850; letter-spacing:.05em; text-transform:uppercase; }.uniform-shift-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }.uniform-shift-card { border:1px solid #dbe4f5; border-radius:9px; padding:5px 6px; background:#f8faff; }.uniform-shift-card b { display:block; font-size:12px; margin-bottom:2px; }.uniform-shift-values { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }.uniform-shift-values span { color:var(--muted); font-size:10px; line-height:1.1; }.uniform-shift-values strong { display:block; margin-top:1px; color:#b42318; font-size:14px; }.uniform-shift-cell { all:unset; box-sizing:border-box; display:block; width:100%; font:inherit; color:var(--muted); text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; border-radius:6px; }.uniform-shift-cell:hover:not(:disabled) { background:#eef3ff; }.uniform-shift-cell[aria-pressed="true"] { background:#dbe7ff; border:1px solid #8fa8e0; }.uniform-shift-cell:disabled { opacity:.55; cursor:default; }.uniform-shift-cell:focus-visible { outline:2px solid #2b3c5d; outline-offset:2px; }
    .uniform-summary,.uniform-shift-section,.uniform-bulk-action,.uniform-controls,.uniform-active-filter,.uniform-columns { flex:none; }.uniform-bulk-action { display:flex; justify-content:flex-end; padding:6px 22px 0; }.uniform-bulk-action .btn { min-height:30px; font-size:13px; }.uniform-controls { display:grid; grid-template-columns:.85fr .85fr 1.15fr .9fr; gap:8px; padding:8px 22px; }.uniform-controls input,.uniform-controls select { min-width:0; min-height:36px; padding:6px 9px; }.uniform-active-filter { margin:0 22px 6px; padding:6px 10px; border-radius:8px; background:#eef3ff; color:#2b3c5d; font-size:12.5px; font-weight:700; }.uniform-columns { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; padding:0 22px 6px; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }.uniform-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); min-width:0; }.uniform-student { display:flex; align-items:center; gap:10px; min-width:0; }.uniform-student .avatar { width:40px; height:40px; font-size:13px; flex:none; }.uniform-student b { display:block; }.uniform-student .meta { margin-top:4px; }.uniform-statuses { display:flex; flex-wrap:wrap; gap:5px; }.uniform-status { display:inline-flex; max-width:100%; padding:6px 9px; border-radius:14px; font-size:12px; font-weight:800; white-space:normal; word-break:break-word; line-height:1.3; }.uniform-status.received { background:#dcfae6; color:#087443; }.uniform-status.pending { background:#fee4e2; color:#b42318; }.uniform-action { display:grid; gap:6px; min-width:0; }.uniform-action select { min-height:37px; padding:6px 8px; font-size:13px; }.uniform-save { min-height:37px; padding:7px 10px; font-size:13px; }.uniform-card-label { margin-left:0; max-width:100%; white-space:normal; line-height:1.25; }.uniform-card-label.uniform-pending { background:#fee4e2; color:#b42318; }.uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media(max-width:800px) { .side .nav #uniformNav { flex:1 1 0!important; min-width:0; }.uniform-modal { padding:6px; align-items:center; }.uniform-dialog { width:100%; height:calc(100dvh - 12px); max-height:none; }.uniform-dialog .modal-head { padding:9px 14px; }.uniform-dialog .modal-head h3 { font-size:17px; }.uniform-dialog .modal-head .meta { font-size:12px; }.uniform-mode-toggle { padding:6px 12px 0; gap:6px; }.uniform-mode-btn { min-height:28px; padding:5px 14px; font-size:12.5px; }.uniform-summary { grid-template-columns:repeat(4,1fr); padding:5px 12px; gap:4px; }.uniform-summary div { padding:4px 5px; }.uniform-summary span { font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.uniform-summary b { font-size:15px; }
      /* Contagem por turno: os 3 cards (Matutino/Vespertino/Noturno) viram
         uma tabela compacta de 3 linhas × 5 colunas (turno + os 4 valores),
         em vez de 3 blocos empilhados cada um com o turno numa linha e os 4
         valores em outra — é isso que devolve a maior parte da altura para
         a lista de resultados. display:contents faz .uniform-shift-card e
         .uniform-shift-values "desaparecerem" da árvore de caixas mantendo
         os filhos (mesmo DOM/onclick/aria-label de sempre) participando
         direto do grid do pai — nenhuma mudança de HTML/JS foi necessária. */
      .uniform-shift-section { padding:5px 12px; }.uniform-shift-title { margin-bottom:4px; font-size:9.5px; }
      .uniform-shift-summary { display:grid; grid-template-columns:50px repeat(4,1fr); gap:3px 4px; }
      .uniform-shift-card { display:contents; }
      .uniform-shift-card b { display:flex; align-items:center; margin:0; font-size:9.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .uniform-shift-values { display:contents; }
      .uniform-shift-cell { min-width:0; display:flex!important; flex-direction:row; align-items:center; justify-content:center; gap:3px; padding:6px 2px; min-height:34px; }
      .uniform-shift-values span { font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .uniform-shift-values strong { font-size:13px; margin:0; }
      .uniform-bulk-action { padding:5px 12px 0; }.uniform-bulk-action .btn { width:100%; min-height:32px; }.uniform-controls { grid-template-columns:1fr 1fr; padding:7px 12px; gap:6px; }.uniform-controls input,.uniform-controls select { min-height:36px; padding:6px 8px; font-size:13px; }.uniform-active-filter { margin:0 12px 6px; font-size:11.5px; padding:6px 10px; }.uniform-columns { display:none; }.uniform-list { min-height:0; padding:0 12px 12px; }
      /* Linha de resultado: situação ao lado do aluno (não embaixo), e os
         dois seletores de registro lado a lado (não empilhados) — reduz a
         altura de cada linha bastante sem remover nenhuma informação nem
         controle; mesmo HTML/onclick de sempre. */
      .uniform-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:3px 8px; padding:7px 0; }
      .uniform-row > div:nth-child(2) { justify-self:end; align-self:center; }
      .uniform-row > .uniform-action, .uniform-row > .meta:last-child { grid-column:1 / -1; }
      .uniform-action { grid-template-columns:1fr 1fr; }
      .uniform-action select, .material-select { min-height:34px; }
      .uniform-student { gap:8px; }
      .uniform-student .avatar { width:32px; height:32px; font-size:11px; }
      .uniform-student b { display:inline; font-size:13px; }
      .uniform-student .meta { display:inline; margin:0 0 0 5px; font-size:11.5px; }
      .uniform-card-label { font-size:11px; }.livro-revisa-panel { padding:0 12px 12px; }.livro-revisa-controls { grid-template-columns:1fr; gap:6px; padding:9px 0; }.livro-revisa-controls input,.livro-revisa-controls select { min-height:38px; padding:7px 8px; font-size:13px; }.livro-revisa-columns { display:none; } }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const isCoordinator = () => !!permission?.is_coordinator;
  // Fonte de autorização de Uniforme: school_members + school_member_permissions,
  // a mesma fonte usada pela RLS/RPC real — não mais user_permissions (que não
  // tem nenhum efeito sobre essa RLS/RPC). Mantidos atualizados por carga
  // inicial + eventos do app (carometro:data-loaded, carometro:permission-refresh)
  // + Realtime nas duas tabelas — sem polling.
  let uniformMembership = null;
  let uniformCommercialPermission = { can_view_uniform:false, can_edit_uniform:false, can_mark_all_uniform_received:false, can_edit_all:false };
  // Um par de canais Realtime por member_id atualmente carregado — nunca mais
  // de um par vivo ao mesmo tempo (ver ensureUniformChannels/teardown abaixo).
  let uniformPermissionChannel = null;
  let uniformMembershipChannel = null;
  let uniformChannelMemberId = null;
  const emptyUniformPermission = () => ({ can_view_uniform:false, can_edit_uniform:false, can_mark_all_uniform_received:false, can_edit_all:false });
  async function teardownUniformChannels() {
    if (uniformPermissionChannel) { await db.removeChannel(uniformPermissionChannel); uniformPermissionChannel = null; }
    if (uniformMembershipChannel) { await db.removeChannel(uniformMembershipChannel); uniformMembershipChannel = null; }
    uniformChannelMemberId = null;
  }
  // Garante exatamente um par de canais vivo, sempre referente ao member_id
  // atual — se o vínculo mudar (ex.: troca de conta), o par anterior é
  // removido antes de assinar o novo, evitando canais duplicados/vazados.
  async function ensureUniformChannels(memberId) {
    if (uniformChannelMemberId === memberId && uniformPermissionChannel && uniformMembershipChannel) return;
    await teardownUniformChannels();
    if (!db.channel) return;
    uniformChannelMemberId = memberId;
    const onRemoteChange = () => { refreshUniformMembership().then(() => { syncUniformNavigation(); if (!modal.classList.contains('hidden')) render(); }); };
    // Flags de uniforme (can_view/edit_uniform, can_mark_all_uniform_received, can_edit_all).
    uniformPermissionChannel = db.channel(`uniform-permission-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_member_permissions', filter:`member_id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
    // Papel/status do próprio vínculo (ex.: promoção/remoção de coordenador).
    // Filtro restrito ao id do próprio membro — nunca amplia o escopo de dados.
    uniformMembershipChannel = db.channel(`uniform-membership-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_members', filter:`id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
  }
  async function refreshUniformMembership() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    // Vínculo da escola ATIVA da sessão (school-context.js) — nunca mais
    // "a primeira membership ativa" retornada pelo banco. Uma conta com
    // vínculo em mais de uma escola precisa das permissões da escola que
    // está de fato selecionada, não de uma escola arbitrária.
    const activeSchoolId = window.getActiveSchoolId?.() || null;
    if (!activeSchoolId) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    const { data: membership } = await db.from('school_members').select('id,school_id,role').eq('user_id', signedInUser.id).eq('school_id', activeSchoolId).eq('status', 'active').maybeSingle();
    if (!membership) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    uniformMembership = membership;
    const { data: perms } = await db.from('school_member_permissions').select('can_view_uniform,can_edit_uniform,can_mark_all_uniform_received,can_edit_all').eq('member_id', membership.id).maybeSingle();
    uniformCommercialPermission = perms || emptyUniformPermission();
    await ensureUniformChannels(membership.id);
  }
  const canAccessUniform = () => isAdmin() || (isCoordinator() && !!(uniformCommercialPermission.can_edit_all || uniformCommercialPermission.can_view_uniform || uniformCommercialPermission.can_edit_uniform || uniformCommercialPermission.can_mark_all_uniform_received));
  window.canAccessUniformNav = canAccessUniform;
  const canRegisterUniform = student => {
    if (isAdmin()) return true;
    return isCoordinator() && !!(uniformCommercialPermission.can_edit_all || uniformCommercialPermission.can_edit_uniform);
  };
  const bulkUniformAccess = () => {
    const classId = get('uniformClass').value || null;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = classId ? selectedClassName(classes.find(item => item.id === classId)?.name) : '';
    const ids = classId
      ? students.filter(item => item.classId === classId || selectedClassName(item.className) === selectedTargetName).map(item => item.id)
      : null;
    if (isAdmin()) return { allowed:true, classId, ids };
    return { allowed:isCoordinator() && !!uniformCommercialPermission.can_mark_all_uniform_received, classId, ids };
  };
  const escape = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  // Avatar da lista — mesmo padrão de carregamento preguiçoso já usado na
  // tela principal (student-edit-improvements.js): nunca assina todas as
  // fotos de uma vez (isso seria N+1 e tornaria a abertura mais lenta).
  // Reaproveita student.photoUrl se já tiver sido carregado em qualquer
  // lugar do app (a mesma lista `students` é compartilhada); só assina sob
  // demanda, um por vez, quando a linha realmente aparece na tela.
  const avatarHtml = item => `<div class="avatar" data-avatar-id="${item.id}">${item.photoUrl ? `<img src="${item.photoUrl}" alt="">` : ini(item.name)}</div>`;
  let uniformPhotoObserver = null;
  async function loadUniformRowPhoto(studentId) {
    const student = students.find(item => item.id === studentId);
    if (!student?.photoPath || student.photoUrl || student.loadingUniformPhoto) return;
    student.loadingUniformPhoto = true;
    const { data } = await db.storage.from('student-photos').createSignedUrl(student.photoPath, 3600);
    student.loadingUniformPhoto = false;
    if (!data?.signedUrl) return;
    student.photoUrl = data.signedUrl;
    // Atualiza só o avatar já em tela — nunca re-renderiza a lista inteira
    // por causa de uma foto (evitaria piscar as outras linhas já prontas).
    modal.querySelectorAll(`[data-avatar-id="${studentId}"]`).forEach(avatar => {
      avatar.innerHTML = `<img src="${student.photoUrl}" alt="">`;
    });
  }
  function observeUniformPhotos(listElement) {
    if (uniformPhotoObserver) uniformPhotoObserver.disconnect();
    const rows = listElement.querySelectorAll('[data-avatar-id]');
    if (!('IntersectionObserver' in window)) { rows.forEach(el => loadUniformRowPhoto(el.dataset.avatarId)); return; }
    uniformPhotoObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      uniformPhotoObserver.unobserve(entry.target);
      loadUniformRowPhoto(entry.target.dataset.avatarId);
    }), { root:listElement, rootMargin:'160px 0px' });
    rows.forEach(el => uniformPhotoObserver.observe(el));
  }
  const labels = { uniform:'Não recebeu uniforme', shoes:'Não recebeu tênis', both:'Não recebeu uniforme e tênis', material:'Não recebeu material' };
  const shifts = ['Matutino', 'Vespertino', 'Noturno'];
  const shiftForClass = classId => classes.find(item => item.id === classId)?.shift || 'Matutino';
  const shiftForStudent = student => {
    const className = String(student?.className || '').trim().toLocaleLowerCase('pt-BR');
    const schoolClass = classes.find(item => item.id === student?.classId || (className && String(item.name || '').trim().toLocaleLowerCase('pt-BR') === className));
    return schoolClass?.shift || 'Matutino';
  };
  const pending = student => {
    // Toda a tela consulta primeiro o último estado confirmado do aluno.
    // Isso protege a contagem contra uma carga antiga que termine depois de
    // o usuário alterar o seletor.
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    const explicit = String(source?.uniform_pending || '').trim().toLocaleLowerCase('pt-BR');
    if (['uniform', 'shoes', 'both'].includes(explicit)) return explicit;

    // Quando a coluna existe, uma pendência só vale se estiver registrada nela.
    // As versões iniciais criavam os dois booleanos como false para alunos já
    // existentes, o que não representa uma escolha feita por um usuário.
    if (Object.prototype.hasOwnProperty.call(source || {}, 'uniform_pending')) return '';

    // Compatibilidade apenas com bancos muito antigos, sem a coluna de status.
    const needsUniform = source?.uniform_received === false || source?.uniform_received === 'false';
    const needsShoes = source?.shoes_received === false || source?.shoes_received === 'false';
    if (needsUniform && needsShoes) return 'both';
    if (needsUniform) return 'uniform';
    if (needsShoes) return 'shoes';
    return '';
  };
  const materialPending = student => {
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    return source?.material_received === false || source?.material_received === 'false';
  };
  const statusesFor = student => {
    const status = pending(student);
    return [...(status ? [status] : []), ...(materialPending(student) ? ['material'] : [])];
  };
  const studentId = card => card.dataset.studentId || card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  let classStudents = null;
  let classStudentsRequest = 0;
  let uniformRecords = [];
  let canonicalUniformState = new Map();
  let locallyUpdatedUniformIds = new Set();
  let uniformStateRequest = 0;
  let uniformStateErrorShown = false;

  // Os três totais não dependem da turma, dos filtros nem da lista visível.
  // Mantê-los em uma função própria evita que uma falha ao montar a lista
  // deixe os números em zero, apesar de os dados já terem sido carregados.
  function updateUniformSummary(records = uniformRecords) {
    // A lista principal sempre representa todos os alunos que o usuário pode
    // visualizar. A resposta exclusiva de Uniforme pode chegar incompleta ou
    // antes de uma alteração recente; use-a apenas antes da carga principal.
    const source = students.length ? students : records;
    const totals = { uniform:0, shoes:0, both:0, material:0 };
    source.forEach(student => {
      const status = pending(student);
      if (status) totals[status] += 1;
      if (materialPending(student)) totals.material += 1;
    });
    get('pendingUniform').textContent = totals.uniform;
    get('pendingShoes').textContent = totals.shoes;
    get('pendingBoth').textContent = totals.both;
    get('pendingMaterial').textContent = totals.material;
    const activeShift = get('uniformShift').value, activeView = get('uniformView').value;
    const shiftCategories = [
      { key:'uniform', label:'Uniforme' },
      { key:'shoes', label:'Tênis' },
      { key:'both', label:'Os dois' },
      { key:'material', label:'Material' }
    ];
    get('uniformShiftSummary').innerHTML = shifts.map(shift => {
      const shiftTotals = { uniform:0, shoes:0, both:0, material:0 };
      source.forEach(student => {
        if (shiftForStudent(student) !== shift) return;
        const status = pending(student);
        if (status) shiftTotals[status] += 1;
        if (materialPending(student)) shiftTotals.material += 1;
      });
      const cellsHtml = shiftCategories.map(category => {
        const count = shiftTotals[category.key];
        const isActive = activeShift === shift && activeView === category.key;
        const disabled = count === 0 && !isActive;
        const ariaLabel = `${labels[category.key]} — turno ${shift} (${count} aluno${count === 1 ? '' : 's'})`;
        return `<button type="button" class="uniform-shift-cell" data-shift="${escape(shift)}" data-view="${category.key}" aria-pressed="${isActive}" aria-label="${escape(ariaLabel)}" ${disabled ? 'disabled' : ''}><span>${category.label}</span><strong>${count}</strong></button>`;
      }).join('');
      return `<article class="uniform-shift-card"><b>${shift}</b><div class="uniform-shift-values">${cellsHtml}</div></article>`;
    }).join('');
  }

  function syncUniformState(records, { preserveLocal = false } = {}) {
    uniformRecords = records || [];
    const stateByStudent = new Map(uniformRecords.map(item => [item.id, item]));
    stateByStudent.forEach((state, id) => {
      if (preserveLocal && locallyUpdatedUniformIds.has(id)) return;
      canonicalUniformState.set(id, { id, ...state });
      if (!preserveLocal) locallyUpdatedUniformIds.delete(id);
    });
    // Exponha a fonte canônica por aluno para a lista e o card principal.
    // Dessa forma uma etiqueta nunca usa uma cópia antiga do objeto do aluno.
    window.uniformStateByStudent = new Map(canonicalUniformState);
    students.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    updateUniformSummary();
    classStudents?.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    // Recrie a lista e o card com o estado de Uniforme que acabou de chegar.
    // Isso evita que uma renderização anterior (sem esses campos) deixe de
    // mostrar as etiquetas, mesmo quando os contadores já estão corretos.
    // A lista principal já usa estes dados em memória. Não a redesenhe a
    // cada resposta de Uniforme: isso evitou a piscada da tela inteira.
  }
  async function fetchEveryUniformState() {
    const pageSize = 1000;
    const records = [];
    for (let from = 0; ; from += pageSize) {
      const result = await db.from('students')
        .select('id,uniform_pending,uniform_received,shoes_received,material_received')
        .order('created_at', { ascending:false })
        .order('id', { ascending:false })
        .range(from, from + pageSize - 1);
      if (result.error) return result;
      records.push(...(result.data || []));
      if ((result.data || []).length < pageSize) return { data:records, error:null };
    }
  }

  async function refreshUniformState({ renderWhenOpen = true } = {}) {
    const requestId = ++uniformStateRequest;
    const { data, error } = await fetchEveryUniformState();
    if (requestId !== uniformStateRequest) return false;
    if (error) {
      // Sem a coluna no banco, não há como calcular nem mostrar a situação.
      // Avise de forma explícita, em vez de deixar contadores silenciosamente em zero.
      if (!uniformStateErrorShown) {
        uniformStateErrorShown = true;
        toast(error.message.includes('material_received')
          ? 'Execute o novo script supabase-uniform-material.sql no Supabase para ativar o controle de material.'
          : error.message.includes('uniform_pending')
          ? 'O controle de Uniforme ainda não foi instalado no banco. Execute o arquivo supabase-uniform-management.sql.'
          : `Não foi possível atualizar o Uniforme: ${error.message}`);
      }
      updateUniformSummary(students);
      return false;
    }
    uniformStateErrorShown = false;
    syncUniformState(data || []);
    if (renderWhenOpen && !modal.classList.contains('hidden')) render();
    return true;
  }

  function uniformStatusFor(studentId) {
    // O retorno específico de Uniforme é a fonte autoritativa. A lista
    // principal pode terminar de carregar depois dele e conter estado antigo.
    const source = uniformRecords.find(item => item.id === studentId)
      || students.find(item => item.id === studentId)
      || classStudents?.find(item => item.id === studentId);
    return pending(source);
  }

  // As etiquetas de situação ficam exclusivamente dentro desta tela.
  // A lista de alunos e o card de detalhes mantêm suas informações próprias.
  function paintStudentCards() {}

  function classOptions() {
    const select = get('uniformClass'); const current = select.value;
    const selectedShift = get('uniformShift').value;
    const available = classes.filter(item => !selectedShift || (item.shift || 'Matutino') === selectedShift);
    select.innerHTML = '<option value="">Todas as turmas</option>' + available.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }
  const uniformViewLabels = { uniform:'Sem uniforme', shoes:'Sem tênis', both:'Sem os dois', material:'Sem material', pending:'Pendentes' };
  function updateActiveFilterIndicator({ shift, classId, view, query, matchedByView, visibleCount }) {
    const indicator = get('uniformActiveFilter');
    const parts = [];
    if (shift) parts.push(`Turno ${shift}`);
    if (classId) { const cls = classes.find(item => item.id === classId); if (cls) parts.push(`Turma ${cls.name}`); }
    if (view !== 'all') parts.push(uniformViewLabels[view] || view);
    // Sem nenhum filtro específico e sem busca: nada de específico para
    // mostrar — não cria informação visual redundante ("mostrando tudo").
    if (!parts.length && !query) {
      indicator.classList.add('hidden');
      indicator.textContent = '';
      return;
    }
    indicator.classList.remove('hidden');
    const base = parts.length ? parts.join(' • ') : 'Busca';
    const countLabel = `${matchedByView} aluno${matchedByView === 1 ? '' : 's'}`;
    const searchSuffix = query && visibleCount !== matchedByView ? ` • mostrando ${visibleCount} com a busca atual` : '';
    indicator.textContent = `${base} — ${countLabel}${searchSuffix}`;
  }
  function render() {
    classOptions();
    const bulkAccess = bulkUniformAccess();
    get('markAllUniformReceived').classList.toggle('hidden', !bulkAccess.allowed);
    // Os contadores são sempre gerais; os filtros abaixo servem apenas para
    // definir quais alunos aparecem na lista.
    updateUniformSummary();
    const shift = get('uniformShift').value, classId = get('uniformClass').value, view = get('uniformView').value, query = get('uniformSearch').value.trim().toLocaleLowerCase('pt-BR');
    if (!shift && !classId) {
      get('uniformActiveFilter').classList.add('hidden');
      get('uniformList').innerHTML = '<div class="uniform-empty">Escolha um turno ou uma turma para ver os alunos.</div>';
      return;
    }
    if (classStudents === null) {
      get('uniformActiveFilter').classList.add('hidden');
      get('uniformList').innerHTML = '<div class="uniform-empty">Carregando alunos da turma…</div>';
      return;
    }
    // A tela de Uniforme deve manter todos os alunos da turma juntos e em
    // ordem alfabética, independentemente da data em que foram cadastrados.
    const matchedByView = classStudents.filter(item => {
      const type = pending(item);
      const missingMaterial = materialPending(item);
      if (view === 'all') return true;
      if (view === 'pending') return !!type || missingMaterial;
      if (view === 'material') return missingMaterial;
      return type === view;
    });
    const visible = matchedByView.filter(item => !query || item.name.toLocaleLowerCase('pt-BR').includes(query))
      .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));
    updateActiveFilterIndicator({ shift, classId, view, query, matchedByView:matchedByView.length, visibleCount:visible.length });
    get('uniformList').innerHTML = visible.length ? visible.map(item => {
      const type = pending(item), missingMaterial = materialPending(item), statuses = statusesFor(item);
      const statusHtml = statuses.length ? `<div class="uniform-statuses">${statuses.map(status => `<span class="uniform-status pending">${labels[status]}</span>`).join('')}</div>` : '<span class="uniform-status received">✓ Recebeu</span>';
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student">${avatarHtml(item)}<div><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div></div><div>${statusHtml}</div>${canRegisterUniform(item) ? `<div class="uniform-action"><select class="uniform-select" aria-label="Registrar situação de uniforme e tênis"><option value="" ${!type ? 'selected' : ''}>Uniforme e tênis: recebeu</option><option value="uniform" ${type === 'uniform' ? 'selected' : ''}>Não recebeu uniforme</option><option value="shoes" ${type === 'shoes' ? 'selected' : ''}>Não recebeu tênis</option><option value="both" ${type === 'both' ? 'selected' : ''}>Não recebeu uniforme e tênis</option></select><select class="material-select" aria-label="Registrar situação de material"><option value="" ${!missingMaterial ? 'selected' : ''}>Material: recebeu</option><option value="material" ${missingMaterial ? 'selected' : ''}>Não recebeu material</option></select></div>` : '<div class="meta">Consulta disponível.</div>'}</article>`;
    }).join('') : `<div class="uniform-empty">Nenhum aluno corresponde a este filtro.<br><br>${view !== 'all' ? 'Use “Todos os alunos da turma” para ver cada aluno e registrar a situação.' : 'Esta turma ainda não possui alunos cadastrados.'}</div>`;
    observeUniformPhotos(get('uniformList'));
    setTimeout(paintStudentCards, 0);
  }
  async function loadClassStudents() {
    const classId = get('uniformClass').value;
    const shift = get('uniformShift').value;
    const requestId = ++classStudentsRequest;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = selectedClassName(classes.find(item => item.id === classId)?.name);
    if (!classId && !shift) {
      classStudents = [];
      render();
      return;
    }
    // A lista principal já contém todos os alunos. Reaproveitá-la evita uma
    // segunda consulta completa que desmontava a janela e causava piscadas.
    classStudents = students
      .filter(item => (!classId || item.classId === classId || selectedClassName(item.className) === selectedTargetName) && (!shift || shiftForStudent(item) === shift))
      .map(item => ({ ...item }));
    if (requestId === classStudentsRequest) render();
  }
  async function open() {
    if (!canAccessUniform()) { toast('O administrador precisa liberar o acesso ao Controle de Itens para este coordenador.'); return; }
    // NUNCA chame window.load?.() aqui: é a carga completa da tela principal
    // (todos os alunos, todas as turmas, e — em student-edit-improvements.js —
    // zera photoUrl de todo mundo antes de recarregar sob demanda), então
    // reexecutá-la só para abrir esta janela recarrega a página inteira por
    // trás (fotos da lista principal somem e voltam) e atrasa a abertura em
    // segundos, sem necessidade: students/classes já são mantidos
    // atualizados pelo ciclo de vida normal do app. Só o estado específico de
    // Uniforme (colunas próprias, leves) precisa ser garantido fresco aqui.
    uniformButton.disabled = true;
    try {
      await refreshUniformState({ renderWhenOpen:false });
      classOptions();
      setUniformMode('items');
      modal.classList.remove('hidden');
      if (get('uniformClass').value || get('uniformShift').value) await loadClassStudents();
      else classStudents = [];
      render();
    } finally {
      uniformButton.disabled = false;
    }
  }
  const syncUniformNavigation = () => {
    const allowed = canAccessUniform();
    uniformButton.classList.toggle('hidden', !allowed);
    uniformButton.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };
  uniformButton.onclick = open; get('closeUniform').onclick = () => modal.classList.add('hidden'); modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('uniformShift').onchange = () => { classOptions(); loadClassStudents(); };
  get('uniformClass').onchange = loadClassStudents;
  get('uniformView').onchange = render;
  get('uniformSearch').oninput = render;
  get('uniformShiftSummary').onclick = event => {
    const button = event.target.closest('button.uniform-shift-cell');
    if (!button || button.disabled) return;
    const shift = button.dataset.shift, view = button.dataset.view;
    const alreadyActive = get('uniformShift').value === shift && get('uniformView').value === view;
    const nextShift = alreadyActive ? '' : shift;
    get('uniformShift').value = nextShift;
    get('uniformView').value = alreadyActive ? 'all' : view;
    // Busca nunca é limpa automaticamente. Turma é preservada só quando ainda
    // compatível com o turno resultante; ao desativar o filtro (toggle-off,
    // nextShift vazio), a turma já escolhida também é preservada.
    const currentClassId = get('uniformClass').value;
    if (currentClassId && nextShift && shiftForClass(currentClassId) !== nextShift) {
      get('uniformClass').value = '';
    }
    classOptions();
    loadClassStudents();
  };
  get('uniformList').onchange = async event => {
    const select = event.target.closest('.uniform-select, .material-select'); if (!select) return;
    const row = select.closest('.uniform-row'); const student = classStudents?.find(item => item.id === row.dataset.id) || students.find(item => item.id === row.dataset.id);
    if (!canRegisterUniform(student)) return;
    const isMaterial = select.classList.contains('material-select');
    const type = select.value;
    select.disabled = true;
    const nextState = isMaterial
      ? { material_received:type !== 'material' }
      : {
          uniform_pending: type || null,
          uniform_received: type !== 'uniform' && type !== 'both',
          shoes_received: type !== 'shoes' && type !== 'both'
        };
    const { error } = await db.from('students').update(nextState).eq('id', row.dataset.id);
    if (error) { toast(error.message.includes('material_received') ? 'Execute o script supabase-uniform-material.sql no Supabase.' : error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message); select.disabled = false; return; }
    // Atualização imediata: contadores, lista e etiqueta não dependem de uma
    // nova abertura da janela nem de uma atualização posterior da página.
    const updateLocalStatus = item => {
      if (item?.id !== row.dataset.id) return;
      Object.assign(item, nextState);
      if (!isMaterial) item.uniform_pending = type || '';
    };
    students.forEach(updateLocalStatus);
    classStudents?.forEach(updateLocalStatus);
    uniformRecords.forEach(updateLocalStatus);
    // Invalida qualquer consulta iniciada antes desta alteração. Ela não pode
    // mais voltar e desfazer apenas o contador deste aluno.
    uniformStateRequest += 1;
    locallyUpdatedUniformIds.add(row.dataset.id);
    canonicalUniformState.set(row.dataset.id, { id:row.dataset.id, ...(canonicalUniformState.get(row.dataset.id) || {}), ...nextState, ...(!isMaterial ? { uniform_pending:type || '' } : {}) });
    window.uniformStateByStudent ||= new Map();
    window.uniformStateByStudent.set(row.dataset.id, canonicalUniformState.get(row.dataset.id));
    updateUniformSummary();
    render();
    toast(type ? 'Pendência registrada.' : 'Aluno marcado como recebeu.');
  };
  get('markAllUniformReceived').onclick = async () => {
    const access = bulkUniformAccess();
    if (!access.allowed) return;
    if (!access.classId) { toast('Selecione uma turma para usar esta ação.'); return; }
    if (!access.ids.length) { toast('Selecione uma turma com alunos para usar esta ação.'); return; }
    if (!confirm('Marcar todos os alunos desta turma como receberam uniforme, tênis e material?')) return;
    const button = get('markAllUniformReceived');
    button.disabled = true;
    const nextState = { uniform_pending:null, uniform_received:true, shoes_received:true, material_received:true };
    const { error } = await db.rpc('mark_all_uniform_received', { target_class_id:access.classId });
    if (error) {
      button.disabled = false;
      toast(error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message);
      return;
    }
    const markReceived = item => {
      if (!item) return;
      item.uniform_pending = '';
      item.uniform_received = true;
      item.shoes_received = true;
      item.material_received = true;
    };
    const affectedIds = new Set(access.ids);
    const markAffectedReceived = item => { if (affectedIds.has(item?.id)) markReceived(item); };
    students.forEach(markAffectedReceived);
    uniformRecords.forEach(markAffectedReceived);
    classStudents?.forEach(markAffectedReceived);
    uniformStateRequest += 1;
    students.forEach(item => {
      if (affectedIds.has(item?.id)) {
        locallyUpdatedUniformIds.add(item.id);
        canonicalUniformState.set(item.id, { id:item.id, ...nextState });
      }
    });
    window.uniformStateByStudent = new Map(canonicalUniformState);
    // Atualização visual imediata: não espere uma consulta, evento em tempo
    // real ou troca de turma para refletir a alteração concluída.
    updateUniformSummary();
    render();
    button.disabled = false;
    toast('Todos os alunos da turma foram marcados como receberam.');
  };
  // ------------------------------------------------------------------
  // Livro/Revisa — núcleo funcional (área própria dentro de Uniforme,
  // não misturada aos contadores/filtros de uniforme/tênis/material).
  // Mesmas permissões já corrigidas: can_view_uniform (ver a aba) e
  // can_edit_uniform (registrar/corrigir/finalizar) — sem flag nova.
  // ------------------------------------------------------------------
  let livroRevisaTerms = new Map(); // chave `${ano}_${bimestre}` -> {starts_on, ends_on}
  let livroRevisaDeliveries = new Map(); // chave `${student_id}_${ano}_${bimestre}` -> linha real
  let livroRevisaClassStudents = [];

  const formatLivroRevisaDate = value => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '';

  // Ausência de linha NUNCA significa "não recebido" — só os dois primeiros
  // estados abaixo têm linha real; os outros três são sempre derivados na
  // leitura, comparando com o calendário (school_terms).
  function deriveLivroRevisaState(row, term) {
    if (!term) return 'sem_calendario';
    if (row) return row.status;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (term.starts_on > todayIso) return 'nao_iniciado';
    return 'sem_informacao';
  }
  window.deriveLivroRevisaState = deriveLivroRevisaState;

  const livroRevisaStateLabel = (state, row) => {
    if (state === 'recebido') return `Recebido em ${formatLivroRevisaDate(row?.delivered_at)}`;
    if (state === 'nao_recebido') return 'Não recebido.';
    if (state === 'nao_iniciado') return 'Bimestre não iniciado.';
    if (state === 'sem_calendario') return 'Calendário letivo não configurado para este período.';
    return 'Não há informação neste período.';
  };
  window.livroRevisaStateLabel = livroRevisaStateLabel;

  const livroRevisaTermFor = (year, bimester) => livroRevisaTerms.get(`${year}_${bimester}`) || null;

  const currentLivroRevisaSelection = () => ({
    classId: get('livroRevisaClass').value || null,
    year: Number(get('livroRevisaYear').value) || null,
    bimester: Number(get('livroRevisaBimester').value) || null
  });

  function livroRevisaClassOptions() {
    const select = get('livroRevisaClass');
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma</option>' + classes.slice()
      .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }))
      .map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }

  async function refreshLivroRevisaTerms() {
    livroRevisaTerms = new Map();
    if (!uniformMembership) return;
    const { data, error } = await db.from('school_terms').select('school_year,bimester,starts_on,ends_on').eq('school_id', uniformMembership.school_id);
    if (error) return;
    (data || []).forEach(term => { livroRevisaTerms.set(`${term.school_year}_${term.bimester}`, term); });
  }

  async function loadLivroRevisaDeliveries(studentIds) {
    livroRevisaDeliveries = new Map();
    if (!studentIds.length) return;
    const { data, error } = await db.rpc('report_livro_revisa', { p_student_ids: studentIds });
    if (error) { toast(error.message); return; }
    (data || []).forEach(row => { livroRevisaDeliveries.set(`${row.student_id}_${row.school_year}_${row.bimester}`, row); });
  }

  function renderLivroRevisaPanel() {
    const { classId, year, bimester } = currentLivroRevisaSelection();
    const notice = get('livroRevisaNotice');
    const columns = get('livroRevisaColumns');
    const list = get('livroRevisaList');
    const finalizeButton = get('finalizeLivroRevisa');

    if (!classId || !year || !bimester) {
      columns.classList.add('hidden');
      notice.classList.add('hidden');
      finalizeButton.disabled = true;
      finalizeButton.title = 'Escolha turma, ano letivo e bimestre antes de finalizar a conferência.';
      list.innerHTML = '<div class="uniform-empty">Escolha turma, ano letivo e bimestre para ver os alunos.</div>';
      return;
    }

    const term = livroRevisaTermFor(year, bimester);
    // O mesmo bloqueio que a RPC já aplica no banco (bimestre precisa existir
    // E já ter começado) tem que valer aqui — nunca deixar ✓/✕/Finalizar
    // habilitados para um período que a escrita real recusaria. O calendário
    // é pré-requisito legítimo, não uma falha — mas o botão desabilitado
    // sozinho parece quebrado, então o motivo exato fica sempre visível no
    // aviso acima da lista E no title do próprio botão (funciona mesmo se o
    // aviso ficar fora da viewport em telas pequenas).
    const termStarted = !!term && term.starts_on <= new Date().toISOString().slice(0, 10);
    notice.classList.toggle('hidden', termStarted);
    if (!termStarted) notice.textContent = term ? 'Bimestre ainda não iniciado — aguarde a data de início configurada.' : 'Calendário letivo não configurado para este período. Configure em Permissões → Permissões avançadas → Calendário letivo.';

    livroRevisaClassStudents = students.filter(item => item.classId === classId)
      .slice().sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));

    columns.classList.toggle('hidden', livroRevisaClassStudents.length === 0);
    const canRegisterHere = canRegisterUniform() && termStarted;
    finalizeButton.disabled = !canRegisterUniform() || !termStarted;
    finalizeButton.title = !canRegisterUniform()
      ? 'Sem permissão para finalizar a conferência.'
      : !termStarted
        ? (term ? 'Bimestre ainda não iniciado — aguarde a data de início configurada.' : 'Calendário letivo não configurado para este período. Configure em Permissões → Permissões avançadas → Calendário letivo.')
        : 'Notifica administradores e coordenadores sobre os alunos ainda marcados como não recebido nesta turma/bimestre.';

    list.innerHTML = livroRevisaClassStudents.length ? livroRevisaClassStudents.map(item => {
      const row = livroRevisaDeliveries.get(`${item.id}_${year}_${bimester}`) || null;
      const state = deriveLivroRevisaState(row, term);
      const isReceived = state === 'recebido', isNotReceived = state === 'nao_recebido';
      const statusClass = isReceived ? 'received' : 'pending';
      const statusHtml = `<span class="uniform-status ${statusClass}">${escape(livroRevisaStateLabel(state, row))}</span>`;
      const actionsHtml = canRegisterHere
        ? `<div class="livro-revisa-toggle"><button type="button" class="livro-revisa-check ${isReceived ? 'active' : ''}" data-student-id="${item.id}" data-status="recebido" aria-pressed="${isReceived}" aria-label="Marcar ${escape(item.name)} como recebido">✓</button><button type="button" class="livro-revisa-cross ${isNotReceived ? 'active' : ''}" data-student-id="${item.id}" data-status="nao_recebido" aria-pressed="${isNotReceived}" aria-label="Marcar ${escape(item.name)} como não recebido">✕</button></div>`
        : '<div class="meta">Consulta disponível.</div>';
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student">${avatarHtml(item)}<div><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div></div><div>${statusHtml}</div>${actionsHtml}</article>`;
    }).join('') : '<div class="uniform-empty">Esta turma ainda não possui alunos cadastrados.</div>';
    observeUniformPhotos(list);
  }

  async function refreshLivroRevisaForClass() {
    const { classId } = currentLivroRevisaSelection();
    livroRevisaDeliveries = new Map();
    if (classId) {
      const ids = students.filter(item => item.classId === classId).map(item => item.id);
      await loadLivroRevisaDeliveries(ids);
    }
    renderLivroRevisaPanel();
  }

  function setUniformMode(mode) {
    const isItems = mode !== 'livro_revisa';
    get('uniformModeItems').classList.toggle('active', isItems);
    get('uniformModeItems').setAttribute('aria-pressed', String(isItems));
    get('uniformModeLivroRevisa').classList.toggle('active', !isItems);
    get('uniformModeLivroRevisa').setAttribute('aria-pressed', String(!isItems));
    get('uniformItemsPanel').classList.toggle('hidden', !isItems);
    get('livroRevisaPanel').classList.toggle('hidden', isItems);
    if (!isItems) {
      if (!get('livroRevisaYear').value) get('livroRevisaYear').value = String(new Date().getFullYear());
      livroRevisaClassOptions();
      refreshLivroRevisaTerms().then(() => refreshLivroRevisaForClass());
    }
  }

  get('uniformModeItems').onclick = () => setUniformMode('items');
  get('uniformModeLivroRevisa').onclick = () => setUniformMode('livro_revisa');
  get('livroRevisaClass').onchange = refreshLivroRevisaForClass;
  get('livroRevisaYear').onchange = renderLivroRevisaPanel;
  get('livroRevisaBimester').onchange = renderLivroRevisaPanel;
  get('livroRevisaList').onclick = async event => {
    const button = event.target.closest('.livro-revisa-check, .livro-revisa-cross');
    if (!button || button.disabled) return;
    const { classId, year, bimester } = currentLivroRevisaSelection();
    if (!classId || !year || !bimester || !canRegisterUniform()) return;
    const studentId = button.dataset.studentId, status = button.dataset.status;
    button.disabled = true;
    const { error } = await db.rpc('set_livro_revisa_status', { target_student_id:studentId, p_school_year:year, p_bimester:bimester, p_status:status });
    if (error) { toast(error.message); button.disabled = false; return; }
    await loadLivroRevisaDeliveries(livroRevisaClassStudents.map(item => item.id));
    renderLivroRevisaPanel();
    toast(status === 'recebido' ? 'Aluno marcado como recebido.' : 'Pendência registrada.');
  };
  get('finalizeLivroRevisa').onclick = async () => {
    const { classId, year, bimester } = currentLivroRevisaSelection();
    if (!classId || !year || !bimester || !canRegisterUniform()) return;
    const button = get('finalizeLivroRevisa');
    button.disabled = true;
    const { error } = await db.rpc('notify_livro_revisa_pending', { target_class_id:classId, p_school_year:year, p_bimester:bimester });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    toast('Conferência finalizada.');
  };

  document.addEventListener('carometro:data-loaded', async () => {
    // O carregamento principal já trouxe os campos de Uniforme. Reutilize-o
    // em vez de iniciar uma segunda consulta que possa chegar fora de ordem.
    syncUniformState(students.map(student => ({
      id:student.id,
      uniform_pending:student.uniform_pending,
      uniform_received:student.uniform_received,
      shoes_received:student.shoes_received,
      material_received:student.material_received
    })), { preserveLocal:true });
    await refreshUniformMembership();
    syncUniformNavigation();
    if (!modal.classList.contains('hidden')) { classOptions(); loadClassStudents(); }
    if (!modal.classList.contains('hidden') && !get('livroRevisaPanel').classList.contains('hidden')) { await refreshLivroRevisaTerms(); await refreshLivroRevisaForClass(); }
  });
  document.addEventListener('carometro:permission-refresh', async () => {
    await refreshUniformMembership();
    syncUniformNavigation();
    if (!modal.classList.contains('hidden')) render();
    if (!modal.classList.contains('hidden') && !get('livroRevisaPanel').classList.contains('hidden')) renderLivroRevisaPanel();
  });
  new MutationObserver(syncUniformNavigation).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  setTimeout(syncUniformNavigation, 0);

});
