document.addEventListener('DOMContentLoaded', () => {
  let refreshTimer;
  let refreshing = false;
  let refreshQueued = false;
  let liveChannel = null;
  let activeScope = null;
  let generation = 0;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let openingPromise = null;
  let reopenQueued = false;
  let hasConnectedBefore = false;
  let stopped = true;
  let hiddenSince = null;
  const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

  const appIsOpen = () => !document.getElementById('app').classList.contains('hidden');
  const notify = name => document.dispatchEvent(new Event(name));
  const runRefresh = async () => {
    if (refreshing) { refreshQueued = true; return; }
    if (!appIsOpen()) return;
    refreshing = true;
    try { await window.load?.(); }
    catch (error) { console.error('[Realtime] Falha ao atualizar dados:', error); }
    finally {
      refreshing = false;
      if (refreshQueued) { refreshQueued = false; runRefresh(); }
    }
  };
  const refreshData = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(runRefresh, 120);
  };
  const clearRetry = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };
  const scheduleReconnect = channelGeneration => {
    if (stopped || channelGeneration !== generation) return;
    clearRetry();
    const delay = RETRY_DELAYS[Math.min(reconnectAttempt, RETRY_DELAYS.length - 1)];
    reconnectAttempt += 1;
    console.warn(`[Realtime] Reconectando em ${delay}ms (tentativa ${reconnectAttempt}).`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped && channelGeneration === generation) requestOpen(true);
    }, delay);
  };

  async function openOnce(force) {
    if (stopped || !appIsOpen() || !db.channel) return;
    const { data:{ user } } = await db.auth.getUser();
    if (!user || stopped) return;
    const schoolId = window.getActiveSchoolId?.() || null;
    const scope = `${user.id}:${schoolId || 'no-school'}`;
    if (!force && liveChannel && activeScope === scope) return;

    generation += 1;
    const channelGeneration = generation;
    clearRetry();
    if (liveChannel) {
      const oldChannel = liveChannel;
      liveChannel = null;
      await db.removeChannel(oldChannel);
    }
    if (stopped || channelGeneration !== generation) return;

    activeScope = scope;
    liveChannel = db.channel(`carometro-live-${user.id}-${schoolId || 'no-school'}-${channelGeneration}`);
    if (schoolId) {
      const schoolChange = table => ({ event:'*', schema:'public', table, filter:`school_id=eq.${schoolId}` });
      liveChannel
        .on('postgres_changes', schoolChange('students'), refreshData)
        .on('postgres_changes', schoolChange('classes'), refreshData)
        .on('postgres_changes', schoolChange('observation_options'), () => { notify('carometro:observations-changed'); refreshData(); })
        .on('postgres_changes', schoolChange('class_counselors'), () => { window.refreshCounselorAssignments?.(); notify('carometro:permissions-changed'); refreshData(); })
        .on('postgres_changes', schoolChange('student_occurrences'), () => { notify('carometro:occurrences-changed'); refreshData(); })
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'school_realtime_events', filter:`school_id=eq.${schoolId}` }, payload => {
          const entity = payload.new?.entity_type;
          if (entity === 'student_occurrences') notify('carometro:occurrences-changed');
          if (entity === 'observation_options') notify('carometro:observations-changed');
          if (entity === 'class_counselors') {
            window.refreshCounselorAssignments?.();
            notify('carometro:permissions-changed');
          }
          refreshData();
        });
    }
    liveChannel
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, () => notify('carometro:profiles-changed'))
      .on('postgres_changes', { event:'*', schema:'public', table:'platform_settings', filter:'id=eq.true' }, () => notify('carometro:platform-settings-changed'))
      .subscribe((status, error) => {
        if (channelGeneration !== generation) return;
        if (status === 'SUBSCRIBED') {
          clearRetry();
          reconnectAttempt = 0;
          if (hasConnectedBefore) { console.info('[Realtime] Reconectado.'); runRefresh(); }
          else { hasConnectedBefore = true; console.info('[Realtime] Conectado.'); }
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !stopped) {
          console.warn(`[Realtime] Canal encerrado inesperadamente (${status}).`, error || '');
          scheduleReconnect(channelGeneration);
        }
      });
  }

  function requestOpen(force = false) {
    if (stopped) return Promise.resolve();
    if (openingPromise) { reopenQueued = reopenQueued || force; return openingPromise; }
    openingPromise = (async () => {
      let nextForce = force;
      do {
        reopenQueued = false;
        await openOnce(nextForce);
        nextForce = true;
      } while (reopenQueued && !stopped);
    })().catch(error => {
      console.error('[Realtime] Falha ao abrir canal:', error);
      scheduleReconnect(generation);
    }).finally(() => { openingPromise = null; });
    return openingPromise;
  }

  async function stopRealtime() {
    stopped = true;
    clearRetry();
    reconnectAttempt = 0;
    hasConnectedBefore = false;
    activeScope = null;
    generation += 1;
    if (liveChannel) {
      const oldChannel = liveChannel;
      liveChannel = null;
      await db.removeChannel(oldChannel);
    }
  }

  window.startCarometroRealtime = async signedInUser => {
    if (!signedInUser) return;
    const schoolId = window.getActiveSchoolId?.() || null;
    const scope = `${signedInUser.id}:${schoolId || 'no-school'}`;
    stopped = false;
    await requestOpen(activeScope !== scope);
  };
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) stopRealtime();
  });
  window.addEventListener('online', () => {
    if (!stopped) { clearRetry(); reconnectAttempt = 0; requestOpen(true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenSince = Date.now(); return; }
    const hiddenFor = hiddenSince ? Date.now() - hiddenSince : 0;
    hiddenSince = null;
    if (stopped) return;
    if (hiddenFor >= 60000) { clearRetry(); reconnectAttempt = 0; requestOpen(true); }
    else refreshData();
  });
});
