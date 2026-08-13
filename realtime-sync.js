document.addEventListener('DOMContentLoaded', () => {
  let refreshTimer;
  let refreshing = false;
  let refreshQueued = false;
  const runRefresh = async () => {
    if (refreshing) { refreshQueued = true; return; }
    if (document.getElementById('app').classList.contains('hidden')) return;
    refreshing = true;
    try { await load(); }
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
    // Um cadastro em lote gera diversos eventos. Agrupe-os em uma única
    // atualização para não alternar a lista entre respostas parciais.
    refreshTimer = setTimeout(runRefresh, 350);
  };

  db.auth.getUser().then(({ data: { user: signedInUser } }) => {
    if (!signedInUser || !db.channel) return;
    db.channel(`carometro-live-${signedInUser.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'students' }, refreshData)
      .on('postgres_changes', { event:'*', schema:'public', table:'classes' }, refreshData)
      .on('postgres_changes', { event:'*', schema:'public', table:'observation_options' }, () => {
        document.dispatchEvent(new Event('carometro:observations-changed'));
        refreshData();
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'class_counselors' }, () => {
        window.refreshCounselorAssignments?.();
        refreshData();
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'student_occurrences' }, () => {
        document.dispatchEvent(new Event('carometro:occurrences-changed'));
        refreshData();
      })
      .subscribe();
  });
});
