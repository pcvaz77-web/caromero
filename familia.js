(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    const config = window.CAROMETRO_RUNTIME_CONFIG;
    if (!config?.backendConfigured || !window.supabase) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope:'./' }).catch(() => {});
    const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    const get = id => document.getElementById(id);
    const esc = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const token = new URL(location.href).searchParams.get('token');
    let links = [];
    let selectedLink = null;
    let previewedPhone = null;
    const error = (id, message) => { const box = get(id); box.textContent = message; box.classList.toggle('hidden', !message); };
    const phone = value => { const clean = value.replace(/[\s()\-]/g, ''); if (!/^\+[1-9][0-9]{7,14}$/.test(clean)) throw new Error('Use o celular com DDI, por exemplo +5562999999999.'); return clean; };
    const familyEmail = value => `familia-${phone(value).slice(1)}@sistemacarometro.com.br`;
    const busy = async (button, work, errorId = 'accessError') => { button.disabled = true; try { await work(); } catch (caught) { error(errorId, caught.message || 'Não foi possível continuar.'); } finally { button.disabled = false; } };
    async function loadPortal() {
      const { data: userData, error: authError } = await db.auth.getUser();
      if (authError || !userData?.user) return;
      const { data, error: listError } = await db.rpc('family_my_students');
      if (listError) throw listError;
      links = data || [];
      get('access').classList.add('hidden');
      get('portal').classList.remove('hidden');
      error('portalError','');
      get('students').innerHTML = links.length ? links.map(link => `<button class="student-card" type="button" data-link="${link.link_id}"><strong>${esc(link.student_name)}</strong><small>${esc(link.school_name)} · ${esc(link.class_name)}</small></button>`).join('') : '<div class="empty">Nenhum estudante autorizado para este celular. Consulte a escola caso tenha recebido um convite.</div>';
      if (selectedLink && links.some(link => link.link_id === selectedLink)) await openTimeline(selectedLink);
      else get('timeline').classList.add('hidden');
    }
    async function acceptPendingInvite() {
      if (!token) return;
      const { error: acceptError } = await db.rpc('family_accept_invitation', { p_token:token });
      if (acceptError) throw acceptError;
      history.replaceState(null,'',location.pathname);
    }
    async function openTimeline(linkId) {
      const link = links.find(row => row.link_id === linkId);
      if (!link) return;
      selectedLink = linkId;
      const { data, error: feedError } = await db.rpc('family_feed', { p_link_id:linkId });
      if (feedError) { error('portalError',feedError.message); return; }
      get('schoolName').textContent = link.school_name;
      get('studentName').textContent = link.student_name;
      get('className').textContent = link.class_name || '';
      get('timeline').classList.remove('hidden');
      get('messages').innerHTML = data?.length ? data.map(message => `<article class="message" data-message="${message.message_id}" data-viewed="${message.viewed_at ? 'true' : 'false'}"><header><h3>${esc(message.title)}</h3><time>${new Intl.DateTimeFormat('pt-BR',{ dateStyle:'medium',timeStyle:'short' }).format(new Date(message.published_at))}</time></header><small>${message.acknowledged_at ? 'Ciência confirmada' : message.viewed_at ? 'Visualizada' : 'Ainda não visualizada'}</small><div><button class="outline" type="button" data-open aria-expanded="false">Ver comunicação</button></div><div class="message-detail hidden"><p>${esc(message.body)}</p><footer>${message.acknowledged_at ? 'Ciência confirmada' : 'Ciência ainda não confirmada'}</footer>${message.acknowledged_at ? '' : '<button class="primary" type="button" data-acknowledge>Confirmar ciência</button>'}</div></article>`).join('') : '<div class="empty">Ainda não há comunicações para este estudante.</div>';
    }
    get('students').onclick = event => { const card = event.target.closest('[data-link]'); if (card) openTimeline(card.dataset.link); };
    get('backToStudents').onclick = () => { selectedLink = null; get('timeline').classList.add('hidden'); };
    get('messages').onclick = async event => {
      const opener = event.target.closest('[data-open]');
      if (opener && selectedLink) {
        const article = opener.closest('[data-message]');
        const detail = article.querySelector('.message-detail');
        const opening = detail.classList.contains('hidden');
        if (opening && article.dataset.viewed !== 'true') {
          opener.disabled = true;
          const { error: viewError } = await db.rpc('family_record_receipt', { p_link_id:selectedLink,p_message_id:article.dataset.message,p_acknowledge:false });
          opener.disabled = false;
          if (viewError) { error('portalError',viewError.message); return; }
          article.dataset.viewed = 'true';
          article.querySelector('small').textContent = 'Visualizada';
        }
        detail.classList.toggle('hidden', !opening);
        opener.textContent = opening ? 'Ocultar comunicação' : 'Ver comunicação';
        opener.setAttribute('aria-expanded', String(opening));
        return;
      }
      const button = event.target.closest('[data-acknowledge]');
      if (!button || !selectedLink) return;
      const article = button.closest('[data-message]');
      button.disabled = true;
      const { error: receiptError } = await db.rpc('family_record_receipt', { p_link_id:selectedLink,p_message_id:article.dataset.message,p_acknowledge:true });
      if (receiptError) { error('portalError',receiptError.message); button.disabled = false; return; }
      article.querySelector('footer').textContent = 'Ciência confirmada';
      article.querySelector('small').textContent = 'Ciência confirmada';
      button.remove();
    };
    get('signOut').onclick = async () => { await db.auth.signOut(); selectedLink = null; links = []; get('portal').classList.add('hidden'); get('access').classList.remove('hidden'); };
    get('passwordForm').onsubmit = event => {
      event.preventDefault(); error('accessError','');
      busy(event.submitter, async () => {
        const { error: loginError } = await db.auth.signInWithPassword({ email:familyEmail(get('phone').value),password:get('password').value });
        if (loginError) throw loginError;
        await acceptPendingInvite();
        await loadPortal();
      });
    };
    function showFirstAccess() {
      get('passwordForm').classList.add('hidden');
      get('firstAccessForm').classList.remove('hidden');
      get('invitePhone').value = get('phone').value;
      error('accessError','');
    }
    async function previewInvitation(invitedPhone) {
      if (!token) throw new Error('Abra o convite individual apresentado pela escola.');
      if (previewedPhone === invitedPhone) return;
      const { data, error: previewError } = await db.functions.invoke('family-activate', {
        body: { action:'preview', token, phone:invitedPhone },
      });
      if (previewError || !Array.isArray(data?.students) || !data.students.length) {
        const response = await previewError?.context?.json?.().catch(() => null);
        throw new Error(response?.error || 'Não foi possível conferir este convite. Confira o celular com a escola.');
      }
      get('inviteChildren').innerHTML = `<strong>Filhos autorizados neste convite</strong><ul>${data.students.map(student => `<li>${esc(student.name)} · Turma ${esc(student.class_name || 'não informada')}</li>`).join('')}</ul>`;
      get('inviteChildren').classList.remove('hidden');
      previewedPhone = invitedPhone;
    }
    get('invitePhone').oninput = () => { previewedPhone = null; get('inviteChildren').classList.add('hidden'); };
    get('checkInvitation').onclick = event => busy(event.currentTarget, async () => {
      await previewInvitation(phone(get('invitePhone').value));
      error('accessError','');
    });
    get('firstAccess').onclick = () => { if (!token) return error('accessError','Abra o convite individual enviado pela escola para fazer o primeiro acesso.'); showFirstAccess(); };
    get('backToLogin').onclick = () => { get('firstAccessForm').classList.add('hidden'); get('passwordForm').classList.remove('hidden'); error('accessError',''); };
    get('firstAccessForm').onsubmit = event => {
      event.preventDefault(); error('accessError','');
      busy(event.submitter, async () => {
        if (!token) throw new Error('Abra o convite individual enviado pela escola.');
        const invitedPhone = phone(get('invitePhone').value);
        await previewInvitation(invitedPhone);
        const password = get('invitePassword').value;
        const { data, error: activationError } = await db.functions.invoke('family-activate', {
          body: { token, phone:invitedPhone, password },
        });
        if (activationError || !data) {
          const response = await activationError?.context?.json?.().catch(() => null);
          throw new Error(response?.error || 'Não foi possível criar o acesso.');
        }
        if (data.existing) {
          const { error: existingLoginError } = await db.auth.signInWithPassword({ email:familyEmail(invitedPhone), password });
          if (!existingLoginError) {
            get('invitePassword').value = '';
            await acceptPendingInvite();
            await loadPortal();
            return;
          }
          get('phone').value = invitedPhone;
          get('firstAccessForm').classList.add('hidden');
          get('passwordForm').classList.remove('hidden');
          error('accessError','Este celular já tem acesso. Entre com a senha que você usa no Portal da Família para aceitar o convite.');
          return;
        }
        if (!data.created) throw new Error(data.error || 'Não foi possível criar o acesso.');
        const { error: loginError } = await db.auth.signInWithPassword({ email:familyEmail(invitedPhone),password });
        if (loginError) throw new Error('Acesso criado. Entre com o celular e a senha que você acabou de definir.');
        await acceptPendingInvite();
        get('invitePassword').value = '';
        await loadPortal();
      });
    };
    get('changePasswordForm').onsubmit = event => {
      event.preventDefault(); error('portalError','');
      busy(event.submitter, async () => {
        const { error: updateError } = await db.auth.updateUser({ password:get('changedPassword').value, current_password:get('currentPassword').value });
        if (updateError) throw updateError;
        get('changePasswordForm').reset();
        error('portalError','Senha alterada.');
      }, 'portalError');
    };
    if (token) showFirstAccess();
    try {
      const { data } = await db.auth.getSession();
      if (data.session) { await acceptPendingInvite(); await loadPortal(); }
    } catch (caught) { error('accessError',caught.message || 'Não foi possível abrir o portal.'); }
  });
})();
