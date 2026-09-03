document.addEventListener('DOMContentLoaded', () => {
  const bell = document.createElement('button');
  bell.id = 'notificationBell';
  bell.type = 'button';
  bell.className = 'notification-bell hidden';
  bell.setAttribute('aria-label', 'Notificações');
  bell.innerHTML = '🔔 <span id="notificationUnreadCount" class="notification-count hidden">0</span>';
  const greeting = document.getElementById('welcomeGreeting');
  const heading = document.querySelector('.top > div:first-child');
  if (greeting && heading) {
    const greetingRow = document.createElement('div');
    greetingRow.className = 'welcome-notification-row';
    const userContext = document.createElement('div');
    userContext.className = 'welcome-user-context';
    heading.before(greetingRow);
    userContext.appendChild(greeting);
    const activeSchool = document.getElementById('activeSchoolGreeting');
    if (activeSchool) userContext.appendChild(activeSchool);
    greetingRow.append(userContext, bell);
  } else {
    document.querySelector('.top-actions')?.prepend(bell);
  }

  const panel = document.createElement('div');
  panel.id = 'notificationPanel';
  panel.className = 'notification-panel hidden';
  panel.innerHTML = `
    <div class="notification-panel-head">
      <b>Notificações</b>
      <div class="notification-panel-actions">
        <button type="button" id="markAllNotificationsRead" class="link">Marcar todas como lidas</button>
        <button type="button" id="clearNotifications" class="link">Limpar notificações</button>
      </div>
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
    .notification-panel-actions { display:flex; align-items:center; gap:10px; }
    .notification-panel-head .link { font-size:12px; }
    .notification-list { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
    .notification-item { padding:12px 16px; border-bottom:1px solid #edf0f4; }
    .notification-item:last-child { border-bottom:0; }
    .notification-item.unread { background:#f5f8ff; }
    .notification-item-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .notification-item-head b { font-size:13px; }
    .notification-item-head span { flex:none; color:var(--muted); font-size:11px; }
    .notification-item p { margin:5px 0 0; font-size:13px; line-height:1.4; color:#344054; }
    .notification-item-clickable { cursor:pointer; }
    .notification-item-clickable:hover { background:#eef2ff; }
    .notification-item-clickable .notification-item-head b::after { content:'  →'; color:var(--muted); font-weight:600; }
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

  // O contador do sino nunca é derivado da lista carregada (que fica
  // limitada aos 50 itens mais recentes) — é sempre uma contagem
  // independente no banco, para não subestimar quando existirem mais de
  // 50 notificações não lidas.
  function renderCount(unreadTotal) {
    const countEl = document.getElementById('notificationUnreadCount');
    if (!countEl) return;
    countEl.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
    countEl.classList.toggle('hidden', unreadTotal === 0);
  }

  async function refreshUnreadCount() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) { renderCount(0); return; }
    const { count, error } = await db.from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', signedInUser.id)
      .eq('school_id', schoolId)
      .is('read_at', null)
      .is('dismissed_at', null);
    if (error) return;
    renderCount(count || 0);
  }

  // A notificação é só um ponteiro de navegação. Cada tipo abaixo tem um
  // destino que já sabemos resolver hoje; qualquer outro target_type (ou um
  // item sem o id/turma necessário) fica sem indicação de link — continua
  // uma notificação normal, só não clicável.
  const CLICKABLE_TARGET_TYPES = new Set(['student', 'occurrence', 'class', 'class_counselor', 'classroom_map']);
  function isNotificationClickable(item) {
    if (!CLICKABLE_TARGET_TYPES.has(item.target_type)) return false;
    if (item.target_type === 'class_counselor') return !!item.class_id;
    return !!item.target_id;
  }

  function renderList() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.innerHTML = notifications.length
      ? notifications.map(item => {
          const clickable = isNotificationClickable(item);
          return `<article class="notification-item ${item.read_at ? '' : 'unread'} ${clickable ? 'notification-item-clickable' : ''}" data-id="${item.id}" ${clickable ? 'data-clickable="1"' : ''}><div class="notification-item-head"><b>${esc(item.title)}</b><span>${formatWhen(item.created_at)}</span></div><p>${esc(item.body)}</p>${item.read_at ? '' : `<button type="button" class="link notification-mark-read" data-id="${item.id}">Marcar como lida</button>`}</article>`;
        }).join('')
      : '<div class="notification-empty">Nenhuma notificação por enquanto.</div>';
    document.getElementById('clearNotifications')?.classList.toggle('hidden', notifications.length === 0);
  }

  async function loadNotifications() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) { notifications = []; renderList(); renderCount(0); return; }
    const { data, error } = await db.from('user_notifications')
      .select('id,school_id,title,body,class_id,read_at,created_at,target_type,target_id')
      .eq('recipient_id', signedInUser.id)
      .eq('school_id', schoolId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    notifications = data || [];
    renderList();
    await refreshUnreadCount();
  }

  // Resolve o destino de uma notificação com uma consulta NOVA ao Supabase
  // no momento do clique — nunca a partir do array `students`/`classes` já
  // carregado em memória. A RLS de cada tabela decide, agora, se a linha
  // volta ou não; a notificação não concede nem amplia nenhum acesso, só
  // aponta para onde tentar olhar. Retorna uma função de navegação (ainda
  // não executada) quando o destino existe e está acessível, ou null.
  async function resolveNotificationTarget(item) {
    try {
      const schoolId = window.getActiveSchoolId?.();
      if (!schoolId) return null;
      if (item.target_type === 'student') {
        if (!item.target_id) return null;
        let query = db.from('students').select('id,class_id').eq('id', item.target_id);
        query = query.eq('school_id', schoolId);
        const { data, error } = await query.maybeSingle();
        if (error || !data) return null;
        return () => { window.selectClass?.(data.class_id || ''); window.showStudentDetails?.(data.id); };
      }
      if (item.target_type === 'occurrence') {
        if (!item.target_id) return null;
        let query = db.from('student_occurrences').select('id,student_id,class_id').eq('id', item.target_id);
        query = query.eq('school_id', schoolId);
        const { data, error } = await query.maybeSingle();
        if (error || !data) return null;
        return () => { window.openOccurrenceRecord?.({ occurrenceId: data.id, studentId: data.student_id, classId: data.class_id }); };
      }
      if (item.target_type === 'class') {
        if (!item.target_id) return null;
        let query = db.from('classes').select('id').eq('id', item.target_id);
        query = query.eq('school_id', schoolId);
        const { data, error } = await query.maybeSingle();
        if (error || !data) return null;
        return () => { window.selectClass?.(data.id); };
      }
      if (item.target_type === 'class_counselor') {
        if (!item.class_id) return null;
        let query = db.from('classes').select('id').eq('id', item.class_id);
        query = query.eq('school_id', schoolId);
        const { data, error } = await query.maybeSingle();
        if (error || !data) return null;
        return () => { window.selectClass?.(data.id); };
      }
      if (item.target_type === 'classroom_map') {
        if (!item.class_id) return null;
        let query = db.from('classes').select('id').eq('id', item.class_id);
        query = query.eq('school_id', schoolId);
        const { data, error } = await query.maybeSingle();
        if (error || !data) return null;
        return () => { window.selectClass?.(data.id); window.openClassroomMap?.(data.id); };
      }
      return null;
    } catch {
      return null;
    }
  }

  async function openNotificationTarget(id) {
    const numericId = Number(id);
    const item = notifications.find(entry => entry.id === numericId);
    if (!item || !isNotificationClickable(item)) return;
    const navigate = await resolveNotificationTarget(item);
    if (!navigate) {
      toast('Este conteúdo não está disponível ou você não possui permissão para acessá-lo.');
      return;
    }
    panel.classList.add('hidden');
    if (!item.read_at) await markRead(id);
    navigate();
  }

  async function markRead(id) {
    const numericId = Number(id);
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) return;
    const { error } = await db.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', numericId).eq('school_id', schoolId);
    if (error) { toast(error.message); return; }
    const item = notifications.find(entry => entry.id === numericId);
    if (item) item.read_at = new Date().toISOString();
    renderList();
    await refreshUnreadCount();
  }

  // Deep link do push: abre uma notificação direto pelo id, sem depender
  // dela já estar carregada no array em memória (o push pode chegar antes
  // do sino ter sido aberto nesta sessão). Busca a linha com uma consulta
  // nova, sujeita à mesma RLS de sempre ("Own notifications": recipient_id
  // = auth.uid()) — se não vier nada (não existe, foi excluída ou não é do
  // usuário), cai no mesmo "não disponível" que o sino já usa. Reaproveita
  // resolveNotificationTarget() em vez de duplicar a lógica por target_type.
  async function openNotificationById(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) return;
    const { data: item, error } = await db.from('user_notifications')
      .select('id,school_id,target_type,target_id,class_id,read_at')
      .eq('id', numericId)
      .maybeSingle();
    if (error || !item) {
      toast('Este conteúdo não está disponível ou você não possui permissão para acessá-lo.');
      return;
    }
    if (item.school_id !== schoolId) {
      try { sessionStorage.setItem('carometroPendingNotification', String(numericId)); } catch {}
      if (window.activateSchoolContext?.(item.school_id)) return;
      try { sessionStorage.removeItem('carometroPendingNotification'); } catch {}
      toast('Esta notificação pertence a uma escola em que seu acesso não está ativo.');
      return;
    }
    const navigate = await resolveNotificationTarget(item);
    if (!navigate) {
      toast('Este conteúdo não está disponível ou você não possui permissão para acessá-lo.');
      return;
    }
    panel.classList.add('hidden');
    if (!item.read_at) await markRead(id);
    navigate();
  }
  window.openNotificationById = openNotificationById;

  document.getElementById('markAllNotificationsRead').onclick = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) return;
    const { error } = await db.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', signedInUser.id)
      .eq('school_id', schoolId)
      .is('read_at', null);
    if (error) { toast(error.message); return; }
    const now = new Date().toISOString();
    notifications.forEach(item => { if (!item.read_at) item.read_at = now; });
    renderList();
    await refreshUnreadCount();
  };

  document.getElementById('clearNotifications').onclick = async () => {
    if (!notifications.length) return;
    if (!confirm('Limpar todas as notificações do sino?')) return;
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) return;
    const { error } = await db.from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('recipient_id', signedInUser.id)
      .eq('school_id', schoolId)
      .is('dismissed_at', null);
    if (error) { toast(error.message); return; }
    notifications = [];
    renderList();
    await refreshUnreadCount();
  };

  document.getElementById('notificationList').onclick = event => {
    const button = event.target.closest('.notification-mark-read');
    if (button) { markRead(button.dataset.id); return; }
    const article = event.target.closest('.notification-item[data-clickable="1"]');
    if (article) openNotificationTarget(article.dataset.id);
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

  let activeScope = null;
  let channelGeneration = 0;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let openingPromise = null;
  let reopenQueued = false;
  let hasConnectedBefore = false;
  let stopped = true;
  let hiddenSince = null;
  const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

  const clearRetry = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };
  const scheduleReconnect = generation => {
    if (stopped || generation !== channelGeneration) return;
    clearRetry();
    const delay = RETRY_DELAYS[Math.min(reconnectAttempt, RETRY_DELAYS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped && generation === channelGeneration) requestNotificationChannel(true);
    }, delay);
  };

  async function openNotificationChannel(force) {
    if (stopped || document.getElementById('app').classList.contains('hidden')) return;
    const { data: { user: signedInUser } } = await db.auth.getUser();
    const schoolId = window.getActiveSchoolId?.();
    if (!signedInUser || !schoolId) { bell.classList.add('hidden'); return; }
    bell.classList.remove('hidden');
    const scope = `${signedInUser.id}:${schoolId}`;
    if (!force && channel && activeScope === scope) return;

    channelGeneration += 1;
    const generation = channelGeneration;
    clearRetry();
    if (channel) {
      const oldChannel = channel;
      channel = null;
      await db.removeChannel(oldChannel);
    }
    if (stopped || generation !== channelGeneration) return;
    activeScope = scope;
    await loadNotifications();
    channel = db.channel(`notification-center-${signedInUser.id}-${schoolId}-${generation}`)
      .on('postgres_changes', { event: 'INSERT', schema:'public', table:'user_notifications', filter:`school_id=eq.${schoolId}` }, async payload => {
        if (payload.new.recipient_id !== signedInUser.id) return;
        notifications.unshift(payload.new);
        if (notifications.length > 50) notifications.length = 50;
        renderList();
        await refreshUnreadCount();
        if (['occurrence', 'occurrence_deleted'].includes(payload.new.target_type)) {
          document.dispatchEvent(new Event('carometro:occurrences-changed'));
        }
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'user_notifications', filter:`school_id=eq.${schoolId}` }, async payload => {
        if (payload.new.recipient_id !== signedInUser.id) return;
        const index = notifications.findIndex(item => item.id === payload.new.id);
        if (payload.new.dismissed_at) { if (index !== -1) notifications.splice(index, 1); }
        else if (index !== -1) notifications[index] = payload.new;
        renderList();
        await refreshUnreadCount();
      })
      .subscribe((status, error) => {
        if (generation !== channelGeneration) return;
        if (status === 'SUBSCRIBED') {
          clearRetry();
          reconnectAttempt = 0;
          if (hasConnectedBefore) loadNotifications();
          else hasConnectedBefore = true;
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !stopped) {
          console.warn(`[Notificações] Canal encerrado inesperadamente (${status}).`, error || '');
          scheduleReconnect(generation);
        }
      });
  }

  function requestNotificationChannel(force = false) {
    if (stopped) return Promise.resolve();
    if (openingPromise) { reopenQueued = reopenQueued || force; return openingPromise; }
    openingPromise = (async () => {
      let nextForce = force;
      do {
        reopenQueued = false;
        await openNotificationChannel(nextForce);
        nextForce = true;
      } while (reopenQueued && !stopped);
    })().catch(error => {
      console.error('[Notificações] Falha ao abrir canal:', error);
      scheduleReconnect(channelGeneration);
    }).finally(() => { openingPromise = null; });
    return openingPromise;
  }

  async function stopNotificationCenter() {
    stopped = true;
    clearRetry();
    reconnectAttempt = 0;
    hasConnectedBefore = false;
    activeScope = null;
    channelGeneration += 1;
    bell.classList.add('hidden');
    panel.classList.add('hidden');
    if (channel) {
      const oldChannel = channel;
      channel = null;
      await db.removeChannel(oldChannel);
    }
  }

  async function startNotificationCenter() {
    stopped = false;
    await requestNotificationChannel(false);
  }

  // O aplicativo pode ficar visível antes de a escola ativa terminar de ser
  // resolvida. Nesse caso a primeira tentativa não possui schoolId e o sino
  // permaneceria oculto até um novo login. Reinicie assim que o contexto da
  // escola estiver pronto, independentemente das notificações push.
  document.addEventListener('carometro:school-context-ready', () => {
    if (!document.getElementById('app').classList.contains('hidden')) {
      startNotificationCenter();
    }
  });

  new MutationObserver(() => {
    if (!document.getElementById('app').classList.contains('hidden')) startNotificationCenter();
    else stopNotificationCenter();
  }).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) stopNotificationCenter();
  });
  window.addEventListener('online', () => {
    if (!stopped) { clearRetry(); reconnectAttempt = 0; requestNotificationChannel(true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenSince = Date.now(); return; }
    const hiddenFor = hiddenSince ? Date.now() - hiddenSince : 0;
    hiddenSince = null;
    if (!stopped && hiddenFor >= 60000) {
      clearRetry();
      reconnectAttempt = 0;
      requestNotificationChannel(true);
    }
  });
});
