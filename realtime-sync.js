document.addEventListener('DOMContentLoaded', () => {
  let refreshTimer;
  let refreshing = false;
  let refreshQueued = false;
  let activeUserId = null;
  let startingUserId = null;
  let liveChannel = null;
  let activeSchoolId = null;

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
    const schoolId = window.getActiveSchoolId?.() || null;
    if (!signedInUser || !db.channel || (activeUserId === signedInUser.id && activeSchoolId === schoolId) || startingUserId === signedInUser.id) return;
    startingUserId = signedInUser.id;
    try {
      if (liveChannel) await db.removeChannel(liveChannel);
      activeUserId = signedInUser.id;
      activeSchoolId = schoolId;
      liveChannel = db.channel(`carometro-live-${signedInUser.id}-${schoolId || 'no-school'}`);
      // Sem escola ativa, não existe assinatura ampla de tabelas escolares.
      // Isso evita depender apenas da RLS para filtrar eventos de todas as
      // escolas durante uma conta recém-confirmada, suspensa ou owner-only.
      if (schoolId) {
        const schoolChange = table => ({ event:'*', schema:'public', table, filter:`school_id=eq.${schoolId}` });
        liveChannel
        .on('postgres_changes', schoolChange('students'), refreshData)
        .on('postgres_changes', schoolChange('classes'), refreshData)
        .on('postgres_changes', schoolChange('observation_options'), () => {
          notify('carometro:observations-changed');
          refreshData();
        })
        .on('postgres_changes', schoolChange('class_counselors'), () => {
          window.refreshCounselorAssignments?.();
          notify('carometro:permissions-changed');
          refreshData();
        })
        .on('postgres_changes', schoolChange('student_occurrences'), () => {
          notify('carometro:occurrences-changed');
        });
      }
      liveChannel
      // Perfil Ã© dado pessoal: sincroniza apenas entre as sessÃµes do prÃ³prio usuÃ¡rio.
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, () => {
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
  db.auth.onAuthStateChange((_event, session) => {
    // A abertura positiva ocorre somente por showApp(), depois de resolver a
    // escola ativa. Eventos SIGNED_IN disparados antes disso não podem criar
    // um canal provisório sem escola e vencer a inicialização correta.
    if (!session?.user) {
      activeUserId = null;
      activeSchoolId = null;
      startingUserId = null;
      if (liveChannel) db.removeChannel(liveChannel);
      liveChannel = null;
    }
  });

  // Recupera alterações feitas durante uma queda breve de conexão ou enquanto
  // o navegador esteve em segundo plano, sem criar uma recarga periódica.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshData();
  });
  window.addEventListener('online', refreshData);
});
