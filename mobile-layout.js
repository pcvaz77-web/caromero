document.addEventListener('DOMContentLoaded', () => {
  const navigationStyle = document.createElement('style');
  navigationStyle.textContent = `
    @media (max-width:1100px) {
      .side {
        position:sticky !important;
        inset:0 0 auto 0 !important;
        z-index:7 !important;
        width:100% !important;
        height:auto !important;
        padding:14px !important;
        display:flex !important;
        flex-flow:row wrap !important;
        align-items:stretch !important;
        gap:10px !important;
        box-shadow:0 5px 20px #1018282b !important;
      }
      .side .logo {
        display:block !important;
        flex:1 1 100% !important;
        width:100% !important;
        padding:0 4px 4px !important;
      }
      .side .nav {
        display:grid !important;
        order:1 !important;
        flex:1 1 100% !important;
        width:100% !important;
        margin:0 !important;
        grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        gap:8px !important;
      }
      .side .nav button,
      .side .nav #studentsNav,
      .side .nav #permissionsNav,
      .side .nav #uniformNav,
      .side .nav #occurrenceNav,
      .side .nav #profileNav {
        min-width:0 !important;
        min-height:48px !important;
        margin:0 !important;
        padding:10px 12px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:flex-start !important;
        gap:6px !important;
        border-radius:10px !important;
        font-size:13px !important;
        line-height:1.2 !important;
        text-align:left !important;
        white-space:normal !important;
      }
      .side .nav #profileNav { flex-direction:row !important; }
      /* Nunca revele comandos que o sistema marcou como restritos. */
      .side .nav button.hidden,
      .settings-nav.hidden { display:none !important; }
      #profileNav .profile-nav-desktop { display:inline !important; }
      #profileNav .profile-nav-mobile { display:none !important; }
      .class-sidebar {
        position:relative !important;
        display:block !important;
        order:2 !important;
        flex:1 1 100% !important;
        width:100% !important;
        margin:2px 0 0 !important;
      }
      .class-head { display:flex !important; padding:6px 4px 7px !important; }
      .class-list {
        display:flex !important;
        gap:7px !important;
        overflow-x:auto !important;
        max-height:none !important;
        padding-bottom:2px !important;
        scrollbar-width:none !important;
      }
      .class-list::-webkit-scrollbar { display:none; }
      .shift-group { position:relative !important; flex:none !important; }
      .shift-tab {
        width:auto !important;
        min-height:39px !important;
        padding:9px 12px !important;
        border-radius:9px !important;
        background:#20304d !important;
        white-space:nowrap !important;
      }
      .shift-tab[aria-expanded="true"] { background:#38527e !important; }
      .shift-classes {
        position:absolute !important;
        top:calc(100% + 7px) !important;
        right:auto !important;
        bottom:auto !important;
        left:0 !important;
        width:min(310px,calc(100vw - 28px)) !important;
        z-index:12 !important;
        padding:8px !important;
        border-radius:12px !important;
        background:#17233a !important;
        box-shadow:0 14px 30px #10182866 !important;
        max-height:45vh !important;
        overflow:auto !important;
      }
      .settings-nav,
      .out {
        order:3 !important;
        flex:1 1 calc(50% - 5px) !important;
        min-height:42px !important;
        margin:0 !important;
        padding:10px 12px !important;
        border-radius:9px !important;
        background:#20304d !important;
        color:#dce6fb !important;
        font-size:12px !important;
        text-align:center !important;
      }
      .settings-nav:hover,
      .out:hover { background:#38527e !important; color:#fff !important; }
      .out::before { content:none !important; }
      .main { margin:0 !important; padding:22px 14px 30px !important; }
    }
    @media (max-width:800px) {
      .side .nav { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
      .side .nav #profileNav { grid-column:auto !important; }
      .class-list {
        display:grid !important;
        grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        overflow:visible !important;
      }
      .shift-group { width:100% !important; }
      .shift-tab { width:100% !important; justify-content:center !important; padding:9px 5px !important; }
    }
  `;
  document.head.appendChild(navigationStyle);

  // Proteção adicional para o menu responsivo. Usar o atributo `hidden`, e
  // não apenas uma classe de estilo, impede que regras de layout revelem
  // botões exclusivos do administrador para usuários comuns.
  const syncAdminOnlyNavigation = () => {
    if (!window.matchMedia('(max-width:1100px)').matches) return;
    const hideAdminCommands = permission?.role !== 'admin';
    ['permissionsNav', 'settingsNav'].forEach(id => {
      const button = document.getElementById(id);
      if (!button) return;
      if (button.hidden !== hideAdminCommands) button.hidden = hideAdminCommands;
      if (button.classList.contains('hidden') !== hideAdminCommands) button.classList.toggle('hidden', hideAdminCommands);
      if (hideAdminCommands) button.style.setProperty('display', 'none', 'important');
      else button.style.removeProperty('display');
      button.setAttribute('aria-hidden', String(hideAdminCommands));
    });
  };
  document.addEventListener('carometro:permission-refresh', syncAdminOnlyNavigation);
  new MutationObserver(syncAdminOnlyNavigation).observe(document.querySelector('.side'), { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  setTimeout(syncAdminOnlyNavigation, 0);

  // No celular o perfil selecionado fica acima da lista. Assim ele não cobre
  // fotos e nomes enquanto a pessoa navega pelos alunos.
  const detail = document.getElementById('studentDetails');
  const main = document.querySelector('.main');
  const stats = document.querySelector('.stats');
  if (detail && main && stats) main.insertBefore(detail, stats);

  const originalShowStudentDetails = window.showStudentDetails;
  window.showStudentDetails = id => {
    originalShowStudentDetails(id);
  };
});

document.addEventListener('DOMContentLoaded', () => {
  if (!window.matchMedia('(max-width:800px)').matches) return;

  const side = document.querySelector('.side');
  const nav = document.querySelector('.side .nav');
  const classSidebar = document.querySelector('.class-sidebar');
  if (!side || !nav || !classSidebar) return;

  const drawerStyle = document.createElement('style');
  drawerStyle.textContent = `
    @media (max-width:800px) {
      body.mobile-menu-open { overflow:hidden; }
      .side {
        position:relative !important;
        inset:auto !important;
        display:block !important;
        width:100% !important;
        padding:0 !important;
        background:#fff !important;
        box-shadow:none !important;
      }
      .side > .logo { display:none !important; }
      .mobile-topbar {
        min-height:68px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:12px 16px;
        background:#fff;
        border-bottom:1px solid #e6eaf0;
      }
      .mobile-menu-toggle {
        width:44px;
        height:44px;
        display:grid;
        place-items:center;
        flex:none;
        border-radius:50%;
        background:#17233a;
        color:#fff;
        font-size:24px;
        line-height:1;
      }
      .mobile-brand {
        display:flex;
        align-items:center;
        justify-content:flex-end;
        min-width:0;
        color:#17233a;
        font-size:17px;
        font-weight:850;
        letter-spacing:-.4px;
        white-space:nowrap;
      }
      .mobile-brand .mark { width:31px; height:31px; margin-right:7px; }
      .mobile-menu-backdrop {
        position:fixed;
        inset:0;
        z-index:29;
        opacity:0;
        pointer-events:none;
        background:#10182888;
        transition:opacity .22s ease;
      }
      body.mobile-menu-open .mobile-menu-backdrop { opacity:1; pointer-events:auto; }
      .side .nav {
        position:fixed !important;
        z-index:30 !important;
        top:0 !important;
        bottom:0 !important;
        left:0 !important;
        width:min(325px,86vw) !important;
        margin:0 !important;
        padding:20px 16px 24px !important;
        display:flex !important;
        flex-direction:column !important;
        align-items:stretch !important;
        gap:8px !important;
        overflow:auto !important;
        background:#17233a !important;
        box-shadow:14px 0 36px #1018284d !important;
        transform:translateX(-105%);
        transition:transform .24s ease;
      }
      body.mobile-menu-open .side .nav { transform:translateX(0); }
      .mobile-drawer-title {
        margin:1px 4px 12px;
        color:#fff;
        font-size:19px;
        font-weight:850;
        letter-spacing:-.4px;
      }
      .side .nav button,
      .side .nav #studentsNav,
      .side .nav #permissionsNav,
      .side .nav #uniformNav,
      .side .nav #occurrenceNav,
      .side .nav #profileNav,
      .side .nav .settings-nav,
      .side .nav .out {
        width:100% !important;
        min-height:48px !important;
        margin:0 !important;
        padding:12px 13px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:flex-start !important;
        border-radius:10px !important;
        background:#2b3c5d !important;
        color:#fff !important;
        font-size:14px !important;
        text-align:left !important;
      }
      .side .nav button.hidden,
      .side .nav .settings-nav.hidden { display:none !important; }
      .side .nav #profileNav { order:-1; }
      #profileNav .profile-nav-desktop { display:inline !important; }
      #profileNav .profile-nav-mobile { display:none !important; }
      .side .nav .out { margin-top:auto !important; background:transparent !important; color:#c9d3e8 !important; }
      .class-sidebar {
        position:relative !important;
        display:block !important;
        width:100% !important;
        margin:0 !important;
        padding:10px 14px 14px !important;
        background:#17233a !important;
      }
      .class-head { display:none !important; }
      .class-list {
        display:grid !important;
        grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        gap:8px !important;
        overflow:visible !important;
        max-height:none !important;
        padding:0 !important;
      }
      .shift-group { position:relative !important; width:100% !important; margin:0 !important; }
      .shift-tab {
        width:100% !important;
        min-height:42px !important;
        justify-content:center !important;
        padding:9px 5px !important;
        border-radius:9px !important;
        background:#2b3c5d !important;
        color:#fff !important;
        font-size:12px !important;
      }
      .shift-tab[aria-expanded="true"] { background:#38527e !important; }
      .shift-classes {
        position:absolute !important;
        top:calc(100% + 7px) !important;
        right:auto !important;
        bottom:auto !important;
        left:0 !important;
        width:min(310px,calc(100vw - 28px)) !important;
        z-index:20 !important;
        padding:8px !important;
        border-radius:12px !important;
        background:#17233a !important;
        box-shadow:0 14px 30px #10182866 !important;
        max-height:45vh !important;
        overflow:auto !important;
      }
      .main { margin:0 !important; padding:22px 14px 30px !important; background:#fff !important; }
    }
  `;
  document.head.appendChild(drawerStyle);

  const topbar = document.createElement('div');
  topbar.className = 'mobile-topbar';
  topbar.innerHTML = `<button type="button" class="mobile-menu-toggle" aria-label="Abrir menu" aria-expanded="false">☰</button><div class="mobile-brand">${side.querySelector('.logo')?.innerHTML || 'CARÔMETRO'}</div>`;
  side.insertBefore(topbar, side.firstChild);

  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-menu-backdrop';
  document.body.appendChild(backdrop);
  const menuButton = topbar.querySelector('.mobile-menu-toggle');
  const setMenuOpen = open => {
    document.body.classList.toggle('mobile-menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menuButton.textContent = open ? '×' : '☰';
  };
  menuButton.onclick = () => setMenuOpen(!document.body.classList.contains('mobile-menu-open'));
  backdrop.onclick = () => setMenuOpen(false);

  setTimeout(() => {
    const title = document.createElement('div');
    title.className = 'mobile-drawer-title';
    title.textContent = 'CARÔMETRO';
    nav.insertBefore(title, nav.firstChild);
    const profile = document.getElementById('profileNav');
    if (profile) nav.insertBefore(profile, title.nextSibling);
    ['settingsNav', 'signOut'].forEach(id => {
      const item = document.getElementById(id);
      if (item) nav.appendChild(item);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('button') && !event.target.closest('#profileNav')) setMenuOpen(false);
    });
  }, 0);
});
