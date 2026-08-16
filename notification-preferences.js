document.addEventListener('DOMContentLoaded', () => {
  const drawer = document.getElementById('profileDrawer');
  if (!drawer) return;
  const footer = drawer.querySelector('.profile-drawer-footer');
  if (!footer) return;

  const section = document.createElement('section');
  section.id = 'notificationPreferences';
  section.className = 'notification-preferences';
  section.innerHTML = `
    <div class="notification-preferences-head">
      <p class="eyebrow">Notificações por turma</p>
      <div class="notification-preferences-actions">
        <button type="button" id="selectAllClassNotifications" class="link">Selecionar todas</button>
        <button type="button" id="clearAllClassNotifications" class="link">Desmarcar todas</button>
      </div>
    </div>
    <div class="meta">Escolha de quais turmas você quer receber avisos de mudanças.</div>
    <div id="classNotificationList" class="class-notification-list"></div>
  `;
  footer.before(section);

  const style = document.createElement('style');
  style.textContent = `
    .notification-preferences { padding:0 24px 22px; }
    .notification-preferences-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .notification-preferences-head .eyebrow { margin:0; }
    .notification-preferences-actions { display:flex; gap:12px; }
    .notification-preferences-actions .link { font-size:12px; }
    .class-notification-list { display:grid; gap:7px; margin-top:12px; max-height:260px; overflow-y:auto; overscroll-behavior:contain; padding-right:4px; }
    .class-notification-item { display:flex; align-items:center; gap:9px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; font-size:13px; font-weight:650; }
    .class-notification-item input { width:auto; min-height:0; }
  `;
  document.head.appendChild(style);

  let myClasses = [];
  let myPreferences = new Set();

  // Notificações por turma são só um aviso: qualquer usuário autenticado
  // (Professor, Coordenador ou Administrador) pode escolher acompanhar
  // qualquer turma cadastrada, independente de ser conselheiro dela. Isso
  // não concede nem amplia acesso a dados protegidos — a navegação/validação
  // de acesso ao conteúdo em si continua acontecendo normalmente em cada
  // tela, sem depender desta escolha.
  const myAccessibleClasses = () => classes;

  function renderPreferences() {
    const list = document.getElementById('classNotificationList');
    if (!list) return;
    list.innerHTML = myClasses.length
      ? myClasses.map(cls => `<label class="class-notification-item"><input type="checkbox" data-class-id="${cls.id}" ${myPreferences.has(cls.id) ? 'checked' : ''}> <span>${esc(cls.name)}</span></label>`).join('')
      : '<div class="meta">Nenhuma turma disponível.</div>';
  }

  async function loadPreferences() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    myClasses = myAccessibleClasses();
    const { data, error } = await db.from('user_favorite_classes')
      .select('class_id,notifications_enabled')
      .eq('user_id', signedInUser.id);
    if (error) { toast(error.message); return; }
    myPreferences = new Set((data || []).filter(row => row.notifications_enabled).map(row => row.class_id));
    renderPreferences();
  }

  async function setPreference(classId, enabled) {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    if (enabled) {
      const { error } = await db.from('user_favorite_classes')
        .upsert({ user_id: signedInUser.id, class_id: classId, notifications_enabled: true }, { onConflict: 'user_id,class_id' });
      if (error) { toast(error.message); await loadPreferences(); return; }
      myPreferences.add(classId);
    } else {
      const { error } = await db.from('user_favorite_classes')
        .delete()
        .eq('user_id', signedInUser.id)
        .eq('class_id', classId);
      if (error) { toast(error.message); await loadPreferences(); return; }
      myPreferences.delete(classId);
    }
  }

  document.getElementById('classNotificationList').onchange = event => {
    const checkbox = event.target.closest('[data-class-id]');
    if (!checkbox) return;
    setPreference(checkbox.dataset.classId, checkbox.checked);
  };

  document.getElementById('selectAllClassNotifications').onclick = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || !myClasses.length) return;
    const rows = myClasses.map(cls => ({ user_id: signedInUser.id, class_id: cls.id, notifications_enabled: true }));
    const { error } = await db.from('user_favorite_classes').upsert(rows, { onConflict: 'user_id,class_id' });
    if (error) { toast(error.message); return; }
    myPreferences = new Set(myClasses.map(cls => cls.id));
    renderPreferences();
    toast('Todas as turmas selecionadas.');
  };

  document.getElementById('clearAllClassNotifications').onclick = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || !myClasses.length) return;
    const { error } = await db.from('user_favorite_classes')
      .delete()
      .eq('user_id', signedInUser.id)
      .in('class_id', myClasses.map(cls => cls.id));
    if (error) { toast(error.message); return; }
    myPreferences.clear();
    renderPreferences();
    toast('Todas as turmas desmarcadas.');
  };

  new MutationObserver(() => {
    if (drawer.classList.contains('open')) loadPreferences();
  }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
});
