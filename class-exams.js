// Provas criadas no Painel da Turma, separadas das provas do Meu CEPI.
(() => {
  const roles = new Set(['teacher','coordinator','school_admin']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const breaks = value => esc(value).replace(/\n/g,'<br>');
  const options = format => format === 'VF' ? ['V','F'] : format === 'ABCD' ? ['A','B','C','D'] : format === 'ABCDE' ? ['A','B','C','D','E'] : [];
  const labels = {bimestral:'Prova bimestral',enem:'Simulado do ENEM'};
  const models = {caderno_1:'Caderno 1 · 45 questões',caderno_2:'Caderno 2 · 45 questões',simuladao:'Simuladão ENEM · 90 questões'};
  let modal, body, context, schoolId, userId, exams = [], viewType = null, editingId = null;

  const style = document.createElement('style');
  style.textContent = `#classExamModal{z-index:225}#classExamModal .modal{width:min(950px,100%)}#classExamModal .form{max-height:calc(94vh - 75px);overflow:auto}.cxe-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cxe-row.three{grid-template-columns:repeat(3,minmax(0,1fr))}.cxe-question,.cxe-item,.cxe-menu-card{border:1px solid #dce4f3;border-radius:10px;padding:14px;margin:12px 0}.cxe-question textarea{min-height:100px}.cxe-choice{margin:8px 0}.cxe-choice input{min-height:38px}.cxe-toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:15px 0}.cxe-toolbar .btn{width:auto}.cxe-item{display:flex;align-items:center;justify-content:space-between;gap:15px}.cxe-item p{margin:5px 0;color:#667085;font-size:13px}.cxe-note{font-size:13px;color:#667085}.cxe-error{color:#b42318;font-weight:700}.cxe-plan{background:#f3f6fc;border-radius:9px;padding:12px;margin:12px 0;font-size:13px}@media(max-width:650px){.cxe-row,.cxe-row.three{grid-template-columns:1fr}.cxe-item{display:block}.cxe-item .cxe-toolbar{margin-bottom:0}}`;
  document.head.appendChild(style);

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'classExamModal'; modal.className = 'modal-bg hidden';
    modal.innerHTML = '<div class="modal"><div class="modal-head"><div><h3>Provas da turma</h3><div id="classExamMeta" class="meta"></div></div><button type="button" class="close" aria-label="Fechar">×</button></div><div class="form" id="classExamBody"></div></div>';
    document.body.appendChild(modal);
    body = modal.querySelector('#classExamBody');
    modal.querySelector('.close').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
  }
  function close() { modal?.classList.add('hidden'); editingId = null; }
  function isThirdClass() {
    return /^(?:ENSINO\s+MEDIO\s+)?3(?=\D|$)/.test(String(context?.className || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase());
  }
  function plan(model) { return window.CepiBlocks?.enemPlan(model) || null; }
  function total(model) { return plan(model)?.reduce((sum,item)=>sum+item.count,0) || 0; }
  function subjectAt(model, index) {
    let last = 0;
    for (const entry of plan(model) || []) { last += entry.count; if (index + 1 <= last) return entry.subject; }
    return '';
  }
  function errorMessage(error) {
    if (error?.code === 'PGRST205' || /class_exams.*schema cache/i.test(error?.message || '')) return 'O cadastro de provas da turma ainda não foi ativado na escola.';
    return error?.message || 'Não foi possível carregar as provas agora.';
  }
  function notice(message) {
    body.innerHTML = `<p class="cxe-error">${esc(message)}</p><button type="button" class="btn secondary" id="cxeBack">Voltar</button>`;
    body.querySelector('#cxeBack').onclick = renderMenu;
  }
  async function loadExams() {
    const {data,error} = await db.from('class_exams').select('*').eq('school_id',schoolId).eq('class_id',context.classId).order('updated_at',{ascending:false});
    if (error) throw error;
    exams = data || [];
  }
  async function open(nextContext) {
    if (!roles.has(window.getActiveSchoolRole?.()) || !nextContext?.classId) return;
    ensureModal();
    context = {classId:nextContext.classId,className:nextContext.className || 'Turma'};
    schoolId = window.getActiveSchoolId?.();
    if (!schoolId) return;
    const {data:{user},error} = await db.auth.getUser();
    if (error || !user) return;
    userId = user.id;
    modal.querySelector('#classExamMeta').textContent = context.className;
    modal.classList.remove('hidden');
    body.innerHTML = '<p class="cxe-note">Carregando provas…</p>';
    try { await loadExams(); renderMenu(); } catch (loadError) { notice(errorMessage(loadError)); }
  }
  function renderMenu() {
    editingId = null; viewType = null;
    body.innerHTML = `<p class="cxe-note">Escolha o tipo de prova para esta turma. Questões e cabeçalho são cadastrados aqui, sem alterar as provas do Meu CP.</p><div class="cxe-menu-card"><h4>Prova bimestral</h4><p class="cxe-note">Escolha a disciplina, crie as questões e edite o cabeçalho.</p><button type="button" class="btn primary" data-type="bimestral">Abrir provas bimestrais</button></div><div class="cxe-menu-card"><h4>Simulado do ENEM</h4><p class="cxe-note">Cadernos 1 e 2 ou Simuladão, com a distribuição de disciplinas prevista para a 3ª série.</p>${isThirdClass() ? '<button type="button" class="btn primary" data-type="enem">Abrir simulados do ENEM</button>' : '<p class="cxe-note">Disponível nas turmas da 3ª série do Ensino Médio.</p>'}</div>`;
    body.querySelectorAll('[data-type]').forEach(button => { button.onclick = () => renderList(button.dataset.type); });
  }
  function renderList(type = viewType) {
    viewType = type; editingId = null;
    const rows = exams.filter(exam => exam.exam_type === type);
    body.innerHTML = `<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeMenu">← Menu de provas</button><button type="button" class="btn primary" id="cxeNew">Criar ${labels[type].toLowerCase()}</button></div><h4>${labels[type]} · ${esc(context.className)}</h4>${rows.length ? rows.map(exam => { const count = (exam.questions || []).length, expected = exam.exam_type === 'enem' ? total(exam.enem_model) : null; return `<div class="cxe-item"><div><strong>${esc(exam.title)}</strong><p>${exam.bimester}º bimestre de ${exam.academic_year} · ${count}${expected ? `/${expected}` : ''} questão(ões)${exam.created_by !== userId ? ' · Criada por outro professor' : ''}</p></div><div class="cxe-toolbar">${count && (!expected || count === expected) ? `<button type="button" class="btn secondary" data-print="${exam.id}">Imprimir</button>` : ''}${exam.created_by === userId ? `<button type="button" class="btn secondary" data-edit="${exam.id}">Editar</button>` : ''}</div></div>`; }).join('') : '<p class="cxe-note">Ainda não há provas deste tipo na turma.</p>'}`;
    body.querySelector('#cxeMenu').onclick = renderMenu;
    body.querySelector('#cxeNew').onclick = () => renderForm(null,type);
    body.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => renderForm(exams.find(exam => exam.id === button.dataset.edit),type); });
    body.querySelectorAll('[data-print]').forEach(button => { button.onclick = () => printExam(exams.find(exam => exam.id === button.dataset.print)); });
  }
  function questionHtml(question = {}, index = 0, format = 'ABCDE', type = 'bimestral', model = '') {
    const choices = options(format);
    const subject = type === 'enem' ? subjectAt(model,index) : '';
    return `<div class="cxe-question"><div class="cxe-toolbar"><strong>Questão ${index + 1}${subject ? ` · ${esc(subject)}` : ''}</strong><button type="button" class="btn secondary cxeRemove">Remover</button></div><label>Enunciado</label><textarea class="cxeStatement" maxlength="30000" placeholder="Escreva o enunciado da questão.">${esc(question.statement || '')}</textarea><div class="cxeOptions">${choices.map(choice => `<div class="cxe-choice"><label>Alternativa ${choice}</label><input class="cxeOption" data-choice="${choice}" value="${esc(question.alternatives?.[choice] || '')}" placeholder="Texto da alternativa ${choice}"></div>`).join('')}</div>${choices.length ? `<label>Gabarito ${type === 'enem' ? '' : '(opcional)'}</label><select class="cxeAnswer"><option value="">Selecione</option>${choices.map(choice => `<option value="${choice}"${question.correct_answer === choice ? ' selected' : ''}>${choice}</option>`).join('')}</select>` : ''}</div>`;
  }
  function bindQuestions() {
    body.querySelectorAll('.cxeRemove').forEach(button => { button.onclick = () => { button.closest('.cxe-question').remove(); renumber(); }; });
  }
  function renumber() {
    const model = body.querySelector('[name="enem_model"]')?.value || '';
    body.querySelectorAll('.cxe-question').forEach((card,index) => { card.querySelector('strong').textContent = `Questão ${index + 1}${model ? ` · ${subjectAt(model,index)}` : ''}`; });
  }
  function renderPlan(model) {
    const holder = body.querySelector('#cxePlan');
    if (!holder) return;
    holder.textContent = plan(model)?.map(item => `${item.subject}: ${item.count}`).join(' · ') || 'Selecione um caderno.';
  }
  function renderForm(exam = null, type = viewType) {
    if (exam && exam.created_by !== userId) return;
    if (type === 'enem' && !isThirdClass()) return;
    viewType = type; editingId = exam?.id || null;
    const format = type === 'enem' ? 'ABCDE' : exam?.answer_format || 'ABCDE';
    const model = exam?.enem_model || 'caderno_1';
    const currentQuestions = exam?.questions || [];
    const initialQuestions = currentQuestions.length ? currentQuestions : [{}];
    const visibleQuestions = type === 'enem' && currentQuestions.length >= total(model) ? currentQuestions : initialQuestions;
    body.innerHTML = `<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button></div><form id="cxeForm"><h4>${exam ? 'Editar' : 'Criar'} ${labels[type].toLowerCase()}</h4>${type === 'enem' ? `<div class="cxe-row"><div><label>Caderno</label><select name="enem_model" ${currentQuestions.length ? 'disabled' : ''}>${Object.entries(models).map(([key,label]) => `<option value="${key}"${key === model ? ' selected' : ''}>${label}</option>`).join('')}</select></div><div><label>Nome da prova</label><input name="title" readonly value="${esc(exam?.title || '')}"></div></div><div id="cxePlan" class="cxe-plan"></div>` : `<div class="cxe-row"><div><label>Nome da prova</label><input name="title" maxlength="200" required value="${esc(exam?.title || 'Prova bimestral')}"></div><div><label>Disciplina</label><input name="subject" maxlength="100" required value="${esc(exam?.subject || '')}" placeholder="Ex.: Ciências, Português, Matemática"></div></div>`}<div class="cxe-row three"><div><label>Ano</label><input name="academic_year" type="number" min="2000" max="2100" required value="${exam?.academic_year || new Date().getFullYear()}"></div><div><label>Bimestre</label><select name="bimester">${[1,2,3,4].map(n => `<option value="${n}"${(exam?.bimester || (type === 'enem' ? 4 : 1)) === n ? ' selected' : ''}>${n}º bimestre</option>`).join('')}</select></div><div><label>Data da prova (opcional)</label><input name="scheduled_on" type="date" value="${esc(exam?.scheduled_on || '')}"></div></div>${type === 'bimestral' ? `<div><label>Tipo de resposta</label><select name="answer_format"><option value="ABCDE"${format === 'ABCDE' ? ' selected' : ''}>A, B, C, D, E</option><option value="ABCD"${format === 'ABCD' ? ' selected' : ''}>A, B, C, D</option><option value="VF"${format === 'VF' ? ' selected' : ''}>V ou F</option><option value="LIVRE"${format === 'LIVRE' ? ' selected' : ''}>Resposta escrita</option></select></div>` : ''}<h4>Cabeçalho da prova</h4><div class="cxe-row"><div><label>Nome da escola</label><input name="header_school_name" maxlength="160" value="${esc(exam?.header_school_name || '')}" placeholder="Nome exibido no topo"></div><div><label>Complemento do cabeçalho</label><input name="header_subtitle" maxlength="240" value="${esc(exam?.header_subtitle || '')}" placeholder="Ex.: Avaliação do 4º bimestre"></div></div><div><label>Orientações aos alunos (opcional)</label><textarea name="instructions" maxlength="1000" style="min-height:90px">${esc(exam?.instructions || '')}</textarea></div><h4>Questões</h4><p id="cxeProgress" class="cxe-note"></p><div id="cxeQuestions">${visibleQuestions.map((question,index) => questionHtml(question,index,format,type,model)).join('')}</div><div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeAdd">Adicionar questão</button></div><p id="cxeFormError" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">Salvar prova</button></div></form>`;
    const form = body.querySelector('#cxeForm');
    const modelField = form.elements.enem_model;
    const syncTitle = () => {
      if (type !== 'enem') return;
      const selected = modelField.value;
      form.elements.title.value = window.CepiBlocks.title({kind:'simulado',stage:'medio',bimester:form.elements.bimester.value,academicYear:form.elements.academic_year.value,enemModel:selected}) || '';
      renderPlan(selected); renumber(); updateProgress();
    };
    const updateProgress = () => { const limit = type === 'enem' ? total(modelField.value) : 99; form.querySelector('#cxeProgress').textContent = `Questões cadastradas: ${currentQuestions.length}${type === 'enem' ? ` de ${limit}. Cada posição segue a disciplina indicada pelo caderno.` : '. Você pode salvar o cabeçalho e completar as questões depois.'}`; };
    body.querySelector('#cxeBack').onclick = () => renderList(type);
    body.querySelector('#cxeAdd').onclick = () => { const holder = body.querySelector('#cxeQuestions'); const limit = type === 'enem' ? total(modelField.value) : 99; if (holder.children.length >= limit) return; holder.insertAdjacentHTML('beforeend',questionHtml({},holder.children.length,format,type,modelField?.value || '')); bindQuestions(); };
    if (type === 'enem') { modelField.onchange = () => { if (currentQuestions.length) return; const holder = form.querySelector('#cxeQuestions'); holder.innerHTML = questionHtml({},0,'ABCDE','enem',modelField.value); bindQuestions(); syncTitle(); }; form.elements.bimester.onchange = syncTitle; form.elements.academic_year.oninput = syncTitle; syncTitle(); }
    else form.elements.answer_format.onchange = event => { const chosen = event.target.value; form.querySelectorAll('.cxe-question').forEach(card => { const alternatives = {}; card.querySelectorAll('.cxeOption').forEach(input => { alternatives[input.dataset.choice] = input.value; }); const container = card.querySelector('.cxeOptions'); container.innerHTML = options(chosen).map(choice => `<div class="cxe-choice"><label>Alternativa ${choice}</label><input class="cxeOption" data-choice="${choice}" value="${esc(alternatives[choice] || '')}"></div>`).join(''); const answer = card.querySelector('.cxeAnswer'); if (answer) { if (chosen === 'LIVRE') { answer.previousElementSibling.remove(); answer.remove(); } else answer.innerHTML = `<option value="">Selecione</option>${options(chosen).map(choice => `<option value="${choice}">${choice}</option>`).join('')}`; } else if (chosen !== 'LIVRE') card.insertAdjacentHTML('beforeend',`<label>Gabarito (opcional)</label><select class="cxeAnswer"><option value="">Selecione</option>${options(chosen).map(choice => `<option value="${choice}">${choice}</option>`).join('')}</select>`); }); };
    form.onsubmit = saveExam;
    bindQuestions(); updateProgress();
  }
  async function saveExam(event) {
    event.preventDefault();
    const form = event.currentTarget, errorBox = form.querySelector('#cxeFormError');
    const type = viewType, model = type === 'enem' ? (form.elements.enem_model.value || exams.find(exam => exam.id === editingId)?.enem_model) : null;
    const format = type === 'enem' ? 'ABCDE' : form.elements.answer_format.value;
    const cards = [...form.querySelectorAll('.cxe-question')];
    const questions = [];
    let blankSeen = false;
    for (const card of cards) {
      const statement = card.querySelector('.cxeStatement').value.trim();
      const alternatives = Object.fromEntries([...card.querySelectorAll('.cxeOption')].map(input => [input.dataset.choice,input.value.trim()]));
      const answer = card.querySelector('.cxeAnswer')?.value || '';
      const hasAny = !!statement || !!answer || Object.values(alternatives).some(Boolean);
      if (!hasAny) { blankSeen = true; continue; }
      if (blankSeen || statement.length < 3) { errorBox.textContent = 'Preencha as questões em ordem, com enunciados válidos.'; return; }
      const question = {statement,alternatives,correct_answer:answer};
      if (type === 'enem') { question.subject = subjectAt(model,questions.length); if (options('ABCDE').some(choice => !alternatives[choice]) || !answer) { errorBox.textContent = `Complete as cinco alternativas e o gabarito da questão ${questions.length + 1}.`; return; } }
      questions.push(question);
    }
    const value = name => form.elements[name].value.trim();
    const payload = {exam_type:type,enem_model:model,subject:type === 'enem' ? 'Simulado do ENEM' : value('subject'),title:value('title'),academic_year:Number(value('academic_year')),bimester:Number(value('bimester')),scheduled_on:value('scheduled_on') || null,answer_format:format,header_school_name:value('header_school_name'),header_subtitle:value('header_subtitle'),instructions:value('instructions'),questions};
    if (type === 'enem' && (!plan(model) || questions.length > total(model))) { errorBox.textContent = 'Escolha um caderno ENEM válido.'; return; }
    if (payload.subject.length < 2 || payload.title.length < 3) { errorBox.textContent = 'Preencha a disciplina e o nome da prova.'; return; }
    const button = form.querySelector('[type="submit"]'); button.disabled = true; errorBox.textContent = '';
    try {
      const query = editingId ? db.from('class_exams').update(payload).eq('id',editingId).eq('school_id',schoolId).eq('class_id',context.classId).eq('created_by',userId) : db.from('class_exams').insert({...payload,school_id:schoolId,class_id:context.classId,created_by:userId});
      const {error} = await query.select('id').single();
      if (error) throw error;
      await loadExams(); renderList(type);
    } catch (saveError) { errorBox.textContent = errorMessage(saveError); button.disabled = false; }
  }
  function printExam(exam) {
    if (!exam) return;
    const popup = window.open('','_blank');
    if (!popup) { window.alert('Permita a abertura da janela para imprimir a prova.'); return; }
    const date = exam.scheduled_on ? String(exam.scheduled_on).split('-').reverse().join('/') : '____/____/________';
    const isEnem = exam.exam_type === 'enem';
    const intro = exam.instructions || (isEnem ? 'Leia atentamente cada questão. Assinale apenas uma alternativa correta e transcreva suas respostas para o cartão-resposta.' : '');
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(exam.title)}</title><style>body{font:12pt Arial,sans-serif;color:#111;margin:18mm}header{text-align:center;border-bottom:2px solid #222;padding-bottom:8mm;margin-bottom:8mm}h1{font-size:17pt;margin:4mm 0}h2{font-size:12pt;margin:2mm 0}.fields{display:grid;grid-template-columns:2fr 1fr;gap:6mm;margin:8mm 0}.question{break-inside:avoid;margin:9mm 0;line-height:1.5}.choice{margin:2mm 0 0 8mm}.answer-space{height:22mm;border-bottom:1px solid #ddd}.skills{border-bottom:1px solid #333;min-height:10mm;margin:6mm 0}@media print{@page{size:A4;margin:16mm}body{margin:0}}</style></head><body><header>${exam.header_school_name ? `<h2>${esc(exam.header_school_name)}</h2>` : ''}${exam.header_subtitle ? `<div>${esc(exam.header_subtitle)}</div>` : ''}<h1>${esc(exam.title)}</h1>${isEnem ? `<div>3ª SÉRIE DO ENSINO MÉDIO · ${exam.academic_year}</div>` : `<div>${esc(exam.subject)} · ${exam.bimester}º bimestre de ${exam.academic_year}</div>`}</header><div class="fields"><div>Aluno(a): _____________________________________</div><div>Data: ${date}</div><div>Turma: ${esc(context.className)}</div></div>${isEnem ? '<div class="skills"><strong>Habilidades:</strong></div>' : ''}${intro ? `<p>${breaks(intro)}</p>` : ''}${(exam.questions || []).map((question,index) => `<div class="question"><strong>QUESTÃO ${index + 1}${isEnem ? ` · ${esc(question.subject)}` : ''}</strong><div>${breaks(question.statement)}</div>${options(exam.answer_format).map(choice => question.alternatives?.[choice] ? `<div class="choice">${choice}) ${breaks(question.alternatives[choice])}</div>` : '').join('')}${exam.answer_format === 'LIVRE' ? '<div class="answer-space"></div>' : ''}</div>`).join('')}</body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }
  window.getClassExamPanelAction = () => roles.has(window.getActiveSchoolRole?.()) ? '<button id="classExamAction" type="button" class="btn secondary">Provas da turma</button>' : '';
  window.bindClassExamPanelAction = actionContext => { const button = document.querySelector('#classExamAction'); if (button) button.onclick = () => open(actionContext); };
})();
