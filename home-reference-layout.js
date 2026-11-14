document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('#app .main');
  const top = main?.querySelector(':scope > .top');
  const stats = main?.querySelector(':scope > .stats');
  if (!main || !top || !stats) return;

  const hero = document.createElement('section');
  hero.className = 'home-reference-hero';
  main.insertBefore(hero, top);
  hero.append(top, stats);

  const toolbar = document.createElement('div');
  toolbar.className = 'home-reference-toolbar';
  toolbar.innerHTML = `<button type="button" class="home-reference-school" aria-label="Escola ativa"><span class="home-reference-school-icon" aria-hidden="true">♧</span><span class="home-reference-school-name">Escola ativa</span><span aria-hidden="true">⌄</span></button>
    <div class="home-reference-toolbar-right"></div>`;
  top.prepend(toolbar);
  const schoolName = toolbar.querySelector('.home-reference-school-name');
  const schoolButton = toolbar.querySelector('.home-reference-school');
  const toolbarRight = toolbar.querySelector('.home-reference-toolbar-right');
  const search = document.getElementById('search');
  const listHead = main.querySelector('.panel .head');
  const listTools = document.createElement('div');
  listTools.className = 'home-reference-list-tools';
  const searchField = document.createElement('label');
  searchField.className = 'home-reference-search';
  searchField.innerHTML = '<span aria-hidden="true">⌕</span>';
  listTools.append(searchField);
  listHead?.append(listTools);
  if (search) {
    search.placeholder = 'Buscar aluno, turma ou ocorrência...';
    searchField.append(search);
  }
  schoolButton.onclick = () => document.getElementById('schoolSwitchNav')?.click();
  const updateSchool = () => {
    const label = document.getElementById('activeSchoolGreeting')?.textContent.trim() || '';
    schoolName.textContent = label.replace(/^Escola ativa:\s*/i, '') || 'Selecione uma escola';
    schoolButton.title = schoolName.textContent;
  };
  updateSchool();
  const schoolLabel = document.getElementById('activeSchoolGreeting');
  if (schoolLabel) new MutationObserver(updateSchool).observe(schoolLabel, { childList:true, characterData:true, subtree:true });
  document.addEventListener('carometro:school-context-ready', updateSchool);

  const greetingRow = top.querySelector('.welcome-notification-row');
  const userContext = greetingRow?.querySelector('.welcome-user-context');
  if (userContext) new MutationObserver(updateSchool).observe(userContext, { childList:true, characterData:true, subtree:true });
  const heading = top.querySelector(':scope > div:not(.home-reference-toolbar):not(.welcome-notification-row):not(.top-actions)');
  const role = document.getElementById('roleLabel');
  if (userContext && role) userContext.append(role);
  const caption = document.createElement('p');
  caption.className = 'home-reference-caption';
  caption.textContent = 'Acompanhe as informações da escola e gerencie os registros do Carômetro.';
  userContext?.append(caption);
  heading?.classList.add('home-reference-old-heading');

  const avatar = document.createElement('button');
  avatar.className = 'home-reference-avatar';
  avatar.type = 'button';
  avatar.setAttribute('aria-label', 'Meu perfil');
  avatar.textContent = 'PF';
  avatar.onclick = () => document.getElementById('profileNav')?.click();
  toolbarRight.append(avatar);
  const greeting = document.getElementById('welcomeGreeting');
  const syncAvatar = () => {
    const name = greeting?.querySelector('.welcome-person')?.textContent.replace(/[!\s]+$/g, '').trim() || '';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    if (initials) avatar.textContent = initials;
  };
  syncAvatar();
  if (greeting) new MutationObserver(syncAvatar).observe(greeting, { childList:true, characterData:true, subtree:true });

  const moveToolbarActions = () => {
    const bell = document.getElementById('notificationBell');
    if (bell && bell.parentElement !== listTools) listTools.append(bell);
    if (bell && !bell.dataset.homePositioned) {
      bell.dataset.homePositioned = 'true';
      const positionPanel = () => {
        const panel = document.getElementById('notificationPanel');
        if (!panel) return;
        if (window.innerWidth <= 800) {
          panel.style.top = '';
          panel.style.right = '';
          panel.style.maxHeight = '';
          return;
        }
        const bounds = bell.getBoundingClientRect();
        panel.style.top = `${Math.round(bounds.bottom + 8)}px`;
        panel.style.right = `${Math.max(16, Math.round(window.innerWidth - bounds.right))}px`;
        panel.style.maxHeight = `${Math.max(180, Math.round(window.innerHeight - bounds.bottom - 24))}px`;
      };
      bell.addEventListener('click', () => requestAnimationFrame(positionPanel));
      window.addEventListener('resize', positionPanel);
      window.addEventListener('scroll', positionPanel, true);
    }
    const assistant = document.getElementById('openSiapAssistant');
    if (assistant && assistant.parentElement !== toolbarRight) toolbarRight.insertBefore(assistant, avatar);
  };
  moveToolbarActions();
  if (greetingRow) new MutationObserver(moveToolbarActions).observe(greetingRow, { childList:true });

  for (const [id, icon] of [['enableCarometroPush', '♧'], ['installCarometro', '⇩'], ['newBulk', '▤'], ['newStudent', '+']]) {
    const button = document.getElementById(id);
    if (button) button.dataset.homeIcon = icon;
  }
});
