document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('#app .home-overview');
  const header = card?.querySelector('.home-overview-head');
  const reminders = document.getElementById('homeReminderList');
  if (!card || !header || !reminders) return;

  const editor = document.createElement('button');
  editor.id = 'homeCommunicationButton';
  editor.type = 'button';
  editor.className = 'btn secondary hidden';
  editor.textContent = 'Comunicação';
  header.insertBefore(editor, document.getElementById('homeAddReminder'));

  const list = document.createElement('div');
  list.id = 'homeCommunicationList';
  list.className = 'home-communication-list';
  header.after(list);

  const modal = document.createElement('div');
  modal.id = 'homeCommunicationModal';
  modal.className = 'modal-bg home-communication-modal hidden';
  modal.innerHTML = `<section class="modal small" role="dialog" aria-modal="true" aria-labelledby="homeCommunicationTitle">
    <div class="modal-head"><h3 id="homeCommunicationTitle">Comunicação da escola</h3><button type="button" class="close" data-home-communication-close aria-label="Fechar">×</button></div>
    <form id="homeCommunicationForm" class="form">
      <p class="meta">O aviso aparece para todos os usuários da escola ativa.</p>
      <div class="field"><label for="homeCommunicationText">Aviso</label><input id="homeCommunicationText" required maxlength="160" autocomplete="off"></div>
      <div class="field"><label for="homeCommunicationDestination">Ao clicar, abrir</label><select id="homeCommunicationDestination"><option value="occurrences">Ocorrências</option><option value="students">Lista de alunos</option><option value="external">Link externo</option></select></div>
      <div class="field hidden" id="homeCommunicationUrlField"><label for="homeCommunicationUrl">Link HTTPS</label><input id="homeCommunicationUrl" type="url" placeholder="https://exemplo.com"></div>
      <div class="grid"><div class="field"><label for="homeCommunicationStart">Exibir a partir de</label><input id="homeCommunicationStart" type="date" required></div><div class="field"><label for="homeCommunicationEnd">Exibir até (opcional)</label><input id="homeCommunicationEnd" type="date"></div></div>
      <div class="field"><label for="homeCommunicationSeconds">Tempo de cada exibição</label><select id="homeCommunicationSeconds"><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15" selected>15 segundos (padrão)</option><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option></select></div>
      <div class="home-communication-preview" aria-live="polite"><small>Prévia no painel</small><strong id="homeCommunicationPreviewText">Seu aviso aparecerá aqui</strong><span id="homeCommunicationPreviewDestination">Destino: Ocorrências · 15 segundos</span></div>
      <p id="homeCommunicationError" class="error hidden" role="alert"></p>
      <div class="actions"><button type="button" class="btn secondary" data-home-communication-close>Cancelar</button><button type="submit" class="btn primary">Publicar aviso</button></div>
    </form></section>`;
  document.body.append(modal);

  const by = id => document.getElementById(id);
  const safe = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const schoolId = () => window.getActiveSchoolId?.();
  const canPublish = () => ['school_admin', 'coordinator', 'secretary'].includes(window.getActiveSchoolRole?.());
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let generation = 0;
  let notices = [];
  let editingSchoolId = null;

  function syncAccess() {
    const allowed = !!schoolId() && canPublish() && !by('app').classList.contains('hidden');
    editor.classList.toggle('hidden', !allowed);
    if (!allowed || (editingSchoolId && editingSchoolId !== schoolId())) modal.classList.add('hidden');
    return allowed;
  }
  function navigate(notice) {
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
  function render() {
    const today = localDate(new Date());
    const visible = notices.filter(item => item.starts_on <= today && (!item.ends_on || item.ends_on >= today));
    list.innerHTML = visible.length ? `<div class="home-communication-label">Avisos da escola</div>${visible.map(item => `
      <div class="home-communication-row" data-display-seconds="${Number(item.display_seconds) || 15}"><button type="button" data-home-notice-open="${safe(item.id)}">${safe(item.title)} <span aria-hidden="true">↗</span></button>
      ${canPublish() && (item.created_by === user?.id || window.getActiveSchoolRole?.() === 'school_admin') ? `<button type="button" class="home-communication-delete" data-home-notice-delete="${safe(item.id)}" aria-label="Excluir aviso">×</button>` : ''}</div>`).join('')}` : '';
  }
  async function refresh() {
    const scope = { school:schoolId(), user:user?.id, generation:++generation };
    syncAccess();
    if (!scope.school || !scope.user || by('app').classList.contains('hidden')) { notices = []; render(); return; }
    const { data, error } = await db.from('school_home_communications')
      .select('id,title,destination_type,destination_url,starts_on,ends_on,created_by,display_seconds')
      .eq('school_id', scope.school).order('created_at', { ascending:false }).limit(100);
    if (scope.generation !== generation || scope.school !== schoolId() || scope.user !== user?.id) return;
    if (error) { list.innerHTML = '<p class="meta">Avisos da escola indisponíveis.</p>'; return; }
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
    by('homeCommunicationPreviewDestination').textContent = `Destino: ${destination.selectedOptions[0]?.textContent || 'Ocorrências'} · ${by('homeCommunicationSeconds').value} segundos`;
  }
  by('homeCommunicationText').addEventListener('input', updatePreview);
  by('homeCommunicationSeconds').addEventListener('change', updatePreview);
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
    const end = by('homeCommunicationEnd').value || null;
    if (end && end < start) { errorBox.textContent = 'A data final deve ser posterior à inicial.'; errorBox.classList.remove('hidden'); return; }
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    const { error } = await db.from('school_home_communications').insert({
      school_id:schoolId(), created_by:user.id, title:by('homeCommunicationText').value.trim(),
      destination_type:destinationType, destination_url:destinationUrl, starts_on:start, ends_on:end,
      display_seconds:Number(by('homeCommunicationSeconds').value)
    });
    button.disabled = false;
    if (error) { errorBox.textContent = 'Não foi possível publicar o aviso.'; errorBox.classList.remove('hidden'); return; }
    modal.classList.add('hidden'); refresh();
  };
  list.onclick = async event => {
    const open = event.target.closest('[data-home-notice-open]');
    if (open) { const notice = notices.find(item => item.id === open.dataset.homeNoticeOpen); if (notice) navigate(notice); return; }
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
  window.addEventListener('focus', refresh);
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  refresh();
});
