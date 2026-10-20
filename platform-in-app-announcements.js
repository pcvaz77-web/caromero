(() => {
  const TABLE = 'platform_in_app_announcements';
  const DISMISSALS = 'platform_in_app_announcement_dismissals';
  const VIDEO_BUCKET = 'platform-announcement-videos';
  const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
  const byId = id => document.getElementById(id);
  const clean = value => String(value || '').trim();
  const escapeHtml = value => {
    const node = document.createElement('div');
    node.textContent = value || '';
    return node.innerHTML;
  };
  const videoInfo = raw => {
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1);
      if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
        id = url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
      }
      if (/^[\w-]{11}$/.test(id || '')) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` };
      if (/\.mp4$/i.test(url.pathname)) return { kind: 'mp4', src: url.href };
    } catch {}
    return null;
  };

  let viewerId = null;
  let viewerGeneration = 0;
  let visibleAnnouncements = [];
  let featuredId = null;
  let announcementChannel = null;
  let channelUserId = null;
  let ownerRows = [];
  let selectedId = null;
  let selectedVideoPath = null;
  let videoChoiceVersion = 0;
  let ownerMounted = false;

  function emitAnnouncements() {
    document.dispatchEvent(new CustomEvent('carometro:platform-announcements', {
      detail: { announcements: visibleAnnouncements.map(({ id, title, message_body, published_at, video_url }) => ({ id, title, message_body, published_at, video_url })) }
    }));
  }

  function stopChannel() {
    if (announcementChannel) db.removeChannel(announcementChannel);
    announcementChannel = null;
    channelUserId = null;
  }

  function startChannel(userId) {
    if (channelUserId === userId) return;
    stopChannel();
    channelUserId = userId;
    announcementChannel = db.channel(`platform-announcements-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, refreshViewer)
      .subscribe();
  }

  async function showVideo(item) {
    if (!item) return;
    let info = videoInfo(item.video_url);
    if (item.video_storage_path) {
      const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUrl(item.video_storage_path, 3600);
      if (error || !data?.signedUrl) { toast('Não foi possível abrir o vídeo. Tente novamente.'); return; }
      info = { kind: 'mp4', src: data.signedUrl };
    }
    if (!info) return;
    const modal = byId('platformAnnouncementVideoModal');
    const content = byId('platformAnnouncementVideoContent');
    content.replaceChildren();
    const media = document.createElement(info.kind === 'youtube' ? 'iframe' : 'video');
    media.src = info.src;
    media.title = 'Vídeo do comunicado';
    if (info.kind === 'youtube') {
      media.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      media.allowFullscreen = true;
    } else {
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.setAttribute('playsinline', '');
      media.setAttribute('webkit-playsinline', '');
    }
    content.append(media);
    if (info.kind === 'mp4') {
      const errorMessage = document.createElement('p');
      errorMessage.className = 'platform-announcement-video-error hidden';
      errorMessage.textContent = 'Não foi possível reproduzir este MP4. Verifique sua conexão ou tente um arquivo H.264 com áudio AAC.';
      media.onerror = () => errorMessage.classList.remove('hidden');
      content.append(errorMessage);
      media.load();
    }
    modal.classList.remove('hidden');
    byId('platformAnnouncementVideoClose').focus();
  }

  function renderBanner() {
    const banner = byId('platformAnnouncementBanner');
    if (!banner) return;
    const item = visibleAnnouncements.find(row => row.id === featuredId) || visibleAnnouncements[0];
    banner.classList.toggle('hidden', !item || byId('app')?.classList.contains('hidden'));
    if (!item) return;
    byId('platformAnnouncementBannerTitle').textContent = item.title;
    byId('platformAnnouncementBannerBody').textContent = item.message_body;
    byId('platformAnnouncementBannerVideo').classList.toggle('hidden', !item.video_storage_path && !videoInfo(item.video_url));
    banner.dataset.announcementId = item.id;
  }

  async function refreshViewer() {
    const generation = ++viewerGeneration;
    const app = byId('app');
    if (!app || app.classList.contains('hidden')) {
      stopChannel();
      viewerId = null;
      visibleAnnouncements = [];
      renderBanner();
      emitAnnouncements();
      return;
    }
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (generation !== viewerGeneration || app.classList.contains('hidden')) return;
    if (!signedInUser) {
      stopChannel();
      viewerId = null;
      visibleAnnouncements = [];
      renderBanner();
      emitAnnouncements();
      return;
    }
    viewerId = signedInUser.id;
    startChannel(signedInUser.id);
    const announcementsResult = await db.from(TABLE).select('id,title,message_body,video_url,video_storage_path,published_at').eq('status', 'published').order('published_at', { ascending: false });
    if (generation !== viewerGeneration || viewerId !== signedInUser.id || app.classList.contains('hidden')) return;
    if (announcementsResult.error) return;
    const published = announcementsResult.data || [];
    if (!published.length) {
      visibleAnnouncements = [];
      renderBanner();
      emitAnnouncements();
      return;
    }
    const dismissalsResult = await db.from(DISMISSALS).select('announcement_id').eq('user_id', signedInUser.id).in('announcement_id', published.map(row => row.id));
    if (generation !== viewerGeneration || viewerId !== signedInUser.id || app.classList.contains('hidden') || dismissalsResult.error) return;
    const dismissed = new Set((dismissalsResult.data || []).map(row => row.announcement_id));
    visibleAnnouncements = published.filter(row => !dismissed.has(row.id));
    renderBanner();
    emitAnnouncements();
  }

  async function dismissAnnouncement(id) {
    if (!viewerId || !visibleAnnouncements.some(row => row.id === id)) return;
    const { error } = await db.from(DISMISSALS).upsert({ announcement_id: id, user_id: viewerId }, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
    if (error) { toast('Não foi possível fechar o aviso. Tente novamente.'); return; }
    visibleAnnouncements = visibleAnnouncements.filter(row => row.id !== id);
    renderBanner();
    emitAnnouncements();
  }

  function ownerStatus(message, error = false) {
    const output = byId('platformAnnouncementStatus');
    if (!output) return;
    output.textContent = message;
    output.classList.toggle('error', error);
  }

  function validateVideoFile(file) {
    if (file.type !== 'video/mp4' || !/\.mp4$/i.test(file.name)) throw new Error('Escolha um arquivo MP4.');
    if (!file.size || file.size > MAX_VIDEO_BYTES) throw new Error('O MP4 deve ter até 45 MB. Comprima o vídeo antes de enviar.');
    return new Promise((resolve, reject) => {
      const media = document.createElement('video');
      const url = URL.createObjectURL(file);
      let done = false;
      const finish = error => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        media.removeAttribute('src');
        media.load();
        URL.revokeObjectURL(url);
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Não foi possível ler a duração do MP4. Escolha outro arquivo.')), 15000);
      media.onloadedmetadata = () => finish(Number.isFinite(media.duration) && media.duration > 0
        ? null : new Error('Não foi possível confirmar a duração deste MP4. Escolha outro arquivo.'));
      media.onerror = () => finish(new Error('Não foi possível abrir este MP4. Escolha outro arquivo.'));
      media.preload = 'metadata';
      media.src = url;
    });
  }

  function updateVideoChoice() {
    const file = byId('platformAnnouncementVideoFile').files?.[0];
    const label = byId('platformAnnouncementVideoChoice');
    label.textContent = file ? `Arquivo selecionado: ${file.name}` : selectedVideoPath ? 'MP4 já enviado para este aviso.' : 'Nenhum arquivo selecionado.';
    byId('platformAnnouncementRemoveVideo').classList.toggle('hidden', !file && !selectedVideoPath && !clean(byId('platformAnnouncementVideoUrl').value));
  }

  function ownerFormData() {
    const title = clean(byId('platformAnnouncementTitle').value);
    const message_body = clean(byId('platformAnnouncementMessage').value);
    const video_url = clean(byId('platformAnnouncementVideoUrl').value) || null;
    const file = byId('platformAnnouncementVideoFile').files?.[0] || null;
    if (title.length < 3 || message_body.length < 3) throw new Error('Informe um título e uma mensagem com pelo menos 3 caracteres.');
    if (video_url && !videoInfo(video_url)) throw new Error('Use um link HTTPS do YouTube ou de um arquivo MP4 público.');
    if (file && video_url) throw new Error('Escolha um link ou um arquivo MP4, não os dois.');
    return { values: { title, message_body, video_url, video_storage_path: file || video_url ? null : selectedVideoPath }, file };
  }

  async function prepareVideo(input) {
    if (!input.file) return { values: input.values, uploadedPath: null };
    await validateVideoFile(input.file);
    const { data: { user: signedInUser }, error: authError } = await db.auth.getUser();
    if (authError || !signedInUser || signedInUser.id !== (viewerId || user?.id)) throw new Error('Sua sessão expirou. Entre novamente.');
    const path = `${signedInUser.id}/${crypto.randomUUID()}.mp4`;
    ownerStatus('Enviando vídeo MP4...');
    const { error } = await db.storage.from(VIDEO_BUCKET).upload(path, input.file, { contentType: 'video/mp4', upsert: false });
    if (error) throw new Error(`Não foi possível enviar o MP4: ${error.message}`);
    return { values: { ...input.values, video_storage_path: path }, uploadedPath: path };
  }

  async function removeUnusedVideo(path) {
    if (!path) return;
    try {
      const { error } = await db.storage.from(VIDEO_BUCKET).remove([path]);
      if (error) console.warn('Não foi possível remover MP4 sem uso:', error.message);
    } catch (error) { console.warn('Não foi possível remover MP4 sem uso:', error); }
  }

  function renderOwnerPreview() {
    byId('platformAnnouncementPreviewTitle').textContent = clean(byId('platformAnnouncementTitle').value) || 'Título do aviso';
    byId('platformAnnouncementPreviewBody').textContent = clean(byId('platformAnnouncementMessage').value) || 'A mensagem aparecerá aqui para todos os usuários.';
    byId('platformAnnouncementPreviewVideo').classList.toggle('hidden', !selectedVideoPath && !byId('platformAnnouncementVideoFile').files?.length && !videoInfo(clean(byId('platformAnnouncementVideoUrl').value)));
  }

  function resetOwnerForm() {
    selectedId = null;
    selectedVideoPath = null;
    videoChoiceVersion++;
    byId('platformAnnouncementForm').reset();
    byId('platformAnnouncementForm').querySelectorAll('input,textarea').forEach(field => { field.disabled = false; });
    byId('platformAnnouncementSave').disabled = false;
    byId('platformAnnouncementPublish').disabled = false;
    byId('platformAnnouncementPublish').textContent = 'Publicar para todos';
    byId('platformAnnouncementRemoveVideo').disabled = false;
    ownerStatus('Novo aviso. Salve um rascunho ou publique quando estiver pronto.');
    updateVideoChoice();
    renderOwnerPreview();
  }

  function selectOwnerRow(id) {
    const row = ownerRows.find(item => item.id === id);
    if (!row) return;
    selectedId = row.status === 'draft' ? id : null;
    selectedVideoPath = row.video_storage_path || null;
    videoChoiceVersion++;
    byId('platformAnnouncementTitle').value = row.title;
    byId('platformAnnouncementMessage').value = row.message_body;
    byId('platformAnnouncementVideoUrl').value = row.video_url || '';
    byId('platformAnnouncementVideoFile').value = '';
    byId('platformAnnouncementForm').querySelectorAll('input,textarea').forEach(field => { field.disabled = row.status !== 'draft'; });
    byId('platformAnnouncementSave').disabled = row.status !== 'draft';
    byId('platformAnnouncementPublish').disabled = row.status !== 'draft';
    byId('platformAnnouncementPublish').textContent = 'Publicar rascunho para todos';
    ownerStatus(row.status === 'draft' ? 'Rascunho carregado para edição.' : 'Prévia do aviso. Clique em Novo aviso para escrever outro.');
    byId('platformAnnouncementRemoveVideo').disabled = row.status !== 'draft';
    updateVideoChoice();
    renderOwnerPreview();
  }

  function renderOwnerList() {
    const container = byId('platformAnnouncementList');
    if (!container) return;
    container.innerHTML = ownerRows.length ? ownerRows.map(row => `
      <div class="platform-announcement-row">
        <div><strong>${escapeHtml(row.title)}</strong><small>${row.status === 'published' ? 'Publicado para todos' : row.status === 'archived' ? 'Encerrado' : 'Rascunho'} · ${new Date(row.published_at || row.created_at).toLocaleString('pt-BR')}</small></div>
        <div class="platform-announcement-row-actions"><button type="button" class="btn secondary" data-preview="${row.id}">${row.status === 'draft' ? 'Editar' : 'Ver'}</button>${row.status === 'published' ? `<button type="button" class="btn secondary" data-archive="${row.id}">Encerrar</button>` : ''}</div>
      </div>`).join('') : '<p class="meta">Nenhum aviso criado.</p>';
  }

  async function loadOwnerRows() {
    const { data, error } = await db.from(TABLE).select('id,title,message_body,video_url,video_storage_path,status,created_at,published_at').order('created_at', { ascending: false }).limit(100);
    if (error) { ownerStatus(`Não foi possível carregar avisos: ${error.message}`, true); return; }
    ownerRows = data || [];
    renderOwnerList();
  }

  async function saveDraft() {
    let input;
    try { input = ownerFormData(); } catch (error) { ownerStatus(error.message, true); return; }
    const row = ownerRows.find(item => item.id === selectedId);
    if (selectedId && row?.status !== 'draft') { ownerStatus('Só rascunhos podem ser editados.', true); return; }
    byId('platformAnnouncementSave').disabled = true;
    byId('platformAnnouncementPublish').disabled = true;
    const createdBy = viewerId || user?.id;
    let uploadedPath = null;
    let persisted = false;
    try {
      if (!createdBy) throw new Error('Sua sessão expirou. Entre novamente.');
      const prepared = await prepareVideo(input);
      uploadedPath = prepared.uploadedPath;
      const result = selectedId
        ? await db.from(TABLE).update(prepared.values).eq('id', selectedId).eq('status', 'draft').select('id').single()
        : await db.from(TABLE).insert({ ...prepared.values, created_by: createdBy, status: 'draft' }).select('id').single();
      if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível salvar o rascunho.');
      persisted = true;
      selectedId = result.data.id;
      selectedVideoPath = prepared.values.video_storage_path;
      byId('platformAnnouncementVideoFile').value = '';
      videoChoiceVersion++;
      if (row?.video_storage_path && row.video_storage_path !== selectedVideoPath) await removeUnusedVideo(row.video_storage_path);
      updateVideoChoice();
      renderOwnerPreview();
      ownerStatus('Rascunho salvo. Ainda não está visível aos usuários.');
      await loadOwnerRows();
    } catch (error) {
      if (!persisted && uploadedPath) await removeUnusedVideo(uploadedPath);
      ownerStatus(persisted ? 'Rascunho salvo, mas não foi possível atualizar a lista. Reabra Comunicações para conferir.' : error.message, true);
    } finally {
      byId('platformAnnouncementSave').disabled = false;
      byId('platformAnnouncementPublish').disabled = false;
    }
  }

  async function publish() {
    let input;
    try { input = ownerFormData(); } catch (error) { ownerStatus(error.message, true); return; }
    if (!confirm('Publicar este aviso para todos os usuários do Carômetro? Ele aparecerá no topo da tela e no sino até cada pessoa fechar o aviso ou você encerrá-lo.')) return;
    byId('platformAnnouncementPublish').disabled = true;
    byId('platformAnnouncementSave').disabled = true;
    const createdBy = viewerId || user?.id;
    let uploadedPath = null;
    let published = false;
    try {
      if (!createdBy) throw new Error('Sua sessão expirou. Entre novamente.');
      const prepared = await prepareVideo(input);
      uploadedPath = prepared.uploadedPath;
      if (selectedId) {
        const result = await db.from(TABLE).update({ ...prepared.values, status: 'published', published_at: new Date().toISOString() }).eq('id', selectedId).eq('status', 'draft').select('id').single();
        if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível publicar o rascunho.');
        published = true;
      } else {
        const created = await db.from(TABLE).insert({ ...prepared.values, created_by: createdBy, status: 'draft' }).select('id').single();
        if (created.error || !created.data) throw new Error(created.error?.message || 'Não foi possível criar o aviso.');
        const result = await db.from(TABLE).update({ status: 'published', published_at: new Date().toISOString() }).eq('id', created.data.id).eq('status', 'draft').select('id').single();
        if (result.error || !result.data) throw new Error(result.error?.message || 'O aviso foi salvo como rascunho, mas não foi publicado.');
        published = true;
      }
      const oldPath = ownerRows.find(item => item.id === selectedId)?.video_storage_path;
      if (oldPath && oldPath !== prepared.values.video_storage_path) await removeUnusedVideo(oldPath);
      resetOwnerForm();
      ownerStatus('Aviso publicado para todos os usuários.');
      await Promise.all([loadOwnerRows(), refreshViewer()]);
    } catch (error) {
      if (!published && uploadedPath) await removeUnusedVideo(uploadedPath);
      ownerStatus(published ? 'Aviso publicado, mas não foi possível atualizar a lista. Reabra Comunicações para conferir.' : `Não foi possível publicar: ${error.message}`, true);
      await loadOwnerRows();
    } finally {
      byId('platformAnnouncementPublish').disabled = false;
      byId('platformAnnouncementSave').disabled = false;
    }
  }

  async function archive(id) {
    const row = ownerRows.find(item => item.id === id && item.status === 'published');
    if (!row || !confirm(`Encerrar o aviso “${row.title}” para todos os usuários?`)) return;
    const { error } = await db.from(TABLE).update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id).eq('status', 'published').select('id').single();
    if (error) { ownerStatus(error.message, true); return; }
    ownerStatus('Aviso encerrado para todos.');
    await Promise.all([loadOwnerRows(), refreshViewer()]);
  }

  function mountOwner() {
    if (ownerMounted || !byId('platformCommunicationsRoot')) return;
    ownerMounted = true;
    const root = byId('platformCommunicationsRoot');
    const shell = document.createElement('div');
    shell.className = 'platform-announcement-shell';
    shell.innerHTML = `
      <nav class="platform-announcement-tabs" aria-label="Canais de comunicação">
        <button type="button" class="active" data-channel="in-app" aria-selected="true">Mensagem direta no Carômetro</button>
        <button type="button" data-channel="whatsapp" aria-selected="false">Mensagens pelo WhatsApp</button>
        <button type="button" data-channel="email" aria-selected="false">Campanhas por e-mail</button>
      </nav>
      <div id="platformAnnouncementOwnerArea">
        <p class="platform-announcement-intro">Publique uma mensagem para todas as pessoas com acesso ao Carômetro. Ela aparece no topo da tela e no sino; cada pessoa pode fechá-la individualmente.</p>
        <div class="platform-announcement-owner-grid"><section class="platform-panel"><div class="platform-panel-head"><div><h4>Novo aviso para todos</h4><p>Título, mensagem e vídeo opcional. Nenhuma ação adicional é exigida de quem receber.</p></div><button type="button" id="platformAnnouncementNew" class="btn secondary">Novo aviso</button></div>
          <form id="platformAnnouncementForm" class="platform-announcement-form">
            <div class="field"><label for="platformAnnouncementTitle">Título</label><input id="platformAnnouncementTitle" maxlength="120" required placeholder="Ex.: Novidade no Carômetro"></div>
            <div class="field"><label for="platformAnnouncementMessage">Mensagem</label><textarea id="platformAnnouncementMessage" maxlength="2000" rows="5" required placeholder="Escreva a informação que aparecerá para todos."></textarea></div>
            <div class="field"><label for="platformAnnouncementVideoUrl">Link do vídeo (opcional)</label><input id="platformAnnouncementVideoUrl" type="url" maxlength="500" placeholder="Link do YouTube ou de um MP4 público"></div>
            <div class="field platform-announcement-file-field"><label for="platformAnnouncementVideoFile">Ou envie um MP4 do computador ou celular</label><input id="platformAnnouncementVideoFile" type="file" accept="video/mp4,.mp4"><small>Até 45 MB, sem limite de duração. O vídeo só abre quando a pessoa clicar em “Ver vídeo”.</small><div class="platform-announcement-file-choice"><span id="platformAnnouncementVideoChoice">Nenhum arquivo selecionado.</span><button type="button" id="platformAnnouncementRemoveVideo" class="link hidden">Remover vídeo</button></div></div>
            <div class="platform-announcement-actions"><button type="submit" id="platformAnnouncementSave" class="btn secondary">Salvar rascunho</button><button type="button" id="platformAnnouncementPublish" class="btn primary">Publicar para todos</button></div>
            <p id="platformAnnouncementStatus" class="meta" role="status">Prepare seu aviso.</p>
          </form></section>
          <div><section class="platform-panel"><div class="platform-panel-head"><h4>Prévia na tela do usuário</h4></div><div class="platform-announcement-preview"><div><small id="platformAnnouncementPreviewTitle">Título do aviso</small><strong id="platformAnnouncementPreviewBody">A mensagem aparecerá aqui para todos os usuários.</strong><span id="platformAnnouncementPreviewVideo" class="hidden">▶ Ver vídeo</span></div><span aria-hidden="true">×</span></div></section>
          <section class="platform-panel platform-announcement-history"><div class="platform-panel-head"><h4>Avisos criados</h4></div><div id="platformAnnouncementList" class="platform-announcement-list"></div></section></div></div>
      </div>
      <section id="platformAnnouncementWhatsAppArea" class="platform-panel platform-announcement-placeholder hidden"><h4>Mensagens pelo WhatsApp</h4><p>Área reservada para organizar este canal em uma próxima etapa.</p></section>
      <section id="platformAnnouncementEmailArea" class="platform-panel platform-announcement-placeholder hidden"><h4>Campanhas por e-mail</h4><p>Área reservada para organizar este canal em uma próxima etapa.</p></section>`;
    root.replaceChildren(shell);
    shell.querySelectorAll('[data-channel]').forEach(button => button.onclick = () => {
      const channel = button.dataset.channel;
      byId('platformAnnouncementOwnerArea').classList.toggle('hidden', channel !== 'in-app');
      byId('platformAnnouncementWhatsAppArea').classList.toggle('hidden', channel !== 'whatsapp');
      byId('platformAnnouncementEmailArea').classList.toggle('hidden', channel !== 'email');
      shell.querySelectorAll('[data-channel]').forEach(tab => {
        tab.classList.toggle('active', tab === button);
        tab.setAttribute('aria-selected', String(tab === button));
      });
    });
    byId('platformAnnouncementForm').onsubmit = event => { event.preventDefault(); saveDraft(); };
    byId('platformAnnouncementForm').addEventListener('input', renderOwnerPreview);
    byId('platformAnnouncementVideoUrl').addEventListener('input', () => {
      if (clean(byId('platformAnnouncementVideoUrl').value)) {
        byId('platformAnnouncementVideoFile').value = '';
        selectedVideoPath = null;
        videoChoiceVersion++;
      }
      updateVideoChoice();
      renderOwnerPreview();
    });
    byId('platformAnnouncementVideoFile').addEventListener('change', () => {
      const file = byId('platformAnnouncementVideoFile').files?.[0];
      if (file) {
        byId('platformAnnouncementVideoUrl').value = '';
        selectedVideoPath = null;
        const version = ++videoChoiceVersion;
        Promise.resolve().then(() => validateVideoFile(file)).then(
          () => { if (version === videoChoiceVersion) ownerStatus('MP4 pronto para enviar. Salve o rascunho ou publique o aviso.'); },
          error => { if (version === videoChoiceVersion) ownerStatus(error.message, true); }
        );
      } else videoChoiceVersion++;
      updateVideoChoice();
      renderOwnerPreview();
    });
    byId('platformAnnouncementRemoveVideo').onclick = () => {
      byId('platformAnnouncementVideoUrl').value = '';
      byId('platformAnnouncementVideoFile').value = '';
      selectedVideoPath = null;
      videoChoiceVersion++;
      updateVideoChoice();
      renderOwnerPreview();
    };
    byId('platformAnnouncementNew').onclick = resetOwnerForm;
    byId('platformAnnouncementPublish').onclick = publish;
    byId('platformAnnouncementList').onclick = event => {
      const preview = event.target.closest('[data-preview]');
      const end = event.target.closest('[data-archive]');
      if (preview) selectOwnerRow(preview.dataset.preview);
      if (end) archive(end.dataset.archive);
    };
  }

  window.openPlatformCommunications = async () => {
    mountOwner();
    await loadOwnerRows();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('section');
    banner.id = 'platformAnnouncementBanner';
    banner.className = 'platform-announcement-banner hidden';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<div class="platform-announcement-banner-copy"><small id="platformAnnouncementBannerTitle"></small><strong id="platformAnnouncementBannerBody"></strong><button type="button" id="platformAnnouncementBannerVideo" class="platform-announcement-video hidden">▶ Ver vídeo</button></div><button type="button" id="platformAnnouncementDismiss" class="platform-announcement-dismiss" aria-label="Fechar aviso" title="Fechar aviso">×</button>';
    byId('app')?.querySelector('.main')?.prepend(banner);
    const modal = document.createElement('div');
    modal.id = 'platformAnnouncementVideoModal';
    modal.className = 'platform-announcement-video-modal hidden';
    modal.innerHTML = '<div class="platform-announcement-video-dialog" role="dialog" aria-modal="true" aria-label="Vídeo do comunicado"><button type="button" id="platformAnnouncementVideoClose" aria-label="Fechar vídeo">×</button><div id="platformAnnouncementVideoContent"></div></div>';
    document.body.append(modal);
    byId('platformAnnouncementDismiss').onclick = () => dismissAnnouncement(banner.dataset.announcementId);
    document.addEventListener('carometro:dismiss-platform-announcement', event => dismissAnnouncement(event.detail?.id));
    byId('platformAnnouncementBannerVideo').onclick = () => showVideo(visibleAnnouncements.find(row => row.id === banner.dataset.announcementId));
    document.addEventListener('carometro:show-platform-announcement', event => {
      if (!visibleAnnouncements.some(row => row.id === event.detail?.id)) return;
      featuredId = event.detail.id;
      renderBanner();
      banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    byId('platformAnnouncementVideoClose').onclick = () => { modal.classList.add('hidden'); byId('platformAnnouncementVideoContent').replaceChildren(); };
    modal.onclick = event => { if (event.target === modal) byId('platformAnnouncementVideoClose').click(); };
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) byId('platformAnnouncementVideoClose').click(); });
    new MutationObserver(refreshViewer).observe(byId('app'), { attributes: true, attributeFilter: ['class'] });
    db.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || !session?.user) refreshViewer(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshViewer(); });
    window.addEventListener('online', refreshViewer);
    setInterval(() => { if (!document.hidden && !byId('app')?.classList.contains('hidden')) refreshViewer(); }, 30000);
    refreshViewer();
  });
})();
