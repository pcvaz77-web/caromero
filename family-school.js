(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    const nav = document.querySelector('.side .nav');
    if (!app || !nav || typeof db === 'undefined') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '⌂  Portal da Família';
    button.hidden = true;
    button.classList.add('hidden');
    nav.append(button);
    const dialog = document.createElement('div');
    dialog.className = 'modal-bg hidden';
    dialog.id = 'familySchoolModal';
    dialog.innerHTML = `<section class="modal family-school-dialog" role="dialog" aria-modal="true" aria-labelledby="familySchoolTitle">
      <div class="modal-head"><div><h3 id="familySchoolTitle">Portal da Família</h3><p class="meta">Escolha o que deseja fazer nesta escola.</p></div><button class="close" type="button" id="familySchoolClose" aria-label="Fechar">×</button></div>
      <div class="form family-school-content"><p id="familySchoolError" class="error hidden" role="alert"></p>
        <section id="familyHome" class="family-workspace-home"><h4>O que você deseja fazer?</h4><div class="family-workspace-choices"><button type="button" data-family-view="invite"><strong>Convidar responsável</strong><span>Escolha os filhos e mostre o QR Code de acesso à família.</span></button><button type="button" data-family-view="addChild"><strong>Acrescentar filho</strong><span>Vincule um novo aluno a uma conta que já está ativa, sem outro QR Code.</span></button><button type="button" data-family-view="occurrence"><strong>Compartilhar ocorrência</strong><span>Encontre o aluno e escolha qual ocorrência publicar.</span></button><button type="button" data-family-view="entry"><strong>Entrada dos alunos</strong><span>Leia a carteirinha pela câmera e registre a chegada.</span></button><button type="button" data-family-view="cards"><strong>Gerenciar carteirinhas</strong><span>Imprima por turma ou aluno e substitua cartões perdidos.</span></button></div></section>
        <section id="familyInviteView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body">
          <div class="family-cpf-tabs"><button class="btn primary" id="familyModeIndividual" type="button">Convite individual</button><button class="btn secondary" id="familyModeGeneral" type="button">Cadastro pelo QR geral</button></div>
          <form id="familyInviteForm"><h4>Convidar responsável</h4><p class="meta">Cadastre o responsável e selecione até 10 filhos, inclusive de turmas diferentes. Ao ler o QR individual, ele confirmará nome e CPF.</p><div class="family-grid" id="familyInviteIdentity"><label>Nome completo do responsável<input id="familyGuardianName" maxlength="160" required></label><label>CPF do responsável<input id="familyIndividualCpf" type="text" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" required></label><label>Celular com DDD<input id="familyPhone" type="tel" inputmode="tel" maxlength="15" placeholder="(62) 99999-9999" required></label></div><div class="family-grid"><label>Turno<select id="familyInviteShift"><option value="">Selecione o turno</option></select></label><label>Turma<select id="familyInviteClass" disabled><option value="">Selecione o turno primeiro</option></select></label></div><label for="familyStudentSearch">Alunos da turma</label><input id="familyStudentSearch" type="search" placeholder="Buscar aluno nesta turma" disabled><div id="familyStudentChoices" class="family-student-choices"><p class="meta">Selecione o turno e a turma para ver os alunos.</p></div><div id="familySelectedStudents" class="family-selected-students" aria-live="polite"></div><button class="btn primary" id="familyInviteSubmit" type="submit">Gerar convite por QR Code</button></form>
          <div id="familyInviteResult" class="family-invite-result hidden"><strong>Convite individual criado</strong><p>Mostre este QR Code ao responsável na escola. Ele vale por 15 minutos e só pode ser usado uma vez. Não o coloque na carteirinha do aluno.</p><p id="familyInviteContactStatus" class="meta" role="status"></p><div id="familyInviteQr" class="family-invite-qr" aria-label="QR Code do convite"></div><input id="familyInviteUrl" readonly aria-label="Link do convite"><button class="btn secondary" type="button" id="familyCopyInvite">Copiar link</button></div>
          <section class="family-cpf-section hidden" id="familyCpfSection"><h4>Cadastro para o QR geral</h4><p class="meta">Use os filtros de turno e turma acima, selecione os filhos e informe o responsável. O celular é salvo na ficha dos alunos; não é usado para confirmar a identidade.</p><label>Nome completo do responsável<input id="familyCpfNameSchool" type="text" maxlength="160" autocomplete="off"></label><label>CPF do responsável<input id="familyCpf" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00"></label><label>Celular com DDD<input id="familyCpfPhone" type="tel" inputmode="tel" maxlength="15" placeholder="(62) 99999-9999"></label><button class="btn primary" type="button" id="familySaveCpf">Cadastrar responsável e filhos</button><p id="familyCpfStatus" class="meta" role="status"></p><div class="family-general-qr"><strong>QR Code geral desta escola</strong><p class="meta">Pode ser impresso ou compartilhado. Não contém CPF nem dados dos alunos.</p><div id="familyGeneralQr" class="family-invite-qr" aria-label="QR Code geral"></div><input id="familyGeneralUrl" readonly aria-label="Link geral do cadastro"><button class="btn secondary" type="button" id="familyCopyGeneral">Copiar link</button> <button class="btn secondary" type="button" id="familyPrintGeneral">Imprimir QR Code</button></div><h4>Responsáveis desta turma e seus filhos na escola</h4><div id="familyCpfRoster" class="family-overview" aria-live="polite"><p class="meta">Selecione uma turma para ver os cadastros.</p></div></section>
          <section class="family-cpf-section hidden" id="familyCpfSearchSection"><h4>Localizar cadastro para excluir</h4><p class="meta">Encontre também responsáveis de alunos transferidos ou fora das turmas atuais.</p><label>CPF do responsável<input id="familyCpfSearch" type="text" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000.000.000-00"></label><button class="btn secondary" type="button" id="familyCpfSearchButton">Buscar cadastro</button><div id="familyCpfSearchResults" class="family-overview" aria-live="polite"></div></section>
          <section><h4>Vínculos e ciência</h4><div id="familySchoolOverview" class="family-overview" aria-live="polite"></div></section>
        </div></section>
        <section id="familyOccurrenceView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body">
          <form id="familyPublishForm"><h4>Compartilhar ocorrência</h4><p class="meta">Escolha turno, turma, aluno e ocorrência. A descrição interna não é copiada; escreva o texto que a família poderá ler.</p><div class="family-grid"><label>Turno<select id="familyOccurrenceShift"><option value="">Selecione o turno</option></select></label><label>Turma<select id="familyOccurrenceClass" disabled><option value="">Selecione o turno primeiro</option></select></label></div><label>Aluno<select id="familyOccurrenceStudent" disabled><option value="">Selecione a turma primeiro</option></select></label><fieldset class="family-occurrence-fieldset"><legend>Escolha a ocorrência</legend><input id="familyOccurrence" type="hidden"><div id="familyOccurrenceChoices" class="family-occurrence-choices" role="radiogroup" aria-label="Ocorrências do aluno"><p class="meta">Selecione o aluno primeiro.</p></div></fieldset><p id="familyOccurrenceAudience" class="meta" role="status"></p><div class="family-grid"><label>Título<input id="familyMessageTitle" maxlength="160" required></label></div><label>Mensagem para a família<textarea id="familyMessageBody" maxlength="2000" required></textarea></label><button class="btn primary" type="submit">Publicar para a família</button></form>
        </div></section>
        <section id="familyEntryView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body" id="familyEntryMount"></div></section>
        <section id="familyCardsView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body" id="familyCardsMount"></div></section>
        <section id="familyAddChildView" class="family-view hidden"><button type="button" class="family-back" data-family-back>← Portal da Família</button><div class="family-view-body"><div class="family-cpf-section">
          <h4>Acrescentar filho a uma conta existente</h4><p class="meta">O responsável já usa o Portal? Busque seu CPF, escolha o novo aluno e confirme. Ele não precisa ler outro QR Code.</p>
          <label>CPF do responsável<input id="familyAddChildCpf" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00"></label>
          <button class="btn secondary" type="button" id="familyAddChildSearch">Buscar responsável</button><div id="familyAddChildAccount" class="family-overview" role="status"></div>
          <div id="familyAddChildSelection" class="hidden"><div class="family-grid"><label>Turno<select id="familyAddChildShift"><option value="">Selecione o turno</option></select></label><label>Turma<select id="familyAddChildClass" disabled><option value="">Selecione o turno primeiro</option></select></label></div>
            <label>Buscar o novo aluno<input id="familyAddChildStudentSearch" type="search" placeholder="Digite o nome do aluno" disabled></label>
            <label>Novo aluno<select id="familyAddChildStudent" disabled><option value="">Selecione a turma primeiro</option></select></label>
            <button class="btn primary" id="familyAddChildSubmit" type="button">Acrescentar este filho à conta</button><p id="familyAddChildStatus" class="meta" role="status"></p>
          </div></div></div></section>
      </div></section>`;
    document.body.append(dialog);
    const css = document.createElement('style');
    css.textContent = `#familySchoolModal{z-index:230}.family-school-dialog{width:min(900px,100%)}.family-school-content{display:grid;gap:26px;min-width:0}.family-school-content form{padding-bottom:20px;border-bottom:1px solid #e4e7ec;min-width:0}.family-school-content h4{margin:0 0 13px;font-size:16px}.family-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.family-school-content label{display:block;min-width:0}.family-school-content label input,.family-school-content label select,.family-school-content textarea{margin-top:7px}.family-student-choices{max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0 16px}.family-student-choices label{display:flex;align-items:center;gap:9px;margin:0;padding:9px;border:1px solid #dce5f1;border-radius:9px;font-size:13px;font-weight:650;min-width:0;overflow-wrap:anywhere}.family-student-choices label:has(input:checked){border-color:#4569da;background:#eef3ff}.family-student-choices input{width:18px!important;height:18px;min-height:0;margin:0!important;flex:none}.family-student-choices small{display:block;color:#667085}.family-selected-students{margin:-4px 0 16px;min-width:0}.family-selected-students strong{display:block;font-size:13px;margin-bottom:8px}.family-selected-students button{background:#eef3ff;color:#264aac;border-radius:99px;padding:7px 10px;margin:0 6px 6px 0;font-size:12px;font-weight:700;max-width:100%;overflow-wrap:anywhere}.family-invite-result{padding:16px;border-radius:10px;background:#f1f6ff;min-width:0}.family-invite-result p{font-size:13px}.family-invite-result input{margin-bottom:10px}.family-invite-qr svg{display:block;width:200px;height:200px;max-width:100%;margin:14px auto;background:#fff}.family-overview{display:grid;gap:9px}.family-link-row{padding:12px;border:1px solid #dce5f1;border-radius:9px;overflow-wrap:anywhere}.family-link-row p{margin:4px 0;font-size:13px}.family-link-row button{margin-top:8px}.family-school-dialog .meta{margin:5px 0 0}@media(max-width:650px){#familySchoolModal{padding:0;place-items:stretch}.family-school-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0;box-shadow:none;overscroll-behavior:contain}.family-school-dialog .modal-head{padding:16px;gap:8px}.family-school-dialog .form{padding:18px 16px 40px}.family-grid,.family-student-choices{grid-template-columns:1fr}.family-school-content{gap:20px}.family-school-content .btn{max-width:100%}.family-invite-result input{min-width:0}.family-school-dialog .close{flex:none;min-width:42px;min-height:42px}}`;
    css.textContent += `#familySchoolModal{padding:0;place-items:stretch}.family-school-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0;box-shadow:none;display:flex;flex-direction:column;overflow:hidden}.family-school-dialog .modal-head{flex:none;background:#fff}.family-school-content{display:block;flex:1;overflow:auto;overscroll-behavior:contain}.family-workspace-home{max-width:1120px;margin:clamp(12px,5vh,55px) auto}.family-workspace-home h4{font-size:20px;margin-bottom:18px}.family-workspace-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.family-workspace-choices button{min-width:0;min-height:156px;padding:23px;text-align:left;border:1px solid #dce5f5;border-radius:16px;background:linear-gradient(135deg,#fff,#f1f5ff);color:#17233a;box-shadow:0 8px 24px #17233a0d}.family-workspace-choices button:hover,.family-workspace-choices button:focus-visible{border-color:#4566d9;box-shadow:0 9px 25px #4566d926;outline:none}.family-workspace-choices strong{display:block;font-size:18px;line-height:1.3}.family-workspace-choices span{display:block;margin-top:13px;color:#5b6a84;font-size:14px;line-height:1.5}.family-view{min-width:0}.family-view-body{max-width:940px;margin:0 auto;display:grid;gap:22px}.family-back{position:sticky;top:0;z-index:2;display:inline-flex;align-items:center;min-height:43px;margin:-5px 0 18px;padding:9px 13px;border:1px solid #dce5f5;border-radius:9px;background:#fff;color:#3156b2;font-weight:750}.family-view-body>form{border-bottom:0}.family-entry-view .family-view-body{max-width:940px}@media(max-width:800px){.family-workspace-choices{grid-template-columns:1fr}.family-workspace-choices button{min-height:105px}.family-workspace-home{margin:10px auto}.family-workspace-home h4{font-size:18px}}@media(max-width:650px){.family-school-content{padding:18px 16px 40px}.family-workspace-choices{gap:12px}.family-workspace-choices button{padding:18px}.family-view-body{gap:18px}.family-back{width:100%;margin:0 0 16px}.family-school-dialog .modal-head{padding:16px}}`;
    css.textContent += `.family-workspace-choices{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.family-workspace-choices button{min-height:122px;padding:17px}.family-workspace-choices strong{font-size:16px}.family-workspace-choices span{margin-top:9px;font-size:13px}@media(max-width:900px){.family-workspace-choices{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.family-workspace-choices{grid-template-columns:1fr}.family-workspace-choices button{min-height:92px;padding:16px}}`;
    css.textContent += `#familySchoolModal .family-workspace-choices button{border-color:#ffffff38;background:linear-gradient(135deg,#142b58,#315fbc);color:#fff;box-shadow:0 12px 24px #173a7940;transition:transform .18s ease,box-shadow .18s ease}#familySchoolModal .family-workspace-choices button:nth-child(2){background:linear-gradient(135deg,#2757c6,#3866cb)}#familySchoolModal .family-workspace-choices button:nth-child(3){background:linear-gradient(135deg,#4148ad,#655bd7)}#familySchoolModal .family-workspace-choices button:nth-child(4){background:linear-gradient(135deg,#5a36a8,#7950d6)}#familySchoolModal .family-workspace-choices button span{color:#eef2ff}#familySchoolModal .family-workspace-choices button:hover{transform:translateY(-3px);border-color:#fff;box-shadow:0 16px 30px #173a7952}#familySchoolModal .family-workspace-choices button:focus-visible{outline:3px solid #356ae6;outline-offset:3px;box-shadow:0 0 0 6px #fff,0 12px 24px #173a7940}@media(prefers-reduced-motion:reduce){#familySchoolModal .family-workspace-choices button{transition:none}#familySchoolModal .family-workspace-choices button:hover{transform:none}}`;
    css.textContent += `.family-occurrence-fieldset{min-width:0;margin:8px 0 0;padding:0;border:0}.family-occurrence-fieldset legend{margin-bottom:10px;font-weight:700}.family-occurrence-choices{display:grid;gap:10px;max-height:420px;overflow:auto;padding:2px}.family-occurrence-choice{display:flex!important;align-items:flex-start;gap:12px;padding:14px;border:1px solid #dce5f1;border-radius:12px;background:#fff;cursor:pointer}.family-occurrence-choice:has(input:checked){border-color:#4566d9;background:#f1f5ff;box-shadow:0 0 0 1px #4566d9}.family-occurrence-choice input{width:18px!important;height:18px;min-height:0;flex:none;margin:2px 0 0!important}.family-occurrence-detail{display:grid;gap:6px;min-width:0;font-size:13px;line-height:1.4;overflow-wrap:anywhere}.family-occurrence-detail strong{font-size:14px;color:#17233a}.family-occurrence-detail small{font-size:12px;color:#5b6a84}.family-occurrence-detail .body{white-space:pre-wrap;color:#263b60}.family-occurrence-detail .remark{padding:7px 9px;background:#f4f6fb;border-radius:7px}.family-occurrence-choice:focus-within{outline:2px solid #4566d9;outline-offset:2px}@media(max-width:600px){.family-occurrence-choice{padding:12px;gap:9px}.family-occurrence-choices{max-height:50dvh}}`;
    css.textContent += `.family-cpf-section{display:grid;gap:12px;padding:20px;border:1px solid #dce5f1;border-radius:14px;background:#f8faff}.family-cpf-section>h4{margin:5px 0 0}.family-cpf-section>button{justify-self:start}.family-general-qr{padding:18px;border:1px solid #dce5f1;border-radius:12px;background:#fff}.family-general-qr input{margin:10px 0}.family-cpf-section .family-link-row{background:#fff}.family-cpf-section .family-link-row button{margin-left:9px}@media(max-width:650px){.family-cpf-section{padding:14px}.family-cpf-section>button{justify-self:stretch}}`;
    css.textContent += `.family-cpf-tabs{display:flex;gap:10px;flex-wrap:wrap}.family-cpf-tabs button{flex:1 1 190px}.family-cpf-section.hidden{display:none!important}`;
    css.textContent += `.family-cpf-children{display:grid;gap:8px;margin:10px 0}.family-cpf-child{border-top:1px solid #dce5f1;padding-top:8px}.family-cpf-child strong{display:block}.family-cpf-child button{margin-left:0!important}`;
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
    let secretaryOnly = false;
    function setInviteMode(mode) {
      const general=mode==='general';
      get('familyInviteIdentity').classList.toggle('hidden',general);
      get('familyGuardianName').required=!general;
      get('familyPhone').required=!general;
      get('familyIndividualCpf').required=!general;
      get('familyInviteSubmit').classList.toggle('hidden',general);
      get('familyInviteSubmit').disabled=general;
      get('familyCpfSection').classList.toggle('hidden',!general);
      get('familyCpfSearchSection').classList.toggle('hidden',!general);
      get('familyInviteResult').classList.toggle('hidden',general || !get('familyInviteUrl').value);
      get('familyModeIndividual').className=general?'btn secondary':'btn primary';
      get('familyModeGeneral').className=general?'btn primary':'btn secondary';
    }
    get('familyModeIndividual').onclick=()=>setInviteMode('individual');
    get('familyModeGeneral').onclick=()=>setInviteMode('general');
    const cpfDigits = value => String(value || '').replace(/\D/g,'');
    const localPhone = value => String(value || '').replace(/\D/g,'');
    const validLocalPhone = value => /^[1-9][0-9]{9,10}$/.test(localPhone(value));
    const validCpf = value => {
      const cpf = cpfDigits(value);
      if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
      for (let length=9;length<=10;length++) {
        const sum=[...cpf.slice(0,length)].reduce((total,digit,index)=>total+Number(digit)*(length+1-index),0);
        if (Number(cpf[length]) !== ((sum*10)%11)%10) return false;
      }
      return true;
    };
    let addChildGuardian = null;
    let addChildRows = [];
    let addChildExistingIds = new Set();
    let addChildLoadId = 0;
    function resetAddChildAccount() {
      addChildGuardian = null;
      addChildExistingIds = new Set();
      get('familyAddChildAccount').textContent = '';
      get('familyAddChildSelection').classList.add('hidden');
      get('familyAddChildStatus').textContent = '';
    }
    get('familyAddChildCpf').oninput = resetAddChildAccount;
    function renderAddChildStudents() {
      const select = get('familyAddChildStudent');
      const previous = select.value;
      const search = get('familyAddChildStudentSearch').value.trim().toLocaleLowerCase('pt-BR');
      const rows = addChildRows.filter(row => !addChildExistingIds.has(row.id)
        && row.full_name.toLocaleLowerCase('pt-BR').includes(search));
      select.innerHTML = `<option value="">${rows.length ? 'Selecione o novo aluno' : 'Nenhum aluno disponível nesta busca'}</option>`
        + rows.map(row => `<option value="${esc(row.id)}">${esc(row.full_name)}</option>`).join('');
      select.disabled = !rows.length;
      if (rows.some(row => row.id === previous)) select.value = previous;
    }
    async function findAddChildAccount() {
      const cpf = cpfDigits(get('familyAddChildCpf').value);
      if (!validCpf(cpf)) return error('Informe um CPF válido do responsável.');
      const school = currentSchool;
      const { data, error: requestError } = await db.rpc('family_cpf_existing_account', {
        p_school_id:school,p_cpf:cpf,
      });
      if (requestError) throw requestError;
      if (school !== currentSchool || cpf !== cpfDigits(get('familyAddChildCpf').value)) return;
      if (!data?.length) {
        resetAddChildAccount();
        get('familyAddChildAccount').textContent = 'Conta ativa não encontrada nesta escola. Confira o CPF ou faça primeiro o cadastro do responsável.';
        return;
      }
      addChildGuardian = data[0];
      addChildExistingIds = new Set(data.map(row => row.student_id).filter(Boolean));
      const children = data.filter(row => row.student_id);
      get('familyAddChildAccount').innerHTML = `<article class="family-link-row"><b>${esc(addChildGuardian.guardian_name)}</b><p>CPF final ${esc(addChildGuardian.cpf_last4)} · Conta ativa</p><p>${children.length ? 'Filhos já vinculados: ' + children.map(row => `${esc(row.student_name)}${row.class_name ? ' · ' + esc(row.class_name) : ''}`).join('; ') : 'Nenhum filho ativo nesta escola.'}</p></article>`;
      get('familyAddChildSelection').classList.remove('hidden');
      renderAddChildStudents();
    }
    get('familyAddChildSearch').onclick = async event => {
      const button=event.currentTarget;button.disabled=true;error('');
      try { await findAddChildAccount(); }
      catch (caught) { error(caught.message || 'Não foi possível buscar o responsável.'); }
      finally { button.disabled=false; }
    };
    get('familyAddChildShift').onchange = () => {
      addChildLoadId++;
      const shift = get('familyAddChildShift').value;
      const classSelect = get('familyAddChildClass');
      classSelect.innerHTML = `<option value="">${shift ? 'Selecione a turma' : 'Selecione o turno primeiro'}</option>`
        + inviteClasses.filter(row => row.shift === shift).map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');
      classSelect.disabled = !shift;
      addChildRows = [];
      get('familyAddChildStudentSearch').value = '';
      get('familyAddChildStudentSearch').disabled = true;
      renderAddChildStudents();
    };
    get('familyAddChildClass').onchange = async () => {
      const loadId=++addChildLoadId;
      const school=currentSchool;
      const classId=get('familyAddChildClass').value;
      addChildRows=[];
      get('familyAddChildStudentSearch').value='';
      get('familyAddChildStudentSearch').disabled=!classId;
      renderAddChildStudents();
      if (!classId) return;
      try {
        const rows=[];
        for (let start=0;;start+=500) {
          const {data,error:requestError}=await db.from('students').select('id,full_name')
            .eq('school_id',school).eq('class_id',classId).eq('enrollment_status','active')
            .order('full_name').range(start,start+499);
          if (requestError) throw requestError;
          if (loadId!==addChildLoadId || school!==currentSchool || classId!==get('familyAddChildClass').value) return;
          rows.push(...(data || []));
          if (!data || data.length<500) break;
        }
        addChildRows=rows;
        renderAddChildStudents();
      } catch (caught) { if (loadId===addChildLoadId) error(caught.message || 'Não foi possível carregar os alunos.'); }
    };
    get('familyAddChildStudentSearch').oninput = renderAddChildStudents;
    get('familyAddChildSubmit').onclick = async event => {
      error('');
      const studentId=get('familyAddChildStudent').value;
      if (!addChildGuardian || !studentId || !addChildRows.some(row => row.id===studentId))
        return error('Busque a conta do responsável e selecione o novo aluno.');
      const button=event.currentTarget;button.disabled=true;
      try {
        const {error:requestError}=await db.rpc('family_cpf_add_child_to_active', {
          p_school_id:currentSchool,p_guardian_id:addChildGuardian.guardian_id,p_student_id:studentId,
        });
        if (requestError) throw requestError;
        const studentName=addChildRows.find(row => row.id===studentId)?.full_name || 'O aluno';
        get('familyAddChildStatus').textContent=`${studentName} foi acrescentado à conta. O responsável verá o filho ao atualizar o Portal, sem ler outro QR Code.`;
        get('familyAddChildStudent').value='';
        await findAddChildAccount();
      } catch (caught) { error(caught.message || 'Não foi possível acrescentar o aluno.'); }
      finally { button.disabled=false; }
    };
    async function loadCpfRoster() {
      const school = currentSchool;
      const classId = get('familyInviteClass').value;
      if (!classId) { get('familyCpfRoster').innerHTML = '<p class="meta">Selecione uma turma para ver os cadastros.</p>'; return; }
      const { data, error: requestError } = await db.rpc('family_cpf_school_roster', {
        p_school_id:school,p_class_id:classId,
      });
      if (school !== currentSchool || classId !== get('familyInviteClass').value) return;
      if (requestError) throw requestError;
      get('familyCpfRoster').innerHTML = data?.length ? cpfRosterGroups(data)
        : '<p class="meta">Nenhum responsável pré-cadastrado nesta turma.</p>';
    }
    function cpfRosterGroups(rows) {
      const groups = new Map();
      rows.forEach(row => {
        if (!groups.has(row.guardian_id)) groups.set(row.guardian_id,{ guardian:row,children:[] });
        groups.get(row.guardian_id).children.push(row);
      });
      return [...groups.values()].map(({ guardian,children }) => `<article class="family-link-row"><b>${esc(guardian.guardian_name)}</b><p>CPF final ${esc(guardian.cpf_last4)} · ${guardian.account_active ? 'Acesso criado' : 'Aguardando cadastro'}</p><div class="family-cpf-children">${children.map(row => `<div class="family-cpf-child"><strong>${esc(row.student_name)}</strong><button class="btn secondary" type="button" data-remove-cpf="${esc(row.guardian_id)}" data-student="${esc(row.student_id)}">Excluir vínculo com este aluno</button></div>`).join('')}</div><button class="btn secondary" type="button" data-remove-guardian-cpf="${esc(guardian.guardian_id)}">Excluir responsável desta escola</button></article>`).join('');
    }
    function cpfRosterRow(row) {
      const inactive=row.enrollment_status && row.enrollment_status!=='active';
      return `<article class="family-link-row"><b>${esc(row.student_name)}</b><p>${esc(row.guardian_name)} · CPF final ${esc(row.cpf_last4)} · ${row.account_active ? 'Acesso criado' : 'Aguardando cadastro'}${inactive ? ' · Aluno fora da matrícula ativa' : ''}</p>${row.link_status!=='revoked' ? `<button class="btn secondary" type="button" data-remove-cpf="${esc(row.guardian_id)}" data-student="${esc(row.student_id)}">Excluir vínculo com este aluno</button>` : ''}<button class="btn secondary" type="button" data-remove-guardian-cpf="${esc(row.guardian_id)}">Excluir responsável desta escola</button></article>`;
    }
    async function findCpfGuardian() {
      const cpf=cpfDigits(get('familyCpfSearch').value);
      if (!validCpf(cpf)) return error('Informe um CPF válido para buscar.');
      const school=currentSchool;
      const { data, error: requestError }=await db.rpc('family_cpf_find_guardian', {
        p_school_id:school,p_cpf:cpf,
      });
      if (requestError) throw requestError;
      if (school!==currentSchool) return;
      get('familyCpfSearchResults').innerHTML=data?.length ? data.map(cpfRosterRow).join('')
        : '<p class="meta">Nenhum cadastro encontrado para este CPF nesta escola.</p>';
    }
    get('familyCpfSearchButton').onclick=async event=>{
      event.currentTarget.disabled=true;error('');
      try { await findCpfGuardian(); }
      catch (caught) { error(caught.message || 'Não foi possível buscar o cadastro.'); }
      finally { event.currentTarget.disabled=false; }
    };
    get('familySaveCpf').onclick = async event => {
      error('');
      const students=[...selectedStudentIds];
      const name=get('familyCpfNameSchool').value.trim();
      const cpf=cpfDigits(get('familyCpf').value);
      const phone=localPhone(get('familyCpfPhone').value);
      if (!students.length || students.length>10 || students.some(id=>!knownStudents.has(id)))
        return error('Selecione de 1 a 10 alunos nos filtros de turno e turma.');
      if (name.length<2 || !validCpf(cpf)) return error('Informe nome completo e CPF válido do responsável.');
      if (!validLocalPhone(phone)) return error('Informe o celular com DDD.');
      const button=event.currentTarget;button.disabled=true;
      try {
        const { data, error: requestError }=await db.rpc('family_cpf_register_bundle_contact', {
          p_school_id:currentSchool,p_student_ids:students,p_name:name,p_cpf:cpf,p_phone_local:phone,
        });
        if (requestError) throw requestError;
        const filled=Number(data?.[0]?.filled_count || 0);
        get('familyCpfStatus').textContent=`Responsável pré-cadastrado. ${filled} ficha(s) de aluno atualizada(s).${filled<students.length?' Contatos diferentes já preenchidos foram preservados.':''} Compartilhe o QR Code geral.`;
        get('familyCpf').value='';
        selectedStudentIds.clear();renderStudentChoices();renderSelectedStudents();
        await window.load?.();
        await loadCpfRoster();
      } catch (caught) { error(caught.message || 'Não foi possível cadastrar o responsável.'); }
      finally { button.disabled=false; }
    };
    get('familyCpfRoster').onclick = async event => {
      const button=event.target.closest('[data-remove-cpf], [data-remove-guardian-cpf]');
      if (!button) return;
      const all=button.hasAttribute('data-remove-guardian-cpf');
      if (!confirm(all
        ? 'Excluir este responsável e todos os seus vínculos nesta escola? O acesso a outras escolas e o histórico de ciência serão preservados.'
        : 'Excluir o vínculo deste responsável com este aluno? O acesso será revogado, mas o histórico de ciência será preservado.')) return;
      button.disabled=true;error('');
      try {
        const { error: requestError }=all
          ? await db.rpc('family_cpf_remove_guardian', {
            p_school_id:currentSchool,p_guardian_id:button.dataset.removeGuardianCpf,
          })
          : await db.rpc('family_cpf_remove_child', {
            p_school_id:currentSchool,p_guardian_id:button.dataset.removeCpf,p_student_id:button.dataset.student,
          });
        if (requestError) throw requestError;
        await loadCpfRoster();await loadOverview();
        if (get('familyCpfSearch').value.trim()) await findCpfGuardian();
      } catch (caught) { error(caught.message || 'Não foi possível excluir o vínculo.');button.disabled=false; }
    };
    get('familyCpfSearchResults').onclick=get('familyCpfRoster').onclick;
    get('familyCopyGeneral').onclick = async () => {
      try { await navigator.clipboard.writeText(get('familyGeneralUrl').value); }
      catch { get('familyGeneralUrl').select(); document.execCommand('copy'); }
    };
    get('familyPrintGeneral').onclick = () => {
      const svg=get('familyGeneralQr').innerHTML;
      const url=get('familyGeneralUrl').value;
      if (!svg || !url) return error('QR Code indisponível.');
      const page=window.open('','_blank');
      if (!page) return error('Permita a abertura da página de impressão.');
      page.opener=null;
      page.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Portal da Família</title><style>@page{size:A4;margin:18mm}body{font:18px Arial,sans-serif;color:#111;text-align:center;margin:0}main{max-width:620px;margin:35px auto}h1{font-size:32px;margin:0 0 12px}p{margin:0 0 20px}svg{width:300px;height:300px;max-width:100%}ol{text-align:left;margin:28px auto 0;padding-left:34px;max-width:500px;line-height:1.45}li{margin-bottom:16px;padding-left:6px}</style><main><h1>Portal da Família</h1><p>Faça seu cadastro pelo QR Code</p>${svg}<ol><li>Abra a câmera do celular e aponte para o QR Code.</li><li>Toque no link que aparecer e informe seu nome completo e CPF.</li><li>Confira os nomes dos seus filhos e crie sua senha.</li></ol></main><script>onload=()=>print()<\/script></html>`);
      page.document.close();
    };
    const close = () => { dialog.classList.add('hidden'); document.dispatchEvent(new Event('carometro:family-school-closed')); };
    get('familySchoolClose').onclick = close;
    dialog.onclick = event => { if (event.target === dialog) close(); };
    function showView(view) {
      if (secretaryOnly && view !== 'addChild') return;
      if (currentView === 'entry' && view !== 'entry') document.dispatchEvent(new Event('carometro:family-entry-hidden'));
      currentView = view;
      get('familyHome').classList.toggle('hidden',view !== 'home');
      for (const name of ['invite','occurrence','entry','cards','addChild']) get(`family${name[0].toUpperCase()+name.slice(1)}View`).classList.toggle('hidden',view !== name);
      error('');
      get('familySchoolModal').querySelector('.family-school-content').scrollTop = 0;
      if (view === 'entry') document.dispatchEvent(new CustomEvent('carometro:family-school-opened', { detail:{ schoolId:currentSchool } }));
      if (view === 'cards') document.dispatchEvent(new CustomEvent('carometro:family-cards-opened', { detail:{ schoolId:currentSchool } }));
      if (view === 'occurrence') activeLinksReady = false;
      if (view === 'invite' || view === 'occurrence') loadOverview().then(() => {
        if (view === 'occurrence') { activeLinksReady = true; updateOccurrenceAudience(); }
      }).catch(caught => error(caught.message || 'Não foi possível consultar os vínculos da família.'));
    }
    get('familyHome').onclick = event => {
      const choice = event.target.closest('[data-family-view]');
      if (choice) showView(choice.dataset.familyView);
    };
    dialog.querySelectorAll('[data-family-back]').forEach(back => back.onclick = () => secretaryOnly ? close() : showView('home'));
    function refreshNav() {
      const role = window.getActiveSchoolRole?.();
      const allowed = !app.classList.contains('hidden')
        && (role === 'secretary' || (['school_admin','coordinator'].includes(role) && window.canManageFamilyPortal?.() === true));
      button.hidden = !allowed;
      button.classList.toggle('hidden', !allowed);
      button.setAttribute('aria-hidden', String(!allowed));
      if (allowed) button.style.removeProperty('display');
      else button.style.setProperty('display','none','important');
      if (!allowed && !dialog.classList.contains('hidden')) close();
    }
    new MutationObserver(refreshNav).observe(app, { attributes:true, attributeFilter:['class'] });
    document.addEventListener('carometro:school-context-ready', refreshNav);
    document.addEventListener('carometro:permission-refresh', refreshNav);
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
      get('familyCpfRoster').innerHTML = '<p class="meta">Carregando cadastros…</p>';
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
        await loadCpfRoster();
      } catch (caught) {
        if (loadId !== classLoadId || activeSchool !== currentSchool) return;
        get('familyStudentChoices').innerHTML = '<p class="meta">Não foi possível carregar os alunos desta turma.</p>';
        error(caught.message || 'Não foi possível carregar os alunos desta turma.');
      }
    };
    let occurrenceLoadId = 0;
    const occurrenceDate = value => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Data não informada';
    };
    const occurrenceMoment = value => value ? new Intl.DateTimeFormat('pt-BR', {
      timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    }).format(new Date(value)) : 'Não informado';
    const resetOccurrenceChoices = message => {
      get('familyOccurrence').value = '';
      get('familyOccurrenceChoices').innerHTML = `<p class="meta">${esc(message)}</p>`;
    };
    function renderOccurrenceChoices(rows) {
      resetOccurrenceChoices(rows.length ? '' : 'Nenhuma ocorrência encontrada para este aluno.');
      if (!rows.length) return;
      get('familyOccurrenceChoices').innerHTML = rows.map(row => {
        const remarks = row.student_occurrence_remarks || [];
        return `<label class="family-occurrence-choice"><input type="radio" name="familyOccurrenceChoice" value="${esc(row.id)}"><span class="family-occurrence-detail">
          <strong>Ocorrência de ${occurrenceDate(row.occurred_on)}</strong>
          <small>Registrada em ${esc(occurrenceMoment(row.created_at))} · Responsável: ${esc(row.created_by_name || 'Não informado')}</small>
          <span class="body">${esc(row.occurrence_text || 'Sem descrição.')}</span>
          ${row.updated_at ? `<small>Edição: ${esc(occurrenceMoment(row.updated_at))} · Responsável: ${esc(row.updated_by_name || 'Não informado')}</small>` : ''}
          ${remarks.map(remark => `<span class="remark">Ressalva: ${esc(remark.body || '')}<br><small>${esc(remark.created_by_name || 'Não informado')} · ${esc(occurrenceMoment(remark.created_at))}</small></span>`).join('')}
        </span></label>`;
      }).join('');
    }
    get('familyOccurrenceChoices').onchange = event => {
      if (event.target.name === 'familyOccurrenceChoice') get('familyOccurrence').value = event.target.value;
    };
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
      resetOccurrenceChoices('Selecione o aluno primeiro.');
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
      resetOccurrenceChoices('Selecione o aluno primeiro.');
      updateOccurrenceAudience();
    };
    get('familyOccurrenceClass').onchange = async () => {
      const loadId = ++occurrenceLoadId;
      const activeSchool = currentSchool;
      const classId = get('familyOccurrenceClass').value;
      occurrenceRows = [];
      get('familyOccurrenceStudent').innerHTML = '<option value="">Carregando alunos…</option>';
      get('familyOccurrenceStudent').disabled = true;
      resetOccurrenceChoices('Selecione o aluno primeiro.');
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
      resetOccurrenceChoices('Carregando ocorrências…');
      updateOccurrenceAudience();
      if (!studentId) {
        resetOccurrenceChoices('Selecione o aluno primeiro.');
        return;
      }
      try {
        const rows = [];
        for (let start = 0; ; start += 500) {
          const { data, error: requestError } = await db.from('student_occurrences')
            .select('id,student_id,occurred_on,occurrence_text,created_at,created_by_name,updated_at,updated_by_name,student_occurrence_remarks(body,created_at,created_by_name)').eq('school_id',activeSchool)
            .eq('student_id',studentId).order('created_at',{ ascending:false }).range(start,start+499);
          if (requestError) throw requestError;
          if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        occurrenceRows = rows;
        renderOccurrenceChoices(rows);
        if (!rows.length) get('familyOccurrenceAudience').textContent += ' Nenhuma ocorrência encontrada para este aluno.';
      } catch (caught) {
        if (loadId !== occurrenceLoadId || activeSchool !== currentSchool) return;
        resetOccurrenceChoices('Não foi possível carregar as ocorrências.');
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
        <p>${row.phone_e164 ? esc(row.phone_e164) : 'Cadastro por CPF'} · ${row.link_status === 'active' ? 'Ativo' : row.link_status === 'pending' ? 'Convite pendente' : 'Revogado'}</p>
        ${messages.map(m => `<p>${esc(m.message_title)}: ${m.acknowledged_at ? 'Ciência confirmada' : m.viewed_at ? 'Visualizada' : 'Aguardando leitura'}
          <button class="btn secondary" type="button" data-withdraw="${esc(m.message_id)}">Retirar publicação</button>
          </p>`).join('')}
        ${row.link_status !== 'revoked' ? `<button class="btn secondary" type="button" data-revoke="${esc(row.link_id)}">Revogar acesso</button>` : ''}
        <button class="btn secondary" type="button" data-remove-guardian="${esc(row.link_id)}">Excluir responsável desta escola</button></article>`).join('') : '<p class="meta">Nenhum responsável vinculado nesta escola.</p>';
    }
    button.onclick = async () => {
      secretaryOnly = window.getActiveSchoolRole?.() === 'secretary';
      if (button.hidden || (!secretaryOnly && window.canManageFamilyPortal?.() !== true)) return;
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
      setInviteMode('individual');
      get('familyCpfStatus').textContent = '';
      get('familyInviteUrl').value = '';
      get('familyPublishForm').reset();
      resetOccurrenceFilters();
      addChildLoadId++;
      addChildRows=[];
      get('familyAddChildCpf').value='';
      resetAddChildAccount();
      get('familyAddChildShift').innerHTML='<option value="">Selecione o turno</option>';
      get('familyAddChildClass').innerHTML='<option value="">Selecione o turno primeiro</option>';
      get('familyAddChildClass').disabled=true;
      get('familyAddChildStudentSearch').value='';
      get('familyAddChildStudentSearch').disabled=true;
      renderAddChildStudents();
      const check = await db.rpc(secretaryOnly ? 'family_can_add_existing_child' : 'family_school_manager', { p_school_id:currentSchool });
      if (check.error || check.data !== true) {
        if (typeof window.refreshCarometroSchoolPermission === 'function')
          await window.refreshCarometroSchoolPermission().catch(() => {});
        refreshNav();
        if (typeof toast === 'function') toast('Você não tem permissão para gerenciar o Portal da Família nesta escola.');
        return;
      }
      dialog.classList.remove('hidden');
      get('familyGeneralUrl').value = new URL(`familia.html?escola=${encodeURIComponent(currentSchool)}`, location.href).href;
      if (typeof window.qrcode === 'function') {
        const qr=window.qrcode(0,'M');qr.addData(get('familyGeneralUrl').value);qr.make();
        get('familyGeneralQr').innerHTML=qr.createSvgTag({ cellSize:4,margin:8,scalable:true });
      } else get('familyGeneralQr').textContent='QR Code indisponível. Copie o link geral.';
      showView(secretaryOnly ? 'addChild' : 'home');
      try {
        const classResult = await db.from('classes').select('id,name,shift').eq('school_id',currentSchool).is('archived_at',null).order('name');
        if (classResult.error) throw classResult.error;
        inviteClasses = classResult.data || [];
        const shiftOrder = ['Matutino','Vespertino','Noturno'];
        const shifts = [...new Set(inviteClasses.map(row => row.shift).filter(Boolean))].sort((a,b) => {
          const first = shiftOrder.findIndex(item => item.toLowerCase() === a.toLowerCase());
          const second = shiftOrder.findIndex(item => item.toLowerCase() === b.toLowerCase());
          return (first < 0 ? shiftOrder.length : first) - (second < 0 ? shiftOrder.length : second) || a.localeCompare(b,'pt-BR');
        });
        const shiftOptions = '<option value="">Selecione o turno</option>' + shifts.map(shift => `<option value="${esc(shift)}">${esc(shift)}</option>`).join('');
        get('familyInviteShift').innerHTML = shiftOptions;
        get('familyOccurrenceShift').innerHTML = shiftOptions;
        get('familyAddChildShift').innerHTML = shiftOptions;
      } catch (caught) { error(caught.message || 'Não foi possível carregar o Portal da Família.'); }
    };
    get('familyInviteForm').onsubmit = async event => {
      event.preventDefault(); error('');
      const students = [...selectedStudentIds];
      const phone = localPhone(get('familyPhone').value);
      const name = get('familyGuardianName').value.trim();
      const cpf=cpfDigits(get('familyIndividualCpf').value);
      if (!students.length || students.length > 10 || students.some(id => !knownStudents.has(id))) return error('Selecione de 1 a 10 filhos autorizados nesta escola.');
      if (!validCpf(cpf)) return error('Informe um CPF válido do responsável.');
      if (!validLocalPhone(phone)) return error('Informe o celular com DDD.');
      const submit = event.submitter; submit.disabled = true;
      try {
        const { data, error: requestError } = await db.rpc('family_cpf_create_individual_invite', { p_school_id:currentSchool,p_student_ids:students,p_name:name,p_cpf:cpf,p_phone_local:phone });
        if (requestError) throw requestError;
        const token = data?.[0]?.invitation_token;
        if (!token) throw new Error('Convite criado, mas o link não foi retornado.');
        const filled=Number(data?.[0]?.filled_count || 0);
        get('familyInviteContactStatus').textContent=`${filled} ficha(s) de aluno atualizada(s).${filled<students.length?' Contatos diferentes já preenchidos foram preservados.':''}`;
        get('familyInviteUrl').value = new URL(`familia.html?escola=${encodeURIComponent(currentSchool)}&token=${encodeURIComponent(token)}&cpf=1`, location.href).href;
        if (typeof window.qrcode === 'function') {
          const qr = window.qrcode(0,'M');
          qr.addData(get('familyInviteUrl').value);
          qr.make();
          get('familyInviteQr').innerHTML = qr.createSvgTag({ cellSize:4, margin:8, scalable:true });
        } else get('familyInviteQr').textContent = 'QR Code indisponível. Copie o link do convite.';
        get('familyInviteResult').classList.remove('hidden');
        selectedStudentIds.clear(); renderStudentChoices(); renderSelectedStudents();
        await window.load?.();
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
