document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('#app .home-overview');
  const header = card?.querySelector('.home-overview-head');
  const reminders = document.getElementById('homeReminderList');
  if (!card || !header || !reminders) return;

  const editor = document.createElement('button');
  editor.id = 'homeCommunicationButton';
  editor.type = 'button';
  editor.className = 'hidden';
  editor.innerHTML = '▤ &nbsp; Comunicação';
  const sideNav = document.querySelector('#app .side .nav');
  sideNav?.insertBefore(editor, document.getElementById('profileNav') || null);

  const list = document.createElement('div');
  list.id = 'homeCommunicationList';
  list.className = 'home-communication-list';
  header.after(list);

  const modal = document.createElement('div');
  modal.id = 'homeCommunicationModal';
  modal.className = 'modal-bg home-communication-modal hidden';
  modal.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="homeCommunicationTitle">
    <div class="modal-head"><h3 id="homeCommunicationTitle">Comunicação</h3><button type="button" class="close" data-home-communication-close aria-label="Fechar">×</button></div>
    <form id="homeCommunicationForm" class="form">
      <p class="meta">Escreva um novo lembrete ou escolha Editar em um aviso publicado. Para mudar apenas os tempos e o resumo, deixe o campo de lembrete vazio.</p>
      <div class="field"><label for="homeCommunicationText">Lembrete novo ou em edição</label><input id="homeCommunicationText" maxlength="160" autocomplete="off"></div>
      <div class="field"><label for="homeCommunicationDestination">Ao clicar, abrir (opcional)</label><select id="homeCommunicationDestination"><option value="none">Nada — apenas mostrar o aviso</option><option value="occurrences">Ocorrências</option><option value="students">Lista de alunos</option><option value="external">Link externo</option></select></div>
      <div class="field hidden" id="homeCommunicationUrlField"><label for="homeCommunicationUrl">Link HTTPS</label><input id="homeCommunicationUrl" type="url" placeholder="https://exemplo.com"></div>
      <div class="home-communication-schedule"><strong>Agendar exibição</strong><p>Escolha quando o lembrete começa e, se quiser, quando ele deixa de aparecer.</p>
        <div class="grid"><div class="field"><label for="homeCommunicationStart">Dia de início</label><input id="homeCommunicationStart" type="date" required></div><div class="field"><label for="homeCommunicationStartTime">Hora de início (opcional)</label><input id="homeCommunicationStartTime" type="time"></div></div>
        <div class="grid"><div class="field"><label for="homeCommunicationEnd">Último dia (opcional)</label><input id="homeCommunicationEnd" type="date"></div><div class="field"><label for="homeCommunicationEndTime">Hora de término (opcional)</label><input id="homeCommunicationEndTime" type="time"></div></div>
      </div>
      <div class="field"><label for="homeCommunicationSeconds">Tempo deste lembrete</label><select id="homeCommunicationSeconds"><option value="5">5 segundos</option><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15" selected>15 segundos</option><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option></select></div>
      <div class="home-communication-preview" aria-live="polite"><small>Prévia no painel</small><strong id="homeCommunicationPreviewText">Seu aviso aparecerá aqui</strong><span id="homeCommunicationPreviewDestination">Apenas aviso · 15 segundos</span><span id="homeCommunicationPreviewSchedule"></span></div>
      <p id="homeCommunicationError" class="error hidden" role="alert"></p>
    </form><section class="home-summary-selection"><h4>Tempos de exibição</h4><div class="grid"><div class="field"><label for="homeSummarySeconds">Cada informação automática</label><select id="homeSummarySeconds"><option value="5">5 segundos</option><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15">15 segundos</option><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option></select></div><div class="field"><label for="homeNoticeAllSeconds">Todos os avisos da escola</label><select id="homeNoticeAllSeconds"><option value="keep">Manter tempos atuais</option><option value="5">5 segundos</option><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15">15 segundos</option><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option></select></div></div><p>Ao escolher um tempo para todos os avisos, ele também vira o padrão dos próximos lembretes.</p><details class="home-summary-options"><summary><span><strong>Informações automáticas do resumo</strong><small>Escolha os dados que vão passar no painel</small></span><span id="homeSummarySelectedCount" class="home-summary-selected-count"></span><span class="home-summary-chevron" aria-hidden="true">⌄</span></summary><div class="home-summary-options-content"><div id="homeSummaryMetricOptions" class="home-summary-metric-options"></div></div></details><div id="homeSummarySelectedLabels" class="home-summary-selected-labels"></div><p class="home-summary-options-footnote">Os avisos publicados continuam aparecendo.</p></section><section class="home-communication-management"><h4>Lembretes publicados</h4><div id="homeCommunicationManagementList"></div></section><div class="home-communication-savebar"><span id="homeCommunicationStatus" role="status"></span><button type="button" class="btn secondary" data-home-communication-close>Cancelar</button><button type="submit" form="homeCommunicationForm" id="homeCommunicationSave" class="btn primary">Salvar alterações</button></div></section>`;
  document.body.append(modal);

  const by = id => document.getElementById(id);
  const safe = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const schoolId = () => window.getActiveSchoolId?.();
  const canPublish = () => ['school_admin', 'coordinator'].includes(window.getActiveSchoolRole?.());
  const metricOptions = [
    ['student_occurrences', 'Aluno com mais ocorrências na semana'],
    ['class_occurrences', 'Turma com mais ocorrências na semana'],
    ['praise_student', 'Aluno elogiado na semana'],
    ['siap_student_absences', 'Aluno com mais faltas na última extração do SIAP'],
    ['school_data', 'Dados da escola: alunos e turmas'],
    ['new_students', 'Alunos cadastrados na semana'],
    ['classes_without_occurrences', 'Turmas sem ocorrências na semana'],
    ['class_fewest_occurrences', 'Turma com menos ocorrências entre as que registraram'],
    ['siap_class_low_absences', 'Turma mais frequente (menor média de faltas no SIAP)'],
    ['siap_class_high_absences', 'Turma mais faltosa (maior média de faltas no SIAP)']
  ];
  const defaultMetricKeys = metricOptions.slice(0, 5).map(([key]) => key);
  let selectedMetricKeys = [...defaultMetricKeys];
  let systemSeconds = 15;
  let defaultNoticeSeconds = 15;
  let editingNoticeId = null;
  const pendingDeleteIds = new Set();
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let generation = 0;
  let notices = [];
  let editingSchoolId = null;
  let visibilitySignature = '';
  const formatSchedule = (date, time) => `${date || ''}${time ? ` às ${String(time).slice(0, 5)}` : ''}`;
  function renderMetricOptions() {
    by('homeSummaryMetricOptions').innerHTML = metricOptions.map(([key, label]) => `<label><input type="checkbox" value="${key}" ${selectedMetricKeys.includes(key) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    updateSelectedMetricLabels();
  }
  function updateSelectedMetricLabels() {
    const keys = [...by('homeSummaryMetricOptions').querySelectorAll('input:checked')].map(input => input.value);
    by('homeSummarySelectedCount').textContent = `${keys.length} selecionada${keys.length === 1 ? '' : 's'}`;
    by('homeSummarySelectedLabels').innerHTML = keys.length
      ? metricOptions.filter(([key]) => keys.includes(key)).map(([, label]) => `<span>${safe(label)}</span>`).join('')
      : '<span>Nenhuma informação selecionada</span>';
  }
  function applySettings(keys, automaticSeconds = 15, noticeSeconds = 15) {
    selectedMetricKeys = metricOptions.map(([key]) => key).filter(key => keys.includes(key));
    systemSeconds = Number(automaticSeconds) || 15;
    defaultNoticeSeconds = Number(noticeSeconds) || 15;
    window.carometroHomeSummaryKeys = [...selectedMetricKeys];
    window.carometroHomeSummarySeconds = systemSeconds;
    document.dispatchEvent(new CustomEvent('carometro:home-summary-preferences'));
    renderMetricOptions();
    by('homeSummarySeconds').value = String(systemSeconds);
  }

  function syncAccess() {
    const allowed = !!schoolId() && canPublish() && !by('app').classList.contains('hidden');
    editor.classList.toggle('hidden', !allowed);
    if (!allowed || (editingSchoolId && editingSchoolId !== schoolId())) modal.classList.add('hidden');
    return allowed;
  }
  function navigate(notice) {
    if (notice.destination_type === 'none') return;
    if (notice.destination_type === 'external') {
      try {
        const url = new URL(notice.destination_url);
        if (url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch { toast('O link deste aviso é inválido.'); }
    } else if (notice.destination_type === 'occurrences') {
      by('occurrenceNav')?.click();
    } else if (notice.destination_type === 'students') {
      document.querySelector('[data-all-students]')?.click();
      by('search')?.scrollIntoView({ behavior:'smooth', block:'center' });
      by('search')?.focus();
    }
  }
  function render(onlyIfChanged = false) {
    const now = new Date();
    const today = localDate(now);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const visible = notices.filter(item =>
      item.starts_on <= today && (!item.ends_on || item.ends_on >= today)
      && (item.starts_on !== today || !item.start_time || currentTime >= item.start_time.slice(0, 5))
      && (item.ends_on !== today || !item.end_time || currentTime <= item.end_time.slice(0, 5))
    );
    const signature = visible.map(item => item.id).join(',');
    if (onlyIfChanged && signature === visibilitySignature) return;
    visibilitySignature = signature;
    list.innerHTML = visible.length ? `<div class="home-communication-label">Avisos da escola</div>${visible.map(item => `
      <div class="home-communication-row" data-starts-on="${safe(item.starts_on)}" data-start-time="${safe(item.start_time || '')}" data-ends-on="${safe(item.ends_on || '')}" data-end-time="${safe(item.end_time || '')}" data-display-seconds="${Number(item.display_seconds) || 15}" data-clickable="${item.destination_type !== 'none'}">${item.destination_type === 'none' ? `<span class="home-communication-title">${safe(item.title)}</span>` : `<button type="button" class="home-communication-title" data-home-notice-open="${safe(item.id)}">${safe(item.title)} <span aria-hidden="true">↗</span></button>`}</div>`).join('')}` : '';
    by('homeCommunicationManagementList').innerHTML = notices.length ? notices.map(item => `<div class="home-communication-managed-item"><div><strong>${safe(item.title)}</strong><small>${item.starts_on > today || item.starts_on === today && item.start_time?.slice(0, 5) > currentTime ? 'Agendado · ' : ''}${safe(formatSchedule(item.starts_on, item.start_time))}${item.ends_on ? ` até ${safe(formatSchedule(item.ends_on, item.end_time))}` : ''} · ${Number(item.display_seconds) || 15}s</small></div><div class="home-communication-managed-actions"><button type="button" data-home-notice-edit="${safe(item.id)}">Editar</button>${canPublish() && (item.created_by === user?.id || window.getActiveSchoolRole?.() === 'school_admin') ? `<button type="button" data-home-notice-delete="${safe(item.id)}" aria-label="${pendingDeleteIds.has(item.id) ? 'Desfazer exclusão' : 'Excluir lembrete'}">${pendingDeleteIds.has(item.id) ? 'Desfazer' : 'Excluir'}</button>` : ''}</div></div>`).join('') : '<p class="meta">Nenhum lembrete publicado.</p>';
  }
  async function refresh() {
    const scope = { school:schoolId(), user:user?.id, generation:++generation };
    syncAccess();
    if (!scope.school || !scope.user || by('app').classList.contains('hidden')) { notices = []; applySettings(defaultMetricKeys); render(); return; }
    const [noticeResult, settingsResult] = await Promise.all([
      db.from('school_home_communications')
        .select('id,title,destination_type,destination_url,starts_on,start_time,ends_on,end_time,created_by,display_seconds')
        .eq('school_id', scope.school).order('created_at', { ascending:false }).limit(100),
      db.from('school_home_summary_settings').select('metric_keys,system_seconds,notice_default_seconds').eq('school_id', scope.school).maybeSingle()
    ]);
    if (scope.generation !== generation || scope.school !== schoolId() || scope.user !== user?.id) return;
    applySettings(settingsResult.error ? defaultMetricKeys : (settingsResult.data?.metric_keys || defaultMetricKeys), settingsResult.data?.system_seconds, settingsResult.data?.notice_default_seconds);
    if (noticeResult.error) { list.innerHTML = ''; by('homeCommunicationManagementList').textContent = 'Lembretes indisponíveis.'; return; }
    notices = noticeResult.data || [];
    render();
  }

  editor.onclick = () => {
    if (!syncAccess()) return;
    editingSchoolId = schoolId();
    editingNoticeId = null;
    pendingDeleteIds.clear();
    by('homeCommunicationForm').reset();
    by('homeCommunicationStart').value = localDate(new Date());
    by('homeCommunicationSeconds').value = String(defaultNoticeSeconds);
    by('homeNoticeAllSeconds').value = 'keep';
    by('homeSummarySeconds').value = String(systemSeconds);
    by('homeCommunicationStatus').textContent = '';
    render();
    by('homeCommunicationUrlField').classList.add('hidden');
    by('homeCommunicationUrl').required = false;
    by('homeCommunicationError').classList.add('hidden');
    updatePreview();
    renderMetricOptions();
    modal.classList.remove('hidden');
    by('homeCommunicationText').focus();
  };
  by('homeCommunicationDestination').onchange = () => {
    const external = by('homeCommunicationDestination').value === 'external';
    by('homeCommunicationUrlField').classList.toggle('hidden', !external);
    by('homeCommunicationUrl').required = false;
    updatePreview();
  };
  function updatePreview() {
    by('homeCommunicationPreviewText').textContent = by('homeCommunicationText').value.trim() || 'Seu aviso aparecerá aqui';
    const destination = by('homeCommunicationDestination');
    by('homeCommunicationPreviewDestination').textContent = `${destination.value === 'none' ? 'Apenas aviso' : `Abre: ${destination.selectedOptions[0]?.textContent || ''}`} · ${by('homeCommunicationSeconds').value} segundos`;
    const start = formatSchedule(by('homeCommunicationStart').value, by('homeCommunicationStartTime').value);
    const end = formatSchedule(by('homeCommunicationEnd').value, by('homeCommunicationEndTime').value);
    by('homeCommunicationPreviewSchedule').textContent = start ? `Exibição: ${start}${end ? ` até ${end}` : ''}` : '';
  }
  by('homeCommunicationText').addEventListener('input', updatePreview);
  by('homeSummaryMetricOptions').addEventListener('change', updateSelectedMetricLabels);
  by('homeCommunicationSeconds').addEventListener('change', updatePreview);
  for (const id of ['homeCommunicationStart', 'homeCommunicationStartTime', 'homeCommunicationEnd', 'homeCommunicationEndTime']) by(id).addEventListener('change', updatePreview);
  modal.querySelectorAll('[data-home-communication-close]').forEach(button => button.onclick = () => { editingNoticeId = null; pendingDeleteIds.clear(); modal.classList.add('hidden'); });
  modal.onclick = event => { if (event.target === modal) { editingNoticeId = null; pendingDeleteIds.clear(); modal.classList.add('hidden'); } };
  by('homeCommunicationForm').onsubmit = async event => {
    event.preventDefault();
    if (!syncAccess() || editingSchoolId !== schoolId()) return;
    const destinationType = by('homeCommunicationDestination').value;
    const destinationUrl = destinationType === 'external' ? by('homeCommunicationUrl').value.trim() : null;
    const title = by('homeCommunicationText').value.trim();
    const hasNotice = !!title || !!editingNoticeId;
    const errorBox = by('homeCommunicationError');
    errorBox.classList.add('hidden');
    if (hasNotice && !title) { errorBox.textContent = 'Escreva o lembrete em edição.'; errorBox.classList.remove('hidden'); return; }
    if (hasNotice && destinationType === 'external' && (!destinationUrl || !/^https:\/\/[^\s]+$/i.test(destinationUrl))) {
      errorBox.textContent = 'Informe um link HTTPS válido.'; errorBox.classList.remove('hidden'); return;
    }
    const start = by('homeCommunicationStart').value;
    const startTime = by('homeCommunicationStartTime').value || null;
    const end = by('homeCommunicationEnd').value || null;
    const endTime = by('homeCommunicationEndTime').value || null;
    if (hasNotice && end && end < start) { errorBox.textContent = 'A data final deve ser posterior à inicial.'; errorBox.classList.remove('hidden'); return; }
    if (hasNotice && endTime && !end) { errorBox.textContent = 'Escolha o último dia para definir a hora de término.'; errorBox.classList.remove('hidden'); return; }
    if (hasNotice && end === start && startTime && endTime && endTime < startTime) { errorBox.textContent = 'A hora de término deve ser posterior à hora de início.'; errorBox.classList.remove('hidden'); return; }
    const button = by('homeCommunicationSave');
    const status = by('homeCommunicationStatus');
    const keys = [...by('homeSummaryMetricOptions').querySelectorAll('input:checked')].map(input => input.value);
    const nextSystemSeconds = Number(by('homeSummarySeconds').value);
    const allNoticeSeconds = by('homeNoticeAllSeconds').value;
    const nextNoticeSeconds = allNoticeSeconds === 'keep' ? defaultNoticeSeconds : Number(allNoticeSeconds);
    button.disabled = true;
    status.textContent = 'Salvando…';
    const scopeSchool = schoolId();
    let { error } = await db.from('school_home_summary_settings').upsert({ school_id:scopeSchool, metric_keys:keys, system_seconds:nextSystemSeconds, notice_default_seconds:nextNoticeSeconds, updated_by:user.id, updated_at:new Date().toISOString() }, { onConflict:'school_id' });
    if (!error && hasNotice) {
      const payload = { title, destination_type:destinationType, destination_url:destinationUrl, starts_on:start, start_time:startTime, ends_on:end, end_time:endTime, display_seconds:Number(by('homeCommunicationSeconds').value) };
      const query = editingNoticeId
        ? db.from('school_home_communications').update(payload).eq('id', editingNoticeId).eq('school_id', scopeSchool)
        : db.from('school_home_communications').insert({ ...payload, school_id:scopeSchool, created_by:user.id });
      ({ error } = await query);
    }
    if (!error && allNoticeSeconds !== 'keep') {
      ({ error } = await db.from('school_home_communications').update({ display_seconds:nextNoticeSeconds }).eq('school_id', scopeSchool));
    }
    if (!error && pendingDeleteIds.size) {
      ({ error } = await db.from('school_home_communications').delete().eq('school_id', scopeSchool).in('id', [...pendingDeleteIds]));
    }
    button.disabled = false;
    if (error) { status.textContent = 'Não foi possível salvar todas as alterações.'; errorBox.textContent = error.message || 'Tente novamente.'; errorBox.classList.remove('hidden'); refresh(); return; }
    applySettings(keys, nextSystemSeconds, nextNoticeSeconds);
    status.textContent = 'Alterações salvas.';
    editingNoticeId = null;
    pendingDeleteIds.clear();
    by('homeCommunicationForm').reset();
    by('homeCommunicationStart').value = localDate(new Date());
    by('homeCommunicationSeconds').value = String(nextNoticeSeconds);
    by('homeNoticeAllSeconds').value = 'keep';
    by('homeCommunicationUrlField').classList.add('hidden');
    updatePreview();
    refresh();
  };
  list.onclick = event => {
    const open = event.target.closest('[data-home-notice-open]');
    if (open) { const notice = notices.find(item => item.id === open.dataset.homeNoticeOpen); if (notice) navigate(notice); return; }
  };
  by('homeCommunicationManagementList').onclick = async event => {
    const edit = event.target.closest('[data-home-notice-edit]');
    if (edit) {
      const notice = notices.find(item => item.id === edit.dataset.homeNoticeEdit);
      if (!notice || !syncAccess()) return;
      editingNoticeId = notice.id;
      by('homeCommunicationText').value = notice.title || '';
      by('homeCommunicationDestination').value = notice.destination_type || 'none';
      by('homeCommunicationUrl').value = notice.destination_url || '';
      by('homeCommunicationStart').value = notice.starts_on || localDate(new Date());
      by('homeCommunicationStartTime').value = notice.start_time?.slice(0, 5) || '';
      by('homeCommunicationEnd').value = notice.ends_on || '';
      by('homeCommunicationEndTime').value = notice.end_time?.slice(0, 5) || '';
      by('homeCommunicationSeconds').value = String(Number(notice.display_seconds) || 15);
      by('homeCommunicationUrlField').classList.toggle('hidden', notice.destination_type !== 'external');
      by('homeCommunicationStatus').textContent = 'Editando aviso publicado.';
      updatePreview();
      modal.querySelector('.modal').scrollTop = 0;
      by('homeCommunicationText').focus();
      return;
    }
    const remove = event.target.closest('[data-home-notice-delete]');
    if (!remove || !syncAccess()) return;
    const id = remove.dataset.homeNoticeDelete;
    if (pendingDeleteIds.has(id)) pendingDeleteIds.delete(id);
    else pendingDeleteIds.add(id);
    if (editingNoticeId === id) { editingNoticeId = null; by('homeCommunicationText').value = ''; updatePreview(); }
    by('homeCommunicationStatus').textContent = pendingDeleteIds.size ? `${pendingDeleteIds.size} exclusão(ões) pendente(s). Salve as alterações.` : '';
    render();
  };
  document.addEventListener('carometro:data-loaded', refresh);
  document.addEventListener('carometro:school-context-ready', refresh);
  document.addEventListener('carometro:permission-refresh', refresh);
  new MutationObserver(() => { if (!by('app').classList.contains('hidden')) refresh(); })
    .observe(by('app'), { attributes:true, attributeFilter:['class'] });
  window.addEventListener('focus', refresh);
  window.setInterval(() => { if (!document.hidden) render(true); }, 15 * 1000);
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  refresh();
});
