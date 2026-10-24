// Comunicado exibido dentro do Assistente SIAP; não envia campanhas.
(() => {
  let mounted = false;
  let current = null;
  let previewFileUrl = null;
  let previewFile = null;
  const bucket = 'siap-announcement-media';
  const maxImageBytes = 50 * 1024 * 1024;
  const maxVideoBytes = 50 * 1024 * 1024;
  const mimeExtensions = {
    'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif',
    'video/mp4':'mp4', 'video/webm':'webm'
  };
  const root = () => document.getElementById('platformSiapAnnouncementRoot');
  const safe = value => {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };
  const media = (type, value) => {
    if (!value) return '';
    let url;
    try { url = new URL(value); } catch { return ''; }
    if (url.protocol !== 'https:') return '';
    if (type === 'image') return `<img src="${safe(url.href)}" alt="Imagem do comunicado" loading="lazy">`;
    if (type !== 'video') return '';
    const host = url.hostname.toLowerCase();
    const youtube = host === 'youtu.be' ? url.pathname.slice(1) :
      ['youtube.com','www.youtube.com','m.youtube.com'].includes(host) ? (url.searchParams.get('v') || /^\/shorts\/([^/]+)/.exec(url.pathname)?.[1]) : '';
    if (youtube && /^[\w-]{11}$/.test(youtube)) return `<iframe src="https://www.youtube-nocookie.com/embed/${youtube}" title="Vídeo do comunicado" loading="lazy" allowfullscreen></iframe>`;
    if (/\.(mp4|webm)$/i.test(url.pathname)) return `<video controls preload="none" src="${safe(url.href)}"></video>`;
    return `<a href="${safe(url.href)}" target="_blank" rel="noopener noreferrer">Assistir ao vídeo ↗</a>`;
  };
  const actionButton = (label, value) => {
    if (!label || !value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return '';
      return `<a class="platform-siap-announcement-action" href="${safe(url.href)}" target="_blank" rel="noopener noreferrer">${safe(label)}</a>`;
    } catch { return ''; }
  };
  function fields() {
    const form = document.getElementById('platformSiapAnnouncementForm');
    const source = form.elements.media_source.value;
    return {
      title:form.elements.title.value.trim(),
      message_body:form.elements.message_body.value.trim(),
      link_label:form.elements.link_label.value.trim(),
      link_url:form.elements.link_url.value.trim(),
      media_type:source === 'link' ? (form.elements.media_type.value || null) : null,
      media_url:source === 'link' ? (form.elements.media_url.value.trim() || null) : null
    };
  }
  function selectedFile() {
    return document.getElementById('platformSiapAnnouncementForm').elements.media_file.files?.[0] || null;
  }
  function fileType(file) {
    return file?.type.startsWith('image/') ? 'image' : file?.type.startsWith('video/') ? 'video' : null;
  }
  function storagePath(url) {
    if (!url) return null;
    const prefix = `/storage/v1/object/public/${bucket}/`;
    try {
      const parsed = new URL(url);
      const expected = new URL(db.storage.from(bucket).getPublicUrl('assistant/').data.publicUrl);
      if (parsed.origin !== expected.origin || !parsed.pathname.startsWith(prefix)) return null;
      const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
      return /^assistant\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(path) ? path : null;
    } catch { return null; }
  }
  function refreshSource() {
    const form = document.getElementById('platformSiapAnnouncementForm');
    const source = form.elements.media_source.value;
    form.querySelector('[data-announcement-link]').hidden = source !== 'link';
    form.querySelector('[data-announcement-file]').hidden = source !== 'file';
    preview();
  }
  function refreshRemoveButton() {
    const form = document.getElementById('platformSiapAnnouncementForm');
    const button = document.getElementById('platformSiapAnnouncementRemoveMedia');
    button.hidden = !current?.media_url && !selectedFile() && !form.elements.media_url.value.trim();
  }
  function status(message, error=false) {
    const node = document.getElementById('platformSiapAnnouncementStatus');
    node.textContent = message;
    node.classList.toggle('error', error);
  }
  function preview() {
    const item = fields();
    const file = selectedFile();
    const source = document.getElementById('platformSiapAnnouncementForm').elements.media_source.value;
    const nextFile = source === 'file' ? file : null;
    if (nextFile !== previewFile) {
      if (previewFileUrl) URL.revokeObjectURL(previewFileUrl);
      previewFile = nextFile;
      previewFileUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    }
    const filePreview = previewFileUrl && fileType(file) === 'image'
      ? `<img src="${safe(previewFileUrl)}" alt="Imagem selecionada" loading="lazy">`
      : previewFileUrl && fileType(file) === 'video'
        ? `<video controls preload="metadata" src="${safe(previewFileUrl)}"></video>` : '';
    document.getElementById('platformSiapAnnouncementPreview').innerHTML = `<div class="platform-siap-notice-preview-label">Como ficará no Assistente SIAP</div><strong>${safe(item.title || 'Título da novidade')}</strong><p>${safe(item.message_body || 'Sua mensagem aparecerá aqui.').replace(/\n/g,'<br>')}</p>${source === 'file' ? filePreview : media(item.media_type,item.media_url)}${actionButton(item.link_label,item.link_url)}`;
    refreshRemoveButton();
  }
  async function load() {
    const {data,error} = await db.from('siap_assistant_announcement').select('title,message_body,media_type,media_url,link_label,link_url,active,updated_at').eq('id',true).maybeSingle();
    if (error) { status('Não foi possível carregar o comunicado. Verifique se a nova etapa do banco foi aplicada.',true); return; }
    current = data || null;
    const form = document.getElementById('platformSiapAnnouncementForm');
    for (const field of ['title','message_body','media_type','media_url','link_label','link_url']) form.elements[field].value = data?.[field] || '';
    form.elements.media_source.value = data?.media_url ? 'link' : 'none';
    form.elements.media_file.value = '';
    document.getElementById('platformSiapAnnouncementDisable').disabled = !data?.active;
    status(data?.active ? `Publicado · atualizado em ${new Date(data.updated_at).toLocaleString('pt-BR')}` : 'Nenhum comunicado publicado.');
    refreshSource();
  }
  async function save(active) {
    const item = active ? fields() : current;
    if (!item || item.title.length < 3 || item.message_body.length < 10) { status('Informe título e mensagem com pelo menos 10 caracteres.',true); return; }
    const form = document.getElementById('platformSiapAnnouncementForm');
    const source = active ? form.elements.media_source.value : 'link';
    const file = active && source === 'file' ? selectedFile() : null;
    if (source === 'file' && !file) { status('Escolha uma imagem ou um vídeo do dispositivo.',true); return; }
    if (file && (!mimeExtensions[file.type] || file.size > (fileType(file) === 'video' ? maxVideoBytes : maxImageBytes) || file.size === 0)) {
      status('Arquivos de imagem ou vídeo podem ter até 50 MB. Para vídeos maiores, use um link HTTPS público.',true); return;
    }
    if (Boolean(item.media_type) !== Boolean(item.media_url)) { status('Escolha o tipo de mídia e informe o link HTTPS, ou deixe os dois vazios.',true); return; }
    if (item.media_url) {
      try { if (new URL(item.media_url).protocol !== 'https:') throw Error(); }
      catch { status('Use um link HTTPS válido para a mídia.',true); return; }
    }
    if (Boolean(item.link_label) !== Boolean(item.link_url)) { status('Preencha o nome e o link do botão, ou deixe os dois vazios.',true); return; }
    if (item.link_label.length > 60 || item.link_url.length > 2048) { status('O botão aceita até 60 caracteres no nome e 2048 no link.',true); return; }
    if (item.link_url) {
      try { if (new URL(item.link_url).protocol !== 'https:') throw Error(); }
      catch { status('Use um link HTTPS válido para o botão.',true); return; }
    }
    const button = document.getElementById(active ? 'platformSiapAnnouncementPublish' : 'platformSiapAnnouncementDisable');
    button.disabled = true;
    let uploadedPath = null;
    const previousPath = storagePath(current?.media_url);
    try {
      if (file) {
        status('Enviando arquivo…');
        uploadedPath = `assistant/${crypto.randomUUID()}.${mimeExtensions[file.type]}`;
        const {error:uploadError} = await db.storage.from(bucket).upload(uploadedPath,file,{contentType:file.type,upsert:false});
        if (uploadError) throw uploadError;
        item.media_type = fileType(file);
        item.media_url = db.storage.from(bucket).getPublicUrl(uploadedPath).data.publicUrl;
      }
      const {error} = await db.rpc('platform_set_siap_assistant_announcement_v2', {
        p_title:item.title, p_message_body:item.message_body,
        p_media_type:item.media_type, p_media_url:item.media_url,
        p_link_label:item.link_label || null, p_link_url:item.link_url || null, p_active:active
      });
      if (error) throw error;
      const replacedPath = active && previousPath && previousPath !== storagePath(item.media_url) ? previousPath : null;
      await load();
      status(active ? 'Comunicado publicado no Assistente SIAP.' : 'Comunicado desativado.');
      if (replacedPath) db.storage.from(bucket).remove([replacedPath]);
    } catch (error) {
      if (uploadedPath) await db.storage.from(bucket).remove([uploadedPath]);
      status(error.message || 'Não foi possível atualizar o comunicado.',true);
    } finally { button.disabled = false; }
  }
  async function removeMedia() {
    const form = document.getElementById('platformSiapAnnouncementForm');
    if (!current?.media_url) {
      form.elements.media_file.value = '';
      form.elements.media_type.value = '';
      form.elements.media_url.value = '';
      form.elements.media_source.value = 'none';
      refreshSource();
      status('Mídia retirada da seleção.');
      return;
    }
    const button = document.getElementById('platformSiapAnnouncementRemoveMedia');
    button.disabled = true;
    const previousPath = storagePath(current.media_url);
    try {
      const {error} = await db.rpc('platform_set_siap_assistant_announcement_v2', {
        p_title:current.title, p_message_body:current.message_body,
        p_media_type:null, p_media_url:null,
        p_link_label:current.link_label || null, p_link_url:current.link_url || null,
        p_active:current.active === true
      });
      if (error) throw error;
      await load();
      const {error:removeError} = previousPath ? await db.storage.from(bucket).remove([previousPath]) : {error:null};
      status(removeError
        ? 'Mídia retirada do comunicado, mas o arquivo antigo ainda precisa ser removido do armazenamento.'
        : 'Mídia removida do comunicado. Título, mensagem e botão preservados.',Boolean(removeError));
    } catch (error) {
      status(error.message || 'Não foi possível remover a mídia.',true);
    } finally { button.disabled = false; }
  }
  function mount() {
    if (mounted || !root()) return;
    mounted = true;
    root().innerHTML = `<section class="platform-panel platform-siap-announcement">
      <div class="platform-panel-head"><div><h4>Novidade no Assistente SIAP</h4><p>Um comunicado visível no topo do Assistente e na entrada por e-mail.</p></div></div>
      <div class="platform-siap-announcement-grid"><form id="platformSiapAnnouncementForm">
        <label>Título<input name="title" maxlength="120" required placeholder="Ex.: Novidade no planejamento"></label>
        <label>Mensagem<textarea name="message_body" rows="5" maxlength="3000" required placeholder="Escreva a novidade para os professores."></textarea></label>
        <label>Nome do botão (opcional)<input name="link_label" maxlength="60" placeholder="Ex.: Ver promoção"></label>
        <label>Link do botão (opcional)<input name="link_url" type="url" maxlength="2048" placeholder="https://..."></label>
        <label>Mídia<select name="media_source"><option value="none">Sem mídia</option><option value="link">Link HTTPS</option><option value="file">Arquivo do computador ou celular</option></select></label>
        <div class="platform-siap-announcement-media" data-announcement-link hidden>
          <label>Tipo<select name="media_type"><option value="">Escolha o tipo</option><option value="image">Imagem</option><option value="video">Vídeo</option></select></label>
          <label>Link público HTTPS<input name="media_url" type="url" placeholder="https://..."></label>
          <small>Para vídeos com mais de 50 MB, use um link público HTTPS.</small>
        </div>
        <div data-announcement-file hidden><label>Escolher imagem ou vídeo<input name="media_file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"></label><small>Imagens JPG, PNG, WebP ou GIF e vídeos MP4 ou WebM: até 50 MB por arquivo. Para vídeos maiores, escolha Link HTTPS.</small></div>
        <button id="platformSiapAnnouncementRemoveMedia" type="button" class="btn secondary" hidden>Remover mídia</button>
        <div class="platform-siap-announcement-actions"><button id="platformSiapAnnouncementPublish" type="submit" class="btn primary">Publicar comunicado</button><button id="platformSiapAnnouncementDisable" type="button" class="btn secondary">Desativar</button></div>
        <p id="platformSiapAnnouncementStatus" class="meta" role="status">Carregando…</p>
      </form><div id="platformSiapAnnouncementPreview" class="platform-siap-announcement-preview"></div></div>
    </section>`;
    const form = document.getElementById('platformSiapAnnouncementForm');
    form.addEventListener('input',preview);
    form.addEventListener('change',event => event.target.name === 'media_source' ? refreshSource() : preview());
    form.onsubmit = event => { event.preventDefault(); save(true); };
    document.getElementById('platformSiapAnnouncementDisable').onclick = () => save(false);
    document.getElementById('platformSiapAnnouncementRemoveMedia').onclick = removeMedia;
  }
  window.openPlatformSiapAnnouncement = () => { mount(); return load(); };
})();
