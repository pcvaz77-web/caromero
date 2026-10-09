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
      <div class="modal-head"><div><h3 id="familySchoolTitle">Portal da Família</h3><p class="meta">Escolha o que deseja fazer nesta escola.</p></div><button class="close" type="button" id="familySchoolClose" aria-label="Fechar">×</button></div>
      <div class="form family-school-content"><p id="familySchoolError" class="error hidden" role="alert"></p>
        <section id="familyHome" class="family-workspace-home"><h4>O que você deseja fazer?</h4><div class="family-workspace-choices"><button type="button" data-family-view="invite"><strong>Convidar responsável</strong><span>Escolha os filhos e mostre o QR Code de acesso à família.</span></button><button type="button" data-family-view="occurrence"><strong>Compartilhar ocorrência</strong><span>Encontre o aluno e escolha qual ocorrência publicar.</span></button><button type="button" data-family-view="entry"><strong>Entrada dos alunos</strong><span>Leia carteirinhas pela câmera e imprima os cartões.</span></button></div></section>
        <section id="familyInviteView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body">
          <form id="familyInviteForm"><h4>Convidar responsável</h4><p class="meta">Confirme a identidade do responsável antes de mostrar o QR Code. Selecione até 10 filhos, inclusive de turmas diferentes, para um único convite.</p><div class="family-grid"><label>Nome do responsável<input id="familyGuardianName" maxlength="160" required></label><label>Celular com DDI<input id="familyPhone" type="tel" placeholder="+5562999999999" pattern="\\+[1-9][0-9]{7,14}" required></label></div><div class="family-grid"><label>Turno<select id="familyInviteShift"><option value="">Selecione o turno</option></select></label><label>Turma<select id="familyInviteClass" disabled><option value="">Selecione o turno primeiro</option></select></label></div><label for="familyStudentSearch">Alunos da turma</label><input id="familyStudentSearch" type="search" placeholder="Buscar aluno nesta turma" disabled><div id="familyStudentChoices" class="family-student-choices"><p class="meta">Selecione o turno e a turma para ver os alunos.</p></div><div id="familySelectedStudents" class="family-selected-students" aria-live="polite"></div><button class="btn primary" type="submit">Gerar convite por QR Code</button></form>
          <div id="familyInviteResult" class="family-invite-result hidden"><strong>Convite individual criado</strong><p>Mostre este QR Code ao responsável na escola. Ele vale por 15 minutos e só pode ser usado uma vez. Não o coloque na carteirinha do aluno.</p><div id="familyInviteQr" class="family-invite-qr" aria-label="QR Code do convite"></div><input id="familyInviteUrl" readonly aria-label="Link do convite"><button class="btn secondary" type="button" id="familyCopyInvite">Copiar link</button></div>
          <section><h4>Vínculos e ciência</h4><div id="familySchoolOverview" class="family-overview" aria-live="polite"></div></section>
        </div></section>
        <section id="familyOccurrenceView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body">
          <form id="familyPublishForm"><h4>Compartilhar ocorrência</h4><p class="meta">Escolha turno, turma, aluno e ocorrência. A descrição interna não é copiada; escreva o texto que a família poderá ler.</p><div class="family-grid"><label>Turno<select id="familyOccurrenceShift"><option value="">Selecione o turno</option></select></label><label>Turma<select id="familyOccurrenceClass" disabled><option value="">Selecione o turno primeiro</option></select></label></div><div class="family-grid"><label>Aluno<select id="familyOccurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></label><label>Ocorrência<select id="familyOccurrence" disabled required><option value="">Selecione o aluno primeiro</option></select></label></div><p id="familyOccurrenceAudience" class="meta" role="status"></p><div class="family-grid"><label>Título<input id="familyMessageTitle" maxlength="160" required></label></div><label>Mensagem para a família<textarea id="familyMessageBody" maxlength="2000" required></textarea></label><button class="btn primary" type="submit">Publicar para a família</button></form>
        </div></section>
        <section id="familyEntryView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body" id="familyEntryMount"></div></section>
      </div></section>`;
    document.body.append(dialog);
    const css = document.createElement('style');
    css.textContent = `#familySchoolModal{z-index:230}.family-school-dialog{width:min(900px,100%)}.family-school-content{display:grid;gap:26px;min-width:0}.family-school-content form{padding-bottom:20px;border-bottom:1px solid #e4e7ec;min-width:0}.family-school-content h4{margin:0 0 13px;font-size:16px}.family-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.family-school-content label{display:block;min-width:0}.family-school-content label input,.family-school-content label select,.family-school-content textarea{margin-top:7px}.family-student-choices{max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0 16px}.family-student-choices label{display:flex;align-items:center;gap:9px;margin:0;padding:9px;border:1px solid #dce5f1;border-radius:9px;font-size:13px;font-weight:650;min-width:0;overflow-wrap:anywhere}.family-student-choices label:has(input:checked){border-color:#4569da;background:#eef3ff}.family-student-choices input{width:18px!important;height:18px;min-height:0;margin:0!important;flex:none}.family-student-choices small{display:block;color:#667085}.family-selected-students{margin:-4px 0 16px;min-width:0}.family-selected-students strong{display:block;font-size:13px;margin-bottom:8px}.family-selected-students button{background:#eef3ff;color:#264aac;border-radius:99px;padding:7px 10px;margin:0 6px 6px 0;font-size:12px;font-weight:700;max-width:100%;overflow-wrap:anywhere}.family-invite-result{padding:16px;border-radius:10px;background:#f1f6ff;min-width:0}.family-invite-result p{font-size:13px}.family-invite-result input{margin-bottom:10px}.family-invite-qr svg{display:block;width:200px;height:200px;max-width:100%;margin:14px auto;background:#fff}.family-overview{display:grid;gap:9px}.family-link-row{padding:12px;border:1px solid #dce5f1;border-radius:9px;overflow-wrap:anywhere}.family-link-row p{margin:4px 0;font-size:13px}.family-link-row button{margin-top:8px}.family-school-dialog .meta{margin:5px 0 0}@media(max-width:650px){#familySchoolModal{padding:0;place-items:stretch}.family-school-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0;box-shadow:none;overscroll-behavior:contain}.family-school-dialog .modal-head{padding:16px;gap:8px}.family-school-dialog .form{padding:18px 16px 40px}.family-grid,.family-student-choices{grid-template-columns:1fr}.family-school-content{gap:20px}.family-school-content .btn{max-width:100%}.family-invite-result input{min-width:0}.family-school-dialog .close{flex:none;min-width:42px;min-height:42px}}`;
    css.textContent += `#familySchoolModal{padding:0;place-items:stretch}.family-school-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0;box-shadow:none;display:flex;flex-direction:column;overflow:hidden}.family-school-dialog .modal-head{flex:none;background:#fff}.family-school-content{display:block;flex:1;overflow:auto;overscroll-behavior:contain}.family-workspace-home{max-width:1120px;margin:clamp(12px,5vh,55px) auto}.family-workspace-home h4{font-size:20px;margin-bottom:18px}.family-workspace-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.family-workspace-choices button{min-width:0;min-height:156px;padding:23px;text-align:left;border:1px solid #dce5f5;border-radius:16px;background:linear-gradient(135deg,#fff,#f1f5ff);color:#17233a;box-shadow:0 8px 24px #17233a0d}.family-workspace-choices button:hover,.family-workspace-choices button:focus-visible{border-color:#4566d9;box-shadow:0 9px 25px #4566d926;outline:none}.family-workspace-choices strong{display:block;font-size:18px;line-height:1.3}.family-workspace-choices span{display:block;margin-top:13px;color:#5b6a84;font-size:14px;line-height:1.5}.family-view{min-width:0}.family-view-body{max-width:940px;margin:0 auto;display:grid;gap:22px}.family-back{position:sticky;top:0;z-index:2;display:inline-flex;align-items:center;min-height:43px;margin:-5px 0 18px;padding:9px 13px;border:1px solid #dce5f5;border-radius:9px;background:#fff;color:#3156b2;font-weight:750}.family-view-body>form{border-bottom:0}.family-entry-view .family-view-body{max-width:940px}@media(max-width:800px){.family-workspace-choices{grid-template-columns:1fr}.family-workspace-choices button{min-height:105px}.family-workspace-home{margin:10px auto}.family-workspace-home h4{font-size:18px}}@media(max-width:650px){.family-school-content{padding:18px 16px 40px}.family-workspace-choices{gap:12px}.family-workspace-choices button{padding:18px}.family-view-body{gap:18px}.family-back{width:100%;margin:0 0 16px}.family-school-dialog .modal-head{padding:16px}}`;
    document.head.append(css);
    const get = id => document.getElementById(id);
    const esc = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const error = message => { const box = get('familySchoolError'); box.textContent = message; box.classList.toggle('hidden', !message); if (message && !dialog.classList.contains('hidden')) box.scrollIntoView({ block:'nearest' }); };
    const schoolId = () => window.getActiveSchoolId?.();
    let currentSchool = null;
    let inviteRows = [];
    let inviteClasses = [];
    const knownStudents = new Map();
    let occurrenceRows = [];
    let activeStudentIds = new Set();
    let activeLinksReady = false;
    const selectedStudentIds = new Set();
    let currentView = 'home';
    const close = () => { dialog.classList.add('hidden'); document.dispatchEvent(new Event('carometro:family-school-closed')); };
    get('familySchoolClose').onclick = close;
    dialog.onclick = event => { if (event.target === dialog) close(); };
    function showView(view) {
      if (currentView === 'entry' && view !== 'entry') document.dispatchEvent(new Event('carometro:family-entry-hidden'));
      currentView = view;
      get('familyHome').classList.toggle('hidden',view !== 'home');
      for (const name of ['invite','occurrence','entry']) get(`family${name[0].toUpperCase()+name.slice(1)}View`).classList.toggle('hidden',view !== name);
      error('');
      get('familySchoolModal').querySelector('.family-school-content').scrollTop = 0;
      if (view === 'entry') document.dispatchEvent(new CustomEvent('carometro:family-school-opened', { detail:{ schoolId:currentSchool } }));
      if (view === 'occurrence') activeLinksReady = false;
      if (view === 'invite' || view === 'occurrence') loadOverview().then(() => {
        if (view === 'occurrence') { activeLinksReady = true; updateOccurrenceAudience(); }
      }).catch(caught => error(caught.message || 'Não foi possível consultar os vínculos da família.'));
    }
    get('familyHome').onclick = event => {
      const choice = event.target.closest('[data-family-view]');
      if (choice) showView(choice.dataset.familyView);
    };
    dialog.querySelectorAll('[data-family-back]').forEach(back => back.onclick = () => showView('home'));
    function refreshNav() {
      button.hidden = app.classList.contains('hidden') || !['school_admin','coordinator'].includes(window.getActiveSchoolRole?.());
    }
    new MutationObserver(refreshNav).observe(app, { attributes:true, attributeFilter:['class'] });
    document.addEventListener('carometro:school-context-ready', refreshNav);
    refreshNav();
    function renderStudentChoices() {
      if (!get('familyInviteClass').value) {
        get('familyStudentChoices').innerHTML = '<p class="meta">Selecione o turno e a turma para ver os alunos.</p>';
        return;
      }
      const search = get('familyStudentSearch').value.trim().toLocaleLowerCase('pt-BR');
      const matches = inviteRows.filter(row => row.full_name.toLocaleLowerCase('pt-BR').includes(search));
      get('familyStudentChoices').innerHTML = matches.length ? matches.map(row => `<label><input type="checkbox" value="${row.id}" ${selectedStudentIds.has(row.id) ? 'checked' : ''}><span>${esc(row.full_name)}<small>${esc(row.class_name || '')}</small></span></label>`).join('') : '<p class="meta">Nenhum aluno encontrado nesta turma.</p>';
    }
    function renderSelectedStudents() {
      const selected = [...selectedStudentIds].map(id => knownStudents.get(id)).filter(Boolean);
      get('familySelectedStudents').innerHTML = selected.length
        ? `<strong>${selected.length} ${selected.length === 1 ? 'filho selecionado' : 'filhos selecionados'} para este convite</strong>${selected.map(row => `<button type="button" data-remove-student="${row.id}" aria-label="Retirar ${esc(row.full_name)}">${esc(row.full_name)} · ${esc(row.class_name || '')} ×</button>`).join('')}`
        : '<p class="meta">Nenhum filho selecionado. Você pode escolher alunos de outras turmas sem perder os anteriores.</p>';
    }
    get('familyStudentSearch').oninput = renderStudentChoices;
    get('familySelectedStudents').onclick = event => {
      const remove = event.target.closest('[data-remove-student]');
      if (!remove) return;
      selectedStudentIds.delete(remove.dataset.removeStudent);
      renderStudentChoices(); renderSelectedStudents();
    };
    get('familyStudentChoices').onchange = event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked && selectedStudentIds.size >= 10) {
        input.checked = false;
        error('Um convite pode incluir até 10 filhos.');
        return;
      }
      if (input.checked) selectedStudentIds.add(input.value);
      else selectedStudentIds.delete(input.value);
      error(''); renderSelectedStudents();
    };
    get('familyInviteShift').onchange = () => {
      classLoadId++;
      const shift = get('familyInviteShift').value;
      const classSelect = get('familyInviteClass');
      classSelect.disabled = !shift;
      classSelect.innerHTML = `<option value="">${shift ? 'Selecione a turma' : 'Selecione o turno primeiro'}</option>`
        + inviteClasses.filter(row => row.shift === shift).map(row => `<option value="${row.id}">${esc(row.name)}</option>`).join('');
      inviteRows = [];
      get('familyStudentSearch').value = '';
      get('familyStudentSearch').disabled = true;
      renderStudentChoices();
    };
    let classLoadId = 0;
    get('familyInviteClass').onchange = async () => {
      const loadId = ++classLoadId;
      const activeSchool = currentSchool;
      const classId = get('familyInviteClass').value;
      inviteRows = [];
      get('familyStudentSearch').value = '';
      get('familyStudentSearch').disabled = !classId;
      if (!classId) return renderStudentChoices();
      get('familyStudentChoices').innerHTML = '<p class="meta">Carregando alunos da turma…</p>';
      try {
        const rows = [];
        for (let start = 0; ; start += 500) {
          const { data, error: requestError } = await db.from('students').select('id,full_name,class_id,class_name')
            .eq('school_id',activeSchool).eq('class_id',classId).eq('enrollment_status','active')
            .order('full_name').range(start,start+499);
          if (requestError) throw requestError;
          if (loadId !== classLoadId || activeSchool !== currentSchool || classId !== get('familyInviteClass').value) return;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        const className = inviteClasses.find(row => row.id === classId)?.name || '';
        inviteRows = rows.map(row => ({ ...row, class_name:className }));
        inviteRows.forEach(row => knownStudents.set(row.id,row));
        renderStudentChoices();
      } catch (caught) {
        if (loadId !== classLoadId || activeSchool !== currentSchool) return;
        get('familyStudentChoices').innerHTML = '<p class="meta">Não foi possível carregar os alunos desta turma.</p>';
        error(caught.message || 'Não foi possível carregar os alunos desta turma.');
      }
    };
    let occurrenceLoadId = 0;
    function updateOccurrenceAudience() {
      const studentId = get('familyOccurrenceStudent').value;
      const node = get('familyOccurrenceAudience');
      node.textContent = !studentId ? '' : !activeLinksReady ? 'Conferindo responsáveis autorizados…'
        : activeStudentIds.has(studentId) ? 'Este aluno tem responsável com acesso ativo ao Portal da Família.'
        : 'Este aluno ainda não tem responsável com acesso ativo. Convide o responsável antes de compartilhar.';
    }
    function resetOccurrenceFilters() {
      occurrenceLoadId++;
      occurrenceRows = [];
      get('familyOccurrenceShift').value = '';
      get('familyOccurrenceClass').innerHTML = '<option value="">Selecione o turno primeiro</option>';
      get('familyOccurrenceClass').disabled = true;
      get('familyOccurrenceStudent').innerHTML = '<option value="">Selecione a turma primeiro</option>';
      get('familyOccurrenceStudent').disabled = true;
      get('familyOccurrence').innerHTML = '<option value="">Selecione o aluno primeiro</option>';
      get('familyOccurrence').disabled = true;
      updateOccurrenceAudience();
    }
    get('familyOccurrenceShift').onchange = () => {
      const shift = get('familyOccurrenceShift').value;
      occurrenceLoadId++;
      occurrenceRows = [];
      get('familyOccurrenceClass').disabled = !shift;
      get('familyOccurrenceClass').innerHTML = `<option value="">${shift ? 'Selecione a turma' : 'Selecione o turno primeiro'}</option>`
        + inviteClasses.filter(row => row.shift === shift).map(row => `<option value="${row.id}">${esc(row.name)}</option>`).join('');
      get('familyOccurrenceStudent').innerHTML = '<option value="">Selecione a turma primeiro</option>';
      get('familyOccurrenceStudent').disabled = true;
      get('familyOccurrence').innerHTML = '<option value="">Selecione o aluno primeiro</option>';
      get('familyOccurrence').disabled = true;
      updateOccurrenceAudience();
    };
    get('familyOccurrenceClass').onchange = async () => {
      const loadId = ++occurrenceLoadId;
      const activeSchool = currentSchool;
      const classId = get('familyOccurrenceClass').value;
      occurrenceRows = [];
      get('familyOccurrenceStudent').innerHTML = '<option value="">Carregando alunos…</option>';
      get('familyOccurrenceStudent').disabled = true;
      get('familyOccurrence').innerHTML = '<option value="">Selecione o aluno primeiro</option>';
      get('familyOccurrence').disabled = true;
      updateOccurrenceAudience();
      if (!classId) {
        get('familyOccurrenceStudent').innerHTML = '<option value="">Selecione a turma primeiro</option>';
        return;
      }
      try {
        const rows = [];
        for (let start = 0; ; start += 500) {
          const { data, error: requestError } = await db.from('students').select('id,full_name')
            .eq('school_id',activeSchool).eq('class_id',classId).eq('enrollment_status','active')
            .order('full_name').range(start,start+499);
          if (requestError) throw requestError;
          if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        get('familyOccurrenceStudent').innerHTML = '<option value="">Selecione o aluno</option>'
          + rows.map(row => `<option value="${row.id}">${esc(row.full_name)}</option>`).join('');
        get('familyOccurrenceStudent').disabled = !rows.length;
      } catch (caught) {
        if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
        get('familyOccurrenceStudent').innerHTML = '<option value="">Não foi possível carregar os alunos</option>';
        error(caught.message || 'Não foi possível carregar os alunos.');
      }
    };
    get('familyOccurrenceStudent').onchange = async () => {
      const loadId = ++occurrenceLoadId;
      const activeSchool = currentSchool;
      const studentId = get('familyOccurrenceStudent').value;
      occurrenceRows = [];
      get('familyOccurrence').innerHTML = '<option value="">Carregando ocorrências…</option>';
      get('familyOccurrence').disabled = true;
      updateOccurrenceAudience();
      if (!studentId) {
        get('familyOccurrence').innerHTML = '<option value="">Selecione o aluno primeiro</option>';
        return;
      }
      try {
        const rows = [];
        for (let start = 0; ; start += 500) {
          const { data, error: requestError } = await db.from('student_occurrences')
            .select('id,student_id,occurred_on,occurrence_text').eq('school_id',activeSchool)
            .eq('student_id',studentId).order('created_at',{ ascending:false }).range(start,start+499);
          if (requestError) throw requestError;
          if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        occurrenceRows = rows;
        get('familyOccurrence').innerHTML = '<option value="">Selecione a ocorrência</option>'
          + rows.map(row => `<option value="${row.id}">${esc(row.occurred_on)} · ${esc(String(row.occurrence_text || '').slice(0,90))}</option>`).join('');
        get('familyOccurrence').disabled = !rows.length;
        if (!rows.length) get('familyOccurrenceAudience').textContent += ' Nenhuma ocorrência encontrada para este aluno.';
      } catch (caught) {
        if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
        get('familyOccurrence').innerHTML = '<option value="">Não foi possível carregar as ocorrências</option>';
        error(caught.message || 'Não foi possível carregar as ocorrências.');
      }
    };
    async function loadOverview() {
      const activeSchool = currentSchool;
      const { data, error: requestError } = await db.rpc('family_school_overview', { p_school_id:activeSchool });
      if (activeSchool !== currentSchool) return;
      if (requestError) throw requestError;
      activeStudentIds = new Set((data || []).filter(row => row.link_status === 'active').map(row => row.student_id));
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
        ${row.link_status !== 'revoked' ? `<button class="btn secondary" type="button" data-revoke="${esc(row.link_id)}">Revogar acesso</button>` : ''}
        <button class="btn secondary" type="button" data-remove-guardian="${esc(row.link_id)}">Excluir responsável desta escola</button></article>`).join('') : '<p class="meta">Nenhum responsável vinculado nesta escola.</p>';
    }
    button.onclick = async () => {
      error('');
      currentSchool = schoolId();
      if (!currentSchool) return;
      classLoadId++;
      selectedStudentIds.clear();
      knownStudents.clear();
      inviteRows = [];
      inviteClasses = [];
      occurrenceRows = [];
      activeStudentIds = new Set();
      activeLinksReady = false;
      get('familyInviteShift').innerHTML = '<option value="">Selecione o turno</option>';
      get('familyInviteClass').innerHTML = '<option value="">Selecione o turno primeiro</option>';
      get('familyInviteClass').disabled = true;
      get('familyStudentSearch').value = '';
      get('familyStudentSearch').disabled = true;
      renderStudentChoices(); renderSelectedStudents();
      get('familyInviteResult').classList.add('hidden');
      get('familyInviteUrl').value = '';
      get('familyPublishForm').reset();
      resetOccurrenceFilters();
      const check = await db.rpc('family_school_manager', { p_school_id:currentSchool });
      if (check.error || check.data !== true) { error('Apenas a administração desta escola pode gerenciar o portal.'); return; }
      dialog.classList.remove('hidden');
      showView('home');
      try {
        const classResult = await db.from('classes').select('id,name,shift').eq('school_id',currentSchool).is('archived_at',null).order('name');
        if (classResult.error) throw classResult.error;
        inviteClasses = classResult.data || [];
        const shifts = [...new Set(inviteClasses.map(row => row.shift).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
        const shiftOptions = '<option value="">Selecione o turno</option>' + shifts.map(shift => `<option value="${esc(shift)}">${esc(shift)}</option>`).join('');
        get('familyInviteShift').innerHTML = shiftOptions;
        get('familyOccurrenceShift').innerHTML = shiftOptions;
      } catch (caught) { error(caught.message || 'Não foi possível carregar o Portal da Família.'); }
    };
    get('familyInviteForm').onsubmit = async event => {
      event.preventDefault(); error('');
      const students = [...selectedStudentIds];
      const phone = get('familyPhone').value.trim();
      const name = get('familyGuardianName').value.trim();
      if (!students.length || students.length > 10 || students.some(id => !knownStudents.has(id))) return error('Selecione de 1 a 10 filhos autorizados nesta escola.');
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
        selectedStudentIds.clear(); renderStudentChoices(); renderSelectedStudents();
        await loadOverview();
      } catch (caught) { error(caught.message || 'Não foi possível criar o convite.'); }
      finally { submit.disabled = false; }
    };
    get('familyCopyInvite').onclick = async () => { try { await navigator.clipboard.writeText(get('familyInviteUrl').value); } catch { get('familyInviteUrl').select(); document.execCommand('copy'); } };
    get('familyPublishForm').onsubmit = async event => {
      event.preventDefault(); error('');
      const occurrence = get('familyOccurrence').value;
      const studentId = get('familyOccurrenceStudent').value;
      if (!studentId || !occurrenceRows.some(row => row.id === occurrence && row.student_id === studentId)) return error('Selecione uma ocorrência do aluno escolhido.');
      const submit = event.submitter; submit.disabled = true;
      try {
        const activeSchool = currentSchool;
        await loadOverview();
        if (activeSchool !== currentSchool) throw new Error('A escola ativa mudou. Abra a tela novamente.');
        if (!activeStudentIds.has(studentId)) throw new Error('Este aluno ainda não tem responsável com acesso ativo ao Portal da Família.');
        const { error: requestError } = await db.rpc('family_publish_occurrence', { p_school_id:currentSchool,p_occurrence_id:occurrence,p_title:get('familyMessageTitle').value.trim(),p_body:get('familyMessageBody').value.trim() });
        if (requestError) throw requestError;
        get('familyPublishForm').reset();
        resetOccurrenceFilters();
        get('familyOccurrenceAudience').textContent = 'Ocorrência publicada no Portal da Família dos responsáveis autorizados.';
      } catch (caught) { error(caught.message || 'Não foi possível publicar.'); }
      finally { submit.disabled = false; }
    };
    get('familySchoolOverview').onclick = async event => {
      const revoke = event.target.closest('[data-revoke]');
      const withdraw = event.target.closest('[data-withdraw]');
      const remove = event.target.closest('[data-remove-guardian]');
      if (!revoke && !withdraw && !remove) return;
      const question = remove
        ? 'Excluir este responsável desta escola? Todos os vínculos deste celular nesta escola serão revogados e ocultados. O histórico de ciência e o acesso a outras escolas serão preservados.'
        : revoke
          ? 'Revogar agora o acesso deste responsável? O histórico de ciência será preservado.'
          : 'Retirar esta comunicação da área da família? O histórico de ciência será preservado.';
      if (!confirm(question)) return;
      const action = revoke || withdraw || remove;
      action.disabled = true; error('');
      try {
        const activeSchool = currentSchool;
        const { error: requestError } = remove
          ? await db.rpc('family_remove_school_guardian', { p_school_id:activeSchool,p_link_id:remove.dataset.removeGuardian })
          : revoke
            ? await db.rpc('family_revoke_link', { p_school_id:activeSchool,p_link_id:revoke.dataset.revoke })
            : await db.rpc('family_withdraw_message', { p_school_id:activeSchool,p_message_id:withdraw.dataset.withdraw });
        if (requestError) throw requestError;
        if (activeSchool !== currentSchool) throw new Error('A escola ativa mudou. Abra a tela novamente.');
        await loadOverview();
      } catch (caught) { error(caught.message || 'Não foi possível concluir.'); action.disabled = false; }
    };
  });
})();
