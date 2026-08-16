document.addEventListener('DOMContentLoaded', () => {
  const bell = document.createElement('button');
  bell.id = 'notificationBell';
  bell.type = 'button';
  bell.className = 'notification-bell hidden';
  bell.setAttribute('aria-label', 'Notificações');
  bell.innerHTML = '🔔 <span id="notifUnreadCount" class="notification-count hidden">0</span>';
  document.querySelector('.top-actions')?.prepend(bell);

  const panel = document.createElement('div');
  panel.id = 'notificationPanel';
  panel.className = 'notification-panel hidden';
  panel.innerHTML = `
    <div class="notification-panel-head">
      <b>Notificações</b>
      <button type="button" id="markAllNotificationsRead" class="link">Marcar todas como lidas</button>
    </div>
    <div id="notificationList" class="notification-list"></div>
  `;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    .notification-bell { position:relative; min-height:43px; padding:10px 13px; border:1px solid #d0d5dd; border-radius:9px; background:#fff; color:var(--navy); font-weight:800; font-size:15px; }
    .notification-count { display:inline-grid; min-width:19px; height:19px; padding:0 4px; place-items:center; border-radius:99px; background:#b42318; color:#fff; font-size:11px; font-weight:800; vertical-align:top; }
    .notification-panel { position:fixed; top:78px; right:28px; width:min(380px, calc(100vw - 32px)); max-height:min(520px, calc(100vh - 110px)); display:flex; flex-direction:column; background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:0 20px 45px #10182833; z-index:120; overflow:hidden; }
    .notification-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 16px; border-bottom:1px solid var(--line); }
    .notification-panel-head b { font-size:15px; }
    .notification-panel-head .link { font-size:12px; }
    .notification-list { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
    .notification-item { padding:12px 16px; border-bottom:1px solid #edf0f4; }
    .notification-item:last-child { border-bottom:0; }
    .notification-item.unread { background:#f5f8ff; }
    .notification-item-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .notification-item-head b { font-size:13px; }
    .notification-item-head span { flex:none; color:var(--muted); font-size:11px; }
    .notification-item p { margin:5px 0 0; font-size:13px; line-height:1.4; color:#344054; }
    .notification-mark-read { margin-top:7px; font-size:12px; }
    .notification-empty { padding:34px 16px; text-align:center; color:var(--muted); font-size:13px; }
    @media(max-width:800px) {
      .notification-panel { top:auto; bottom:0; right:0; left:0; width:100%; max-height:70dvh; border-radius:16px 16px 0 0; }
    }
  `;
  document.head.appendChild(style);

  let notifications = [];
  let channel = null;

  const formatWhen = value => {
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
    catch { return ''; }
  };

  function renderCount() {
    const unread = notifications.filter(item => !item.read_at).length;
    const countEl = document.getElementById('notifUnreadCount');
    if (!countEl) return;
    countEl.textContent = unread > 99 ? '99+' : String(unread);
    countEl.classList.toggle('hidden', unread === 0);
  }

  function renderList() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.innerHTML = notifications.length
      ? notifications.map(item => `<article class="notification-item ${item.read_at ? '' : 'unread'}" data-id="${item.id}"><div class="notification-item-head"><b>${esc(item.title)}</b><span>${formatWhen(item.created_at)}</span></div><p>${esc(item.body)}</p>${item.read_at ? '' : `<button type="button" class="link notification-mark-read" data-id="${item.id}">Marcar como lida</button>`}</article>`).join('')
      : '<div class="notification-empty">Nenhuma notificação por enquanto.</div>';
  }

  async function loadNotifications() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    const { data, error } = await db.from('user_notifications')
      .select('id,title,body,class_id,read_at,created_at')
      .eq('recipient_id', signedInUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    notifications = data || [];
    renderCount();
    renderList();
  }

  async function markRead(id) {
    const numericId = Number(id);
    const { error } = await db.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', numericId);
    if (error) { toast(error.message); return; }
    const item = notifications.find(entry => entry.id === numericId);
    if (item) item.read_at = new Date().toISOString();
    renderCount();
    renderList();
  }

  document.getElementById('markAllNotificationsRead').onclick = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    const { error } = await db.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', signedInUser.id)
      .is('read_at', null);
    if (error) { toast(error.message); return; }
    const now = new Date().toISOString();
    notifications.forEach(item => { if (!item.read_at) item.read_at = now; });
    renderCount();
    renderList();
  };

  document.getElementById('notificationList').onclick = event => {
    const button = event.target.closest('.notification-mark-read');
    if (!button) return;
    markRead(button.dataset.id);
  };

  bell.onclick = () => {
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (opening) loadNotifications();
  };
  document.addEventListener('click', event => {
    if (panel.classList.contains('hidden')) return;
    if (event.target.closest('#notificationPanel, #notificationBell')) return;
    panel.classList.add('hidden');
  });

  let activeUserId = null;
  async function startNotificationCenter() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) { bell.classList.add('hidden'); return; }
    bell.classList.remove('hidden');
    if (activeUserId === signedInUser.id) return;
    activeUserId = signedInUser.id;
    await loadNotifications();
    if (channel) await db.removeChannel(channel);
    channel = db.channel(`notification-center-${signedInUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `recipient_id=eq.${signedInUser.id}` }, payload => {
        notifications.unshift(payload.new);
        if (notifications.length > 50) notifications.length = 50;
        renderCount();
        renderList();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_notifications', filter: `recipient_id=eq.${signedInUser.id}` }, payload => {
        const index = notifications.findIndex(item => item.id === payload.new.id);
        if (index !== -1) notifications[index] = payload.new;
        renderCount();
        renderList();
      })
      .subscribe();
  }

  new MutationObserver(() => {
    if (!document.getElementById('app').classList.contains('hidden')) startNotificationCenter();
    else { bell.classList.add('hidden'); panel.classList.add('hidden'); activeUserId = null; }
  }).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
});
