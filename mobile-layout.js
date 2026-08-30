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
      .side .nav #reportsNav,
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
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:8px !important;
        min-height:39px !important;
        padding:9px 10px !important;
        border-radius:9px !important;
        background:#20304d !important;
        overflow:hidden !important;
        white-space:nowrap !important;
      }
      .shift-tab[aria-expanded="true"] { background:#38527e !important; }
      .class-list > .all-students-tab {
        width:auto !important;
        min-height:39px !important;
        padding:9px 12px !important;
        border-radius:9px !important;
        background:#20304d !important;
        white-space:nowrap !important;
      }
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
      .shift-tab { width:100% !important; padding:9px 5px !important; }
      .class-list > .all-students-tab { width:100% !important; text-align:center !important; }
    }
  `;
  document.head.appendChild(navigationStyle);

  // Fonte de autorização de Uniforme usada pelo menu móvel: a mesma função
  // de decisão de uniform-management.js, exposta globalmente como
  // window.canAccessUniformNav, para não manter uma cópia própria e
  // potencialmente desatualizada do estado de permissão.

  // Proteção adicional para o menu responsivo. Usar o atributo `hidden`, e
  // não apenas uma classe de estilo, impede que regras de layout revelem
  // botões exclusivos do administrador para usuários comuns.
  const syncAdminOnlyNavigation = () => {
    if (!window.matchMedia('(max-width:1100px)').matches) return;
    const hideAdminCommands = permission?.role !== 'admin';
    const canViewUniform = typeof window.canAccessUniformNav === 'function' ? window.canAccessUniformNav() : false;
    const canViewReports = permission?.role === 'admin' || !!permission?.is_coordinator;
    const syncButton = (id, hidden) => {
      const button = document.getElementById(id);
      if (!button) return;
      if (button.hidden !== hidden) button.hidden = hidden;
      if (button.classList.contains('hidden') !== hidden) button.classList.toggle('hidden', hidden);
      if (hidden) button.style.setProperty('display', 'none', 'important');
      else button.style.removeProperty('display');
      button.setAttribute('aria-hidden', String(hidden));
    };
      // settingsNav é global e controla a própria visibilidade com
      // is_platform_owner(); o layout móvel não pode reexibi-lo com base no
      // papel legado admin. permissionsNav continua sendo gestão escolar.
      ['permissionsNav'].forEach(id => syncButton(id, hideAdminCommands));
      // A autorização de conselheiros é derivada do papel ativo na escola.
      syncButton('counselorNav', !(typeof window.counselorCanManage === 'function' ? window.counselorCanManage() : false));
    // Uniforme é recurso avançado: nunca pode aparecer por causa do CSS do
    // menu em um perfil de professor(a), mesmo que a tela móvel seja aberta.
    syncButton('uniformNav', !canViewUniform);
    // Mesma defesa em profundidade de Uniforme: Relatórios é recurso de
    // administrador/coordenador e nunca pode aparecer por causa do CSS do
    // menu móvel para um perfil de professor(a).
    syncButton('reportsNav', !canViewReports);
  };
  document.addEventListener('carometro:permission-refresh', () => {
    syncAdminOnlyNavigation();
  });
  new MutationObserver(syncAdminOnlyNavigation).observe(document.querySelector('.side'), { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  new MutationObserver(syncAdminOnlyNavigation).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });
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
        z-index:auto !important;
        display:block !important;
        width:100% !important;
        padding:0 !important;
        background:#fff !important;
        box-shadow:none !important;
      }
      .side > .logo { display:none !important; }
      .mobile-topbar {
        position:relative;
        z-index:220;
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
        padding:0;
        background:transparent;
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
        z-index:221;
        opacity:0;
        pointer-events:none;
        background:#10182888;
        transition:opacity .22s ease;
      }
      body.mobile-menu-open .mobile-menu-backdrop { opacity:1; pointer-events:auto; }
      .side .nav {
        position:fixed !important;
        z-index:222 !important;
        top:0 !important;
        bottom:0 !important;
        left:0 !important;
        width:min(325px,86vw) !important;
        margin:0 !important;
        padding:84px 16px 24px !important;
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
      .side .nav #reportsNav,
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
      .side .nav #profileNav { order:initial !important; }
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
        grid-template-columns:repeat(4,minmax(0,1fr)) !important;
        gap:8px !important;
        overflow:visible !important;
        max-height:none !important;
        padding:0 !important;
      }
      .shift-group { position:static !important; width:auto !important; margin:0 !important; }
      .shift-tab {
        width:100% !important;
        height:100% !important;
        min-height:48px !important;
        padding:7px 2px !important;
        border-radius:9px !important;
        background:#2b3c5d !important;
        color:#fff !important;
        font-size:11px !important;
        line-height:1.12 !important;
        white-space:normal !important;
        overflow:hidden !important;
        flex-direction:column !important;
        justify-content:center !important;
      }
      .class-list > .shift-group .shift-tab .arrow { display:none !important; }
      .class-list > .all-students-tab {
        width:100% !important;
        min-height:48px !important;
        padding:7px 4px !important;
        border-radius:9px !important;
        background:#2b3c5d !important;
        color:#fff !important;
        font-size:11px !important;
        line-height:1.12 !important;
        text-align:center !important;
        white-space:normal !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }
      .class-list > .shift-group { min-height:48px !important; }
      .class-list > .shift-group .shift-tab { height:100% !important; }
      .shift-tab[aria-expanded="true"] { background:#38527e !important; }
      .shift-classes {
        position:absolute !important;
        top:calc(100% + 7px) !important;
        right:0 !important;
        bottom:auto !important;
        left:0 !important;
        width:auto !important;
        z-index:20 !important;
        padding:8px !important;
        border-radius:12px !important;
        background:#17233a !important;
        box-shadow:0 14px 30px #10182866 !important;
        max-height:45vh !important;
        overflow-x:hidden !important;
        overflow-y:auto !important;
      }
      .main { margin:0 !important; padding:22px 14px 30px !important; background:#fff !important; }
    }
  `;
  document.head.appendChild(drawerStyle);

  const topbar = document.createElement('div');
  topbar.className = 'mobile-topbar';
  topbar.innerHTML = `<button type="button" class="mobile-menu-toggle" aria-label="Abrir menu" aria-expanded="false">☰</button><button type="button" class="mobile-brand" aria-label="Voltar para a tela inicial">${side.querySelector('.logo')?.innerHTML || 'CARÔMETRO'}</button>`;
  side.insertBefore(topbar, side.firstChild);

  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-menu-backdrop';
  document.body.appendChild(backdrop);
  const menuButton = topbar.querySelector('.mobile-menu-toggle');
  const homeButton = topbar.querySelector('.mobile-brand');
  const savedScreenKey = 'carometro:mobile-screen';
  let restoreAttempted = false;
  let classRestoreAttempted = false;

  const currentModal = () => {
    if (!document.getElementById('counselorModal')?.classList.contains('hidden')) return 'counselorNav';
    if (!document.getElementById('uniformModal')?.classList.contains('hidden')) return 'uniformNav';
    if (!document.getElementById('occurrenceModal')?.classList.contains('hidden')) return 'occurrenceNav';
    if (!document.getElementById('reportsModal')?.classList.contains('hidden')) return 'reportsNav';
    if (!document.getElementById('permissionsModal')?.classList.contains('hidden')) return 'permissionsNav';
    if (!document.getElementById('settingsModal')?.classList.contains('hidden')) return 'settingsNav';
    if (document.getElementById('profileDrawer')?.classList.contains('open')) return 'profileNav';
    return '';
  };
  const saveCurrentScreen = () => {
    const app = document.getElementById('app');
    if (!app || app.classList.contains('hidden')) return;
    try {
      sessionStorage.setItem(savedScreenKey, JSON.stringify({
        classId: selectedClassId || null,
        studentId: detailStudentId || null,
        search: document.getElementById('search')?.value || '',
        modalButtonId: currentModal(),
        scrollY: window.scrollY
      }));
    } catch {}
  };
  const clearSavedScreen = () => { try { sessionStorage.removeItem(savedScreenKey); } catch {} };
  const goHome = () => {
    clearSavedScreen();
    closeMobileMenuDialogs();
    selectedClassId = null;
    detailStudentId = null;
    const search = document.getElementById('search');
    if (search) search.value = '';
    window.render?.();
    window.scrollTo(0, 0);
  };
  // Restauração puramente visual (busca, modal reaberto, posição de rolagem)
  // — nenhuma dessas depende de classes/students já carregados, então
  // continua no gatilho atual (MutationObserver em #app + fallback de
  // tempo). classId/studentId NÃO são tratados aqui.
  const restoreCurrentScreen = () => {
    if (restoreAttempted || document.getElementById('app')?.classList.contains('hidden')) return;
    restoreAttempted = true;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(savedScreenKey) || 'null'); } catch {}
    if (!saved) return;
    const search = document.getElementById('search');
    if (search) search.value = saved.search || '';
    window.render?.();
    window.setTimeout(() => {
      const opener = saved.modalButtonId && document.getElementById(saved.modalButtonId);
      if (opener && !opener.hidden && !opener.classList.contains('hidden')) opener.click();
      window.scrollTo(0, Number(saved.scrollY) || 0);
    }, 140);
  };
  // Restauração dependente de dados (classId/studentId): só pode ser
  // avaliada depois que carometro:data-loaded confirma que `classes`/
  // `students` já refletem a escola ativa — #app ficar visível (gatilho da
  // função acima) acontece ANTES de window.load() no fluxo real
  // (app-core.js: remove 'hidden' e só depois chama load()), então nunca é
  // garantia de dado carregado. Não restaura duas vezes (classRestoreAttempted)
  // e não consome a tentativa enquanto não houver escola ativa resolvida —
  // conta multi-escola sem escolha feita dispara carometro:data-loaded com
  // classes/students vazios, e isso não pode "gastar" a única tentativa.
  const restoreClassAndStudent = () => {
    if (classRestoreAttempted || !window.getActiveSchoolId?.()) return;
    classRestoreAttempted = true;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(savedScreenKey) || 'null'); } catch {}
    if (!saved) return;
    // A turma/aluno salvos podem pertencer a outra escola (conta
    // multi-escola) ou já não existir mais — sessionStorage não é isolado
    // por escola. Atribuição sempre explícita: se a validação falhar, volta
    // para null mesmo que selectedClassId/detailStudentId já tivessem um
    // valor anterior — nunca deixa um estado antigo sobreviver por a
    // validação ter falhado.
    selectedClassId = (saved.classId && classes.some(item => item.id === saved.classId)) ? saved.classId : null;
    detailStudentId = (saved.studentId && students.some(item => item.id === saved.studentId)) ? saved.studentId : null;
    window.render?.();
  };
  document.addEventListener('carometro:data-loaded', restoreClassAndStudent);
  const closeMobileMenuDialogs = () => {
    // Fecha qualquer janela do sistema antes da troca de navegação. Os
    // botões chamados em seguida continuam livres para abrir sua nova tela.
    document.querySelectorAll('.modal-bg:not(.hidden), .photo-picker:not(.hidden)').forEach(dialog => dialog.classList.add('hidden'));
    document.querySelectorAll('.profile-drawer.open').forEach(drawer => drawer.classList.remove('open'));
    document.getElementById('profileBackdrop')?.classList.add('hidden');
  };
  const setMenuOpen = open => {
    // O ícone do menu também é sempre uma saída segura de janelas abertas.
    // Assim Configurações nunca impede a navegação para outra função.
    if (open) closeMobileMenuDialogs();
    document.body.classList.toggle('mobile-menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menuButton.textContent = open ? '×' : '☰';
  };
  menuButton.onclick = () => setMenuOpen(!document.body.classList.contains('mobile-menu-open'));
  backdrop.onclick = () => setMenuOpen(false);
  homeButton.onclick = goHome;
  window.addEventListener('pagehide', saveCurrentScreen);
  window.addEventListener('beforeunload', saveCurrentScreen);
  document.addEventListener('click', () => window.setTimeout(saveCurrentScreen, 0));
  document.getElementById('app')?.addEventListener('input', () => window.setTimeout(saveCurrentScreen, 0));
  new MutationObserver(restoreCurrentScreen).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });
  window.setTimeout(restoreCurrentScreen, 240);

  setTimeout(() => {
    const title = document.createElement('div');
    title.className = 'mobile-drawer-title';
    title.textContent = 'CARÔMETRO';
    nav.insertBefore(title, nav.firstChild);
    const profile = document.getElementById('profileNav');
    if (profile) nav.appendChild(profile);
    ['settingsNav', 'signOut'].forEach(id => {
      const item = document.getElementById(id);
      if (item) nav.appendChild(item);
    });
    // Cada botão mantém seu próprio evento de abertura. O fechamento é
    // ligado separadamente e só ocorre depois que esse evento já foi
    // processado, evitando disputar o clique com Uniforme, Ocorrência ou
    // Meu Perfil.
    nav.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => window.setTimeout(() => setMenuOpen(false), 80));
    });
    nav.addEventListener('click', event => {
      if (!event.target.closest('button')) return;
      // Ao trocar de opção, feche a janela anterior para que a nova função
      // assuma a tela imediatamente.
      closeMobileMenuDialogs();
    }, true);
  }, 0);

  let touchStartX = 0;
  document.addEventListener('touchstart', event => { touchStartX = event.touches[0]?.clientX || 0; }, { passive:true });
  document.addEventListener('touchend', event => {
    const endX = event.changedTouches[0]?.clientX || touchStartX;
    const distance = endX - touchStartX;
    const open = document.body.classList.contains('mobile-menu-open');
    if (open && distance < -60) setMenuOpen(false);
    if (!open && touchStartX < 32 && distance > 60) setMenuOpen(true);
  }, { passive:true });
});

// Tablets mantêm o layout próprio, mas preservam a mesma continuidade de
// navegação do celular ao atualizar a página.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.matchMedia('(min-width:801px) and (max-width:1100px)').matches) return;

  const side = document.querySelector('.side');
  const logo = side?.querySelector('.logo');
  const app = document.getElementById('app');
  if (!side || !logo || !app) return;

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width:801px) and (max-width:1100px) {
      .side .tablet-home-brand { display:block!important; flex:1 1 100%!important; width:100%!important; padding:0 4px 4px!important; background:transparent; color:inherit; text-align:left; font-size:20px; font-weight:850; }
      .side .tablet-home-brand:focus-visible { outline:2px solid #82aeff; outline-offset:4px; border-radius:8px; }
    }
  `;
  document.head.appendChild(style);

  const homeButton = document.createElement('button');
  homeButton.type = 'button';
  homeButton.className = 'logo tablet-home-brand';
  homeButton.innerHTML = logo.innerHTML;
  homeButton.setAttribute('aria-label', 'Voltar para a tela inicial');
  logo.replaceWith(homeButton);

  const savedScreenKey = 'carometro:mobile-screen';
  let restoreAttempted = false;
  let classRestoreAttempted = false;
  const currentModal = () => {
    if (!document.getElementById('counselorModal')?.classList.contains('hidden')) return 'counselorNav';
    if (!document.getElementById('uniformModal')?.classList.contains('hidden')) return 'uniformNav';
    if (!document.getElementById('occurrenceModal')?.classList.contains('hidden')) return 'occurrenceNav';
    if (!document.getElementById('reportsModal')?.classList.contains('hidden')) return 'reportsNav';
    if (!document.getElementById('permissionsModal')?.classList.contains('hidden')) return 'permissionsNav';
    if (!document.getElementById('settingsModal')?.classList.contains('hidden')) return 'settingsNav';
    if (document.getElementById('profileDrawer')?.classList.contains('open')) return 'profileNav';
    return '';
  };
  const saveScreen = () => {
    if (app.classList.contains('hidden')) return;
    try {
      sessionStorage.setItem(savedScreenKey, JSON.stringify({
        classId: selectedClassId || null,
        studentId: detailStudentId || null,
        search: document.getElementById('search')?.value || '',
        modalButtonId: currentModal(),
        scrollY: window.scrollY
      }));
    } catch {}
  };
  const closeOpenPanels = () => {
    document.querySelectorAll('.modal-bg:not(.hidden), .photo-picker:not(.hidden)').forEach(panel => panel.classList.add('hidden'));
    document.querySelectorAll('.profile-drawer.open').forEach(panel => panel.classList.remove('open'));
    document.getElementById('profileBackdrop')?.classList.add('hidden');
  };
  homeButton.onclick = () => {
    try { sessionStorage.removeItem(savedScreenKey); } catch {}
    closeOpenPanels();
    selectedClassId = null;
    detailStudentId = null;
    const search = document.getElementById('search');
    if (search) search.value = '';
    window.render?.();
    window.scrollTo(0, 0);
  };
  // Mesma separação da implementação acima (layout mobile/desktop): a parte
  // visual (busca, modal, rolagem) não depende de dado carregado e continua
  // no gatilho atual; classId/studentId só são avaliados em resposta a
  // carometro:data-loaded, ver restoreClassAndStudent mais abaixo.
  const restoreScreen = () => {
    if (restoreAttempted || app.classList.contains('hidden')) return;
    restoreAttempted = true;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(savedScreenKey) || 'null'); } catch {}
    if (!saved) return;
    const search = document.getElementById('search');
    if (search) search.value = saved.search || '';
    window.render?.();
    window.setTimeout(() => {
      const opener = saved.modalButtonId && document.getElementById(saved.modalButtonId);
      if (opener && !opener.hidden && !opener.classList.contains('hidden')) opener.click();
      window.scrollTo(0, Number(saved.scrollY) || 0);
    }, 140);
  };
  const restoreClassAndStudent = () => {
    if (classRestoreAttempted || !window.getActiveSchoolId?.()) return;
    classRestoreAttempted = true;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(savedScreenKey) || 'null'); } catch {}
    if (!saved) return;
    // Atribuição sempre explícita: se a validação falhar, volta para null
    // mesmo que já houvesse um valor anterior.
    selectedClassId = (saved.classId && classes.some(item => item.id === saved.classId)) ? saved.classId : null;
    detailStudentId = (saved.studentId && students.some(item => item.id === saved.studentId)) ? saved.studentId : null;
    window.render?.();
  };
  document.addEventListener('carometro:data-loaded', restoreClassAndStudent);
  window.addEventListener('pagehide', saveScreen);
  window.addEventListener('beforeunload', saveScreen);
  document.addEventListener('click', () => window.setTimeout(saveScreen, 0));
  app.addEventListener('input', () => window.setTimeout(saveScreen, 0));
  new MutationObserver(restoreScreen).observe(app, { attributes:true, attributeFilter:['class'] });
  window.setTimeout(restoreScreen, 240);
});
