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
      <h3>Notificações por turma</h3>
      <div class="notification-preferences-actions">
        <button type="button" id="selectAllClassNotifications" class="link">Selecionar todas</button>
        <button type="button" id="clearAllClassNotifications" class="link">Desmarcar todas</button>
      </div>
    </div>
    <div class="notification-preferences-description">Escolha de quais turmas você quer receber avisos de mudanças.</div>
    <div class="notification-autosave-note">As escolhas abaixo são salvas automaticamente.</div>
    <div id="classNotificationList" class="class-notification-list"></div>
  `;
  footer.before(section);

  const style = document.createElement('style');
  style.textContent = `
    .notification-preferences { padding:17px 20px 20px; flex:0 0 auto; min-height:100px; display:flex; flex-direction:column; background:#f8faff; border-bottom:1px solid var(--line); overflow:hidden; }
    .notification-preferences-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
    .notification-preferences-head h3 { margin:0; font-size:20px; line-height:1.25; letter-spacing:-.35px; color:var(--navy); }
    .notification-preferences-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .notification-preferences-actions .link { padding:7px 9px; border:1px solid #cbd5e1; border-radius:7px; background:#fff; font-size:12px; }
    .notification-preferences-description { margin-top:7px; color:var(--muted); font-size:13px; line-height:1.45; }
    .notification-autosave-note { margin-top:10px; padding:9px 11px; border-radius:8px; background:#eaf1ff; color:#315dbb; font-size:12px; font-weight:700; }
    .class-notification-list { display:grid; align-content:start; gap:9px; height:286px; min-height:286px; margin-top:14px; flex:0 0 286px; overflow-y:auto; overscroll-behavior:contain; padding-right:4px; scrollbar-width:thin; scrollbar-color:#c9d3e8 transparent; }
    .class-notification-list::-webkit-scrollbar { width:10px; }
    .class-notification-list::-webkit-scrollbar-track { background:transparent; }
    .class-notification-list::-webkit-scrollbar-thumb { background:#c9d3e8; border-radius:99px; }
    .class-notification-list::-webkit-scrollbar-thumb:hover { background:#a9b8d6; }
    .class-notification-item { display:flex; align-items:center; gap:10px; padding:12px 13px; border:1px solid #d7deea; border-radius:10px; background:#fff; font-size:14px; font-weight:700; }
    .class-notification-item input { width:auto; min-height:0; }
    /* Piso real na lista rolável, não só no bloco que a envolve — sem isso o
       cabeçalho/descrição da seção tomavam todo o espaço mínimo reservado e a
       lista em si era comprimida até sumir. Só desktop por enquanto; celular
       será testado separadamente. */
    @media (min-width:801px) {
      #notificationPreferences { min-height:386px; }
    }
    /* Mesmo problema do desktop (lista comprimida a 0px pelo cabeçalho/
       descrição da seção), agora coberto também em telas menores, com pisos
       proporcionalmente menores. Não mexe no bloco acima, aprovado para desktop. */
    @media (max-width:800px) {
      #notificationPreferences { min-height:378px; }
      .notification-preferences { padding:15px 18px 18px; }
    }
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
    if (!myClasses.length) { myPreferences = new Set(); renderPreferences(); return; }
    const { data, error } = await db.from('user_favorite_classes')
      .select('class_id,notifications_enabled')
      .eq('user_id', signedInUser.id)
      .in('class_id', myClasses.map(cls => cls.id));
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
