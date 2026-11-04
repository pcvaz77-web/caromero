(() => {
  const TABLE = 'platform_in_app_announcements';
  const DISMISSALS = 'platform_in_app_announcement_dismissals';
  const VIDEO_BUCKET = 'platform-announcement-videos';
  const IMAGE_BUCKET = 'siap-announcement-media';
  let selectedKind = 'notice';
  const THEMES = {classic:['#138052','#ffffff','#ffffff'],black_friday:['#080e1b','#fff5d4','#d7b65f'],
    teachers:['#123d6b','#ffffff','#e9c768'],public_servant:['#173654','#ffffff','#d9b86b'],
    black_awareness:['#231b12','#fff1cb','#bd8b45'],students:['#165a86','#ffffff','#f3ca66'],
    september_yellow:['#f5c84a','#18283b','#183653'],christmas:['#164935','#ffffff','#d4ae61'],
    new_year:['#142b51','#ffffff','#e4c46f'],custom:['#17345d','#ffffff','#ffffff'],
    image_only:['#17345d','#13213a','#ffffff']};
  const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
  const ROLE_LABELS = { teacher: 'Professor', coordinator: 'Coordenador', secretary: 'Secretário', school_admin: 'Administrador' };
  const byId = id => document.getElementById(id);
  const clean = value => String(value || '').trim();
  const validColor = value => /^#[0-9a-f]{6}$/i.test(value);
  const contrastText = hex => { const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722 > .35 ? '#13213a' : '#ffffff'; };
  const validImage = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
  function applyTheme(node, item) {
    const key = Object.hasOwn(THEMES,item?.theme_key) ? item.theme_key : 'classic';
    const defaults = THEMES[key];
    node.dataset.theme = key;
    node.style.setProperty('--announcement-color',validColor(item?.theme_color) ? item.theme_color : defaults[0]);
    node.style.setProperty('--announcement-text',validColor(item?.theme_text_color) ? item.theme_text_color : defaults[1]);
    const button = validColor(item?.button_color) ? item.button_color : defaults[2];
    node.style.setProperty('--announcement-button',button);
    node.style.setProperty('--announcement-button-text',contrastText(button));
    const url = validImage(item?.theme_image_url) || (String(item?.theme_image_url || '').startsWith('blob:') ? item.theme_image_url : null);
    node.dataset.hasImage = url ? 'true' : 'false';
    node.dataset.hasCopy = clean(item?.title) || clean(item?.message_body) ? 'true' : 'false';
    node.style.setProperty('--announcement-image',url ? `url(${JSON.stringify(url)})` : 'none');
  }
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
      detail: { announcements: visibleAnnouncements.map(({ id, title, message_body, published_at, video_url, link_label, link_url, notice_image_url }) => ({ id, title, message_body, published_at, video_url, link_label, link_url, notice_image_url })) }
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
    const image = byId('platformAnnouncementBannerImage');
    const isCampaign = item.communication_kind === 'campaign';
    const imageUrl = isCampaign ? null : validImage(item.notice_image_url);
    image.classList.toggle('hidden',!imageUrl);
    image.src = imageUrl || '';
    byId('platformAnnouncementBannerVideo').classList.toggle('hidden', isCampaign || (!item.video_storage_path && !videoInfo(item.video_url)));
    const action = byId('platformAnnouncementBannerAction');
    action.classList.toggle('hidden', !item.link_label || !validImage(item.link_url));
    if (item.link_label && validImage(item.link_url)) { action.textContent = item.link_label; action.href = item.link_url; }
    applyTheme(banner,item);
    renderTicker(banner, 'platformAnnouncementBannerTicker', 'platformAnnouncementBannerTickerLine', item.ticker_text, item.ticker_text_color, item.ticker_background_color);
    banner.dataset.announcementId = item.id;
  }

  function renderTicker(banner, tickerId, lineId, value, color, background) {
    const ticker = byId(tickerId);
    const line = byId(lineId);
    const phrase = clean(value).replace(/\s+/g, ' ');
    banner.dataset.hasTicker = phrase ? 'true' : 'false';
    ticker.classList.toggle('hidden', !phrase);
    line.textContent = phrase;
    ticker.title = phrase;
    ticker.style.color = validColor(color) ? color : '#ffffff';
    ticker.style.background = `${validColor(background) ? background : '#071a36'}e6`;
    if (!phrase) return;
    const width = ticker.clientWidth || banner.clientWidth || 1100;
    const textWidth = line.scrollWidth || phrase.length * 9;
    line.style.setProperty('--ticker-start', `${width}px`);
    line.style.animationDuration = `${Math.max(14, Math.ceil((width + textWidth) / 62))}s`;
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
    const announcementsResult = await db.from(TABLE).select('id,communication_kind,title,message_body,ticker_text,ticker_text_color,ticker_background_color,video_url,video_storage_path,link_label,link_url,theme_key,theme_color,theme_text_color,theme_image_url,notice_image_url,button_color,published_at').eq('status', 'published').order('published_at', { ascending: false });
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
    const isCampaign = selectedKind === 'campaign';
    const title = clean(byId('platformAnnouncementTitle').value);
    const message_body = clean(byId('platformAnnouncementMessage').value);
    const ticker_text = clean(byId('platformAnnouncementTickerText').value).replace(/\s+/g, ' ') || null;
    const ticker_text_color = byId('platformAnnouncementTickerColor').value || '#ffffff';
    const ticker_background_color = byId('platformAnnouncementTickerBackground').value || '#071a36';
    const video_url = isCampaign ? null : clean(byId('platformAnnouncementVideoUrl').value) || null;
    const file = isCampaign ? null : byId('platformAnnouncementVideoFile').files?.[0] || null;
    const target_roles = selectedOwnerRoles();
    const theme_key = isCampaign ? byId('platformAnnouncementTheme').value || 'classic' : 'custom';
    const theme_color = byId('platformAnnouncementThemeColor').value || THEMES[theme_key]?.[0] || THEMES.classic[0];
    const theme_text_color = byId('platformAnnouncementTextColor').value || THEMES[theme_key]?.[1] || THEMES.classic[1];
    const theme_image_url = isCampaign ? clean(byId('platformAnnouncementThemeImage').value) || null : null;
    const theme_file = isCampaign ? byId('platformAnnouncementThemeFile').files?.[0] || null : null;
    const notice_image_url = isCampaign ? null : clean(byId('platformAnnouncementNoticeImage').value) || null;
    const notice_file = isCampaign ? null : byId('platformAnnouncementNoticeFile').files?.[0] || null;
    const button_color = byId('platformAnnouncementButtonColor').value || THEMES[theme_key]?.[2] || THEMES.classic[2];
    const link_label = clean(byId('platformAnnouncementLinkLabel').value) || null;
    const link_url = clean(byId('platformAnnouncementLinkUrl').value) || null;
    if ((title && title.length < 3) || (message_body && message_body.length < 3)) throw new Error('Se preencher título ou mensagem, use pelo menos 3 caracteres.');
    if (theme_key === 'image_only' && !theme_image_url && !theme_file) throw new Error('No modo Somente imagem, escolha uma imagem de fundo.');
    if (!title && !message_body && !ticker_text && !theme_image_url && !theme_file && !notice_image_url && !notice_file && !video_url && !file && (isCampaign || !selectedVideoPath)) throw new Error('Escreva um texto ou escolha uma imagem ou vídeo para o aviso.');
    if (ticker_text && ticker_text.length > 180) throw new Error('O letreiro deve ter até 180 caracteres.');
    if (!validColor(ticker_text_color)) throw new Error('Escolha uma cor válida para a letra do letreiro.');
    if (!validColor(ticker_background_color)) throw new Error('Escolha uma cor válida para o fundo do letreiro.');
    if (video_url && !videoInfo(video_url)) throw new Error('Use um link HTTPS do YouTube ou de um arquivo MP4 público.');
    if (file && video_url) throw new Error('Escolha um link ou um arquivo MP4, não os dois.');
    if (target_roles?.length === 0) throw new Error('Selecione ao menos um perfil ou Todos.');
    if (!Object.hasOwn(THEMES,theme_key) || !validColor(theme_color) || !validColor(theme_text_color)) throw new Error('Escolha cores válidas para o tema.');
    if (theme_image_url && !validImage(theme_image_url)) throw new Error('Use um link HTTPS válido para a imagem de fundo.');
    if (notice_image_url && !validImage(notice_image_url)) throw new Error('Use um link HTTPS válido para a imagem do aviso.');
    if (theme_file && (!['image/jpeg','image/png','image/webp'].includes(theme_file.type) || theme_file.size > 10*1024*1024)) throw new Error('A imagem deve ser JPG, PNG ou WebP de até 10 MB.');
    if (notice_file && (!['image/jpeg','image/png','image/webp'].includes(notice_file.type) || notice_file.size > 10*1024*1024)) throw new Error('A imagem do aviso deve ser JPG, PNG ou WebP de até 10 MB.');
    if (!validColor(button_color)) throw new Error('Escolha uma cor válida para o botão.');
    if (Boolean(link_label) !== Boolean(link_url) || (link_url && !validImage(link_url))) throw new Error('Preencha nome e link HTTPS do botão.');
    return { values: { communication_kind:selectedKind, title, message_body, ticker_text, ticker_text_color, ticker_background_color, video_url, video_storage_path: isCampaign || file || video_url ? null : selectedVideoPath, target_roles, theme_key, theme_color, theme_text_color, theme_image_url, notice_image_url, button_color, link_label, link_url }, file, theme_file, notice_file };
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
    byId('platformAnnouncementPublish').textContent = selectedKind === 'campaign' ? 'Publicar campanha' : 'Publicar novidade';
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

  async function prepareImage(input, fileField, valueField) {
    const imageFile = input[fileField];
    if (!imageFile) return { values: input.values, uploadedPath: null };
    const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[imageFile.type];
    const path = `themes/${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from(IMAGE_BUCKET).upload(path,imageFile,{contentType:imageFile.type,upsert:false});
    if (error) throw new Error(`Não foi possível enviar a imagem: ${error.message}`);
    return { values:{...input.values,[valueField]:db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl},uploadedPath:path };
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
    updateThemeControls();
    updateImageChoices();
    byId('platformAnnouncementPreviewTitle').textContent = clean(byId('platformAnnouncementTitle').value);
    byId('platformAnnouncementPreviewBody').textContent = clean(byId('platformAnnouncementMessage').value);
    updateOwnerAudience();
    byId('platformAnnouncementPreviewVideo').classList.toggle('hidden', selectedKind === 'campaign' || (!selectedVideoPath && !byId('platformAnnouncementVideoFile').files?.length && !videoInfo(clean(byId('platformAnnouncementVideoUrl').value))));
    const preview = byId('platformAnnouncementPreview');
    const file = selectedKind === 'campaign' ? byId('platformAnnouncementThemeFile').files?.[0] : null;
    const previous = preview.dataset.previewFileUrl;
    if (previous) URL.revokeObjectURL(previous);
    const fileUrl = file ? URL.createObjectURL(file) : '';
    preview.dataset.previewFileUrl = fileUrl;
    applyTheme(preview,{theme_key:selectedKind === 'campaign' ? byId('platformAnnouncementTheme').value : 'custom',theme_color:byId('platformAnnouncementThemeColor').value,
      theme_text_color:byId('platformAnnouncementTextColor').value,theme_image_url:selectedKind === 'campaign' ? fileUrl || byId('platformAnnouncementThemeImage').value : null,
      button_color:byId('platformAnnouncementButtonColor').value,title:byId('platformAnnouncementTitle').value,message_body:byId('platformAnnouncementMessage').value});
    const noticeFile = selectedKind === 'notice' ? byId('platformAnnouncementNoticeFile').files?.[0] : null;
    if (preview.dataset.noticeFileUrl) URL.revokeObjectURL(preview.dataset.noticeFileUrl);
    preview.dataset.noticeFileUrl = noticeFile ? URL.createObjectURL(noticeFile) : '';
    const noticeUrl = selectedKind === 'notice' ? preview.dataset.noticeFileUrl || validImage(byId('platformAnnouncementNoticeImage').value) : null;
    const image = byId('platformAnnouncementPreviewImage');
    image.classList.toggle('hidden',!noticeUrl);
    image.src = noticeUrl || '';
    const action = byId('platformAnnouncementPreviewAction');
    action.textContent = clean(byId('platformAnnouncementLinkLabel').value) || 'Abrir link';
    action.classList.toggle('hidden',!clean(byId('platformAnnouncementLinkLabel').value));
    syncOwnerPreviewSize();
  }

  function syncOwnerPreviewSize() {
    const frame = byId('platformAnnouncementPreviewFrame');
    const preview = byId('platformAnnouncementPreview');
    if (!frame || !preview) return;
    const referenceWidth = window.innerWidth <= 800 ? Math.max(320, window.innerWidth - 34) : 1100;
    const frameWidth = frame.clientWidth || referenceWidth;
    const scale = Math.min(1, frameWidth / referenceWidth);
    preview.style.width = `${referenceWidth}px`;
    preview.style.transform = `scale(${scale})`;
    renderTicker(preview, 'platformAnnouncementPreviewTicker', 'platformAnnouncementPreviewTickerLine', byId('platformAnnouncementTickerText').value, byId('platformAnnouncementTickerColor').value, byId('platformAnnouncementTickerBackground').value);
    frame.style.height = `${Math.ceil((preview.offsetHeight || (preview.dataset.theme === 'image_only' ? 216 : 156)) * scale)}px`;
  }

  function updateThemeControls() {
    const imageOnly = selectedKind === 'campaign' && byId('platformAnnouncementTheme').value === 'image_only';
    byId('platformAnnouncementColorDetails').classList.toggle('hidden', imageOnly);
    byId('platformAnnouncementThemeColors').classList.toggle('hidden', imageOnly);
    byId('platformAnnouncementButtonColorField').classList.toggle('hidden', imageOnly);
  }

  function updateImageChoices() {
    byId('platformAnnouncementRemoveThemeImage').classList.toggle('hidden',
      !clean(byId('platformAnnouncementThemeImage').value) && !byId('platformAnnouncementThemeFile').files?.length);
    byId('platformAnnouncementRemoveNoticeImage').classList.toggle('hidden',
      !clean(byId('platformAnnouncementNoticeImage').value) && !byId('platformAnnouncementNoticeFile').files?.length);
  }

  function clearImage(urlId, fileId) {
    byId(urlId).value = '';
    byId(fileId).value = '';
    renderOwnerPreview();
  }

  function setOwnerKind(kind) {
    selectedKind = kind === 'campaign' ? 'campaign' : 'notice';
    const campaign = selectedKind === 'campaign';
    byId('platformAnnouncementNoticeFields').classList.toggle('hidden', campaign);
    byId('platformAnnouncementCampaignFields').classList.toggle('hidden', !campaign);
    byId('platformAnnouncementNoticeFields').open = !campaign;
    byId('platformAnnouncementCampaignFields').open = campaign;
    byId('platformAnnouncementOwnerArea').dataset.kind = selectedKind;
    for (const choice of ['notice','campaign']) {
      byId(`platformAnnouncementKind-${choice}`).setAttribute('aria-selected',String(selectedKind === choice));
    }
    byId('platformAnnouncementEditorHeading').textContent = campaign ? 'Preparar campanha' : 'Preparar novidade';
    byId('platformAnnouncementEditorHelp').textContent = campaign
      ? 'Escolha o tema, a imagem de fundo e a chamada da campanha.'
      : 'Escreva uma novidade e, se quiser, inclua imagem ou vídeo no comunicado.';
    byId('platformAnnouncementPublish').textContent = campaign ? 'Publicar campanha' : 'Publicar novidade';
    renderOwnerPreview();
  }

  function resetOwnerForm() {
    selectedId = null;
    selectedVideoPath = null;
    videoChoiceVersion++;
    byId('platformAnnouncementForm').reset();
    byId('platformAnnouncementForm').querySelectorAll('input,textarea').forEach(field => { field.disabled = false; });
    byId('platformAnnouncementRemoveThemeImage').disabled = false;
    byId('platformAnnouncementRemoveNoticeImage').disabled = false;
    byId('platformAnnouncementSave').disabled = false;
    byId('platformAnnouncementPublish').disabled = false;
    byId('platformAnnouncementRoleAll').checked = true;
    byId('platformAnnouncementRemoveVideo').disabled = false;
    ownerStatus('Novo aviso. Salve um rascunho ou publique quando estiver pronto.');
    updateVideoChoice();
    for (const choice of ['notice','campaign']) byId(`platformAnnouncementKind-${choice}`).disabled = false;
    setOwnerKind('notice');
  }

  function selectOwnerRow(id) {
    const row = ownerRows.find(item => item.id === id);
    if (!row) return;
    selectedId = row.status === 'draft' ? id : null;
    selectedVideoPath = row.video_storage_path || null;
    videoChoiceVersion++;
    byId('platformAnnouncementTitle').value = row.title;
    byId('platformAnnouncementMessage').value = row.message_body;
    byId('platformAnnouncementTickerText').value = row.ticker_text || '';
    byId('platformAnnouncementTickerColor').value = row.ticker_text_color || '#ffffff';
    byId('platformAnnouncementTickerBackground').value = row.ticker_background_color || '#071a36';
    byId('platformAnnouncementTheme').value = row.theme_key || 'classic';
    byId('platformAnnouncementThemeColor').value = row.theme_color || THEMES.classic[0];
    byId('platformAnnouncementTextColor').value = row.theme_text_color || THEMES.classic[1];
    byId('platformAnnouncementThemeImage').value = row.theme_image_url || '';
    byId('platformAnnouncementThemeFile').value = '';
    byId('platformAnnouncementNoticeImage').value = row.notice_image_url || '';
    byId('platformAnnouncementNoticeFile').value = '';
    byId('platformAnnouncementButtonColor').value = row.button_color || THEMES.classic[2];
    byId('platformAnnouncementLinkLabel').value = row.link_label || '';
    byId('platformAnnouncementLinkUrl').value = row.link_url || '';
    byId('platformAnnouncementVideoUrl').value = row.video_url || '';
    byId('platformAnnouncementVideoFile').value = '';
    byId('platformAnnouncementRoleAll').checked = !row.target_roles;
    Object.keys(ROLE_LABELS).forEach(role => { byId(`platformAnnouncementRole-${role}`).checked = !!row.target_roles?.includes(role); });
    byId('platformAnnouncementForm').querySelectorAll('input,textarea,select').forEach(field => { field.disabled = row.status !== 'draft'; });
    for (const choice of ['notice','campaign']) byId(`platformAnnouncementKind-${choice}`).disabled = row.status !== 'draft';
    byId('platformAnnouncementRemoveThemeImage').disabled = row.status !== 'draft';
    byId('platformAnnouncementRemoveNoticeImage').disabled = row.status !== 'draft';
    byId('platformAnnouncementSave').disabled = row.status !== 'draft';
    byId('platformAnnouncementPublish').disabled = row.status !== 'draft';
    setOwnerKind(row.communication_kind || (row.theme_image_url ? 'campaign' : 'notice'));
    ownerStatus(row.status === 'draft' ? 'Rascunho carregado para edição.' : 'Prévia do aviso. Clique em Novo aviso para escrever outro.');
    byId('platformAnnouncementRemoveVideo').disabled = row.status !== 'draft';
    updateVideoChoice();
  }

  function renderOwnerList() {
    const container = byId('platformAnnouncementList');
    if (!container) return;
    container.innerHTML = ownerRows.length ? ownerRows.map(row => `
      <div class="platform-announcement-row">
        <div><strong>${escapeHtml(row.title || (row.notice_image_url || row.theme_image_url ? 'Aviso com imagem' : row.message_body || 'Aviso com vídeo'))}</strong><small>${row.communication_kind === 'campaign' ? 'Campanha' : 'Novidade'} · ${row.status === 'published' ? 'Publicado' : 'Rascunho'} · ${escapeHtml(audienceLabel(row.target_roles))} · ${new Date(row.published_at || row.created_at).toLocaleString('pt-BR')}</small></div>
        <div class="platform-announcement-row-actions"><button type="button" class="btn secondary" data-preview="${row.id}">${row.status === 'draft' ? 'Editar' : 'Ver'}</button>${row.status === 'published' ? `<button type="button" class="btn secondary" data-delete="${row.id}">Excluir aviso</button>` : ''}</div>
      </div>`).join('') : '<p class="meta">Nenhum aviso criado.</p>';
  }

  async function loadOwnerRows() {
    const { data, error } = await db.from(TABLE).select('id,communication_kind,title,message_body,ticker_text,ticker_text_color,ticker_background_color,video_url,video_storage_path,link_label,link_url,theme_key,theme_color,theme_text_color,theme_image_url,notice_image_url,button_color,target_roles,status,created_at,published_at').in('status', ['draft', 'published']).order('created_at', { ascending: false }).limit(100);
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
    const uploadedImagePaths = [];
    let persisted = false;
    try {
      if (!createdBy) throw new Error('Sua sessão expirou. Entre novamente.');
      const prepared = await prepareVideo(input);
      uploadedPath = prepared.uploadedPath;
      const themed = await prepareImage({...input,values:prepared.values},'theme_file','theme_image_url');
      if (themed.uploadedPath) uploadedImagePaths.push(themed.uploadedPath);
      const illustrated = await prepareImage({...input,values:themed.values},'notice_file','notice_image_url');
      if (illustrated.uploadedPath) uploadedImagePaths.push(illustrated.uploadedPath);
      const result = selectedId
        ? await db.from(TABLE).update(illustrated.values).eq('id', selectedId).eq('status', 'draft').select('id').single()
        : await db.from(TABLE).insert({ ...illustrated.values, created_by: createdBy, status: 'draft' }).select('id').single();
      if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível salvar o rascunho.');
      persisted = true;
      selectedId = result.data.id;
      selectedVideoPath = prepared.values.video_storage_path;
      byId('platformAnnouncementThemeImage').value = themed.values.theme_image_url || '';
      byId('platformAnnouncementThemeFile').value = '';
      byId('platformAnnouncementNoticeImage').value = illustrated.values.notice_image_url || '';
      byId('platformAnnouncementNoticeFile').value = '';
      byId('platformAnnouncementVideoFile').value = '';
      videoChoiceVersion++;
      if (row?.video_storage_path && row.video_storage_path !== selectedVideoPath) await removeUnusedVideo(row.video_storage_path);
      updateVideoChoice();
      renderOwnerPreview();
      ownerStatus('Rascunho salvo. Ainda não está visível aos usuários.');
      await loadOwnerRows();
    } catch (error) {
      if (!persisted && uploadedPath) await removeUnusedVideo(uploadedPath);
      if (!persisted && uploadedImagePaths.length) await db.storage.from(IMAGE_BUCKET).remove(uploadedImagePaths);
      ownerStatus(persisted ? 'Rascunho salvo, mas não foi possível atualizar a lista. Reabra Comunicações para conferir.' : error.message, true);
    } finally {
      byId('platformAnnouncementSave').disabled = false;
      byId('platformAnnouncementPublish').disabled = false;
    }
  }

  async function publish() {
    let input;
    try { input = ownerFormData(); } catch (error) { ownerStatus(error.message, true); return; }
    if (!confirm(`Publicar esta ${selectedKind === 'campaign' ? 'campanha' : 'novidade'} para: ${audienceLabel(input.values.target_roles)}? O comunicado publicado anteriormente será excluído definitivamente.`)) return;
    byId('platformAnnouncementPublish').disabled = true;
    byId('platformAnnouncementSave').disabled = true;
    const createdBy = viewerId || user?.id;
    let uploadedPath = null;
    const uploadedImagePaths = [];
    let persisted = false;
    let published = false;
    try {
      if (!createdBy) throw new Error('Sua sessão expirou. Entre novamente.');
      const draft = ownerRows.find(item => item.id === selectedId);
      if (selectedId && draft?.status !== 'draft') throw new Error('Só rascunhos podem ser publicados.');
      const prepared = await prepareVideo(input);
      uploadedPath = prepared.uploadedPath;
      const themed = await prepareImage({...input,values:prepared.values},'theme_file','theme_image_url');
      if (themed.uploadedPath) uploadedImagePaths.push(themed.uploadedPath);
      const illustrated = await prepareImage({...input,values:themed.values},'notice_file','notice_image_url');
      if (illustrated.uploadedPath) uploadedImagePaths.push(illustrated.uploadedPath);
      if (selectedId) {
        const result = await db.from(TABLE).update(illustrated.values).eq('id', selectedId).eq('status', 'draft').select('id').single();
        if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível salvar o rascunho.');
      } else {
        const created = await db.from(TABLE).insert({ ...illustrated.values, created_by: createdBy, status: 'draft' }).select('id').single();
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
      if (!persisted && uploadedImagePaths.length) await db.storage.from(IMAGE_BUCKET).remove(uploadedImagePaths);
      ownerStatus(published ? 'Aviso publicado, mas não foi possível atualizar a lista. Reabra Comunicações para conferir.' : persisted ? `Rascunho salvo, mas a publicação falhou; o aviso anterior foi preservado. ${error.message}` : `Não foi possível publicar: ${error.message}`, true);
      await loadOwnerRows();
    } finally {
      byId('platformAnnouncementPublish').disabled = false;
      byId('platformAnnouncementSave').disabled = false;
    }
  }

  async function deletePublished(id) {
    const row = ownerRows.find(item => item.id === id && item.status === 'published');
    if (!row || !confirm(`Excluir definitivamente ${row.communication_kind === 'campaign' ? 'a campanha' : 'a novidade'} “${row.title || 'sem título'}”? Ela deixará de aparecer para todos.`)) return;
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
      <div id="platformAnnouncementOwnerArea">
        <div class="platform-communication-intro"><div><small>COMUNICAÇÃO NO CARÔMETRO</small><h4>Prepare o comunicado para a plataforma</h4><p>Escolha uma novidade ou campanha, confira a prévia e publique. Um comunicado fica no ar por vez.</p></div><span class="platform-communication-intro-mark" aria-hidden="true">✦</span></div>
        <div class="platform-communication-switch platform-inapp-kind-switch" role="tablist" aria-label="Tipo de comunicação do Carômetro"><button type="button" role="tab" id="platformAnnouncementKind-notice" aria-selected="true"><span aria-hidden="true">✦</span><strong>Novidade</strong><small>Texto, imagem ou vídeo do comunicado</small></button><button type="button" role="tab" id="platformAnnouncementKind-campaign" aria-selected="false"><span aria-hidden="true">◈</span><strong>Campanha</strong><small>Tema, cores e imagem de fundo</small></button></div>
        <div class="platform-announcement-owner-grid"><section class="platform-panel"><div class="platform-panel-head"><div><h4 id="platformAnnouncementEditorHeading">Preparar novidade</h4><p id="platformAnnouncementEditorHelp">Escreva uma novidade e, se quiser, inclua imagem ou vídeo no comunicado.</p></div><button type="button" id="platformAnnouncementNew" class="btn secondary">Novo aviso</button></div>
          <form id="platformAnnouncementForm" class="platform-announcement-form">
            <div class="platform-compose-step"><span>01</span><div><strong>Mensagem</strong><small>O conteúdo principal que as pessoas verão.</small></div></div>
            <div class="field"><label for="platformAnnouncementTitle">Título (opcional)</label><input id="platformAnnouncementTitle" maxlength="120" placeholder="Ex.: Novidade no Carômetro"></div>
            <div class="field"><label for="platformAnnouncementMessage">Mensagem (opcional)</label><textarea id="platformAnnouncementMessage" maxlength="2000" rows="5" placeholder="Escreva a informação que aparecerá para os perfis escolhidos."></textarea></div>
            <div class="field platform-announcement-ticker-field"><label for="platformAnnouncementTickerText">Letreiro na base da faixa (opcional)</label><input id="platformAnnouncementTickerText" maxlength="180" placeholder="Ex.: Inscrições abertas para o ENEM 2026"><small>O texto passa em linha contínua da direita para a esquerda. Funciona em Novidade e Campanha.</small><div class="platform-announcement-ticker-colors"><div><label for="platformAnnouncementTickerColor">Cor da letra</label><input id="platformAnnouncementTickerColor" type="color" value="#ffffff"></div><div><label for="platformAnnouncementTickerBackground">Cor do fundo</label><input id="platformAnnouncementTickerBackground" type="color" value="#071a36"></div></div></div>
            <div class="platform-compose-step"><span>02</span><div><strong>Público</strong><small>Escolha quem receberá este aviso.</small></div></div>
            <fieldset class="platform-announcement-roles"><legend>Quem verá a mensagem?</legend><div class="platform-announcement-role-options"><label><input type="checkbox" id="platformAnnouncementRoleAll" checked> Todos</label>${Object.entries(ROLE_LABELS).map(([role, label]) => `<label><input type="checkbox" id="platformAnnouncementRole-${role}" value="${role}"> ${label}</label>`).join('')}</div><small>Você pode escolher mais de um perfil. A seleção considera os vínculos ativos da pessoa nas escolas.</small></fieldset>
            <details id="platformAnnouncementCampaignFields" class="platform-communication-details hidden"><summary><span><strong>Tema da campanha</strong><small>Data comemorativa e imagem de fundo da faixa.</small></span></summary><div class="platform-communication-details-body platform-announcement-theme-fields">
              <div class="field"><label for="platformAnnouncementTheme">Aparência da faixa</label><select id="platformAnnouncementTheme"><option value="classic">Padrão</option><option value="image_only">Somente imagem (sem cor)</option><option value="black_friday">Black Friday</option><option value="teachers">Dia dos Professores</option><option value="public_servant">Dia do Servidor Público</option><option value="black_awareness">Consciência Negra</option><option value="students">Dia do Estudante</option><option value="september_yellow">Setembro Amarelo</option><option value="christmas">Natal</option><option value="new_year">Ano Novo</option><option value="custom">Personalizado</option></select></div>
              <div class="field"><label for="platformAnnouncementThemeImage">Imagem de fundo (link HTTPS, opcional)</label><input id="platformAnnouncementThemeImage" type="url" maxlength="2048" placeholder="https://..."></div>
              <div class="field"><label for="platformAnnouncementThemeFile">Ou enviar imagem de fundo</label><input id="platformAnnouncementThemeFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP até 10 MB. O texto permanece por cima da imagem.</small><button type="button" id="platformAnnouncementRemoveThemeImage" class="link hidden">Remover imagem de fundo</button></div>
            </div></details>
            <details id="platformAnnouncementNoticeFields" class="platform-communication-details" open><summary><span><strong>Imagem ou vídeo da novidade</strong><small>O arquivo aparece no comunicado, sem virar fundo da campanha.</small></span></summary><div class="platform-communication-details-body platform-announcement-theme-fields">
              <div class="field"><label for="platformAnnouncementNoticeImage">Imagem da informação (link HTTPS, opcional)</label><input id="platformAnnouncementNoticeImage" type="url" maxlength="2048" placeholder="https://..."></div>
              <div class="field"><label for="platformAnnouncementNoticeFile">Ou enviar imagem da informação</label><input id="platformAnnouncementNoticeFile" type="file" accept="image/jpeg,image/png,image/webp"><small>Essa imagem aparece dentro da faixa, abaixo do texto.</small><button type="button" id="platformAnnouncementRemoveNoticeImage" class="link hidden">Remover imagem do aviso</button></div>
              <div class="platform-announcement-media-divider"><strong>Vídeo</strong><small>Link público ou arquivo MP4.</small></div>
              <div class="field"><label for="platformAnnouncementVideoUrl">Link do vídeo (opcional)</label><input id="platformAnnouncementVideoUrl" type="url" maxlength="500" placeholder="Link do YouTube ou de um MP4 público"></div>
              <div class="field platform-announcement-file-field"><label for="platformAnnouncementVideoFile">Ou envie um MP4 do computador ou celular</label><input id="platformAnnouncementVideoFile" type="file" accept="video/mp4,.mp4"><small>Até 45 MB, sem limite de duração. O vídeo só abre quando a pessoa clicar em “Ver vídeo”.</small><div class="platform-announcement-file-choice"><span id="platformAnnouncementVideoChoice">Nenhum arquivo selecionado.</span><button type="button" id="platformAnnouncementRemoveVideo" class="link hidden">Remover vídeo</button></div></div>
            </div></details>
            <details id="platformAnnouncementColorDetails" class="platform-communication-details"><summary><span><strong>Cores da faixa</strong><small>Personalize o fundo, o texto e o botão.</small></span></summary><div class="platform-communication-details-body platform-announcement-theme-fields">
              <div id="platformAnnouncementThemeColors" class="platform-announcement-theme-colors"><div class="field"><label for="platformAnnouncementThemeColor">Cor de fundo</label><input id="platformAnnouncementThemeColor" type="color" value="#138052"></div><div class="field"><label for="platformAnnouncementTextColor">Cor do texto</label><input id="platformAnnouncementTextColor" type="color" value="#ffffff"></div></div>
              <div id="platformAnnouncementButtonColorField" class="field"><label for="platformAnnouncementButtonColor">Cor do botão</label><input id="platformAnnouncementButtonColor" type="color" value="#ffffff"></div>
            </div></details>
            <details class="platform-communication-details"><summary><span><strong>Botão com link</strong><small>Opcional: envie para uma página, promoção ou tutorial.</small></span></summary><div class="platform-communication-details-body">
            <div class="field"><label for="platformAnnouncementLinkLabel">Nome do botão (opcional)</label><input id="platformAnnouncementLinkLabel" maxlength="60" placeholder="Ex.: Ver planos"></div>
            <div class="field"><label for="platformAnnouncementLinkUrl">Link do botão (opcional)</label><input id="platformAnnouncementLinkUrl" type="url" maxlength="2048" placeholder="https://..."></div>
            </div></details>
            <div class="platform-compose-step"><span>03</span><div><strong>Revise e publique</strong><small>Veja a prévia ao lado antes de publicar.</small></div></div>
            <div class="platform-announcement-actions"><button type="submit" id="platformAnnouncementSave" class="btn secondary">Salvar rascunho</button><button type="button" id="platformAnnouncementPublish" class="btn primary">Publicar aviso</button></div>
            <p id="platformAnnouncementStatus" class="meta" role="status">Prepare seu aviso.</p>
          </form></section>
          <div><section class="platform-panel"><div class="platform-panel-head"><h4>Prévia na tela do usuário</h4></div><p id="platformAnnouncementPreviewAudience" class="platform-announcement-audience">Visível para: Todos</p><div id="platformAnnouncementPreviewFrame" class="platform-announcement-preview-frame"><div id="platformAnnouncementPreview" class="platform-announcement-banner platform-announcement-owner-preview"><div class="platform-announcement-banner-copy"><small id="platformAnnouncementPreviewTitle"></small><strong id="platformAnnouncementPreviewBody"></strong><img id="platformAnnouncementPreviewImage" class="platform-announcement-content-image hidden" alt="Imagem da informação"><button type="button" id="platformAnnouncementPreviewVideo" class="platform-announcement-video hidden">▶ Ver vídeo</button><a id="platformAnnouncementPreviewAction" class="platform-announcement-action hidden">Abrir link</a></div><button type="button" class="platform-announcement-dismiss" aria-label="Prévia do botão de fechar">×</button><div id="platformAnnouncementPreviewTicker" class="platform-announcement-ticker hidden" tabindex="0" aria-label="Letreiro do comunicado"><span id="platformAnnouncementPreviewTickerLine" class="platform-announcement-ticker-line"></span></div></div></div></section>
          <section class="platform-panel platform-announcement-history"><div class="platform-panel-head"><h4>Aviso atual e rascunhos</h4></div><div id="platformAnnouncementList" class="platform-announcement-list"></div></section></div></div>
      </div>`;
    root.replaceChildren(shell);
    byId('platformAnnouncementForm').onsubmit = event => { event.preventDefault(); saveDraft(); };
    byId('platformAnnouncementForm').addEventListener('input', renderOwnerPreview);
    byId('platformAnnouncementPreviewImage').addEventListener('load', syncOwnerPreviewSize);
    window.addEventListener('resize', syncOwnerPreviewSize);
    if (typeof ResizeObserver !== 'undefined') {
      let previousWidth = 0;
      new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width || 0;
        if (width && width !== previousWidth) { previousWidth = width; syncOwnerPreviewSize(); }
      }).observe(byId('platformAnnouncementPreviewFrame'));
    }
    for (const choice of ['notice','campaign']) byId(`platformAnnouncementKind-${choice}`).onclick = () => setOwnerKind(choice);
    byId('platformAnnouncementTheme').addEventListener('change', () => {
      const [background,foreground,button] = THEMES[byId('platformAnnouncementTheme').value] || THEMES.classic;
      byId('platformAnnouncementThemeColor').value = background;
      byId('platformAnnouncementTextColor').value = foreground;
      byId('platformAnnouncementButtonColor').value = button;
      renderOwnerPreview();
    });
    for (const id of ['platformAnnouncementThemeColor','platformAnnouncementTextColor','platformAnnouncementButtonColor']) byId(id).addEventListener('input', renderOwnerPreview);
    byId('platformAnnouncementThemeFile').addEventListener('change', renderOwnerPreview);
    byId('platformAnnouncementNoticeFile').addEventListener('change', renderOwnerPreview);
    byId('platformAnnouncementRemoveThemeImage').onclick = () => clearImage('platformAnnouncementThemeImage','platformAnnouncementThemeFile');
    byId('platformAnnouncementRemoveNoticeImage').onclick = () => clearImage('platformAnnouncementNoticeImage','platformAnnouncementNoticeFile');
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
    setOwnerKind('notice');
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
    banner.innerHTML = '<div class="platform-announcement-banner-copy"><small id="platformAnnouncementBannerTitle"></small><strong id="platformAnnouncementBannerBody"></strong><img id="platformAnnouncementBannerImage" class="platform-announcement-content-image hidden" alt="Imagem da informação"><button type="button" id="platformAnnouncementBannerVideo" class="platform-announcement-video hidden">▶ Ver vídeo</button><a id="platformAnnouncementBannerAction" class="platform-announcement-action hidden" target="_blank" rel="noopener noreferrer"></a></div><button type="button" id="platformAnnouncementDismiss" class="platform-announcement-dismiss" aria-label="Fechar aviso" title="Fechar aviso">×</button><div id="platformAnnouncementBannerTicker" class="platform-announcement-ticker hidden" tabindex="0" aria-label="Letreiro do comunicado"><span id="platformAnnouncementBannerTickerLine" class="platform-announcement-ticker-line"></span></div>';
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
    window.addEventListener('resize', renderBanner);
    setInterval(() => { if (!document.hidden && !byId('app')?.classList.contains('hidden')) refreshViewer(); }, 30000);
    refreshViewer();
  });
})();
