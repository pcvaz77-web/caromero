const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, flush } = require('./helpers/browser-harness.cjs');

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
