(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    const nav = document.querySelector('.side .nav');
    if (!app || !nav || typeof db === 'undefined') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '⌂  Portal da Família';
    button.hidden = true;
    nav.append(button);
    const dialog = document.createElement('div');
    dialog.className = 'modal-bg hidden';
    dialog.id = 'familySchoolModal';
    dialog.innerHTML = `<section class="modal family-school-dialog" role="dialog" aria-modal="true" aria-labelledby="familySchoolTitle">
      <div class="modal-head"><div><h3 id="familySchoolTitle">Portal da Família</h3><p class="meta">Autorize responsáveis e publique apenas o conteúdo escolhido para a família.</p></div><button class="close" type="button" id="familySchoolClose" aria-label="Fechar">×</button></div>
      <div class="form family-school-content"><p id="familySchoolError" class="error hidden" role="alert"></p>
        <form id="familyInviteForm"><h4>Convidar responsável</h4><p class="meta">Confirme a identidade do responsável antes de mostrar o QR Code. Marque apenas os filhos autorizados pela escola.</p><div class="family-grid"><label>Nome do responsável<input id="familyGuardianName" maxlength="160" required></label><label>Celular com DDI<input id="familyPhone" type="tel" placeholder="+5562999999999" pattern="\\+[1-9][0-9]{7,14}" required></label></div><label for="familyStudentSearch">Filhos autorizados</label><input id="familyStudentSearch" type="search" placeholder="Buscar aluno pelo nome"><div id="familyStudentChoices" class="family-student-choices"></div><button class="btn primary" type="submit">Gerar convite por QR Code</button></form>
        <div id="familyInviteResult" class="family-invite-result hidden"><strong>Convite individual criado</strong><p>Mostre este QR Code ao responsável na escola. Ele vale por 15 minutos e só pode ser usado uma vez. Não o coloque na carteirinha do aluno.</p><div id="familyInviteQr" class="family-invite-qr" aria-label="QR Code do convite"></div><input id="familyInviteUrl" readonly aria-label="Link do convite"><button class="btn secondary" type="button" id="familyCopyInvite">Copiar link</button></div>
        <form id="familyPublishForm"><h4>Compartilhar ocorrência</h4><p class="meta">A descrição interna não é copiada. Escreva o texto que a família poderá ler.</p><div class="family-grid"><label>Ocorrência<select id="familyOccurrence" required></select></label><label>Título<input id="familyMessageTitle" maxlength="160" required></label></div><label>Mensagem para a família<textarea id="familyMessageBody" maxlength="2000" required></textarea></label><button class="btn primary" type="submit">Publicar para a família</button></form>
        <section><h4>Vínculos e ciência</h4><div id="familySchoolOverview" class="family-overview" aria-live="polite"></div></section>
      </div></section>`;
    document.body.append(dialog);
    const css = document.createElement('style');
    css.textContent = `.family-school-dialog{width:min(900px,100%)}.family-school-content{display:grid;gap:26px}.family-school-content form{padding-bottom:20px;border-bottom:1px solid #e4e7ec}.family-school-content h4{margin:0 0 13px;font-size:16px}.family-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.family-school-content label{display:block}.family-school-content label input,.family-school-content label select,.family-school-content textarea{margin-top:7px}.family-student-choices{max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0 16px}.family-student-choices label{display:flex;align-items:center;gap:9px;margin:0;padding:9px;border:1px solid #dce5f1;border-radius:9px;font-size:13px;font-weight:650}.family-student-choices label:has(input:checked){border-color:#4569da;background:#eef3ff}.family-student-choices input{width:18px!important;height:18px;min-height:0;margin:0!important;flex:none}.family-student-choices small{display:block;color:#667085}.family-invite-result{padding:16px;border-radius:10px;background:#f1f6ff}.family-invite-result p{font-size:13px}.family-invite-result input{margin-bottom:10px}.family-invite-qr svg{display:block;width:200px;height:200px;max-width:100%;margin:14px auto;background:#fff}.family-overview{display:grid;gap:9px}.family-link-row{padding:12px;border:1px solid #dce5f1;border-radius:9px}.family-link-row p{margin:4px 0;font-size:13px}.family-link-row button{margin-top:8px}.family-school-dialog .meta{margin:5px 0 0}@media(max-width:650px){.family-grid,.family-student-choices{grid-template-columns:1fr}}`;
    document.head.append(css);
    const get = id => document.getElementById(id);
    const esc = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const error = message => { const box = get('familySchoolError'); box.textContent = message; box.classList.toggle('hidden', !message); };
    const schoolId = () => window.getActiveSchoolId?.();
    let currentSchool = null;
    let inviteRows = [];
    let occurrenceRows = [];
    const selectedStudentIds = new Set();
    const close = () => { dialog.classList.add('hidden'); document.dispatchEvent(new Event('carometro:family-school-closed')); };
    get('familySchoolClose').onclick = close;
    dialog.onclick = event => { if (event.target === dialog) close(); };
    function refreshNav() {
      button.hidden = app.classList.contains('hidden') || !['school_admin','coordinator'].includes(window.getActiveSchoolRole?.());
    }
    new MutationObserver(refreshNav).observe(app, { attributes:true, attributeFilter:['class'] });
    document.addEventListener('carometro:school-context-ready', refreshNav);
    refreshNav();
    function renderStudentChoices() {
      const search = get('familyStudentSearch').value.trim().toLocaleLowerCase('pt-BR');
      const matches = inviteRows.filter(row => row.full_name.toLocaleLowerCase('pt-BR').includes(search)).slice(0,100);
      get('familyStudentChoices').innerHTML = matches.length ? matches.map(row => `<label><input type="checkbox" value="${row.id}" ${selectedStudentIds.has(row.id) ? 'checked' : ''}><span>${esc(row.full_name)}<small>${esc(row.class_name || '')}</small></span></label>`).join('') : '<p class="meta">Nenhum aluno encontrado.</p>';
    }
    get('familyStudentSearch').oninput = renderStudentChoices;
    get('familyStudentChoices').onchange = event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked) selectedStudentIds.add(input.value);
      else selectedStudentIds.delete(input.value);
    };
    async function loadOverview() {
      const { data, error: requestError } = await db.rpc('family_school_overview', { p_school_id:currentSchool });
      if (requestError) throw requestError;
      const grouped = new Map();
      for (const row of data || []) {
        if (!grouped.has(row.link_id)) grouped.set(row.link_id, { row, messages:[] });
        if (row.message_id) grouped.get(row.link_id).messages.push(row);
      }
      get('familySchoolOverview').innerHTML = grouped.size ? [...grouped.values()].map(({ row, messages }) => `
        <article class="family-link-row"><b>${esc(row.guardian_name)}</b> · ${esc(row.student_name)}
        <p>${esc(row.phone_e164)} · ${row.link_status === 'active' ? 'Ativo' : row.link_status === 'pending' ? 'Convite pendente' : 'Revogado'}</p>
        ${messages.map(m => `<p>${esc(m.message_title)}: ${m.acknowledged_at ? 'Ciência confirmada' : m.viewed_at ? 'Visualizada' : 'Aguardando leitura'}
          <button class="btn secondary" type="button" data-withdraw="${esc(m.message_id)}">Retirar publicação</button>
          </p>`).join('')}
        ${row.link_status !== 'revoked' ? `<button class="btn secondary" type="button" data-revoke="${esc(row.link_id)}">Revogar acesso</button>` : ''}</article>`).join('') : '<p class="meta">Nenhum responsável vinculado nesta escola.</p>';
    }
    button.onclick = async () => {
      error('');
      currentSchool = schoolId();
      if (!currentSchool) return;
      selectedStudentIds.clear();
      get('familyStudentSearch').value = '';
      get('familyInviteResult').classList.add('hidden');
      get('familyInviteUrl').value = '';
      const check = await db.rpc('family_school_manager', { p_school_id:currentSchool });
      if (check.error || check.data !== true) { error('Apenas a administração desta escola pode gerenciar o portal.'); return; }
      dialog.classList.remove('hidden');
      try {
        const [studentResult, occurrenceResult] = await Promise.all([
          db.from('students').select('id,full_name,class_name').eq('school_id',currentSchool).eq('enrollment_status','active').order('full_name'),
          db.from('student_occurrences').select('id,student_id,occurred_on,occurrence_text').eq('school_id',currentSchool).order('created_at',{ ascending:false }).limit(100)
        ]);
        if (studentResult.error) throw studentResult.error;
        if (occurrenceResult.error) throw occurrenceResult.error;
        inviteRows = studentResult.data || [];
        occurrenceRows = occurrenceResult.data || [];
        const names = new Map(inviteRows.map(s => [s.id,s.full_name]));
        renderStudentChoices();
        get('familyOccurrence').innerHTML = '<option value="">Selecione</option>' + occurrenceRows.map(o => `<option value="${o.id}">${esc(names.get(o.student_id) || 'Aluno')} · ${esc(o.occurred_on)} · ${esc(o.occurrence_text.slice(0,50))}</option>`).join('');
        await loadOverview();
        document.dispatchEvent(new CustomEvent('carometro:family-school-opened', { detail:{ schoolId:currentSchool } }));
      } catch (caught) { error(caught.message || 'Não foi possível carregar o Portal da Família.'); }
    };
    get('familyInviteForm').onsubmit = async event => {
      event.preventDefault(); error('');
      const students = [...selectedStudentIds];
      const phone = get('familyPhone').value.trim();
      const name = get('familyGuardianName').value.trim();
      if (!students.length || students.some(id => !inviteRows.some(row => row.id === id))) return error('Selecione os filhos autorizados nesta escola.');
      const submit = event.submitter; submit.disabled = true;
      try {
        const { data, error: requestError } = await db.rpc('family_create_invitation_bundle', { p_school_id:currentSchool,p_student_ids:students,p_name:name,p_phone:phone });
        if (requestError) throw requestError;
        const token = data?.[0]?.invitation_token;
        if (!token) throw new Error('Convite criado, mas o link não foi retornado.');
        get('familyInviteUrl').value = new URL(`familia.html?token=${encodeURIComponent(token)}`, location.href).href;
        if (typeof window.qrcode === 'function') {
          const qr = window.qrcode(0,'M');
          qr.addData(get('familyInviteUrl').value);
          qr.make();
          get('familyInviteQr').innerHTML = qr.createSvgTag({ cellSize:4, margin:8, scalable:true });
        } else get('familyInviteQr').textContent = 'QR Code indisponível. Copie o link do convite.';
        get('familyInviteResult').classList.remove('hidden');
        selectedStudentIds.clear(); renderStudentChoices();
        await loadOverview();
      } catch (caught) { error(caught.message || 'Não foi possível criar o convite.'); }
      finally { submit.disabled = false; }
    };
    get('familyCopyInvite').onclick = async () => { try { await navigator.clipboard.writeText(get('familyInviteUrl').value); } catch { get('familyInviteUrl').select(); document.execCommand('copy'); } };
    get('familyPublishForm').onsubmit = async event => {
      event.preventDefault(); error('');
      const occurrence = get('familyOccurrence').value;
      if (!occurrenceRows.some(row => row.id === occurrence)) return error('Selecione uma ocorrência desta escola.');
      const submit = event.submitter; submit.disabled = true;
      try {
        const { error: requestError } = await db.rpc('family_publish_occurrence', { p_school_id:currentSchool,p_occurrence_id:occurrence,p_title:get('familyMessageTitle').value.trim(),p_body:get('familyMessageBody').value.trim() });
        if (requestError) throw requestError;
        get('familyPublishForm').reset();
        await loadOverview();
      } catch (caught) { error(caught.message || 'Não foi possível publicar.'); }
      finally { submit.disabled = false; }
    };
    get('familySchoolOverview').onclick = async event => {
      const revoke = event.target.closest('[data-revoke]');
      const withdraw = event.target.closest('[data-withdraw]');
      if (!revoke && !withdraw) return;
      if (!confirm(revoke ? 'Revogar agora o acesso deste responsável? O histórico de ciência será preservado.' : 'Retirar esta comunicação da área da família? O histórico de ciência será preservado.')) return;
      const action = revoke || withdraw;
      action.disabled = true; error('');
      try {
        const { error: requestError } = revoke
          ? await db.rpc('family_revoke_link', { p_school_id:currentSchool,p_link_id:revoke.dataset.revoke })
          : await db.rpc('family_withdraw_message', { p_school_id:currentSchool,p_message_id:withdraw.dataset.withdraw });
        if (requestError) throw requestError;
        await loadOverview();
      } catch (caught) { error(caught.message || 'Não foi possível concluir.'); action.disabled = false; }
    };
  });
})();
