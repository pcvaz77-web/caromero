// Escola ativa da sessão comercial. A escolha controla a interface; as
// autorizações continuam sendo validadas por RLS/RPC no servidor.
function initializeSchoolContext() {
  const STORAGE_KEY = 'carometro:activeSchoolId';
  let activeSchoolId = null, activeSchoolRole = null, memberships = [];
  let accessCheckTimer = null, accessCheckRunning = false, accessLost = false;
  let noSchoolCheckTimer = null, noSchoolCheckRunning = false;
  const style = document.createElement('style');
  style.textContent = `#schoolSwitchNav{border:0;background:#2b3c5d;color:#fff}.school-context-modal{z-index:200}.school-context-modal .modal{width:min(480px,100%)}.school-context-list{display:grid;gap:10px;margin-top:16px}.school-context-option{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%}.school-context-role{padding:4px 9px;border-radius:99px;background:#e8efff;color:#214dba;font-size:11px;font-weight:800;white-space:nowrap}`;
  document.head.appendChild(style);
  const switchNav = document.createElement('button');
  switchNav.id = 'schoolSwitchNav'; switchNav.type = 'button'; switchNav.className = 'hidden';
  switchNav.innerHTML = '<span>⇄ &nbsp; Trocar de escola</span>';
  document.querySelector('.side .nav')?.appendChild(switchNav);
  const modal = document.createElement('div');
  modal.id = 'schoolContextModal'; modal.className = 'modal-bg school-context-modal hidden';
  modal.innerHTML = '<div class="modal"><div class="modal-head"><div><h3>Escolha a escola</h3><div class="meta">Selecione em qual escola você quer trabalhar agora.</div></div></div><div class="form"><div id="schoolContextList" class="school-context-list"></div></div></div>';
  document.body.appendChild(modal);
  // Ao trocar uma escola que já está ativa, clicar no fundo apenas
  // recolhe o seletor e preserva o contexto atual. Na primeira escolha
  // obrigatória, o fundo não fecha: sem escola ativa a aplicação não pode
  // carregar dados com segurança.
  modal.onclick = event => {
    if (event.target === modal && activeSchoolId) modal.classList.add('hidden');
  };
  const roleLabel = role => role === 'school_admin' ? 'Administrador' : role === 'coordinator' ? 'Coordenador' : 'Professor(a)';
  const persist = id => { try { sessionStorage.setItem(STORAGE_KEY, id); } catch {} };
  function setActive(item) {
    activeSchoolId = item.school_id; activeSchoolRole = item.role; persist(item.school_id);
    switchNav.classList.toggle('hidden', memberships.length <= 1); modal.classList.add('hidden');
    startEffectiveAccessChecks();
  }
  async function verifyEffectiveAccess() {
    if (!activeSchoolId || accessCheckRunning || accessLost || document.hidden) return;
    accessCheckRunning = true;
    try {
      const checkedSchoolId = activeSchoolId;
      const { data, error } = await db.rpc('can_use_school', { target_school_id:checkedSchoolId });
      if (error) { await window.verifyCarometroSession?.(); return; }
      if (checkedSchoolId !== activeSchoolId || data === true) return;
      accessLost = true;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      toast('O acesso a esta escola foi suspenso ou está indisponível.');
      setTimeout(() => location.reload(), 1200);
    } finally {
      accessCheckRunning = false;
    }
  }
  function startEffectiveAccessChecks() {
    if (accessCheckTimer) clearInterval(accessCheckTimer);
    if (noSchoolCheckTimer) clearInterval(noSchoolCheckTimer);
    noSchoolCheckTimer = null;
    accessLost = false;
    accessCheckTimer = setInterval(verifyEffectiveAccess, 60000);
    verifyEffectiveAccess();
  }
  async function checkForRestoredMembership() {
    if (activeSchoolId || noSchoolCheckRunning || document.hidden) return;
    noSchoolCheckRunning = true;
    try {
      const { data: { user } } = await db.auth.getUser();
      if (!user) { await window.verifyCarometroSession?.(); return; }
      const { data, error } = await db.from('school_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
      if (!error && data?.length) location.reload();
    } finally {
      noSchoolCheckRunning = false;
    }
  }
  function startNoSchoolChecks() {
    if (noSchoolCheckTimer) clearInterval(noSchoolCheckTimer);
    noSchoolCheckTimer = setInterval(checkForRestoredMembership, 30000);
  }
  function renderOptions(onPick) {
    document.getElementById('schoolContextList').innerHTML = memberships.map((item, index) => `<button type="button" class="school-context-option" data-index="${index}"><b>${esc(item.name || 'Escola')}</b><span class="school-context-role">${esc(roleLabel(item.role))}</span></button>`).join('');
    document.querySelectorAll('.school-context-option').forEach(button => { button.onclick = () => onPick(memberships[Number(button.dataset.index)]); });
  }
  async function showNoSchoolState() {
    const { data:isOwner } = await db.rpc('is_platform_owner');
    if (isOwner === true) return;
    startNoSchoolChecks();
    const list = document.getElementById('schoolContextList');
    list.innerHTML = `
      <div class="empty" style="padding:8px 0 18px">
        Sua conta está confirmada, mas ainda não possui acesso ativo a uma escola.
        Aguarde o administrador concluir a liberação ou abra novamente o link de convite recebido.
      </div>
      <button id="noSchoolSignOut" type="button" class="btn secondary full">Sair desta conta</button>
    `;
    modal.querySelector('h3').textContent = 'Aguardando acesso escolar';
    modal.querySelector('.meta').textContent = 'Nenhum dado escolar foi carregado.';
    modal.classList.remove('hidden');
    document.getElementById('noSchoolSignOut').onclick = async () => {
      const button = document.getElementById('noSchoolSignOut');
      button.disabled = true;
      window.prepareCarometroSignOut?.();
      try {
        await Promise.race([
          Promise.resolve().then(() => window.disableCarometroPush?.()).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 2500))
        ]);
      } finally {
        if (window.endInvalidCarometroSession) await window.endInvalidCarometroSession();
        else { await db.auth.signOut({ scope:'local' }); location.reload(); }
      }
    };
  }
  window.resolveActiveSchoolContext = async () => {
    activeSchoolId = null; activeSchoolRole = null;
    const { data: { user } } = await db.auth.getUser(); if (!user) return;
    const { data, error } = await db.from('school_members').select('school_id,role,schools(name)').eq('user_id', user.id).eq('status', 'active');
    if (error) { toast('Não foi possível confirmar a escola ativa.'); throw error; }
    memberships = (data || []).map(row => ({ school_id:row.school_id, role:row.role, name:row.schools?.name || '' }));
    if (!memberships.length) {
      switchNav.classList.add('hidden');
      await showNoSchoolState();
      document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
      return;
    }
    if (memberships.length === 1) setActive(memberships[0]);
    else {
      let stored = null; try { stored = sessionStorage.getItem(STORAGE_KEY); } catch {}
      const valid = memberships.find(item => item.school_id === stored);
      if (valid) setActive(valid);
      else { switchNav.classList.remove('hidden'); modal.classList.remove('hidden'); await new Promise(resolve => renderOptions(item => { setActive(item); resolve(); })); }
    }
    document.dispatchEvent(new CustomEvent('carometro:school-context-ready'));
  };
  window.openSchoolSwitcher = () => { if (memberships.length <= 1) return; modal.classList.remove('hidden'); renderOptions(item => { persist(item.school_id); location.reload(); }); };
  window.activateSchoolContext = schoolId => {
    const target = memberships.find(item => item.school_id === schoolId);
    if (!target) return false;
    persist(target.school_id);
    location.reload();
    return true;
  };
  switchNav.onclick = window.openSchoolSwitcher;
  window.addEventListener('focus', () => { verifyEffectiveAccess(); checkForRestoredMembership(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { verifyEffectiveAccess(); checkForRestoredMembership(); } });
  document.getElementById('signOut')?.addEventListener('click', () => window.clearActiveSchoolContext?.(), { capture:true });
  window.getActiveSchoolId = () => activeSchoolId;
  window.getActiveSchoolRole = () => activeSchoolRole;
  window.getActiveSchoolMembership = () => memberships.find(item => item.school_id === activeSchoolId) || null;
  window.clearActiveSchoolContext = () => { activeSchoolId = null; activeSchoolRole = null; memberships = []; accessLost = false; if (accessCheckTimer) clearInterval(accessCheckTimer); if (noSchoolCheckTimer) clearInterval(noSchoolCheckTimer); accessCheckTimer = null; noSchoolCheckTimer = null; switchNav.classList.add('hidden'); modal.classList.add('hidden'); try { sessionStorage.removeItem(STORAGE_KEY); } catch {} };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSchoolContext, { once:true });
} else {
  initializeSchoolContext();
}
