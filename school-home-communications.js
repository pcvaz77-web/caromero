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
      <p class="meta">Publique um lembrete para todos os usuários da escola ativa. Ele aparecerá no painel da página inicial.</p>
      <div class="field"><label for="homeCommunicationText">Lembrete</label><input id="homeCommunicationText" required maxlength="160" autocomplete="off"></div>
      <div class="field"><label for="homeCommunicationDestination">Ao clicar, abrir (opcional)</label><select id="homeCommunicationDestination"><option value="none">Nada — apenas mostrar o aviso</option><option value="occurrences">Ocorrências</option><option value="students">Lista de alunos</option><option value="external">Link externo</option></select></div>
      <div class="field hidden" id="homeCommunicationUrlField"><label for="homeCommunicationUrl">Link HTTPS</label><input id="homeCommunicationUrl" type="url" placeholder="https://exemplo.com"></div>
      <div class="home-communication-schedule"><strong>Agendar exibição</strong><p>Escolha quando o lembrete começa e, se quiser, quando ele deixa de aparecer.</p>
        <div class="grid"><div class="field"><label for="homeCommunicationStart">Dia de início</label><input id="homeCommunicationStart" type="date" required></div><div class="field"><label for="homeCommunicationStartTime">Hora de início (opcional)</label><input id="homeCommunicationStartTime" type="time"></div></div>
        <div class="grid"><div class="field"><label for="homeCommunicationEnd">Último dia (opcional)</label><input id="homeCommunicationEnd" type="date"></div><div class="field"><label for="homeCommunicationEndTime">Hora de término (opcional)</label><input id="homeCommunicationEndTime" type="time"></div></div>
      </div>
      <div class="field"><label for="homeCommunicationSeconds">Tempo de cada exibição</label><select id="homeCommunicationSeconds"><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15" selected>15 segundos (padrão)</option><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option></select></div>
      <div class="home-communication-preview" aria-live="polite"><small>Prévia no painel</small><strong id="homeCommunicationPreviewText">Seu aviso aparecerá aqui</strong><span id="homeCommunicationPreviewDestination">Apenas aviso · 15 segundos</span><span id="homeCommunicationPreviewSchedule"></span></div>
      <p id="homeCommunicationError" class="error hidden" role="alert"></p>
      <div class="actions"><button type="button" class="btn secondary" data-home-communication-close>Cancelar</button><button type="submit" class="btn primary">Publicar lembrete</button></div>
    </form><section class="home-communication-management"><h4>Lembretes publicados</h4><div id="homeCommunicationManagementList"></div></section></section>`;
  document.body.append(modal);

  const by = id => document.getElementById(id);
  const safe = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const schoolId = () => window.getActiveSchoolId?.();
  const canPublish = () => ['school_admin', 'coordinator'].includes(window.getActiveSchoolRole?.());
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let generation = 0;
  let notices = [];
  let editingSchoolId = null;
  let visibilitySignature = '';
  const formatSchedule = (date, time) => `${date || ''}${time ? ` às ${String(time).slice(0, 5)}` : ''}`;

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
    by('homeCommunicationManagementList').innerHTML = notices.length ? notices.map(item => `<div class="home-communication-managed-item"><div><strong>${safe(item.title)}</strong><small>${item.starts_on > today || item.starts_on === today && item.start_time?.slice(0, 5) > currentTime ? 'Agendado · ' : ''}${safe(formatSchedule(item.starts_on, item.start_time))}${item.ends_on ? ` até ${safe(formatSchedule(item.ends_on, item.end_time))}` : ''} · ${Number(item.display_seconds) || 15}s</small></div>${canPublish() && (item.created_by === user?.id || window.getActiveSchoolRole?.() === 'school_admin') ? `<button type="button" data-home-notice-delete="${safe(item.id)}" aria-label="Excluir lembrete">Excluir</button>` : ''}</div>`).join('') : '<p class="meta">Nenhum lembrete publicado.</p>';
  }
  async function refresh() {
    const scope = { school:schoolId(), user:user?.id, generation:++generation };
    syncAccess();
    if (!scope.school || !scope.user || by('app').classList.contains('hidden')) { notices = []; render(); return; }
    const { data, error } = await db.from('school_home_communications')
      .select('id,title,destination_type,destination_url,starts_on,start_time,ends_on,end_time,created_by,display_seconds')
      .eq('school_id', scope.school).order('created_at', { ascending:false }).limit(100);
    if (scope.generation !== generation || scope.school !== schoolId() || scope.user !== user?.id) return;
    if (error) { list.innerHTML = ''; by('homeCommunicationManagementList').textContent = 'Lembretes indisponíveis.'; return; }
    notices = data || [];
    render();
  }

  editor.onclick = () => {
    if (!syncAccess()) return;
    editingSchoolId = schoolId();
    by('homeCommunicationForm').reset();
    by('homeCommunicationStart').value = localDate(new Date());
    by('homeCommunicationUrlField').classList.add('hidden');
    by('homeCommunicationUrl').required = false;
    by('homeCommunicationError').classList.add('hidden');
    updatePreview();
    modal.classList.remove('hidden');
    by('homeCommunicationText').focus();
  };
  by('homeCommunicationDestination').onchange = () => {
    const external = by('homeCommunicationDestination').value === 'external';
    by('homeCommunicationUrlField').classList.toggle('hidden', !external);
    by('homeCommunicationUrl').required = external;
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
  by('homeCommunicationSeconds').addEventListener('change', updatePreview);
  for (const id of ['homeCommunicationStart', 'homeCommunicationStartTime', 'homeCommunicationEnd', 'homeCommunicationEndTime']) by(id).addEventListener('change', updatePreview);
  modal.querySelectorAll('[data-home-communication-close]').forEach(button => button.onclick = () => modal.classList.add('hidden'));
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  by('homeCommunicationForm').onsubmit = async event => {
    event.preventDefault();
    if (!syncAccess() || editingSchoolId !== schoolId()) return;
    const destinationType = by('homeCommunicationDestination').value;
    const destinationUrl = destinationType === 'external' ? by('homeCommunicationUrl').value.trim() : null;
    const errorBox = by('homeCommunicationError');
    errorBox.classList.add('hidden');
    if (destinationUrl && !/^https:\/\/[^\s]+$/i.test(destinationUrl)) {
      errorBox.textContent = 'Informe um link HTTPS válido.'; errorBox.classList.remove('hidden'); return;
    }
    const start = by('homeCommunicationStart').value;
    const startTime = by('homeCommunicationStartTime').value || null;
    const end = by('homeCommunicationEnd').value || null;
    const endTime = by('homeCommunicationEndTime').value || null;
    if (end && end < start) { errorBox.textContent = 'A data final deve ser posterior à inicial.'; errorBox.classList.remove('hidden'); return; }
    if (endTime && !end) { errorBox.textContent = 'Escolha o último dia para definir a hora de término.'; errorBox.classList.remove('hidden'); return; }
    if (end === start && startTime && endTime && endTime < startTime) { errorBox.textContent = 'A hora de término deve ser posterior à hora de início.'; errorBox.classList.remove('hidden'); return; }
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    const { error } = await db.from('school_home_communications').insert({
      school_id:schoolId(), created_by:user.id, title:by('homeCommunicationText').value.trim(),
      destination_type:destinationType, destination_url:destinationUrl, starts_on:start, start_time:startTime, ends_on:end, end_time:endTime,
      display_seconds:Number(by('homeCommunicationSeconds').value)
    });
    button.disabled = false;
    if (error) { errorBox.textContent = 'Não foi possível publicar o aviso.'; errorBox.classList.remove('hidden'); return; }
    modal.classList.add('hidden'); refresh();
  };
  list.onclick = event => {
    const open = event.target.closest('[data-home-notice-open]');
    if (open) { const notice = notices.find(item => item.id === open.dataset.homeNoticeOpen); if (notice) navigate(notice); return; }
  };
  by('homeCommunicationManagementList').onclick = async event => {
    const remove = event.target.closest('[data-home-notice-delete]');
    if (!remove || !syncAccess()) return;
    if (!window.confirm('Excluir este aviso da escola?')) return;
    remove.disabled = true;
    const { error } = await db.from('school_home_communications').delete()
      .eq('id', remove.dataset.homeNoticeDelete).eq('school_id', schoolId());
    if (error) { remove.disabled = false; toast('Não foi possível excluir o aviso.'); return; }
    refresh();
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
