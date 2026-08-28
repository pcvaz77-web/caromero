// #app só é revelado depois que escola/papel/permissões da conta atual
// estiverem completamente resolvidos (ver window.showApp abaixo). Isso evita
// que qualquer dado de uma conta anterior — ou um estado provisório — apareça
// mesmo que só por um instante durante o login/troca de conta.
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
    /* Cortina de bootstrap: cobre a interface comum (fica acima dela) mas
       fica abaixo do seletor de escola (#schoolContextModal, z-index:200),
       que precisa continuar visível e utilizável durante a resolução. */
    #carometroBootShield {
      position:fixed; inset:0; z-index:150;
      background:var(--bg); color:var(--navy);
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:15px; text-align:center; padding:24px;
    }
  `;
  document.head.appendChild(navigationStyle);

  const bootShield = document.createElement('div');
  bootShield.id = 'carometroBootShield';
  bootShield.className = 'hidden';
  bootShield.textContent = 'Carregando seu acesso…';
  document.body.appendChild(bootShield);
  const showBootShield = () => bootShield.classList.remove('hidden');
  const hideBootShield = () => bootShield.classList.add('hidden');

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

  // Única limpeza do estado comercial em memória: zera o vínculo/escola ativa
  // e a lista de vínculos, e publica contexto nulo. Chamada tanto quando não
  // há usuário autenticado (abaixo) quanto no logout (index.html), para que
  // nenhuma conta seguinte herde dado de uma sessão anterior.
  function clearCommercialLoginState() {
    commercialMemberships = [];
    publishActiveSchool(null);
    document.getElementById('schoolSwitchNav')?.classList.add('hidden');
    hideBootShield();
  }
  window.clearCommercialLoginState = clearCommercialLoginState;

  async function ensureSchoolSwitcherVisibility() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { clearCommercialLoginState(); return; }
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
    // Cortina primeiro, sincronamente, antes de qualquer reorganização da
    // interface anterior — nada do que acontece a seguir fica visível ao
    // usuário até hideBootShield() no fim deste bloco.
    showBootShield();
    login?.classList.add('hidden');

    try {
      // Não depende do término da escolha inicial: ela pode estar aguardando
      // interação do usuário quando ainda não existe escola salva na sessão.
      // O seletor (#schoolContextModal, z-index:200) fica acima da cortina
      // (z-index:150) e continua utilizável enquanto ela está visível.
      await ensureSchoolSwitcherVisibility();
      await authenticatedShowApp(...args);
      // Recuperação de senha tem sua própria tela (password-recovery-flow.js)
      // e já decidiu a visibilidade de #app/#login sozinha; a cortina não pode
      // ficar por cima dela.
      if (window.isCarometroPasswordRecovery?.()) { hideBootShield(); return; }
      await ensureSchoolSwitcherVisibility();
      // O núcleo legado chama a referência local de load/profile. Executa
      // explicitamente as versões comerciais, já com a escola resolvida.
      await window.load?.();
      await window.refreshCarometroSchoolPermission?.();
      // #app é liberado internamente aqui para que os MutationObservers
      // existentes (mobile-layout.js, permissions-and-details.js,
      // student-edit-improvements.js, notification-center.js,
      // pwa-notifications.js, class-counselors.js, class-periods.js)
      // disparem normalmente — eles não são alterados. A cortina, ainda
      // visível, é o que impede o usuário de ver esse instante.
      app?.classList.remove('hidden');
      // Janela de estabilização apenas com atraso tecnicamente justificado:
      // 140ms é o setTimeout já existente em mobile-layout.js
      // (restoreCurrentScreen), o único observer com atraso conhecido
      // reagindo a #app ficar visível. Os dois requestAnimationFrame
      // garantem que o resultado já foi pintado antes de tirar a cortina.
      await new Promise(resolve => setTimeout(resolve, 140));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      hideBootShield();
    } catch (error) {
      app?.classList.add('hidden');
      login?.classList.remove('hidden');
      hideBootShield();
      throw error;
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCommercialLoginFix, { once:true });
} else {
  initializeCommercialLoginFix();
}
