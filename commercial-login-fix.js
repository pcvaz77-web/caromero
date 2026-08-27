// A seleção da escola pode aguardar uma ação do usuário. Mostra a estrutura
// autenticada antes dessa espera para que o seletor multi-escola fique visível
// e o login nunca pareça ter ignorado o clique.
function initializeCommercialLoginFix() {
  const authenticatedShowApp = window.showApp;
  if (typeof authenticatedShowApp !== 'function') return;
  const navigationStyle = document.createElement('style');
  navigationStyle.id = 'commercialNavigationStyle';
  navigationStyle.textContent = `
    .side .nav > button:not(.hidden) {
      width:100% !important;
      min-height:43px !important;
      margin:0 !important;
      padding:10px 12px !important;
      display:flex !important;
      align-items:center !important;
      justify-content:flex-start !important;
      border:0 !important;
      border-radius:8px !important;
      background:#2b3c5d !important;
      color:#fff !important;
      font-weight:700 !important;
      line-height:1.25 !important;
      text-align:left !important;
    }
    .side .nav > button:not(.hidden):hover,
    .side .nav > button:not(.hidden):focus {
      background:#38527e !important;
      color:#fff !important;
    }
    .side .nav > button.hidden { display:none !important; }
  `;
  document.head.appendChild(navigationStyle);
  let commercialMemberships = [];
  let commercialActiveMembership = null;

  function publishActiveSchool(item) {
    commercialActiveMembership = item || null;
    window.getActiveSchoolId = () => commercialActiveMembership?.school_id || null;
    window.getActiveSchoolRole = () => commercialActiveMembership?.role || null;
    window.getActiveSchoolMembership = () => commercialActiveMembership;

    let label = document.getElementById('activeSchoolGreeting');
    if (!label) {
      label = document.createElement('p');
      label.id = 'activeSchoolGreeting';
      label.style.cssText = 'margin:0 0 8px;color:#415273;font-size:14px;font-weight:750';
      const greeting = document.getElementById('welcomeGreeting');
      if (greeting) greeting.insertAdjacentElement('afterend', label);
      else document.querySelector('.top > div')?.prepend(label);
    }
    const requiresChoice = !item && commercialMemberships.length > 1;
    label.textContent = item
      ? `Escola ativa: ${item.schools?.name || 'Escola'}`
      : requiresChoice ? 'Escola ativa: selecione uma escola' : '';
    label.classList.toggle('hidden', !item && !requiresChoice);
  }

  async function ensureSchoolSwitcherVisibility() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    const { data, error } = await db.from('school_members')
      .select('school_id,role,schools(name)')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if (error) throw error;
    commercialMemberships = data || [];
    let storedSchoolId = null;
    try { storedSchoolId = sessionStorage.getItem('carometro:activeSchoolId'); } catch {}
    const storedMembership = commercialMemberships.find(item => item.school_id === storedSchoolId);
    const selectedMembership = storedMembership || (commercialMemberships.length === 1 ? commercialMemberships[0] : null);
    publishActiveSchool(selectedMembership);

    const switcher = document.getElementById('schoolSwitchNav');
    if (!switcher) return;
    if (commercialMemberships.length <= 1) {
      switcher.classList.add('hidden');
      return;
    }
    switcher.hidden = false;
    switcher.classList.remove('hidden');
    switcher.style.removeProperty('display');
    switcher.setAttribute('aria-hidden', 'false');
    switcher.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const modal = document.getElementById('schoolContextModal');
      const list = document.getElementById('schoolContextList');
      if (!modal || !list) return;
      const roleLabel = role => role === 'school_admin'
        ? 'Administrador'
        : role === 'coordinator' ? 'Coordenador' : 'Professor(a)';
      list.innerHTML = commercialMemberships.map((item, index) => `
        <button type="button" class="school-context-option" data-school-index="${index}">
          <b>${esc(item.schools?.name || 'Escola')}</b>
          <span class="school-context-role">${esc(roleLabel(item.role))}</span>
        </button>
      `).join('');
      list.querySelectorAll('[data-school-index]').forEach(button => {
        button.onclick = () => {
          const selected = commercialMemberships[Number(button.dataset.schoolIndex)];
          if (!selected) return;
          try { sessionStorage.setItem('carometro:activeSchoolId', selected.school_id); } catch {}
          location.reload();
        };
      });
      modal.classList.remove('hidden');
    };
  }

  window.showApp = async (...args) => {
    const login = document.getElementById('login');
    const app = document.getElementById('app');
    login?.classList.add('hidden');
    app?.classList.remove('hidden');

    try {
      // Não depende do término da escolha inicial: ela pode estar aguardando
      // interação do usuário quando ainda não existe escola salva na sessão.
      await ensureSchoolSwitcherVisibility();
      await authenticatedShowApp(...args);
      await ensureSchoolSwitcherVisibility();
      // O núcleo legado chama a referência local de load/profile. Executa
      // explicitamente as versões comerciais, já com a escola resolvida.
      await window.load?.();
      await window.refreshCarometroSchoolPermission?.();
    } catch (error) {
      app?.classList.add('hidden');
      login?.classList.remove('hidden');
      throw error;
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCommercialLoginFix, { once:true });
} else {
  initializeCommercialLoginFix();
}
