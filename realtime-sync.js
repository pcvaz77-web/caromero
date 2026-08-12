document.addEventListener('DOMContentLoaded', () => {
  let refreshTimer;
  const refreshData = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!document.getElementById('app').classList.contains('hidden')) load();
    }, 120);
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
      .subscribe();
  });
});
