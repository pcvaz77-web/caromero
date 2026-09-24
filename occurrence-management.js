document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const uniformNav = document.getElementById('uniformNav');
  if (!nav || !uniformNav) return;

  const occurrenceButton = document.createElement('button');
  occurrenceButton.id = 'occurrenceNav';
  occurrenceButton.type = 'button';
  occurrenceButton.className = 'hidden';
  occurrenceButton.hidden = true;
  occurrenceButton.setAttribute('aria-hidden', 'true');
  occurrenceButton.style.setProperty('display', 'none', 'important');
  occurrenceButton.innerHTML = '<span>● &nbsp; Ocorrência</span>';
  uniformNav.insertAdjacentElement('afterend', occurrenceButton);

  const modal = document.createElement('div');
  modal.id = 'occurrenceModal';
  modal.className = 'modal-bg occurrence-modal hidden';
  modal.innerHTML = `<section class="modal occurrence-dialog"><div class="modal-head"><div><h3>Ocorrência</h3><div class="meta">Registre e consulte ocorrências por aluno e por data.</div></div><button class="close" id="closeOccurrence" type="button" aria-label="Fechar">×</button></div><div class="form occurrence-form"><div class="occurrence-grid"><div class="field"><label for="occurrenceClass">Turma</label><select id="occurrenceClass"><option value="">Selecione uma turma</option></select></div><div class="field"><label for="occurrenceStudent">Aluno</label><select id="occurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></div></div><div class="field occurrence-date-field"><label for="occurrenceDate">Data da nova ocorrência</label><input id="occurrenceDate" type="date"></div><div class="field"><label for="occurrenceText">Descrição</label><textarea id="occurrenceText" maxlength="500" placeholder="Descreva a ocorrência em até 500 caracteres."></textarea><div class="occurrence-text-meta"><span id="occurrenceTextCount">0/500</span><span>A ocorrência fica visível somente nesta aba.</span></div></div><div class="occurrence-attachment-field"><button class="btn secondary occurrence-attachment-picker" id="occurrenceAttachmentPicker" type="button">📎 Anexar documento</button><div id="occurrenceAttachmentState" class="occurrence-attachment-state"><span>Foto ou PDF, até 10 MB.</span></div></div><div class="actions occurrence-actions"><button class="btn secondary" id="searchOccurrences" type="button" aria-expanded="false">Buscar Ocorrência</button><button class="btn primary" id="saveOccurrence" type="button">Salvar ocorrência</button></div><div id="occurrenceDateFilters" class="occurrence-date-filters hidden"><div class="occurrence-grid occurrence-dates"><div class="field"><label for="occurrenceStart">Buscar a partir de</label><input id="occurrenceStart" type="date"></div><div class="field"><label for="occurrenceEnd">Buscar até</label><input id="occurrenceEnd" type="date"></div></div><div class="occurrence-grid occurrence-search-fields"><div class="field"><label for="occurrenceSearchClass">Buscar por turma</label><select id="occurrenceSearchClass"><option value="">Todas as turmas</option></select></div><div class="field"><label for="occurrenceSearchName">Buscar por nome</label><input id="occurrenceSearchName" placeholder="Digite o nome do aluno"></div></div><div class="meta">Os resultados são atualizados assim que você escolher os filtros.</div></div><section class="occurrence-history"><div class="occurrence-history-head"><div><b>Ocorrências registradas</b><div class="meta" id="occurrenceHistoryMeta">Selecione uma turma ou aluno para consultar.</div></div></div><div id="occurrenceHistoryList" class="occurrence-history-list"></div></section></div></section>`;
  document.body.appendChild(modal);

  const attachmentModal = document.createElement('div');
  attachmentModal.id = 'occurrenceAttachmentModal';
  attachmentModal.className = 'modal-bg occurrence-attachment-modal hidden';
  attachmentModal.innerHTML = `<section class="modal occurrence-attachment-dialog"><div class="modal-head"><div><h3>Incluir documento</h3><div class="meta">Anexe uma foto da ata ou um arquivo PDF.</div></div><button class="close" id="closeOccurrenceAttachment" type="button" aria-label="Fechar">×</button></div><div class="form occurrence-attachment-body"><div class="field"><label>Arquivo</label><input id="occurrenceAttachmentInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><button class="btn secondary occurrence-file-select" id="occurrenceFileSelect" type="button">Selecionar arquivo</button><div id="occurrenceAttachmentDraft" class="occurrence-attachment-draft">Nenhum arquivo selecionado.</div></div><div class="actions occurrence-attachment-dialog-actions"><button class="btn secondary" id="cancelOccurrenceAttachment" type="button">Sair</button><button class="btn primary" id="confirmOccurrenceAttachment" type="button" disabled>Incluir documento</button></div></div></section>`;
  document.body.appendChild(attachmentModal);

  const remarkModal = document.createElement('div');
  remarkModal.id = 'occurrenceRemarkModal';
  remarkModal.className = 'modal-bg occurrence-remark-modal hidden';
  remarkModal.innerHTML = `<section class="modal occurrence-remark-dialog"><div class="modal-head"><div><h3>Nova ressalva</h3><div class="meta">A ressalva será acrescentada ao registro original com seu nome, data e hora.</div></div><button class="close" id="closeOccurrenceRemark" type="button" aria-label="Fechar">×</button></div><div class="form"><div class="field"><label for="occurrenceRemarkText">Texto da ressalva</label><textarea id="occurrenceRemarkText" maxlength="1000" placeholder="Descreva a correção ou complemento."></textarea><div class="meta"><span id="occurrenceRemarkCount">0/1000</span></div></div><div class="actions"><button class="btn secondary" id="cancelOccurrenceRemark" type="button">Cancelar</button><button class="btn primary" id="saveOccurrenceRemark" type="button">Registrar ressalva</button></div></div></section>`;
  document.body.appendChild(remarkModal);

  // Confirmação de exclusão dedicada: substitui o confirm() nativo, que só
  // mostrava a data, por um resumo que identifica inequivocamente o registro
  // (aluno, data do fato, autor, data/hora real de registro e um trecho do
  // texto) — evita excluir o registro errado quando há ocorrências parecidas
  // para o mesmo aluno. Não altera autoria/permissão nem o DELETE em si,
  // que continua sendo feito pelo id exato da ocorrência sob a RLS existente.
  const deleteConfirmModal = document.createElement('div');
  deleteConfirmModal.id = 'occurrenceDeleteConfirmModal';
  deleteConfirmModal.className = 'modal-bg occurrence-delete-confirm-modal hidden';
  deleteConfirmModal.innerHTML = `<section class="modal occurrence-delete-confirm-dialog"><div class="modal-head"><div><h3>Excluir ocorrência?</h3></div></div><div class="form occurrence-delete-confirm-body"><dl class="occurrence-delete-confirm-details"><div><dt>Aluno</dt><dd id="occurrenceDeleteConfirmStudent"></dd></div><div><dt>Ocorrência</dt><dd id="occurrenceDeleteConfirmDate"></dd></div><div><dt>Registrada por</dt><dd id="occurrenceDeleteConfirmAuthor"></dd></div><div><dt>Registrada em</dt><dd id="occurrenceDeleteConfirmCreatedAt"></dd></div></dl><blockquote id="occurrenceDeleteConfirmText" class="occurrence-delete-confirm-text"></blockquote><p class="occurrence-delete-confirm-warning">Esta ação não poderá ser desfeita. As ressalvas deste registro também serão excluídas.</p><div class="actions occurrence-delete-confirm-actions"><button class="btn secondary" id="occurrenceDeleteConfirmCancel" type="button">Cancelar</button><button class="btn occurrence-delete-confirm-submit" id="occurrenceDeleteConfirmSubmit" type="button">Excluir ocorrência</button></div></div></section>`;
  document.body.appendChild(deleteConfirmModal);

  const style = document.createElement('style');
  style.textContent = `
    #occurrenceRemarkModal.occurrence-remark-modal { z-index:240!important; }.occurrence-remark-dialog { width:min(520px,100%); }.occurrence-remark-dialog textarea { min-height:130px; }.occurrence-remarks { display:grid; gap:8px; margin-top:10px; }.occurrence-remark { padding:10px 12px; border-left:3px solid #4165eb; border-radius:6px; background:#f3f6ff; }.occurrence-remark b { font-size:12px; }.occurrence-remark p { margin:5px 0 0; white-space:pre-wrap; font-size:13px; }.occurrence-remark-action { background:#eef2ff; color:#214dba; }.occurrence-item-footer { border-top:1px solid #dbe4f5; margin-top:12px; padding-top:10px; }.occurrence-item-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }.occurrence-item-meta .occurrence-responsible,.occurrence-item-meta .occurrence-updated { margin:0; }
    #occurrenceNav { border:0; background:#2b3c5d; color:#fff; } #occurrenceNav:hover { background:#38527e; }
    .occurrence-item-focused { outline:2px solid #2b3c5d; box-shadow:0 0 0 3px rgba(43,60,93,.18); }
    #occurrenceDeleteConfirmModal.occurrence-delete-confirm-modal,#occurrenceAttachmentModal.occurrence-attachment-modal { z-index:240!important; }.occurrence-delete-confirm-dialog { width:min(460px,100%); }.occurrence-delete-confirm-body { padding:20px 24px 24px; }.occurrence-delete-confirm-details { display:grid; gap:7px; margin:0 0 14px; }.occurrence-delete-confirm-details > div { display:flex; justify-content:space-between; align-items:baseline; gap:12px; font-size:13px; }.occurrence-delete-confirm-details dt { margin:0; color:var(--muted); font-weight:650; flex:0 0 auto; }.occurrence-delete-confirm-details dd { margin:0; font-weight:750; text-align:right; }.occurrence-delete-confirm-text { margin:0 0 16px; padding:10px 12px; border-left:3px solid #dbe4f5; border-radius:4px; background:#f8faff; font-size:13px; line-height:1.45; white-space:pre-wrap; color:#344054; }.occurrence-delete-confirm-warning { margin:0 0 16px; font-size:13px; font-weight:750; color:#b42318; }.occurrence-delete-confirm-actions { justify-content:flex-end; gap:10px; }.occurrence-delete-confirm-actions .occurrence-delete-confirm-submit { background:#b42318; color:#fff; }.occurrence-delete-confirm-actions .occurrence-delete-confirm-submit:hover { background:#932016; }.occurrence-attachment-dialog { width:min(470px,100%); }.occurrence-attachment-body { padding:20px 24px 24px; }.occurrence-file-select { width:max-content; margin-top:8px; }.occurrence-attachment-draft { min-height:36px; margin-top:12px; padding:9px 11px; border:1px dashed #c9d6ee; border-radius:8px; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }.occurrence-attachment-dialog-actions { justify-content:flex-end; gap:8px; margin-top:18px; }
    @media(max-width:800px) { .occurrence-delete-confirm-dialog,.occurrence-attachment-dialog { width:100%; } .occurrence-delete-confirm-actions,.occurrence-attachment-dialog-actions { display:grid; grid-template-columns:1fr; gap:8px; } .occurrence-delete-confirm-actions .btn,.occurrence-attachment-dialog-actions .btn { width:100%; } }
    #occurrenceModal.occurrence-modal { z-index:230!important; }.occurrence-dialog { width:min(820px,100%); }.occurrence-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:12px; }.occurrence-dates,.occurrence-search-fields { grid-template-columns:1fr 1fr; }.occurrence-date-field { max-width:260px; }.occurrence-date-filters { margin-top:14px; padding:14px; border:1px solid #dbe4f5; border-radius:10px; background:#f8faff; }.occurrence-date-filters .field { margin-bottom:7px; }.occurrence-form textarea { min-height:120px; }.occurrence-text-meta { display:flex; justify-content:space-between; gap:10px; margin-top:6px; color:var(--muted); font-size:12px; }.occurrence-attachment-field { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:12px; }.occurrence-attachment-picker { min-height:38px; }.occurrence-attachment-state { display:flex; align-items:center; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }.occurrence-attachment-state strong { color:#344054; }.occurrence-attachment-remove { border:0; background:#fff0ed; color:#b42318; border-radius:6px; padding:5px 8px; font-weight:750; cursor:pointer; }.occurrence-actions { justify-content:space-between; }.occurrence-history { margin-top:22px; border-top:1px solid var(--line); padding-top:18px; }.occurrence-history-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:11px; }.occurrence-history-list { display:grid; gap:9px; max-height:290px; overflow:auto; padding-right:3px; }.occurrence-item { border:1px solid var(--line); border-radius:9px; padding:12px; background:#fafbfc; }.occurrence-item-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:7px; }.occurrence-item-date { color:#344054; font-size:13px; font-weight:800; }.occurrence-item-actions { display:flex; gap:6px; margin-left:auto; }.occurrence-item-actions button { min-height:29px; padding:5px 8px; border-radius:6px; font-size:12px; font-weight:750; }.occurrence-edit { background:#e8efff; color:#214dba; }.occurrence-delete { background:#fff0ed; color:#b42318; }.occurrence-item-student { color:var(--muted); font-size:12px; }.occurrence-item-text { white-space:pre-wrap; line-height:1.45; font-size:14px; }.occurrence-item-attachment { display:inline-flex; align-items:center; gap:6px; margin-top:10px; border:1px solid #c9d6ee; border-radius:8px; background:#f2f6ff; color:#214dba; padding:7px 10px; font-size:12px; font-weight:800; cursor:pointer; }.occurrence-responsible { display:inline-flex; width:max-content; max-width:100%; margin-top:9px; padding:4px 8px; border-radius:99px; background:#172b4d; color:#fff; font-size:11px; font-weight:800; line-height:1.25; overflow-wrap:anywhere; }.occurrence-updated { display:inline-flex; width:max-content; max-width:100%; margin-top:6px; margin-left:6px; padding:4px 8px; border-radius:99px; background:#eef2f8; color:#344054; font-size:11px; font-weight:750; line-height:1.25; overflow-wrap:anywhere; }.occurrence-empty { padding:23px 10px; color:var(--muted); text-align:center; }.occurrence-label { display:inline-flex; width:max-content; margin-top:6px; padding:4px 8px; border-radius:99px; background:#101828; color:#fff; font-size:11px; font-weight:800; line-height:1.15; }.occurrence-detail-label { align-items:center; justify-content:center; gap:10px; min-height:44px; margin-top:11px; padding:11px 16px; border:1px solid #294985; border-radius:10px; background:#172b4d; font-family:inherit; font-size:14px; font-weight:850; letter-spacing:.01em; cursor:pointer; box-shadow:0 3px 8px rgba(16,24,40,.22); transition:background-color .16s ease, transform .16s ease, box-shadow .16s ease; }.occurrence-detail-label::after { content:'→'; display:grid; place-items:center; width:23px; height:23px; border-radius:6px; background:rgba(255,255,255,.14); font-size:16px; line-height:1; }.occurrence-detail-label:hover { background:#294985; transform:translateY(-1px); box-shadow:0 5px 12px rgba(16,24,40,.28); }.occurrence-detail-label:active { transform:translateY(0); box-shadow:0 1px 3px rgba(16,24,40,.22); }.occurrence-detail-label:focus-visible { outline:3px solid #82aeff; outline-offset:3px; box-shadow:0 0 0 1px #fff; }
    @media(max-width:800px) { .side .nav #occurrenceNav { flex:1 1 0!important; min-width:0; }.occurrence-modal { padding:10px!important; align-items:center!important; }.occurrence-dialog { width:100%; max-height:calc(100dvh - 20px); }.occurrence-dialog .modal-head { padding:16px; }.occurrence-form { padding:16px; }.occurrence-grid,.occurrence-dates { grid-template-columns:1fr; gap:0; }.occurrence-actions { display:grid; grid-template-columns:1fr; gap:8px; }.occurrence-actions .btn { width:100%; }.occurrence-text-meta { flex-direction:column; gap:3px; }.occurrence-history-list { max-height:34vh; }.occurrence-item-head { flex-direction:column; align-items:flex-start; gap:7px; }.occurrence-item-actions { flex-wrap:wrap; margin-left:0; }.occurrence-item-student { overflow-wrap:anywhere; } }
    #occurrenceModal.occurrence-modal { inset:0!important; padding:0!important; align-items:stretch!important; overscroll-behavior:none; }
    .occurrence-dialog { width:100vw; max-width:none; height:100dvh; max-height:100dvh; border-radius:0; display:flex; flex-direction:column; overflow:hidden; }
    .occurrence-dialog .modal-head { flex:none; padding:18px 32px; }
    .occurrence-form { flex:1; min-height:0; overflow-y:auto; display:grid; grid-template-columns:minmax(300px,.9fr) minmax(420px,1.1fr); gap:0 30px; align-content:start; padding:24px 32px 32px; }
    .occurrence-form > :not(.occurrence-history) { grid-column:1; min-width:0; }
    .occurrence-form > .occurrence-grid { grid-row:1; }
    .occurrence-form > .occurrence-date-field { grid-row:2; max-width:none; }
    .occurrence-form > .occurrence-attachment-field { grid-row:3; margin:0 0 18px; }
    .occurrence-form > .field:not(.occurrence-date-field) { grid-row:4; }
    .occurrence-form textarea { min-height:260px; height:min(38dvh,420px); resize:vertical; }
    .occurrence-form > .occurrence-actions { grid-row:5; justify-content:flex-start; flex-wrap:wrap; margin-top:2px; }
    .occurrence-form > .occurrence-date-filters { grid-row:6; }
    .occurrence-history { grid-column:2; grid-row:1 / span 6; min-width:0; margin:0; border-top:0; border-left:1px solid var(--line); padding:0 0 0 30px; }
    .occurrence-history-head { margin:0 0 16px; }
    .occurrence-history-list { max-height:calc(100dvh - 170px); gap:16px; padding-right:8px; }
    .occurrence-item { padding:20px 22px; background:#fff; box-shadow:0 2px 10px rgba(23,43,77,.05); }
    .occurrence-item-head { display:grid; justify-content:stretch; gap:7px; margin-bottom:16px; }
    .occurrence-item-date { font-size:14px; line-height:1.45; }
    .occurrence-item-author { font-size:13px; color:#344054; }
    .occurrence-item-author strong { color:#172b4d; }
    .occurrence-item-fact-date { color:var(--muted); font-size:12px; }
    .occurrence-item-student { font-size:13px; margin-top:3px; }
    .occurrence-item-student strong { color:#172b4d; font-weight:800; }
    .occurrence-item-text { font-size:15px; line-height:1.65; overflow-wrap:anywhere; }
    .occurrence-item-actions { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }
    .occurrence-item-actions button { min-height:36px; padding:8px 12px; font-size:13px; }
    .occurrence-item-footer { margin-top:18px; padding-top:14px; }
    .occurrence-revision,.occurrence-remark { padding:12px 14px; border-radius:8px; background:#f5f7fc; }
    .occurrence-revision { border-left:3px solid #64748b; }
    .occurrence-remark { border-left:3px solid #4165eb; }
    .occurrence-revision h4,.occurrence-remark h4 { margin:0 0 4px; font-size:13px; color:#172b4d; }
    .occurrence-event-meta { font-size:12px; color:#475467; line-height:1.5; overflow-wrap:anywhere; }
    .occurrence-remarks { margin-top:10px; }
    .occurrence-remark p { margin-top:8px; font-size:14px; line-height:1.55; }
    @media(max-width:800px) { #occurrenceModal.occurrence-modal { padding:0!important; align-items:stretch!important; }.occurrence-dialog { width:100vw; height:100dvh; max-height:100dvh; }.occurrence-dialog .modal-head { padding:14px 18px; }.occurrence-form { display:flex; flex-direction:column; padding:18px; }.occurrence-form > .occurrence-grid { order:0; }.occurrence-form > .occurrence-date-field { order:1; }.occurrence-form > .occurrence-attachment-field { order:2; }.occurrence-form > .field:not(.occurrence-date-field) { order:3; }.occurrence-form > .occurrence-actions { order:4; }.occurrence-form > .occurrence-date-filters { order:5; }.occurrence-form > .occurrence-history { order:6; }.occurrence-form textarea { min-height:220px; height:30dvh; }.occurrence-history { margin-top:26px; border-left:0; border-top:1px solid var(--line); padding:20px 0 0; }.occurrence-history-list { max-height:none; overflow:visible; padding-right:0; }.occurrence-item { padding:16px; }.occurrence-item-actions { margin-left:0; }.occurrence-grid,.occurrence-dates { grid-template-columns:1fr; } }
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
  let membershipRequest = 0, historyRequest = 0, labelRequest = 0;
  let savingOccurrence = false;
  let savingRemark = false;
  let remarkOccurrence = null;
  const occurrenceScope = () => ({ userId:user?.id, schoolId:window.getActiveSchoolId?.() });
  const sameOccurrenceScope = scope => !!scope.userId && !!scope.schoolId
    && scope.userId === user?.id && scope.schoolId === window.getActiveSchoolId?.()
    && !get('app').classList.contains('hidden');
  const isSchoolAdmin = () => occurrenceMembership?.role === 'school_admin';
  // Espelha a policy "school_members_can_view_occurrences": bypass automático
  // só para school_admin; qualquer outro papel depende só das flags.
  const canViewOccurrences = () => isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_view_occurrences || !!occurrencePermission.can_edit_occurrences || !!occurrencePermission.can_delete_occurrences;
  // Espelha "authorized_school_members_can_add_occurrences": além da flag,
  // exige um vínculo ativo (created_by/school_id são resolvidos pela RLS/trigger).
  const canRegisterOccurrence = () => !!occurrenceMembership && (isSchoolAdmin() || !!occurrencePermission.can_edit_all || !!occurrencePermission.can_register_occurrences);
  const isOccurrenceAuthor = item => !!item?.created_by && item.created_by === user?.id;
  // Espelha can_change_school_occurrence(): cada ação usa sua própria flag.
  const canChangeOccurrence = (item, flag) => !!occurrenceMembership && (isSchoolAdmin()
    || (occurrenceMembership.role === 'coordinator' && !!occurrencePermission[flag])
    || (occurrenceMembership.role === 'teacher' && isOccurrenceAuthor(item) && !!occurrencePermission[flag]));
  const canEditOccurrence = item => canChangeOccurrence(item, 'can_edit_occurrences');
  const canDeleteOccurrence = item => canChangeOccurrence(item, 'can_delete_occurrences');
  const canRemarkOccurrence = item => !!occurrenceMembership && (isSchoolAdmin()
    || (occurrenceMembership.role === 'teacher' && isOccurrenceAuthor(item))
    || (occurrenceMembership.role === 'coordinator' && (isOccurrenceAuthor(item) || !!occurrencePermission.can_edit_occurrences || !!occurrencePermission.can_delete_occurrences)));
  const emptyOccurrencePermission = () => ({ can_view_occurrences:false, can_register_occurrences:false, can_edit_occurrences:false, can_delete_occurrences:false, can_edit_all:false });
  async function teardownOccurrenceChannels() {
    const oldPermission = occurrencePermissionChannel, oldMembership = occurrenceMembershipChannel;
    occurrencePermissionChannel = null; occurrenceMembershipChannel = null;
    occurrenceChannelMemberId = null;
    await Promise.all([oldPermission, oldMembership].filter(Boolean).map(channel => db.removeChannel(channel)));
  }
  // Garante exatamente um par de canais vivo, sempre referente ao member_id
  // atual — se o vínculo mudar (ex.: troca de conta), o par anterior é
  // removido antes de assinar o novo, evitando canais duplicados/vazados.
  async function ensureOccurrenceChannels(memberId, request, scope) {
    if (occurrenceChannelMemberId === memberId && occurrencePermissionChannel && occurrenceMembershipChannel) return;
    await teardownOccurrenceChannels();
    if (request !== membershipRequest || !sameOccurrenceScope(scope)) return;
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
    const request = ++membershipRequest, scope = occurrenceScope();
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (request !== membershipRequest) return;
    const schoolId = window.getActiveSchoolId?.();
    if (!sameOccurrenceScope(scope) || signedInUser?.id !== scope.userId) { occurrenceMembership = null; occurrencePermission = emptyOccurrencePermission(); await teardownOccurrenceChannels(); return; }
    const { data: membership } = await db.from('school_members').select('id,school_id,role').eq('user_id', signedInUser.id).eq('school_id', schoolId).eq('status', 'active').maybeSingle();
    if (request !== membershipRequest || !sameOccurrenceScope(scope)) return;
    if (!membership) { occurrenceMembership = null; occurrencePermission = emptyOccurrencePermission(); await teardownOccurrenceChannels(); return; }
    const { data: perms } = await db.from('school_member_permissions').select('can_view_occurrences,can_register_occurrences,can_edit_occurrences,can_delete_occurrences,can_edit_all').eq('member_id', membership.id).maybeSingle();
    if (request !== membershipRequest || !sameOccurrenceScope(scope)) return;
    occurrenceMembership = membership;
    occurrencePermission = perms || emptyOccurrencePermission();
    await ensureOccurrenceChannels(membership.id, request, scope);
  }
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const today = () => new Date().toISOString().slice(0, 10);
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00`)) : 'Sem data';
  // updated_at é timestamptz real (não uma data pura como occurred_on), então
  // aqui usamos o fuso local do navegador em vez de forçar UTC.
  const formatDateTime = value => value ? `${new Intl.DateTimeFormat('pt-BR').format(new Date(value))} ${new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(new Date(value))}` : '';
  const formatTime = value => value ? new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '';
  const formatFileSize = bytes => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  let occurrenceStudentIds = new Set();
  let occurrenceCounts = new Map();
  let tableErrorShown = false;
  let historyRecords = new Map();
  let editingOccurrence = null;
  let pendingAttachment = null;
  let draftedAttachment = null;
  let removeAttachment = false;
  let focusedHistoryStudentId = null;
  const OCCURRENCE_ATTACHMENT_BUCKET = 'occurrence-attachments';
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const ALLOWED_ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

  function renderAttachmentState() {
    const state = get('occurrenceAttachmentState');
    const existing = editingOccurrence?.attachment_path && !removeAttachment ? editingOccurrence : null;
    const attachment = pendingAttachment || existing;
    if (!attachment) {
      state.innerHTML = '<span>Foto ou PDF, até 10 MB.</span>';
      get('occurrenceAttachmentPicker').textContent = '📎 Anexar documento';
      return;
    }
    const name = pendingAttachment?.name || existing.attachment_name || 'Documento anexado';
    const size = pendingAttachment?.size || existing.attachment_size;
    state.innerHTML = `<strong>${escape(name)}</strong>${size ? `<span>${formatFileSize(size)}</span>` : ''}<button class="occurrence-attachment-remove" type="button" data-remove-occurrence-attachment>Remover</button>`;
    get('occurrenceAttachmentPicker').textContent = '📎 Trocar documento';
  }

  function closeAttachmentDialog() {
    attachmentModal.classList.add('hidden');
    draftedAttachment = null;
    get('occurrenceAttachmentInput').value = '';
    get('occurrenceAttachmentDraft').textContent = 'Nenhum arquivo selecionado.';
    get('confirmOccurrenceAttachment').disabled = true;
  }

  function openAttachmentDialog() {
    draftedAttachment = null;
    get('occurrenceAttachmentInput').value = '';
    get('occurrenceAttachmentDraft').textContent = 'Nenhum arquivo selecionado.';
    get('confirmOccurrenceAttachment').disabled = true;
    attachmentModal.classList.remove('hidden');
  }

  async function validateAttachment(file) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) return 'Escolha uma imagem JPG, PNG ou WEBP, ou um arquivo PDF.';
    if (file.size > MAX_ATTACHMENT_BYTES) return 'O documento deve ter no máximo 10 MB.';
    if (!file.size) return 'O arquivo selecionado está vazio.';
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    const isPdf = String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
    const signatureMatches = (file.type === 'image/jpeg' && isJpeg) || (file.type === 'image/png' && isPng) || (file.type === 'image/webp' && isWebp) || (file.type === 'application/pdf' && isPdf);
    return signatureMatches ? '' : 'O conteúdo do arquivo não corresponde a uma foto ou PDF válido.';
  }

  async function openAttachment(item) {
    if (!item?.attachment_path || !canViewOccurrences()) return;
    const { data, error } = await db.storage.from(OCCURRENCE_ATTACHMENT_BUCKET).createSignedUrl(item.attachment_path, 60);
    if (error || !data?.signedUrl) { toast('Não foi possível abrir o documento anexado.'); return; }
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
  }

  function selectedClass() { return get('occurrenceClass').value; }
  function selectedStudent() { return get('occurrenceStudent').value; }
  function syncSaveAction() {
    const button = get('saveOccurrence');
    const allowed = editingOccurrence ? canEditOccurrence(editingOccurrence) : canRegisterOccurrence();
    button.disabled = savingOccurrence || !selectedClass() || !allowed;
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
    const historyClasses = window.getSchoolHistoryData?.().classes || classes;
    select.innerHTML = '<option value="">Todas as turmas</option>' + historyClasses.map(item => `<option value="${item.id}">${escape(item.name)}${item.archived_at ? ' (arquivada)' : ''}</option>`).join('');
    if (historyClasses.some(item => item.id === current)) select.value = current;
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
    const request = ++labelRequest, scope = occurrenceScope();
    if (!sameOccurrenceScope(scope) || !canViewOccurrences()) {
      occurrenceStudentIds = new Set();
      occurrenceCounts = new Map();
      paintStudentCards();
      publishOccurrenceLabelState();
      return;
    }
    const { data, error } = await readOccurrencePages(() => db.from('student_occurrences').select('id,student_id').eq('school_id', scope.schoolId).order('id'));
    if (request !== labelRequest || !sameOccurrenceScope(scope) || !canViewOccurrences()) return;
    if (error) {
      if (!tableErrorShown) {
        tableErrorShown = true;
        toast('Não foi possível atualizar os indicadores de ocorrências. Tente novamente.');
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
  async function readOccurrencePages(createQuery) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const result = await createQuery().range(from, from + 999);
      if (result.error) return result;
      rows.push(...(result.data || []));
      if ((result.data || []).length < 1000) return { data:rows, error:null };
    }
  }
  function renderOccurrenceItem(item) {
    const remarks = [...(item.student_occurrence_remarks || [])]
      .sort((first, second) => first.created_at.localeCompare(second.created_at));
    const registrationDate = formatDateTime(item.created_at);
    const occurrenceDate = formatDate(item.occurred_on);
    const registrationDay = (registrationDate || '').split(' ')[0] || 'Sem data';
    const canRemark = canRemarkOccurrence(item);
    const canEdit = canEditOccurrence(item);
    const canDelete = canDeleteOccurrence(item);
    return `<article class="occurrence-item" data-occurrence-id="${item.id}">
      <header class="occurrence-item-head">
        <div class="occurrence-item-date">Registrada em ${registrationDay} às ${formatTime(item.created_at)}</div>
        ${occurrenceDate !== registrationDay ? `<div class="occurrence-item-fact-date">Data da ocorrência: ${occurrenceDate}</div>` : ''}
        <div class="occurrence-item-author">Responsável: <strong>${escape(item.created_by_name || 'Não informado')}</strong></div>
        <div class="occurrence-item-student"><strong>${escape(item.students?.full_name || 'Aluno removido')}</strong> · ${escape(item.class_name || 'Turma não informada')}</div>
      </header>
      <div class="occurrence-item-text">${escape(item.occurrence_text)}</div>
      ${item.attachment_path ? `<button class="occurrence-item-attachment" type="button" data-occurrence-attachment="${item.id}">📎 Abrir ${escape(item.attachment_name || 'documento anexado')}</button>` : ''}
      ${canRemark || canEdit || canDelete ? `<div class="occurrence-item-actions">
        ${canRemark ? `<button class="occurrence-remark-action" type="button" data-occurrence-remark="${item.id}">Fazer Ressalva</button>` : ''}
        ${canEdit ? `<button class="occurrence-edit" type="button" data-occurrence-edit="${item.id}">Editar</button>` : ''}
        ${canDelete ? `<button class="occurrence-delete" type="button" data-occurrence-delete="${item.id}">Excluir</button>` : ''}
      </div>` : ''}
      ${item.updated_at || remarks.length ? `<footer class="occurrence-item-footer">
        ${item.updated_at ? `<section class="occurrence-revision" aria-label="Edição"><h4>Edição</h4><div class="occurrence-event-meta">Responsável: ${escape(item.updated_by_name || 'Não informado')} · ${formatDateTime(item.updated_at)}</div></section>` : ''}
        ${remarks.length ? `<section class="occurrence-remarks" aria-label="Ressalvas">${remarks.map(remark => `<div class="occurrence-remark"><h4>Ressalva</h4><div class="occurrence-event-meta">Responsável: ${escape(remark.created_by_name || 'Não informado')} · ${formatDateTime(remark.created_at)}</div><p>${escape(remark.body)}</p></div>`).join('')}</section>` : ''}
      </footer>` : ''}
    </article>`;
  }

  async function refreshHistory() {
    const request = ++historyRequest, scope = occurrenceScope();
    if (!sameOccurrenceScope(scope) || !canViewOccurrences()) { historyRecords = new Map(); get('occurrenceHistoryList').innerHTML = ''; return; }
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
      .select('id,student_id,class_id,class_name,occurred_on,occurrence_text,attachment_path,attachment_name,attachment_type,attachment_size,created_at,created_by,created_by_name,updated_by,updated_by_name,updated_at,students(full_name),student_occurrence_remarks(id,body,created_by_name,created_at)')
      .eq('school_id', occurrenceMembership.school_id)
      .order('occurred_on', { ascending:false })
      .order('created_at', { ascending:false })
      .order('id');
    if (focusedHistoryStudentId) {
      query = query.eq('student_id', focusedHistoryStudentId);
    } else if (normalizedName) {
      const historyStudents = window.getSchoolHistoryData?.().students || students;
      const matches = historyStudents.filter(item => String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedName));
      if (!matches.length) {
        historyRecords = new Map();
        get('occurrenceHistoryMeta').textContent = 'Nenhum aluno encontrado com esse nome.';
        get('occurrenceHistoryList').innerHTML = '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
        return;
      }
      query = query.in('student_id', matches.map(item => item.id));
      if (searchClassId) query = query.eq('class_id', searchClassId);
    } else if (searchClassId) query = query.eq('class_id', searchClassId);
    else if (studentId) query = query.eq('student_id', studentId);
    else if (classId) query = query.eq('class_id', classId);
    if (startDate) query = query.gte('occurred_on', startDate);
    if (endDate) query = query.lte('occurred_on', endDate);
    const { data, error } = await readOccurrencePages(() => query);
    if (request !== historyRequest || !sameOccurrenceScope(scope) || !canViewOccurrences()) return;
    if (error) {
      historyRecords = new Map();
      list.innerHTML = '<div class="occurrence-empty">Não foi possível consultar as ocorrências.</div>';
      get('occurrenceHistoryMeta').textContent = error.message;
      return;
    }
    const records = data || [];
    historyRecords = new Map(records.map(item => [item.id, item]));
    get('occurrenceHistoryMeta').textContent = records.length ? `${records.length} ocorrência${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}.` : 'Nenhuma ocorrência no filtro selecionado.';
    list.innerHTML = records.length ? records.map(renderOccurrenceItem).join('') : '<div class="occurrence-empty">Nenhuma ocorrência encontrada.</div>';
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
    pendingAttachment = null;
    removeAttachment = false;
    get('occurrenceAttachmentInput').value = '';
    renderAttachmentState();
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
    if (savingOccurrence) return;
    const scope = occurrenceScope();
    if (!sameOccurrenceScope(scope)) return;
    const editing = editingOccurrence, attachment = pendingAttachment, removing = removeAttachment;
    const classId = selectedClass();
    const studentId = selectedStudent();
    const text = get('occurrenceText').value.trim();
    const occurrenceDate = get('occurrenceDate').value;
    const classItem = classes.find(item => item.id === classId);
    if (!editing && (!classItem || !studentId)) { toast('Selecione a turma e o aluno.'); return; }
    if (!editing && !canRegisterOccurrence()) { toast('Sem permissão para registrar ocorrência.'); return; }
    if (editing && !canEditOccurrence(editing)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    if (!occurrenceDate) { toast('Selecione a data da ocorrência.'); return; }
    if (!text) { toast('Digite a descrição da ocorrência.'); return; }
    if (text.length > 500) { toast('A descrição deve ter no máximo 500 caracteres.'); return; }
    const button = get('saveOccurrence');
    savingOccurrence = true;
    let writeConfirmed = false;
    try {
      button.disabled = true;
      button.textContent = attachment ? 'Enviando documento…' : 'Salvando…';
      const occurrenceId = editing?.id || crypto.randomUUID();
      const oldAttachmentPath = editing?.attachment_path || null;
      let uploadedAttachmentPath = null;
      let attachmentFields = {};
      if (attachment) {
        const extensionByType = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' };
        const authorId = editing?.created_by || user?.id;
        uploadedAttachmentPath = `${scope.schoolId}/${authorId}/${occurrenceId}/${crypto.randomUUID()}.${extensionByType[attachment.type]}`;
        const upload = await db.storage.from(OCCURRENCE_ATTACHMENT_BUCKET).upload(uploadedAttachmentPath, attachment, { contentType:attachment.type, upsert:false });
        if (upload.error) {
          button.disabled = false;
          button.textContent = editing ? 'Salvar alterações' : 'Salvar ocorrência';
          toast('Não foi possível enviar o documento. A ocorrência não foi alterada.');
          return;
        }
        if (!sameOccurrenceScope(scope)) return;
        attachmentFields = { attachment_path:uploadedAttachmentPath, attachment_name:attachment.name, attachment_type:attachment.type, attachment_size:attachment.size };
      } else if (removing) {
        attachmentFields = { attachment_path:null, attachment_name:null, attachment_type:null, attachment_size:null };
      }
      if (!sameOccurrenceScope(scope)) return;
      const write = editing
        ? await db.from('student_occurrences').update({ occurred_on:occurrenceDate, occurrence_text:text, ...attachmentFields }).eq('id', occurrenceId).eq('school_id', scope.schoolId).select('id').maybeSingle()
        : await db.from('student_occurrences').insert({ id:occurrenceId, school_id:scope.schoolId, student_id:studentId, class_id:classId, class_name:classItem.name, occurred_on:occurrenceDate, occurrence_text:text, ...attachmentFields }).select('id').maybeSingle();
      if (!sameOccurrenceScope(scope)) return;
      if (write.error || !write.data) {
        // Sem resposta do servidor, a escrita pode ter sido concluída: preserve
        // o arquivo até conferir o histórico, em vez de apagar um anexo válido.
        if (uploadedAttachmentPath && (!write.error || write.error.code)) await db.storage.from(OCCURRENCE_ATTACHMENT_BUCKET).remove([uploadedAttachmentPath]);
        button.disabled = false;
        button.textContent = editing ? 'Salvar alterações' : 'Salvar ocorrência';
        toast(write.error?.message || 'A ocorrência não foi alterada. Ela pode ter sido removida ou sua permissão mudou.');
        return;
      }
      writeConfirmed = true;
      let attachmentCleanupFailed = false;
      if (oldAttachmentPath && (uploadedAttachmentPath || removing)) {
        try {
          const cleanup = await db.storage.from(OCCURRENCE_ATTACHMENT_BUCKET).remove([oldAttachmentPath]);
          attachmentCleanupFailed = !!cleanup.error;
        } catch { attachmentCleanupFailed = true; }
      }
      if (!sameOccurrenceScope(scope)) return;
      button.disabled = false;
      const wasEditing = !!editing;
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
        pendingAttachment = null;
        removeAttachment = false;
        get('occurrenceAttachmentInput').value = '';
        renderAttachmentState();
      }
      toast(attachmentCleanupFailed ? 'Ocorrência salva. O documento anterior ficou preservado no armazenamento.' : (wasEditing ? 'Ocorrência atualizada.' : 'Ocorrência salva. A etiqueta foi atualizada no card do aluno.'));
      publishOccurrenceLabelState();
      await refreshHistory();
    } catch (error) {
      if (sameOccurrenceScope(scope)) toast(writeConfirmed ? 'Ocorrência salva. Não foi possível atualizar a tela; consulte o histórico.' : 'Não foi possível confirmar o salvamento. Consulte o histórico antes de tentar novamente.');
    } finally {
      savingOccurrence = false;
      button.textContent = editingOccurrence ? 'Salvar alterações' : 'Salvar ocorrência';
      syncSaveAction();
    }
  }

  function editOccurrence(item) {
    if (savingOccurrence) return;
    if (!canEditOccurrence(item)) { toast('Sem permissão para editar esta ocorrência.'); return; }
    editingOccurrence = item;
    get('occurrenceClass').value = item.class_id || '';
    fillStudents();
    get('occurrenceStudent').value = item.student_id;
    get('occurrenceDate').value = item.occurred_on;
    get('occurrenceText').value = item.occurrence_text;
    get('occurrenceTextCount').textContent = `${item.occurrence_text.length}/500`;
    pendingAttachment = null;
    removeAttachment = false;
    get('occurrenceAttachmentInput').value = '';
    renderAttachmentState();
    get('saveOccurrence').textContent = 'Salvar alterações';
    syncSaveAction();
    get('occurrenceText').focus();
  }

  function closeRemarkDialog(force = false) {
    if (savingRemark && force !== true) return;
    remarkOccurrence = null;
    get('occurrenceRemarkText').value = '';
    get('occurrenceRemarkCount').textContent = '0/1000';
    remarkModal.classList.add('hidden');
  }
  function openRemarkDialog(item) {
    if (!canRemarkOccurrence(item) || savingOccurrence) return;
    remarkOccurrence = item;
    get('occurrenceRemarkText').value = '';
    get('occurrenceRemarkCount').textContent = '0/1000';
    remarkModal.classList.remove('hidden');
    get('occurrenceRemarkText').focus();
  }
  async function saveRemark() {
    const item = remarkOccurrence, scope = occurrenceScope();
    const body = get('occurrenceRemarkText').value.trim();
    if (savingRemark || !item || !sameOccurrenceScope(scope) || !canRemarkOccurrence(item)) return;
    if (!body || body.length > 1000) { toast('Digite uma ressalva de até 1000 caracteres.'); return; }
    savingRemark = true;
    get('saveOccurrenceRemark').disabled = true;
    try {
      const { error } = await db.rpc('add_student_occurrence_remark', { p_occurrence_id:item.id, p_body:body });
      if (!sameOccurrenceScope(scope)) return;
      if (error) { toast(error.message || 'Não foi possível registrar a ressalva.'); return; }
      closeRemarkDialog(true);
      toast('Ressalva registrada.');
      await refreshHistory();
    } catch {
      if (sameOccurrenceScope(scope)) toast('Não foi possível confirmar a ressalva. Consulte o histórico antes de tentar novamente.');
    } finally {
      savingRemark = false;
      get('saveOccurrenceRemark').disabled = false;
    }
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
    const scope = occurrenceScope();
    if (savingOccurrence || !sameOccurrenceScope(scope)) return;
    if (!canDeleteOccurrence(item)) { toast('Sem permissão para excluir esta ocorrência.'); return; }
      if (!(await confirmOccurrenceDeletion(item))) return;
    if (!sameOccurrenceScope(scope) || !canDeleteOccurrence(item)) return;
    savingOccurrence = true;
    let deleteConfirmed = false;
    try {
      const { data, error } = await db.from('student_occurrences').delete().eq('id', item.id).eq('school_id', scope.schoolId).select('id').maybeSingle();
    if (!sameOccurrenceScope(scope)) return;
    if (error || !data) { toast(error?.message || 'Nenhuma ocorrência foi excluída. Atualize a consulta e confira sua permissão.'); return; }
    deleteConfirmed = true;
    let attachmentCleanupFailed = false;
    if (item.attachment_path) {
      try {
        const cleanup = await db.storage.from(OCCURRENCE_ATTACHMENT_BUCKET).remove([item.attachment_path]);
        attachmentCleanupFailed = !!cleanup.error;
      } catch { attachmentCleanupFailed = true; }
    }
    if (!sameOccurrenceScope(scope)) return;
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
    publishOccurrenceLabelState();
    toast(attachmentCleanupFailed ? 'Ocorrência excluída. O documento anexado não pôde ser removido do armazenamento.' : 'Ocorrência excluída.');
    } catch {
      if (sameOccurrenceScope(scope)) toast(deleteConfirmed ? 'Ocorrência excluída. Não foi possível atualizar a tela; consulte o histórico.' : 'Não foi possível confirmar a exclusão. Atualize a consulta antes de tentar novamente.');
    } finally { savingOccurrence = false; syncSaveAction(); }
  }

  const syncOccurrenceNavigation = () => {
    const allowed = canViewOccurrences();
    occurrenceButton.classList.toggle('hidden', !allowed);
    occurrenceButton.hidden = !allowed;
    occurrenceButton.setAttribute('aria-hidden', String(!allowed));
    if (allowed) occurrenceButton.style.removeProperty('display');
    else occurrenceButton.style.setProperty('display', 'none', 'important');
    if (!allowed) {
      historyRequest += 1; labelRequest += 1;
      historyRecords = new Map();
      get('occurrenceHistoryList').innerHTML = '';
      modal.classList.add('hidden');
    }
  };
  occurrenceButton.onclick = open;
  const closeOccurrence = () => { if (savingOccurrence) { toast('Aguarde o salvamento terminar.'); return; } resetOccurrenceScreen(); modal.classList.add('hidden'); };
  get('closeOccurrence').onclick = closeOccurrence;
  modal.onclick = event => { if (event.target === modal) closeOccurrence(); };
  get('occurrenceAttachmentPicker').onclick = openAttachmentDialog;
  get('occurrenceFileSelect').onclick = () => get('occurrenceAttachmentInput').click();
  get('closeOccurrenceAttachment').onclick = closeAttachmentDialog;
  get('cancelOccurrenceAttachment').onclick = closeAttachmentDialog;
  attachmentModal.onclick = event => { if (event.target === attachmentModal) closeAttachmentDialog(); };
  get('occurrenceAttachmentInput').onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    let validationError = '';
    try { validationError = await validateAttachment(file); }
    catch { validationError = 'Não foi possível ler o arquivo selecionado.'; }
    if (validationError) {
      draftedAttachment = null;
      event.target.value = '';
      get('occurrenceAttachmentDraft').textContent = validationError;
      get('confirmOccurrenceAttachment').disabled = true;
      return;
    }
    draftedAttachment = file;
    get('occurrenceAttachmentDraft').innerHTML = `<strong>${escape(file.name)}</strong><br>${formatFileSize(file.size)}`;
    get('confirmOccurrenceAttachment').disabled = false;
  };
  get('confirmOccurrenceAttachment').onclick = () => {
    if (!draftedAttachment) return;
    pendingAttachment = draftedAttachment;
    removeAttachment = false;
    closeAttachmentDialog();
    renderAttachmentState();
  };
  get('occurrenceAttachmentState').onclick = event => {
    if (!event.target.closest('[data-remove-occurrence-attachment]')) return;
    pendingAttachment = null;
    removeAttachment = !!editingOccurrence?.attachment_path;
    get('occurrenceAttachmentInput').value = '';
    renderAttachmentState();
  };
  get('occurrenceDeleteConfirmCancel').onclick = () => closeDeleteConfirm(false);
  get('occurrenceDeleteConfirmSubmit').onclick = () => closeDeleteConfirm(true);
  deleteConfirmModal.onclick = event => { if (event.target === deleteConfirmModal) closeDeleteConfirm(false); };
  get('closeOccurrenceRemark').onclick = closeRemarkDialog;
  get('cancelOccurrenceRemark').onclick = closeRemarkDialog;
  remarkModal.onclick = event => { if (event.target === remarkModal) closeRemarkDialog(); };
  get('saveOccurrenceRemark').onclick = saveRemark;
  get('occurrenceRemarkText').oninput = event => { get('occurrenceRemarkCount').textContent = `${event.target.value.length}/1000`; };
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
    const remarkId = event.target.closest('[data-occurrence-remark]')?.dataset.occurrenceRemark;
    const attachmentId = event.target.closest('[data-occurrence-attachment]')?.dataset.occurrenceAttachment;
    if (editId && historyRecords.has(editId)) editOccurrence(historyRecords.get(editId));
    if (deleteId && historyRecords.has(deleteId)) deleteOccurrence(historyRecords.get(deleteId));
    if (remarkId && historyRecords.has(remarkId)) openRemarkDialog(historyRecords.get(remarkId));
    if (attachmentId && historyRecords.has(attachmentId)) openAttachment(historyRecords.get(attachmentId));
  };
  new MutationObserver(paintStudentCards).observe(get('list'), { childList:true });
  new MutationObserver(paintStudentCards).observe(get('studentDetails'), { childList:true, subtree:true });
  new MutationObserver(() => {
    if (!get('app').classList.contains('hidden')) {
      // A carga/permissão pode terminar enquanto o bootstrap ainda oculta
      // o app. Ao revelá-lo, resolva o acesso de novo antes de pintar o menu.
      void refreshOccurrenceMembership().then(() => {
        syncOccurrenceNavigation(); syncSaveAction(); refreshLabelState();
      });
    }
    else {
      membershipRequest += 1; historyRequest += 1; labelRequest += 1;
      occurrenceMembership = null; occurrencePermission = emptyOccurrencePermission();
      historyRecords = new Map(); occurrenceStudentIds = new Set(); occurrenceCounts = new Map();
      resetOccurrenceScreen(); closeAttachmentDialog(); closeDeleteConfirm(false); closeRemarkDialog(true);
      syncOccurrenceNavigation(); publishOccurrenceLabelState();
      void teardownOccurrenceChannels();
    }
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
    syncOccurrenceNavigation();
    syncSaveAction();
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
