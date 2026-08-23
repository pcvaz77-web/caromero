// Infraestrutura central de "escola ativa" para o modelo comercial
// multi-escola. Fonte única de verdade para "em qual escola o usuário está
// operando agora" — reports.js, school-calendar.js e uniform-management.js
// passam a ler o contexto daqui, em vez de cada um resolver sozinho (o que
// produzia resultados diferentes e por vezes incorretos entre eles).
//
// Regra comercial:
//   - 0 vínculos ativos: nenhuma escola é inventada; o app segue no fluxo
//     legado existente (conta sem nenhuma escola comercial).
//   - 1 vínculo ativo: selecionado automaticamente.
//   - 2+ vínculos ativos: o usuário escolhe explicitamente, sempre que não
//     houver uma escolha válida e ainda vigente guardada nesta aba.
//
// O valor guardado (sessionStorage, por aba) NUNCA é autorização — é só
// "qual escola mostrar". Toda RPC/RLS protegida continua validando
// vínculo/papel no servidor, independente do que está aqui.
document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'carometro:activeSchoolId';

  let activeSchoolId = null;
  let activeSchoolRole = null;
  let activeMemberships = []; // [{school_id, role, name}] — só vínculos ativos, recarregado a cada resolveActiveSchoolContext()

  const style = document.createElement('style');
  style.textContent = `
    #schoolSwitchNav { border:0; background:#2b3c5d; color:#fff; }
    #schoolSwitchNav:hover { background:#38527e; }
    .school-context-modal { z-index:200; }
    .school-context-modal .modal { width:min(480px,100%); }
    .school-context-list { display:grid; gap:10px; margin-top:16px; }
    .school-context-option { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 16px; border:1px solid var(--line); border-radius:10px; background:#fff; cursor:pointer; text-align:left; font:inherit; color:inherit; width:100%; }
    .school-context-option:hover { background:#f5f8ff; border-color:#8fa8e0; }
    .school-context-option b { display:block; }
    .school-context-option .meta { margin-top:3px; }
    .school-context-role { padding:4px 9px; border-radius:99px; background:#e8efff; color:#214dba; font-size:11px; font-weight:800; white-space:nowrap; }
    @media (max-width:800px) {
      .school-context-modal { padding:10px; align-items:start; overflow:auto; }
      .school-context-modal .modal { width:100%; max-height:calc(100vh - 20px); margin:auto 0; }
    }
  `;
  document.head.appendChild(style);

  // Botão "Trocar de escola" — só aparece com 2+ vínculos ativos. Fica no
  // mesmo nível dos demais botões de nav (index.html já tem #reportsNav,
  // #inviteNav etc. inseridos do mesmo jeito).
  const switchNav = document.createElement('button');
  switchNav.id = 'schoolSwitchNav';
  switchNav.type = 'button';
  switchNav.className = 'hidden';
  switchNav.innerHTML = '<span>⇄ &nbsp; Trocar de escola</span>';
  const sideNavigation = document.querySelector('.side .nav');
  sideNavigation?.insertBefore(switchNav, document.getElementById('profileNav') || null);

  const modal = document.createElement('div');
  modal.id = 'schoolContextModal';
  modal.className = 'modal-bg school-context-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Escolha a escola</h3><div class="meta">Sua conta tem vínculo ativo em mais de uma escola. Selecione em qual você quer entrar agora.</div></div></div><div class="form"><div id="schoolContextList" class="school-context-list"></div></div></div>`;
  document.body.appendChild(modal);

  const roleLabel = role => role === 'school_admin' ? 'Administrador' : role === 'coordinator' ? 'Coordenador' : 'Professor(a)';

  function renderOptions(onPick) {
    document.getElementById('schoolContextList').innerHTML = activeMemberships.map((membership, index) =>
      `<button type="button" class="school-context-option" data-index="${index}"><span><b>${esc(membership.name || 'Escola')}</b></span><span class="school-context-role">${esc(roleLabel(membership.role))}</span></button>`
    ).join('');
    document.querySelectorAll('.school-context-option').forEach(button => {
      button.onclick = () => onPick(activeMemberships[Number(button.dataset.index)]);
    });
  }

  function persist(schoolId) {
    try { sessionStorage.setItem(STORAGE_KEY, schoolId); } catch {}
  }

  async function fetchActiveMemberships(signedInUser) {
    const { data } = await db.from('school_members').select('school_id,role,schools(name)').eq('user_id', signedInUser.id).eq('status', 'active');
    return (data || []).map(row => ({ school_id: row.school_id, role: row.role, name: row.schools?.name || '' }));
  }

  function setActive(membership) {
    activeSchoolId = membership.school_id;
    activeSchoolRole = membership.role;
    persist(membership.school_id);
    switchNav.classList.toggle('hidden', activeMemberships.length <= 1);
    modal.classList.add('hidden');
  }

  // Ponto único de resolução — chamado por showApp() logo depois de
  // schoolMembership(), antes de load(). Nunca inventa escola para conta
  // sem nenhum vínculo comercial (fluxo legado preservado).
  window.resolveActiveSchoolContext = async () => {
    activeSchoolId = null;
    activeSchoolRole = null;
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    activeMemberships = await fetchActiveMemberships(signedInUser);

    if (!activeMemberships.length) {
      switchNav.classList.add('hidden');
      document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
      return;
    }

    if (activeMemberships.length === 1) {
      setActive(activeMemberships[0]);
      document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
      return;
    }

    // 2+ vínculos: só reaproveita a escolha salva nesta aba se ela ainda
    // corresponder a um vínculo ativo real, revalidado agora — nunca
    // confia cegamente no valor salvo (vínculo pode ter sido revogado).
    let stored = null;
    try { stored = sessionStorage.getItem(STORAGE_KEY); } catch {}
    const stillValid = stored && activeMemberships.find(m => m.school_id === stored);
    if (stillValid) {
      setActive(stillValid);
      document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
      return;
    }

    switchNav.classList.remove('hidden');
    modal.classList.remove('hidden');
    await new Promise(resolve => {
      renderOptions(membership => { setActive(membership); resolve(); });
    });
    document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
  };

  // "Trocar de escola" — sempre reload após a escolha, para que todo
  // módulo (reports.js, school-calendar.js, uniform-management.js, e
  // qualquer outro que dependa da escola ativa) releia seu próprio estado
  // do zero sob o novo contexto, sem precisar invalidar caches um por um.
  window.openSchoolSwitcher = () => {
    if (activeMemberships.length <= 1) return;
    modal.classList.remove('hidden');
    renderOptions(membership => {
      persist(membership.school_id);
      location.reload();
    });
  };
  switchNav.onclick = () => window.openSchoolSwitcher();
  modal.onclick = event => { if (event.target === modal && activeMemberships.length <= 1) modal.classList.add('hidden'); };

  window.getActiveSchoolId = () => activeSchoolId;
  window.getActiveSchoolRole = () => activeSchoolRole;

  window.clearActiveSchoolContext = () => {
    activeSchoolId = null;
    activeSchoolRole = null;
    activeMemberships = [];
    switchNav.classList.add('hidden');
    modal.classList.add('hidden');
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  };
});
