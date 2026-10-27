(() => {
  const TABLE = 'platform_in_app_announcements';
  const DISMISSALS = 'platform_in_app_announcement_dismissals';
  const VIDEO_BUCKET = 'platform-announcement-videos';
  const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
  const ROLE_LABELS = { teacher: 'Professor', coordinator: 'Coordenador', secretary: 'Secretário', school_admin: 'Administrador' };
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

  async function prepareMp4ForStreaming(file) {
    const boxes = [];
    for (let offset = 0; offset < file.size;) {
      const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
      if (header.byteLength < 8) throw new Error('Este MP4 está incompleto. Escolha outro arquivo.');
      let size = header.getUint32(0);
      const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
      const headerSize = size === 1 ? 16 : 8;
      if (size === 1 && header.byteLength >= 16) size = Number(header.getBigUint64(8));
      else if (size === 0) size = file.size - offset;
      if (!Number.isSafeInteger(size) || size < headerSize || offset + size > file.size) {
        throw new Error('Este MP4 está incompleto. Escolha outro arquivo.');
      }
      boxes.push({ type, offset, size, headerSize });
      offset += size;
    }
    const ftyp = boxes[0];
    const moov = boxes.find(box => box.type === 'moov');
    const mdat = boxes.find(box => box.type === 'mdat');
    if (!ftyp || ftyp.type !== 'ftyp' || !moov || !mdat) throw new Error('Formato MP4 não reconhecido. Exporte novamente o vídeo.');
    if (moov.offset < mdat.offset) return file;
    if (boxes.at(-1) !== moov) throw new Error('Este MP4 precisa ser exportado com “início rápido” para funcionar no celular.');

    const moovBytes = new Uint8Array(await file.slice(moov.offset, moov.offset + moov.size).arrayBuffer());
    const view = new DataView(moovBytes.buffer);
    let chunkTables = 0;
    function visit(start, end) {
      for (let offset = start; offset < end;) {
        if (offset + 8 > end) throw new Error('Índice do MP4 inválido. Exporte novamente o vídeo.');
        let size = view.getUint32(offset);
        const type = String.fromCharCode(...moovBytes.subarray(offset + 4, offset + 8));
        const headerSize = size === 1 ? 16 : 8;
        if (size === 1 && offset + 16 <= end) size = Number(view.getBigUint64(offset + 8));
        else if (size === 0) size = end - offset;
        if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) throw new Error('Índice do MP4 inválido. Exporte novamente o vídeo.');
        if (type === 'stco' || type === 'co64') {
          const count = view.getUint32(offset + headerSize + 4);
          const width = type === 'stco' ? 4 : 8;
          const entries = offset + headerSize + 8;
          if (entries + count * width > offset + size) throw new Error('Índice do MP4 inválido. Exporte novamente o vídeo.');
          chunkTables++;
          for (let i = 0; i < count; i++) {
            const at = entries + i * width;
            const oldOffset = width === 4 ? view.getUint32(at) : Number(view.getBigUint64(at));
            const nextOffset = oldOffset + moov.size;
            if (oldOffset < ftyp.size || oldOffset >= moov.offset || !Number.isSafeInteger(nextOffset) || (width === 4 && nextOffset > 0xffffffff)) {
              throw new Error('Índice do MP4 incompatível. Exporte com “início rápido”.');
            }
            if (width === 4) view.setUint32(at, nextOffset);
            else view.setBigUint64(at, BigInt(nextOffset));
          }
        } else if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) {
          visit(offset + headerSize, offset + size);
        }
        offset += size;
      }
    }
    visit(0, moovBytes.length);
    if (!chunkTables) throw new Error('Este MP4 precisa ser exportado com “início rápido” para funcionar no celular.');
    return new File([file.slice(0, ftyp.size), moovBytes, file.slice(ftyp.size, moov.offset)], file.name, { type: 'video/mp4' });
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
    const target_roles = selectedOwnerRoles();
    if (title.length < 3 || message_body.length < 3) throw new Error('Informe um título e uma mensagem com pelo menos 3 caracteres.');
    if (video_url && !videoInfo(video_url)) throw new Error('Use um link HTTPS do YouTube ou de um arquivo MP4 público.');
    if (file && video_url) throw new Error('Escolha um link ou um arquivo MP4, não os dois.');
    if (target_roles?.length === 0) throw new Error('Selecione ao menos um perfil ou Todos.');
    return { values: { title, message_body, video_url, video_storage_path: file || video_url ? null : selectedVideoPath, target_roles }, file };
  }

  function selectedOwnerRoles() {
    if (byId('platformAnnouncementRoleAll').checked) return null;
    return Object.keys(ROLE_LABELS).filter(role => byId(`platformAnnouncementRole-${role}`).checked);
  }

  function audienceLabel(roles) {
    return roles === null || roles === undefined ? 'Todos' : roles.map(role => ROLE_LABELS[role]).filter(Boolean).join(', ') || 'Nenhum perfil';
  }

  function updateOwnerAudience() {
    const label = audienceLabel(selectedOwnerRoles());
    byId('platformAnnouncementPreviewAudience').textContent = `Visível para: ${label}`;
    byId('platformAnnouncementPublish').textContent = 'Publicar aviso';
  }

  async function prepareVideo(input) {
    if (!input.file) return { values: input.values, uploadedPath: null };
    await validateVideoFile(input.file);
    ownerStatus('Preparando MP4 para computador e celular...');
    const uploadFile = await prepareMp4ForStreaming(input.file);
    if (uploadFile !== input.file) await validateVideoFile(uploadFile);
    const { data: { user: signedInUser }, error: authError } = await db.auth.getUser();
    if (authError || !signedInUser || signedInUser.id !== (viewerId || user?.id)) throw new Error('Sua sessão expirou. Entre novamente.');
    const path = `${signedInUser.id}/${crypto.randomUUID()}.mp4`;
    ownerStatus('Enviando vídeo MP4...');
    const { error } = await db.storage.from(VIDEO_BUCKET).upload(path, uploadFile, { contentType: 'video/mp4', upsert: false });
    if (error) throw new Error(`Não foi possível enviar o MP4: ${error.message}`);
    return { values: { ...input.values, video_storage_path: path }, uploadedPath: path };
  }

  async function removeUnusedVideo(path) {
    if (!path) return true;
    try {
      const { error } = await db.storage.from(VIDEO_BUCKET).remove([path]);
      if (error) throw error;
      return true;
    } catch (error) { console.warn('Não foi possível remover MP4 sem uso:', error); return false; }
  }

  async function removeReplacedVideos(paths) {
    if (!paths?.length) return true;
    try {
      const { error } = await db.storage.from(VIDEO_BUCKET).remove(paths);
      if (error) throw error;
      return true;
    } catch (error) { console.warn('Não foi possível remover os MP4s substituídos:', error); return false; }
  }

  function renderOwnerPreview() {
    byId('platformAnnouncementPreviewTitle').textContent = clean(byId('platformAnnouncementTitle').value) || 'Título do aviso';
    byId('platformAnnouncementPreviewBody').textContent = clean(byId('platformAnnouncementMessage').value) || 'A mensagem aparecerá aqui para os perfis escolhidos.';
    updateOwnerAudience();
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
    byId('platformAnnouncementRoleAll').checked = true;
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
    byId('platformAnnouncementRoleAll').checked = !row.target_roles;
    Object.keys(ROLE_LABELS).forEach(role => { byId(`platformAnnouncementRole-${role}`).checked = !!row.target_roles?.includes(role); });
    byId('platformAnnouncementForm').querySelectorAll('input,textarea').forEach(field => { field.disabled = row.status !== 'draft'; });
    byId('platformAnnouncementSave').disabled = row.status !== 'draft';
    byId('platformAnnouncementPublish').disabled = row.status !== 'draft';
    byId('platformAnnouncementPublish').textContent = 'Publicar aviso';
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
        <div><strong>${escapeHtml(row.title)}</strong><small>${row.status === 'published' ? 'Publicado' : 'Rascunho'} · ${escapeHtml(audienceLabel(row.target_roles))} · ${new Date(row.published_at || row.created_at).toLocaleString('pt-BR')}</small></div>
        <div class="platform-announcement-row-actions"><button type="button" class="btn secondary" data-preview="${row.id}">${row.status === 'draft' ? 'Editar' : 'Ver'}</button>${row.status === 'published' ? `<button type="button" class="btn secondary" data-delete="${row.id}">Excluir aviso</button>` : ''}</div>
      </div>`).join('') : '<p class="meta">Nenhum aviso criado.</p>';
  }

  async function loadOwnerRows() {
    const { data, error } = await db.from(TABLE).select('id,title,message_body,video_url,video_storage_path,target_roles,status,created_at,published_at').in('status', ['draft', 'published']).order('created_at', { ascending: false }).limit(100);
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
    if (!confirm(`Publicar este aviso para: ${audienceLabel(input.values.target_roles)}? O aviso publicado anteriormente será excluído definitivamente.`)) return;
    byId('platformAnnouncementPublish').disabled = true;
    byId('platformAnnouncementSave').disabled = true;
    const createdBy = viewerId || user?.id;
    let uploadedPath = null;
    let persisted = false;
    let published = false;
    try {
      if (!createdBy) throw new Error('Sua sessão expirou. Entre novamente.');
      const draft = ownerRows.find(item => item.id === selectedId);
      if (selectedId && draft?.status !== 'draft') throw new Error('Só rascunhos podem ser publicados.');
      const prepared = await prepareVideo(input);
      uploadedPath = prepared.uploadedPath;
      if (selectedId) {
        const result = await db.from(TABLE).update(prepared.values).eq('id', selectedId).eq('status', 'draft').select('id').single();
        if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível salvar o rascunho.');
      } else {
        const created = await db.from(TABLE).insert({ ...prepared.values, created_by: createdBy, status: 'draft' }).select('id').single();
        if (created.error || !created.data) throw new Error(created.error?.message || 'Não foi possível criar o aviso.');
        selectedId = created.data.id;
      }
      persisted = true;
      selectedVideoPath = prepared.values.video_storage_path;
      byId('platformAnnouncementVideoFile').value = '';
      const oldPath = draft?.video_storage_path;
      if (oldPath && oldPath !== selectedVideoPath) await removeUnusedVideo(oldPath);
      const { data: replacedPaths, error: publishError } = await db.rpc('platform_publish_in_app_announcement', { p_announcement_id: selectedId });
      if (publishError) throw publishError;
      published = true;
      const videosRemoved = await removeReplacedVideos(replacedPaths);
      resetOwnerForm();
      ownerStatus(videosRemoved ? `Aviso publicado para: ${audienceLabel(input.values.target_roles)}. O aviso anterior foi excluído.` : 'Aviso publicado e anterior excluído, mas não foi possível remover o MP4 antigo do armazenamento.', !videosRemoved);
      await Promise.all([loadOwnerRows(), refreshViewer()]);
    } catch (error) {
      if (!persisted && uploadedPath) await removeUnusedVideo(uploadedPath);
      ownerStatus(published ? 'Aviso publicado, mas não foi possível atualizar a lista. Reabra Comunicações para conferir.' : persisted ? `Rascunho salvo, mas a publicação falhou; o aviso anterior foi preservado. ${error.message}` : `Não foi possível publicar: ${error.message}`, true);
      await loadOwnerRows();
    } finally {
      byId('platformAnnouncementPublish').disabled = false;
      byId('platformAnnouncementSave').disabled = false;
    }
  }

  async function deletePublished(id) {
    const row = ownerRows.find(item => item.id === id && item.status === 'published');
    if (!row || !confirm(`Excluir definitivamente o aviso “${row.title}”? Ele deixará de aparecer para todos.`)) return;
    const { data, error } = await db.from(TABLE).delete().eq('id', id).eq('status', 'published').select('id,video_storage_path').single();
    if (error || !data) { ownerStatus(error?.message || 'Não foi possível excluir o aviso.', true); return; }
    const videoRemoved = await removeUnusedVideo(data.video_storage_path);
    resetOwnerForm();
    ownerStatus(videoRemoved ? 'Aviso excluído definitivamente.' : 'Aviso excluído, mas não foi possível remover o MP4 do armazenamento.', !videoRemoved);
    if (featuredId === id) featuredId = null;
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
        <p class="platform-announcement-intro">Publique uma mensagem para os perfis escolhidos no Carômetro. A publicação substitui e exclui definitivamente o aviso anterior. Cada pessoa pode fechar o aviso individualmente.</p>
        <div class="platform-announcement-owner-grid"><section class="platform-panel"><div class="platform-panel-head"><div><h4>Novo aviso</h4><p>Título, mensagem e vídeo opcional. Nenhuma ação adicional é exigida de quem receber.</p></div><button type="button" id="platformAnnouncementNew" class="btn secondary">Novo aviso</button></div>
          <form id="platformAnnouncementForm" class="platform-announcement-form">
            <div class="field"><label for="platformAnnouncementTitle">Título</label><input id="platformAnnouncementTitle" maxlength="120" required placeholder="Ex.: Novidade no Carômetro"></div>
            <div class="field"><label for="platformAnnouncementMessage">Mensagem</label><textarea id="platformAnnouncementMessage" maxlength="2000" rows="5" required placeholder="Escreva a informação que aparecerá para os perfis escolhidos."></textarea></div>
            <fieldset class="platform-announcement-roles"><legend>Quem verá a mensagem?</legend><div class="platform-announcement-role-options"><label><input type="checkbox" id="platformAnnouncementRoleAll" checked> Todos</label>${Object.entries(ROLE_LABELS).map(([role, label]) => `<label><input type="checkbox" id="platformAnnouncementRole-${role}" value="${role}"> ${label}</label>`).join('')}</div><small>Você pode escolher mais de um perfil. A seleção considera os vínculos ativos da pessoa nas escolas.</small></fieldset>
            <div class="field"><label for="platformAnnouncementVideoUrl">Link do vídeo (opcional)</label><input id="platformAnnouncementVideoUrl" type="url" maxlength="500" placeholder="Link do YouTube ou de um MP4 público"></div>
            <div class="field platform-announcement-file-field"><label for="platformAnnouncementVideoFile">Ou envie um MP4 do computador ou celular</label><input id="platformAnnouncementVideoFile" type="file" accept="video/mp4,.mp4"><small>Até 45 MB, sem limite de duração. O vídeo só abre quando a pessoa clicar em “Ver vídeo”.</small><div class="platform-announcement-file-choice"><span id="platformAnnouncementVideoChoice">Nenhum arquivo selecionado.</span><button type="button" id="platformAnnouncementRemoveVideo" class="link hidden">Remover vídeo</button></div></div>
            <div class="platform-announcement-actions"><button type="submit" id="platformAnnouncementSave" class="btn secondary">Salvar rascunho</button><button type="button" id="platformAnnouncementPublish" class="btn primary">Publicar aviso</button></div>
            <p id="platformAnnouncementStatus" class="meta" role="status">Prepare seu aviso.</p>
          </form></section>
          <div><section class="platform-panel"><div class="platform-panel-head"><h4>Prévia na tela do usuário</h4></div><p id="platformAnnouncementPreviewAudience" class="platform-announcement-audience">Visível para: Todos</p><div class="platform-announcement-preview"><div><small id="platformAnnouncementPreviewTitle">Título do aviso</small><strong id="platformAnnouncementPreviewBody">A mensagem aparecerá aqui para os perfis escolhidos.</strong><span id="platformAnnouncementPreviewVideo" class="hidden">▶ Ver vídeo</span></div><span aria-hidden="true">×</span></div></section>
          <section class="platform-panel platform-announcement-history"><div class="platform-panel-head"><h4>Aviso atual e rascunhos</h4></div><div id="platformAnnouncementList" class="platform-announcement-list"></div></section></div></div>
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
    byId('platformAnnouncementRoleAll').addEventListener('change', () => {
      if (byId('platformAnnouncementRoleAll').checked) Object.keys(ROLE_LABELS).forEach(role => { byId(`platformAnnouncementRole-${role}`).checked = false; });
      renderOwnerPreview();
    });
    Object.keys(ROLE_LABELS).forEach(role => byId(`platformAnnouncementRole-${role}`).addEventListener('change', () => {
      if (byId(`platformAnnouncementRole-${role}`).checked) byId('platformAnnouncementRoleAll').checked = false;
      renderOwnerPreview();
    }));
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
      const remove = event.target.closest('[data-delete]');
      if (preview) selectOwnerRow(preview.dataset.preview);
      if (remove) deletePublished(remove.dataset.delete);
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
