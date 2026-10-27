const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, flush } = require('./helpers/browser-harness.cjs');

test('aviso direto exige destinatarios e prepara os perfis escolhidos', async () => {
  const h = harness('platform-in-app-announcements.js', {
    transform: source => source.replace(/\}\)\(\);\s*$/, 'window.testAnnouncements={ownerFormData,audienceLabel};})();')
  });
  await h.ready();
  h.get('platformAnnouncementTitle').value = 'Novo recurso';
  h.get('platformAnnouncementMessage').value = 'Confira a novidade.';
  h.get('platformAnnouncementRoleAll').checked = true;
  let input = h.context.window.testAnnouncements.ownerFormData();
  assert.equal(input.values.target_roles, null);
  assert.equal(h.context.window.testAnnouncements.audienceLabel(input.values.target_roles), 'Todos');

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

test('aviso global permanece para outra conta apos fechamento individual', async () => {
  const dismissed = new Set();
  const announcement = {
    id: 'notice-1', title: 'Atualização', message_body: 'Há uma novidade para todos.',
    video_url: null, published_at: '2026-10-20T12:00:00Z'
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
