document.addEventListener('DOMContentLoaded', () => {
  let refreshTimer;
  let refreshing = false;
  let refreshQueued = false;
  let activeUserId = null;
  let startingUserId = null;
  let liveChannel = null;

  const appIsOpen = () => !document.getElementById('app').classList.contains('hidden');
  const runRefresh = async () => {
    if (refreshing) { refreshQueued = true; return; }
    if (!appIsOpen()) return;
    refreshing = true;
    try { await window.load?.(); }
    finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        runRefresh();
      }
    }
  };
  const refreshData = () => {
    clearTimeout(refreshTimer);
    // Agrupa uma alteração em lote, mantendo o reflexo nos demais aparelhos
    // praticamente imediato e sem substituir dados recentes.
    refreshTimer = setTimeout(runRefresh, 120);
  };
  const notify = name => document.dispatchEvent(new Event(name));

  const startRealtime = async signedInUser => {
    if (!signedInUser || !db.channel || activeUserId === signedInUser.id || startingUserId === signedInUser.id) return;
    startingUserId = signedInUser.id;
    try {
      if (liveChannel) await db.removeChannel(liveChannel);
      activeUserId = signedInUser.id;
      liveChannel = db.channel(`carometro-live-${signedInUser.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'students' }, refreshData)
      .on('postgres_changes', { event:'*', schema:'public', table:'classes' }, refreshData)
      .on('postgres_changes', { event:'*', schema:'public', table:'observation_options' }, () => {
        notify('carometro:observations-changed');
        refreshData();
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'class_counselors' }, () => {
        window.refreshCounselorAssignments?.();
        notify('carometro:permissions-changed');
        refreshData();
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'user_permissions' }, payload => {
        if (payload.new?.user_id === signedInUser.id) window.applyCarometroPermission?.(payload.new);
        notify('carometro:permissions-changed');
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'student_occurrences' }, () => {
        notify('carometro:occurrences-changed');
      })
      // Perfil Ã© dado pessoal: sincroniza apenas entre as sessÃµes do prÃ³prio usuÃ¡rio.
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles', filter:`id=eq.${signedInUser.id}` }, () => {
        notify('carometro:profiles-changed');
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'platform_settings', filter:'id=eq.true' }, () => {
        notify('carometro:platform-settings-changed');
      })
        .subscribe();
    } finally {
      startingUserId = null;
    }
  };

  window.startCarometroRealtime = startRealtime;
  db.auth.getUser().then(({ data: { user: signedInUser } }) => startRealtime(signedInUser));
  db.auth.onAuthStateChange((_event, session) => {
    if (session?.user) startRealtime(session.user);
    else {
      activeUserId = null;
      startingUserId = null;
      if (liveChannel) db.removeChannel(liveChannel);
      liveChannel = null;
    }
  });
});
