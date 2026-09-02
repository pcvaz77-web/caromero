// Convites da escola ativa. A interface apenas solicita as operações; a
// autorização e os dados definitivos são sempre resolvidos pelas RPCs.
document.addEventListener('DOMContentLoaded', () => {
  // O convite legado escolhe o primeiro vínculo de administrador encontrado e
  // não representa corretamente uma conta vinculada a mais de uma escola.
  // Ele permanece no HTML apenas por compatibilidade com o núcleo antigo, mas
  // não pode ser exibido nem acionado no comercial. Todo convite deve passar
  // pela interface abaixo, que usa explicitamente a escola ativa.
  const legacyInvitationNav = document.getElementById('inviteNav');
  if (legacyInvitationNav) {
    legacyInvitationNav.disabled = true;
    legacyInvitationNav.setAttribute('aria-hidden', 'true');
    legacyInvitationNav.style.setProperty('display', 'none', 'important');
  }

  const style = document.createElement('style');
  style.textContent = `
    #schoolInvitationsModal{z-index:110}.school-invite-grid{display:grid;grid-template-columns:1fr 190px;gap:12px}.school-invite-result{display:flex;gap:8px;margin-top:12px}.school-invite-result input{min-width:0}.school-invite-list{display:grid;gap:9px;margin-top:12px}.school-invite-item{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px;border:1px solid var(--line);border-radius:9px}.school-invite-link{font-size:12px;overflow-wrap:anywhere;color:var(--muted)}
    @media(max-width:800px){.school-invite-grid{grid-template-columns:1fr}.school-invite-result,.school-invite-item{align-items:stretch;flex-direction:column}.school-invite-result .btn,.school-invite-item .btn{width:100%}}
  `;
  document.head.appendChild(style);

  const nav = document.createElement('button');
  nav.id = 'schoolInvitationsNav'; nav.type = 'button'; nav.className = 'hidden';
  nav.innerHTML = '✉ &nbsp; Convites';
  document.querySelector('.side .nav')?.appendChild(nav);

  const modal = document.createElement('div');
  modal.id = 'schoolInvitationsModal'; modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Convites da escola</h3><div class="meta">Cada link é individual, expira e só pode ser aceito pelo e-mail convidado.</div></div><button class="close" type="button" data-school-invite-close>×</button></div><div class="form"><div class="school-invite-grid"><div class="field"><label>E-mail</label><input id="schoolInviteEmail" type="email" placeholder="professor@escola.edu.br"></div><div class="field"><label>Papel</label><select id="schoolInviteRole"><option value="teacher">Professor(a)</option><option value="coordinator">Coordenador(a)</option></select></div></div><button id="schoolInviteCreate" class="btn primary" type="button">Gerar convite</button><div id="schoolInviteResult" class="school-invite-result hidden"><input id="schoolInviteLink" readonly><button id="schoolInviteCopy" class="btn secondary" type="button">Copiar link</button></div><hr style="margin:24px 0;border:0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><b>Convites pendentes</b><div class="meta">Somente convites da escola ativa.</div></div><button id="schoolInviteRefresh" class="btn secondary" type="button">Atualizar</button></div><div id="schoolInviteList" class="school-invite-list"></div></div></div>`;
  document.body.appendChild(modal);

  const byId = id => document.getElementById(id);
  const roleLabel = role => role === 'coordinator' ? 'Coordenador(a)' : 'Professor(a)';
  const canInvite = () => window.getActiveSchoolRole?.() === 'school_admin' || (window.getActiveSchoolRole?.() === 'coordinator' && !!(permission.can_edit_all || permission.can_invite_teachers));
  const linkForToken = token => new URL(`accept-invite.html?token=${encodeURIComponent(token)}`, location.href).href;
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); }
    catch { const input = byId('schoolInviteLink'); input.value = text; input.select(); document.execCommand('copy'); }
    toast('Link copiado.');
  };

  function refreshVisibility() {
    const allowed = canInvite();
    nav.classList.toggle('hidden', !allowed);
    const coordinator = window.getActiveSchoolRole?.() === 'coordinator';
    byId('schoolInviteRole').querySelector('option[value="coordinator"]').disabled = coordinator;
    if (coordinator) byId('schoolInviteRole').value = 'teacher';
    if (!allowed) modal.classList.add('hidden');
  }

  async function loadPending() {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !canInvite()) return;
    byId('schoolInviteList').innerHTML = '<div class="meta">Carregando…</div>';
    const { data, error } = await db.from('school_invitations').select('id,email,role,token,expires_at,created_at').eq('school_id', schoolId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending:false });
    if (error) { byId('schoolInviteList').innerHTML = `<div class="error">${esc(error.message)}</div>`; return; }
    byId('schoolInviteList').innerHTML = (data || []).length ? data.map(item => `<div class="school-invite-item"><div><b>${esc(item.email)}</b><div class="meta">${esc(roleLabel(item.role))} · expira em ${esc(new Date(item.expires_at).toLocaleDateString('pt-BR'))}</div><div class="school-invite-link">${esc(linkForToken(item.token))}</div></div><div class="actions-small"><button class="edit" type="button" data-copy-invite="${esc(item.token)}">Copiar</button><button class="edit" type="button" data-resend-invite="${esc(item.id)}">Reenviar</button><button class="delete" type="button" data-cancel-invite="${esc(item.id)}">Cancelar</button></div></div>`).join('') : '<div class="empty" style="padding:26px">Nenhum convite pendente.</div>';
  }

  async function sendInvitationEmail(invitationId) {
    const { data, error } = await db.functions.invoke('send-school-invitation', { body:{ invitationId } });
    if (error) {
      let message = error.message || 'Não foi possível enviar o e-mail.';
      try { const payload = await error.context?.json(); if (payload?.error) message = payload.error; } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  nav.onclick = async () => { if (!canInvite()) return; byId('schoolInviteEmail').value = ''; byId('schoolInviteResult').classList.add('hidden'); modal.classList.remove('hidden'); await loadPending(); };
  byId('schoolInviteCreate').onclick = async () => {
    const schoolId = window.getActiveSchoolId?.(), email = byId('schoolInviteEmail').value.trim(), role = byId('schoolInviteRole').value;
    if (!schoolId || !canInvite()) { toast('Você não possui permissão para convidar nesta escola.'); return; }
    if (!byId('schoolInviteEmail').checkValidity()) { byId('schoolInviteEmail').reportValidity(); return; }
    if (window.getActiveSchoolRole?.() === 'coordinator' && role !== 'teacher') { toast('Coordenadores só podem convidar professores.'); return; }
    byId('schoolInviteCreate').disabled = true;
    try {
      const { data:id, error } = await db.rpc('create_school_invitation', { target_school_id:schoolId, target_email:email, target_role:role });
      if (error) throw error;
      const { data, error:readError } = await db.from('school_invitations').select('token').eq('id', id).eq('school_id', schoolId).single();
      if (readError || !data) throw readError || new Error('Convite criado, mas o link não pôde ser recuperado.');
      byId('schoolInviteLink').value = linkForToken(data.token); byId('schoolInviteResult').classList.remove('hidden'); byId('schoolInviteEmail').value = '';
      try {
        await sendInvitationEmail(id);
        toast('Convite criado e enviado por e-mail.');
      } catch (sendError) {
        toast(`Convite criado, mas o e-mail não foi enviado: ${sendError.message}`);
      }
      await loadPending();
    } catch (error) { toast(error.message || 'Não foi possível gerar o convite.'); }
    finally { byId('schoolInviteCreate').disabled = false; }
  };
  byId('schoolInviteCopy').onclick = () => copyText(byId('schoolInviteLink').value);
  byId('schoolInviteRefresh').onclick = loadPending;
  modal.querySelector('[data-school-invite-close]').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  byId('schoolInviteList').onclick = async event => {
    const copyButton = event.target.closest('[data-copy-invite]');
    if (copyButton) { await copyText(linkForToken(copyButton.dataset.copyInvite)); return; }
    const resendButton = event.target.closest('[data-resend-invite]');
    if (resendButton) {
      if (resendButton.disabled) return;
      resendButton.disabled = true;
      try {
        await sendInvitationEmail(resendButton.dataset.resendInvite);
        toast('Convite reenviado por e-mail.');
      } catch (error) {
        toast(error.message || 'Não foi possível reenviar o convite.');
      } finally {
        resendButton.disabled = false;
      }
      return;
    }
    const cancelButton = event.target.closest('[data-cancel-invite]');
    if (!cancelButton || !confirm('Cancelar este convite? O link deixará de funcionar.')) return;
    cancelButton.disabled = true;
    const { error } = await db.rpc('cancel_school_invitation', { invitation_id:cancelButton.dataset.cancelInvite });
    if (error) { toast(error.message); cancelButton.disabled = false; return; }
    toast('Convite cancelado.'); await loadPending();
  };
  // O contexto da escola fica pronto antes de a carga geral dos alunos. Antes,
  // a visibilidade era calculada nesse intervalo usando a permissão legada e o
  // botão só aparecia quando uma atualização posterior acontecia. Resolva a
  // permissão comercial da escola ativa primeiro e então atualize o menu.
  document.addEventListener('carometro:school-context-ready', async () => {
    await window.refreshCarometroSchoolPermission?.();
    refreshVisibility();
  });
  document.addEventListener('carometro:permission-refresh', refreshVisibility);
});
