const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, flush } = require('./helpers/browser-harness.cjs');

test('aviso direto exige destinatarios e prepara os perfis escolhidos', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={ownerFormData,audienceLabel,setOwnerKind};})();')
  });
  await h.ready();
  h.context.URL = URL;
  h.get('platformAnnouncementTitle').value = 'Novo recurso';
  h.get('platformAnnouncementMessage').value = 'Confira a novidade.';
  h.get('platformAnnouncementTheme').value = 'black_friday';
  h.get('platformAnnouncementThemeColor').value = '#080e1b';
  h.get('platformAnnouncementTextColor').value = '#fff5d4';
  h.get('platformAnnouncementButtonColor').value = '#d7b65f';
  h.get('platformAnnouncementThemeImage').value = 'https://example.org/fundo.jpg';
  h.get('platformAnnouncementNoticeImage').value = 'https://example.org/noticia.jpg';
  h.get('platformAnnouncementRoleAll').checked = true;
  let input = h.context.window.testAnnouncements.ownerFormData();
  assert.equal(input.values.target_roles, null);
  assert.equal(input.values.communication_kind, 'notice');
  assert.equal(input.values.theme_image_url, null);
  assert.equal(input.values.notice_image_url, 'https://example.org/noticia.jpg');
  assert.equal(input.values.button_color, '#d7b65f');
  assert.equal(h.context.window.testAnnouncements.audienceLabel(input.values.target_roles), 'Todos');

  h.context.window.testAnnouncements.setOwnerKind('campaign');
  input = h.context.window.testAnnouncements.ownerFormData();
  assert.equal(input.values.communication_kind, 'campaign');
  assert.equal(input.values.theme_image_url, 'https://example.org/fundo.jpg');
  assert.equal(input.values.notice_image_url, null);
  assert.equal(input.values.video_url, null);
  h.context.window.testAnnouncements.setOwnerKind('notice');

  h.get('platformAnnouncementRoleAll').checked = false;
  h.get('platformAnnouncementRole-teacher').checked = true;
  h.get('platformAnnouncementRole-coordinator').checked = true;
  input = h.context.window.testAnnouncements.ownerFormData();
  assert.deepEqual([...input.values.target_roles], ['teacher', 'coordinator']);
  assert.equal(h.context.window.testAnnouncements.audienceLabel(input.values.target_roles), 'Professor, Coordenador');

  h.get('platformAnnouncementRole-teacher').checked = false;
  h.get('platformAnnouncementRole-coordinator').checked = false;
  assert.throws(() => h.context.window.testAnnouncements.ownerFormData(), /Selecione ao menos um perfil/);
});

test('arte de fundo permite aviso sem titulo e mensagem, mas aviso vazio e recusado', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={ownerFormData,setOwnerKind};})();')
  });
  await h.ready();
  h.context.URL = URL;
  h.get('platformAnnouncementRoleAll').checked = true;
  assert.throws(() => h.context.window.testAnnouncements.ownerFormData(), /Escreva um texto ou escolha/);
  h.context.window.testAnnouncements.setOwnerKind('campaign');
  h.get('platformAnnouncementThemeImage').value = 'https://example.org/arte.png';
  const input = h.context.window.testAnnouncements.ownerFormData();
  assert.equal(input.values.title, '');
  assert.equal(input.values.message_body, '');
  assert.equal(input.values.theme_image_url, 'https://example.org/arte.png');
});

test('modo somente imagem exige fundo e permite retirar as duas imagens antes de salvar', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={ownerFormData,clearImage,renderOwnerPreview,setOwnerKind};})();')
  });
  await h.ready();
  h.context.URL = URL;
  h.get('platformAnnouncementRoleAll').checked = true;
  h.context.window.testAnnouncements.setOwnerKind('campaign');
  h.get('platformAnnouncementTheme').value = 'image_only';
  h.get('platformAnnouncementThemeColor').value = '#17345d';
  h.get('platformAnnouncementTextColor').value = '#13213a';
  h.get('platformAnnouncementButtonColor').value = '#ffffff';
  assert.throws(() => h.context.window.testAnnouncements.ownerFormData(), /escolha uma imagem de fundo/);
  h.get('platformAnnouncementThemeImage').value = 'https://example.org/fundo.png';
  h.get('platformAnnouncementNoticeImage').value = 'https://example.org/aviso.png';
  assert.equal(h.context.window.testAnnouncements.ownerFormData().values.theme_key, 'image_only');
  h.context.window.testAnnouncements.renderOwnerPreview();
  assert.equal(h.get('platformAnnouncementThemeColors').classList.contains('hidden'), true);
  assert.equal(h.get('platformAnnouncementButtonColorField').classList.contains('hidden'), true);
  h.context.window.testAnnouncements.clearImage('platformAnnouncementNoticeImage','platformAnnouncementNoticeFile');
  assert.equal(h.get('platformAnnouncementNoticeImage').value, '');
  h.context.window.testAnnouncements.clearImage('platformAnnouncementThemeImage','platformAnnouncementThemeFile');
  assert.equal(h.get('platformAnnouncementThemeImage').value, '');
  assert.throws(() => h.context.window.testAnnouncements.ownerFormData(), /escolha uma imagem de fundo/);
});

test('prévia reduz a faixa inteira sem alterar suas proporções', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={syncOwnerPreviewSize};})();')
  });
  await h.ready();
  h.context.window.innerWidth = 1360;
  h.get('platformAnnouncementPreviewFrame').clientWidth = 550;
  h.get('platformAnnouncementPreview').offsetHeight = 216;
  h.context.window.testAnnouncements.syncOwnerPreviewSize();
  assert.equal(h.get('platformAnnouncementPreview').style.width, '1100px');
  assert.equal(h.get('platformAnnouncementPreview').style.transform, 'scale(0.5)');
  assert.equal(h.get('platformAnnouncementPreviewFrame').style.height, '108px');
});

test('imagem com e sem texto identifica a necessidade de contraste local na prévia e na faixa', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={applyTheme,setOwnerKind,renderOwnerPreview};})();')
  });
  await h.ready();
  h.context.URL = URL;
  h.context.window.testAnnouncements.setOwnerKind('campaign');
  h.get('platformAnnouncementTheme').value = 'image_only';
  h.get('platformAnnouncementThemeImage').value = 'https://example.org/banner.png';
  h.context.window.testAnnouncements.renderOwnerPreview();
  assert.equal(h.get('platformAnnouncementPreview').dataset.hasCopy, 'false');
  h.get('platformAnnouncementTitle').value = 'Mensagem sobre a imagem';
  h.context.window.testAnnouncements.renderOwnerPreview();
  assert.equal(h.get('platformAnnouncementPreview').dataset.hasCopy, 'true');
  h.context.window.testAnnouncements.applyTheme(h.get('platformAnnouncementBanner'), {
    theme_key: 'image_only', theme_image_url: 'https://example.org/banner.png', title: '', message_body: ''
  });
  assert.equal(h.get('platformAnnouncementBanner').dataset.hasCopy, 'false');
});

test('letreiro sozinho pode ser salvo em novidade e campanha e aparece na prévia', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={ownerFormData,setOwnerKind,renderOwnerPreview};})();')
  });
  await h.ready();
  h.context.URL = URL;
  h.get('platformAnnouncementRoleAll').checked = true;
  h.get('platformAnnouncementTickerText').value = 'Inscrições abertas para o ENEM 2026';
  h.get('platformAnnouncementTickerColor').value = '#ffdf54';
  h.get('platformAnnouncementTickerBackground').value = '#10214a';
  let values = h.context.window.testAnnouncements.ownerFormData().values;
  assert.equal(values.ticker_text, 'Inscrições abertas para o ENEM 2026');
  assert.equal(values.ticker_text_color, '#ffdf54');
  assert.equal(values.ticker_background_color, '#10214a');
  h.context.window.testAnnouncements.setOwnerKind('campaign');
  h.get('platformAnnouncementTheme').value = 'image_only';
  h.get('platformAnnouncementThemeImage').value = 'https://example.org/enem.png';
  values = h.context.window.testAnnouncements.ownerFormData().values;
  assert.equal(values.ticker_text, 'Inscrições abertas para o ENEM 2026');
  assert.equal(values.ticker_background_color, '#10214a');
  h.get('platformAnnouncementPreviewTicker').clientWidth = 1100;
  h.get('platformAnnouncementPreviewTickerLine').scrollWidth = 500;
  h.context.window.testAnnouncements.renderOwnerPreview();
  assert.equal(h.get('platformAnnouncementPreview').dataset.hasTicker, 'true');
  assert.equal(h.get('platformAnnouncementPreviewTickerLine').textContent, 'Inscrições abertas para o ENEM 2026');
  assert.equal(h.get('platformAnnouncementPreviewTickerLine').style.animationDuration, '26s');
  assert.equal(h.get('platformAnnouncementPreviewTicker').style.color, '#ffdf54');
  assert.equal(h.get('platformAnnouncementPreviewTicker').style.background, '#10214ae6');
});

for (const rpcFails of [false, true]) test(`publicacao ${rpcFails ? 'preserva o anterior se falhar' : 'substitui o anterior e limpa seus videos'}`, async () => {
  const records = [
    { id: 'old', status: 'published', video_storage_path: 'old.mp4', title: 'Anterior', message_body: 'Mensagem anterior', published_at: '2026-10-20T12:00:00Z' },
    { id: 'archived', status: 'archived', video_storage_path: 'archived.mp4', title: 'Antigo', message_body: 'Mensagem antiga', published_at: '2026-10-19T12:00:00Z' }
  ];
  const removed = [];
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={publish};})();'),
    query: (table, operations) => {
      if (table === 'platform_in_app_announcement_dismissals') return { data: [], error: null };
      const insertion = operations.find(([method]) => method === 'insert');
      if (insertion) {
        records.push({ ...insertion[1], id: 'new' });
        return { data: { id: 'new' }, error: null };
      }
      const status = operations.find(([method, key]) => method === 'eq' && key === 'status')?.[2];
      const allowed = operations.find(([method, key]) => method === 'in' && key === 'status')?.[2];
      return { data: records.filter(row => status ? row.status === status : allowed ? allowed.includes(row.status) : true), error: null };
    },
    rpc: (name, args) => {
      assert.equal(name, 'platform_publish_in_app_announcement');
      assert.equal(args.p_announcement_id, 'new');
      if (rpcFails) return { error: { message: 'Falha simulada' } };
      const oldRows = records.filter(row => row.status === 'published');
      for (const row of oldRows) records.splice(records.indexOf(row), 1);
      records.find(row => row.id === 'new').status = 'published';
      return { data: oldRows.map(row => row.video_storage_path), error: null };
    }
  });
  h.context.db.storage = { from: () => ({ remove: async paths => { removed.push(...paths); return { error: null }; } }) };
  h.get('platformAnnouncementForm').reset = () => {};
  await h.ready();
  h.get('platformAnnouncementTitle').value = 'Aviso novo';
  h.get('platformAnnouncementMessage').value = 'Nova mensagem para todos.';
  h.get('platformAnnouncementRoleAll').checked = true;
  await h.context.window.testAnnouncements.publish();

  if (rpcFails) {
    assert.equal(records.find(row => row.id === 'old').status, 'published');
    assert.equal(records.find(row => row.id === 'new').status, 'draft');
    assert.match(h.get('platformAnnouncementStatus').textContent, /aviso anterior foi preservado/);
    assert.deepEqual(removed, []);
  } else {
    assert.deepEqual(records.map(row => row.id), ['archived', 'new']);
    assert.equal(records[1].status, 'published');
    assert.deepEqual(removed, ['old.mp4']);
    assert.match(h.get('platformAnnouncementStatus').textContent, /anterior foi excluído/);
  }
});

test('aviso global permanece para outra conta apos fechamento individual', async () => {
  const dismissed = new Set();
  const announcement = {
    id: 'notice-1', title: 'Atualização', message_body: 'Há uma novidade para todos.',
    ticker_text: 'Leia o comunicado completo', video_url: null, published_at: '2026-10-20T12:00:00Z'
  };
  const h = harness('platform-in-app-announcements.js', {
    query: (table, operations) => {
      if (table === 'platform_in_app_announcements') return { data: [announcement], error: null };
      if (operations.some(([method]) => method === 'upsert')) {
        const row = operations.find(([method]) => method === 'upsert')[1];
        dismissed.add(`${row.user_id}:${row.announcement_id}`);
        return { data: null, error: null };
      }
      const userId = operations.find(([method, key]) => method === 'eq' && key === 'user_id')?.[2];
      return { data: dismissed.has(`${userId}:notice-1`) ? [{ announcement_id: 'notice-1' }] : [], error: null };
    }
  });
  h.context.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  await h.ready();
  assert.equal(h.get('platformAnnouncementBannerTitle').textContent, 'Atualização');
  assert.equal(h.get('platformAnnouncementBanner').classList.contains('hidden'), false);
  assert.equal(h.get('platformAnnouncementBannerTickerLine').textContent, 'Leia o comunicado completo');

  await h.get('platformAnnouncementDismiss').onclick();
  assert.equal(h.get('platformAnnouncementBanner').classList.contains('hidden'), true);
  assert.equal(dismissed.has('user-a:notice-1'), true);

  h.context.user = { id: 'user-b' };
  h.observers[0].fn();
  await flush();
  assert.equal(h.get('platformAnnouncementBanner').classList.contains('hidden'), false);
  assert.equal(h.get('platformAnnouncementBannerTitle').textContent, 'Atualização');
});

test('aviso global aparece no sino mesmo sem permissao de notificacoes da escola', async () => {
  const h = harness('notification-center.js');
  h.context.permission = { is_secretary: true, can_receive_notifications: false };
  await h.ready();
  h.context.document.dispatchEvent({
    type: 'carometro:platform-announcements',
    detail: { announcements: [{ id: 'notice-1', title: 'Comunicado geral', message_body: 'Mensagem para todos.', published_at: '2026-10-20T12:00:00Z' }] }
  });
  assert.equal(h.get('notificationBell').classList.contains('hidden'), false);
  assert.equal(h.get('notificationUnreadCount').textContent, '1');
  assert.match(h.get('notificationList').innerHTML, /Comunicado geral/);
});

test('MP4 local aceita duracao maior e respeita tamanho antes do envio privado', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={validateVideoFile,prepareVideo,prepareMp4ForStreaming};})();')
  });
  h.context.File = File;
  const removed = [];
  let duration = 150;
  h.context.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: url => removed.push(url) };
  h.context.crypto = { randomUUID: () => '00000000-0000-0000-0000-000000000001' };
  await h.ready();
  h.context.document.createElement = tag => {
    assert.equal(tag, 'video');
    return { duration, load() {}, removeAttribute() {}, set src(value) { if (value) queueMicrotask(() => this.onloadedmetadata()); } };
  };
  const video = { name: 'tutorial.mp4', type: 'video/mp4', size: 45 * 1024 * 1024 };
  await h.context.window.testAnnouncements.validateVideoFile(video);
  assert.deepEqual(removed, ['blob:test']);
  duration = 151;
  await h.context.window.testAnnouncements.validateVideoFile(video);
  duration = 0;
  await assert.rejects(h.context.window.testAnnouncements.validateVideoFile(video), /confirmar a duração/);
  await assert.rejects(async () => h.context.window.testAnnouncements.validateVideoFile({ ...video, size: video.size + 1 }), /45 MB/);
  await assert.rejects(async () => h.context.window.testAnnouncements.validateVideoFile({ ...video, type: 'video/quicktime' }), /MP4/);

  duration = 150;
  const uploads = [];
  h.context.db.storage = { from: bucket => ({ upload: async (path, file, options) => {
    uploads.push({ bucket, path, file, options });
    return { error: null };
  } }) };
  const box = type => {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32BE(8, 0);
    bytes.write(type, 4);
    return bytes;
  };
  const uploadVideo = new File([box('ftyp'), box('moov'), box('mdat')], 'tutorial.mp4', { type: 'video/mp4' });
  const result = await h.context.window.testAnnouncements.prepareVideo({
    file: uploadVideo, values: { title: 'Tutorial', message_body: 'Veja o vídeo.', video_url: null, video_storage_path: null }
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, 'platform-announcement-videos');
  assert.match(uploads[0].path, /^user-a\/[0-9a-f-]+\.mp4$/);
  assert.equal(uploads[0].options.contentType, 'video/mp4');
  assert.equal(result.values.video_url, null);
  assert.equal(result.values.video_storage_path, uploads[0].path);
});

test('MP4 com indice no fim e preparado para reproducao progressiva', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={prepareMp4ForStreaming};})();')
  });
  h.context.File = File;
  await h.ready();
  const box = (type, payload = Buffer.alloc(0)) => {
    const bytes = Buffer.alloc(8 + payload.length);
    bytes.writeUInt32BE(bytes.length, 0);
    bytes.write(type, 4);
    payload.copy(bytes, 8);
    return bytes;
  };
  const chunk = Buffer.alloc(12);
  chunk.writeUInt32BE(1, 4);
  chunk.writeUInt32BE(16, 8);
  const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stco', chunk))))));
  const source = new File([box('ftyp'), box('mdat', Buffer.alloc(4)), moov], 'tutorial.mp4', { type: 'video/mp4' });
  const result = await h.context.window.testAnnouncements.prepareMp4ForStreaming(source);
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(bytes.toString('ascii', 12, 16), 'moov');
  assert.equal(bytes.toString('ascii', 8 + moov.length + 4, 8 + moov.length + 8), 'mdat');
  assert.equal(bytes.readUInt32BE(8 + moov.length - 4), 16 + moov.length);
});
