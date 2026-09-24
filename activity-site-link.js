function initializeActivitySiteLink() {
  const ACTIVITY_SITE_URL = 'https://atividades.sistemacarometro.com.br/';
  const app = document.getElementById('app');
  const actions = app?.querySelector('.top-actions');
  if (!actions) return;

  const link = document.createElement('a');
  link.id = 'teacherActivitySiteLink';
  link.className = 'btn secondary hidden';
  link.href = ACTIVITY_SITE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Atividades';
  link.setAttribute('aria-label', 'Abrir site de atividades para professores');
  actions.prepend(link);

  let requestId = 0;
  async function refresh() {
    const currentRequest = ++requestId;
    link.classList.add('hidden');
    if (app.classList.contains('hidden') || window.getActiveSchoolRole?.() !== 'teacher') return;
    try {
      const { data:{ user }, error:authError } = await db.auth.getUser();
      if (authError || !user) return;
      const { data, error } = await db.from('platform_settings')
        .select('show_activity_site').eq('id', true).maybeSingle();
      if (currentRequest !== requestId || app.classList.contains('hidden') || window.getActiveSchoolRole?.() !== 'teacher') return;
      link.classList.toggle('hidden', !!error || data?.show_activity_site !== true);
    } catch { if (currentRequest === requestId) link.classList.add('hidden'); }
  }

  document.addEventListener('carometro:school-context-ready', refresh);
  document.addEventListener('carometro:permission-refresh', refresh);
  document.addEventListener('carometro:activity-site-setting-changed', refresh);
  document.addEventListener('carometro:data-loaded', refresh);
  window.addEventListener('focus', refresh);
  new MutationObserver(refresh).observe(app, { attributes:true, attributeFilter:['class'] });
  db.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) { ++requestId; link.classList.add('hidden'); }
  });
  refresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeActivitySiteLink, { once:true });
} else {
  initializeActivitySiteLink();
}
