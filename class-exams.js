// Provas do professor vinculadas à turma aberta. Cabeçalho comum à escola.
(() => {
  'use strict';
  const roles = new Set(['teacher','coordinator','school_admin']);
  const managers = new Set(['coordinator','school_admin']);
  const imageBucket = 'class-exam-images';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const answers = format => format === 'VF' ? ['V','F'] : format === 'ABCD' ? ['A','B','C','D'] : format === 'LIVRE' ? [] : ['A','B','C','D','E'];
  const labels = {mensal:'Prova mensal',bimestral:'Prova bimestral',enem:'Simulado do ENEM'};
  const models = {caderno_1:'Caderno 1 · 45 questões',caderno_2:'Caderno 2 · 45 questões',simuladao:'Simuladão ENEM · 90 questões'};
  let modal, body, context, schoolId, userId, exams=[], header=null, viewType=null, current=null, richControl=null, pendingUploads=[];

  const style = document.createElement('style');
  style.textContent = `#classExamModal{z-index:225}#classExamModal .modal{width:min(980px,100%)}#classExamModal .form{max-height:calc(94vh - 75px);overflow:auto}.cxe-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cxe-row.three{grid-template-columns:repeat(3,minmax(0,1fr))}.cxe-item,.cxe-menu-card,.cxe-question{border:1px solid #dce4f3;border-radius:10px;padding:14px;margin:12px 0}.cxe-toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:15px 0}.cxe-toolbar .btn{width:auto}.cxe-item{display:flex;align-items:center;justify-content:space-between;gap:15px}.cxe-item p{margin:5px 0;color:#667085;font-size:13px}.cxe-note{font-size:13px;color:#53627e}.cxe-error{color:#b42318;font-weight:700}.cxe-plan{background:#f3f6fc;border-radius:9px;padding:12px;margin:12px 0;font-size:13px}.cxe-question .cepi-rich-content{margin:8px 0}.cxe-logo-preview{max-width:120px;max-height:70px;object-fit:contain;display:block;margin:6px 0}.cxe-rich-toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid #cbd5e1;border-bottom:0;border-radius:10px 10px 0 0;background:#f8faff}.cxe-rich-toolbar button{min-width:34px;padding:6px 9px;border:1px solid #d7dfec;border-radius:6px;background:white;color:#26385d;cursor:pointer}.cxe-rich-editor{min-height:300px;padding:18px;border:1px solid #cbd5e1;border-radius:0 0 10px 10px;background:white;line-height:1.55;outline:none;overflow:auto}.cxe-rich-editor:empty:before{content:attr(data-placeholder);color:#7c89a3}.cxe-rich-editor img,.cepi-rich-content img{display:block;max-width:100%;max-height:540px;object-fit:contain;margin:12px auto}.cxe-rich-editor img.cepi-image-selected{outline:3px solid #6255db}.cxe-rich-editor table,.cepi-rich-content table{border-collapse:collapse;max-width:100%}.cxe-rich-editor td,.cxe-rich-editor th,.cepi-rich-content td,.cepi-rich-content th{border:1px solid #b8c3d6;padding:5px}.cxe-image-tools{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%;padding-top:8px;border-top:1px solid #d7dfec}.cxe-image-tools[hidden]{display:none}.cxe-image-tools input[type=range]{width:130px;min-height:auto}.cxe-image-tools button[aria-pressed=true]{background:#dedaff}.cxe-rich-toolbar .cxe-image-tools button{font-size:12px}@media(max-width:650px){.cxe-row,.cxe-row.three{grid-template-columns:1fr}.cxe-item{display:block}}`;
  document.head.appendChild(style);

  const rich = () => window.CepiRichText;
  const role = () => window.getActiveSchoolRole?.();
  const canEdit = exam => exam?.created_by === userId && !exam.finalized_at;
  const plan = model => window.CepiBlocks?.enemPlan(model) || [];
  const total = model => plan(model).reduce((sum,item)=>sum+item.count,0);
  function subjectAt(model,index) { let end=0; for(const item of plan(model)){end+=item.count;if(index<end)return item.subject;}return ''; }
  function message(error) { return error?.message || 'Não foi possível concluir a operação.'; }
  function ensureModal() {
    if(modal)return;
    modal=document.createElement('div');modal.id='classExamModal';modal.className='modal-bg hidden';
    modal.innerHTML='<div class="modal"><div class="modal-head"><div><h3>Provas da turma</h3><div id="classExamMeta" class="meta"></div></div><button type="button" class="close" aria-label="Fechar">×</button></div><div class="form" id="classExamBody"></div></div>';
    document.body.appendChild(modal);body=modal.querySelector('#classExamBody');
    modal.querySelector('.close').onclick=close;modal.onclick=event=>{if(event.target===modal)close();};
  }
  function dispose() {richControl?.dispose();richControl=null;pendingUploads=[];}
  function close() {dispose();modal?.classList.add('hidden');current=null;}
  function isThirdClass() {return /^(?:ENSINO\s+MEDIO\s+)?3(?=\D|$)/.test(String(context?.className||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase());}
  async function load() {
    const [proofs,heading]=await Promise.all([
      db.from('class_exams').select('*').eq('school_id',schoolId).eq('class_id',context.classId).order('updated_at',{ascending:false}),
      db.from('class_exam_headers').select('*').eq('school_id',schoolId).maybeSingle()
    ]);
    if(proofs.error)throw proofs.error;if(heading.error)throw heading.error;
    exams=proofs.data||[];header=heading.data||null;
  }
  async function open(nextContext) {
    if(!roles.has(role())||!nextContext?.classId)return;
    ensureModal();schoolId=window.getActiveSchoolId?.();if(!schoolId)return;
    const {data:{user},error}=await db.auth.getUser();if(error||!user)return;
    userId=user.id;context={classId:nextContext.classId,className:nextContext.className||'Turma'};
    modal.querySelector('#classExamMeta').textContent=context.className;modal.classList.remove('hidden');body.innerHTML='<p>Carregando provas…</p>';
    try{await load();renderMenu();}catch(reason){showError(message(reason));}
  }
  function showError(text) {body.innerHTML=`<p class="cxe-error" role="alert">${esc(text)}</p><button type="button" class="btn secondary" id="cxeBack">Voltar</button>`;body.querySelector('#cxeBack').onclick=renderMenu;}
  function renderMenu() {
    dispose();current=null;viewType=null;
    body.innerHTML=`<p class="cxe-note">Crie uma prova para ${esc(context.className)}. A autoria é de quem está acessando o Painel da Turma.</p><div class="cxe-menu-card"><h4>Provas do professor</h4><p class="cxe-note">Provas mensais e bimestrais de qualquer disciplina, com questões e imagens.</p><button type="button" class="btn primary" data-type="regular">Abrir provas da turma</button></div><div class="cxe-menu-card"><h4>Simulado do ENEM</h4><p class="cxe-note">Cadernos 1 e 2 ou Simuladão.</p>${isThirdClass()?'<button type="button" class="btn primary" data-type="enem">Abrir simulados do ENEM</button>':'<p class="cxe-note">Disponível na 3ª série do Ensino Médio.</p>'}</div>`;
    body.querySelectorAll('[data-type]').forEach(button=>button.onclick=()=>renderList(button.dataset.type));
  }
  function renderList(type=viewType) {
    dispose();viewType=type;current=null;
    const rows=exams.filter(exam=>type==='regular'?exam.exam_type!=='enem':exam.exam_type==='enem');
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeMenu">← Menu de provas</button><button type="button" class="btn primary" id="cxeNew">Criar provas</button>${managers.has(role())?'<button type="button" class="btn secondary" id="cxeHeader">Criar cabeçalho de prova</button>':''}</div><h4>${type==='enem'?'Simulados do ENEM':'Provas da turma'} · ${esc(context.className)}</h4>${rows.length?rows.map(exam=>`<div class="cxe-item"><div><strong>${esc(exam.title)}</strong><p>${esc(labels[exam.exam_type]||'Prova')} · ${esc(exam.subject)} · ${exam.academic_year} · ${(exam.questions||[]).length} questão(ões) · ${exam.finalized_at?'Finalizada':'Rascunho'}${exam.created_by!==userId?' · Outro professor':''}</p></div><div class="cxe-toolbar"><button type="button" class="btn secondary" data-open="${exam.id}">Abrir</button>${exam.finalized_at?`<button type="button" class="btn secondary" data-print="${exam.id}">Imprimir prova</button><button type="button" class="btn secondary" data-key="${exam.id}">Imprimir gabarito</button>`:''}</div></div>`).join(''):'<p class="cxe-note">Ainda não há provas deste tipo nesta turma.</p>'}`;
    body.querySelector('#cxeMenu').onclick=renderMenu;body.querySelector('#cxeNew').onclick=()=>renderExamForm(null,type);
    body.querySelector('#cxeHeader')?.addEventListener('click',renderHeader);
    body.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>renderExam(exams.find(item=>item.id===button.dataset.open)));
    body.querySelectorAll('[data-print]').forEach(button=>button.onclick=()=>printProof(exams.find(item=>item.id===button.dataset.print)));
    body.querySelectorAll('[data-key]').forEach(button=>button.onclick=()=>printKey(exams.find(item=>item.id===button.dataset.key)));
  }
  function renderExamForm(exam=null,type=viewType) {
    dispose();if(exam&&!canEdit(exam))return renderExam(exam);if(type==='enem'&&!isThirdClass())return;
    const model=exam?.enem_model||'caderno_1',format=exam?.answer_format||'ABCDE';
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button></div><form id="cxeForm"><h4>${exam?'Editar':'Criar'} ${type==='enem'?'simulado':'prova'}</h4>${type==='enem'?`<div class="cxe-row"><label>Caderno<select name="enem_model" ${exam?.questions?.length?'disabled':''}>${Object.entries(models).map(([value,label])=>`<option value="${value}"${model===value?' selected':''}>${label}</option>`).join('')}</select></label><label>Nome da prova<input name="title" readonly value="${esc(exam?.title||'')}"></label></div><div id="cxePlan" class="cxe-plan"></div>`:`<div class="cxe-row"><label>Tipo de prova<select name="exam_type"><option value="mensal"${exam?.exam_type==='mensal'?' selected':''}>Prova mensal</option><option value="bimestral"${exam?.exam_type==='bimestral'?' selected':''}>Prova bimestral</option></select></label><label>Disciplina<input name="subject" maxlength="100" required value="${esc(exam?.subject||'')}"></label></div><label>Nome da prova<input name="title" maxlength="200" required value="${esc(exam?.title||'')}"></label>`}<div class="cxe-row three"><label>Ano<input name="academic_year" type="number" min="2000" max="2100" required value="${exam?.academic_year||new Date().getFullYear()}"></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>`<option value="${n}"${(exam?.bimester||(type==='enem'?4:1))===n?' selected':''}>${n}º bimestre</option>`).join('')}</select></label><label>Data da prova (opcional)<input name="scheduled_on" type="date" value="${esc(exam?.scheduled_on||'')}"></label></div>${type!=='enem'?`<label>Formato das respostas<select name="answer_format"><option value="ABCDE"${format==='ABCDE'?' selected':''}>A, B, C, D, E</option><option value="ABCD"${format==='ABCD'?' selected':''}>A, B, C, D</option><option value="VF"${format==='VF'?' selected':''}>V ou F</option><option value="LIVRE"${format==='LIVRE'?' selected':''}>Resposta escrita</option></select></label>`:''}<p class="cxe-note">O cabeçalho geral da escola e os nomes da turma e dos alunos serão inseridos automaticamente ao imprimir.</p><p id="cxeFormError" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">Salvar e cadastrar questões</button></div></form>`;
    body.querySelector('#cxeBack').onclick=()=>renderList(type);
    const form=body.querySelector('#cxeForm');
    const sync=()=>{if(type!=='enem')return;const model=form.elements.enem_model.value;form.elements.title.value=window.CepiBlocks.title({kind:'simulado',stage:'medio',bimester:form.elements.bimester.value,academicYear:form.elements.academic_year.value,enemModel:model})||'';form.querySelector('#cxePlan').textContent=plan(model).map(item=>`${item.subject}: ${item.count}`).join(' · ');};
    form.elements.enem_model?.addEventListener('change',sync);form.elements.bimester.addEventListener('change',sync);form.elements.academic_year.addEventListener('input',sync);sync();
    form.onsubmit=async event=>{
      event.preventDefault();const errorBox=form.querySelector('#cxeFormError'),submit=form.querySelector('[type="submit"]');
      const value=name=>form.elements[name]?.value.trim()||'';
      const payload={exam_type:type==='enem'?'enem':value('exam_type'),enem_model:type==='enem'?(exam?.enem_model||value('enem_model')):null,subject:type==='enem'?'Simulado do ENEM':value('subject'),title:value('title'),academic_year:Number(value('academic_year')),bimester:Number(value('bimester')),scheduled_on:value('scheduled_on')||null,answer_format:type==='enem'?'ABCDE':value('answer_format')};
      if(payload.subject.length<2||payload.title.length<3){errorBox.textContent='Informe a disciplina e o nome da prova.';return;}
      if(exam?.questions?.length && exam.answer_format!==payload.answer_format){errorBox.textContent='O formato de resposta não pode mudar após cadastrar questões.';return;}
      submit.disabled=true;errorBox.textContent='';
      try{const query=exam?db.from('class_exams').update(payload).eq('id',exam.id).eq('school_id',schoolId).eq('class_id',context.classId).eq('created_by',userId):db.from('class_exams').insert({...payload,school_id:schoolId,class_id:context.classId,created_by:userId});const result=await query.select('id').single();if(result.error)throw result.error;await load();renderExam(exams.find(item=>item.id===(exam?.id||result.data.id)));}
      catch(reason){errorBox.textContent=message(reason);submit.disabled=false;}
    };
  }
  function legacyRich(question) {
    const value=String(question?.statement||'');if(value.startsWith(rich().marker))return value.slice(rich().marker.length);
    const paragraph=text=>`<p>${esc(text).replace(/\r?\n/g,'<br>')}</p>`;
    return paragraph(value)+Object.entries(question?.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>paragraph(`${letter}) ${text}`)).join('');
  }
  function renderExam(exam) {
    dispose();current=exam;if(!exam)return renderList();
    const questions=exam.questions||[],limit=exam.exam_type==='enem'?total(exam.enem_model):null;
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button>${canEdit(exam)?'<button type="button" class="btn secondary" id="cxeEdit">Editar dados da prova</button>':''}${exam.finalized_at?'<button type="button" class="btn primary" id="cxePrint">Imprimir prova</button><button type="button" class="btn secondary" id="cxeKey">Imprimir gabarito</button>':''}</div><h4>${esc(exam.title)}</h4><p class="cxe-note">${esc(exam.subject)} · ${esc(context.className)} · ${questions.length}${limit?` de ${limit}`:''} questão(ões) · ${exam.finalized_at?'Finalizada':'Rascunho'}</p>${exam.exam_type==='enem'?`<div class="cxe-plan">${plan(exam.enem_model).map(item=>`${esc(item.subject)}: ${item.count}`).join(' · ')}</div>`:''}${questions.map((question,index)=>`<div class="cxe-question"><strong>Questão ${index+1}${question.subject?` · ${esc(question.subject)}`:''}</strong><div class="cxe-question-content">${rich().render(question.statement,schoolId)}${!String(question.statement).startsWith(rich().marker)?Object.entries(question.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>`<p>${esc(letter)}) ${esc(text)}</p>`).join(''):''}</div><p class="cxe-note">Gabarito: ${esc(question.correct_answer||'Resposta escrita')}</p>${canEdit(exam)?`<button type="button" class="btn secondary" data-edit-question="${index}">Editar questão</button>${exam.exam_type!=='enem'||index===questions.length-1?`<button type="button" class="btn secondary" data-remove-question="${index}">Remover questão</button>`:''}`:''}</div>`).join('')}${canEdit(exam)?`<div class="cxe-toolbar">${!limit||questions.length<limit?'<button type="button" class="btn primary" id="cxeAdd">Adicionar questão</button>':''}<button type="button" class="btn secondary" id="cxeFinalize">Finalizar prova</button></div>`:''}<p id="cxeStatus" class="cxe-error" role="alert"></p>`;
    body.querySelector('#cxeBack').onclick=()=>renderList(exam.exam_type==='enem'?'enem':'regular');
    body.querySelector('#cxeEdit')?.addEventListener('click',()=>renderExamForm(exam,exam.exam_type==='enem'?'enem':'regular'));
    body.querySelector('#cxePrint')?.addEventListener('click',()=>printProof(exam));body.querySelector('#cxeKey')?.addEventListener('click',()=>printKey(exam));
    body.querySelector('#cxeAdd')?.addEventListener('click',()=>renderQuestionForm(exam));
    body.querySelector('#cxeFinalize')?.addEventListener('click',()=>finalize(exam));
    body.querySelectorAll('[data-edit-question]').forEach(button=>button.onclick=()=>renderQuestionForm(exam,Number(button.dataset.editQuestion)));
    body.querySelectorAll('[data-remove-question]').forEach(button=>button.onclick=()=>removeQuestion(exam,Number(button.dataset.removeQuestion)));
    body.querySelectorAll('.cxe-question-content').forEach(element=>rich().hydrate(element,db,schoolId,imageBucket).catch(()=>{}));
  }
  function toolbar() {return `<div class="cxe-rich-toolbar" aria-label="Formatação da questão"><button type="button" data-command="undo" title="Desfazer">↶</button><button type="button" data-command="redo" title="Refazer">↷</button><button type="button" data-command="bold" title="Negrito"><b>B</b></button><button type="button" data-command="italic" title="Itálico"><i>I</i></button><button type="button" data-command="underline" title="Sublinhado"><u>S</u></button><button type="button" data-command="justifyLeft" title="Alinhar à esquerda">☰</button><button type="button" data-command="justifyCenter" title="Centralizar">≡</button><button type="button" data-command="justifyRight" title="Alinhar à direita">☷</button><button type="button" data-command="insertUnorderedList">• Lista</button><button type="button" data-command="insertOrderedList">1. Lista</button><button type="button" data-table="1">▦ Tabela</button><button type="button" data-image="1">▧ Imagem</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="cxe-image-tools" hidden><strong>Imagem selecionada</strong><label>Tamanho <input type="range" min="10" max="100" step="5" aria-label="Tamanho da imagem"><output>100%</output></label><button type="button" data-image-align="left">Esquerda</button><button type="button" data-image-align="center">Centro</button><button type="button" data-image-align="right">Direita</button><button type="button" data-image-move="-1">↑ Subir</button><button type="button" data-image-move="1">↓ Descer</button><button type="button" data-image-remove="1">Excluir imagem</button><small>Ou arraste a imagem para outra posição no texto.</small></div></div>`;}
  function bindToolbar(form,editor,status) {
    const tools=form.querySelector('.cxe-rich-toolbar'),picker=tools.querySelector('input[type=file]'),imageTools=tools.querySelector('.cxe-image-tools'),widthInput=imageTools.querySelector('input[type=range]');
    richControl=rich().mount(editor,{db,schoolId,imageBucket,onError:text=>status.textContent=text,onImageSelection:image=>{imageTools.hidden=!image;if(image){widthInput.value=String(image.width);imageTools.querySelector('output').textContent=`${image.width}%`;imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.imageAlign===image.align)));}}});
    tools.querySelectorAll('[data-command]').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>{editor.focus();document.execCommand(button.dataset.command,false,null);};});
    tools.querySelector('[data-table]').onclick=()=>{editor.focus();document.execCommand('insertHTML',false,'<table><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table><p><br></p>');};
    tools.querySelector('[data-image]').onclick=()=>picker.click();picker.onchange=async()=>{if(picker.files?.[0])await richControl.insertImage(picker.files[0]);picker.value='';};
    widthInput.oninput=()=>richControl.setImageWidth(Number(widthInput.value));
    imageTools.querySelectorAll('button').forEach(button=>button.onmousedown=event=>event.preventDefault());
    imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.onclick=()=>richControl.setImageAlign(button.dataset.imageAlign));
    imageTools.querySelectorAll('[data-image-move]').forEach(button=>button.onclick=()=>richControl.moveImage(Number(button.dataset.imageMove)));
    imageTools.querySelector('[data-image-remove]').onclick=()=>richControl.removeImage();
  }
  function renderQuestionForm(exam,index=null) {
    if(!canEdit(exam))return;dispose();current=exam;
    const question=index===null?null:exam.questions[index],letters=answers(exam.answer_format),number=index===null?exam.questions.length+1:index+1;
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar à prova</button></div><form id="cxeQuestionForm"><h4>${question?'Editar':'Nova'} questão ${number}${exam.exam_type==='enem'?` · ${esc(subjectAt(exam.enem_model,number-1))}`:''}</h4><div><strong>Enunciado e alternativas *</strong><p class="cxe-note">Cole a questão completa do Word, inclusive alternativas. Você pode formatar texto, inserir tabelas e imagens.</p>${toolbar()}<div id="cxeEditor" class="cxe-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Enunciado e alternativas" data-placeholder="Cole ou escreva aqui o texto de apoio, a pergunta e as alternativas..."></div></div>${letters.length?`<label>Alternativa correta<select name="correct_answer" required><option value="">Selecione</option>${letters.map(letter=>`<option value="${letter}"${question?.correct_answer===letter?' selected':''}>${letter}</option>`).join('')}</select></label>`:'<p class="cxe-note">Resposta escrita: o aluno responde no espaço indicado na prova.</p>'}<p id="cxeQuestionStatus" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">${question?'Salvar alterações':'Salvar e ir para a próxima'}</button></div></form>`;
    const form=body.querySelector('#cxeQuestionForm'),editor=form.querySelector('#cxeEditor'),status=form.querySelector('#cxeQuestionStatus');
    editor.innerHTML=rich().sanitize(legacyRich(question),{schoolId});rich().hydrate(editor,db,schoolId,imageBucket).catch(reason=>status.textContent=message(reason));bindToolbar(form,editor,status);
    body.querySelector('#cxeBack').onclick=async()=>{if(pendingUploads.length)await richControl.rollback(pendingUploads).catch(()=>{});renderExam(exam);};
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Salvando questão…';
      try{
        const saved=await richControl.serialize();pendingUploads.push(...saved.uploaded);
        const questionValue={statement:saved.value,alternatives:{},correct_answer:form.elements.correct_answer?.value||''};
        if(exam.exam_type==='enem')questionValue.subject=subjectAt(exam.enem_model,number-1);
        const questions=[...(exam.questions||[])];if(index===null)questions.push(questionValue);else questions[index]=questionValue;
        const {error}=await db.from('class_exams').update({questions}).eq('id',exam.id).eq('school_id',schoolId).eq('class_id',context.classId).eq('created_by',userId).select('id').single();
        if(error)throw error;pendingUploads=[];dispose();await load();
        const updated=exams.find(item=>item.id===exam.id);
        if(index===null && (updated.exam_type!=='enem'||updated.questions.length<total(updated.enem_model)))renderQuestionForm(updated);
        else renderExam(updated);
      }catch(reason){
        if(pendingUploads.length){await richControl.rollback(pendingUploads).catch(()=>{});pendingUploads=[];}
        status.textContent=message(reason);button.disabled=false;
      }
    };
  }
  async function removeQuestion(exam,index) {
    if(!canEdit(exam)||(exam.exam_type==='enem'&&index!==exam.questions.length-1)||!window.confirm(`Remover a questão ${index+1}?`))return;
    const questions=exam.questions.filter((_,position)=>position!==index).map((question,position)=>exam.exam_type==='enem'?{...question,subject:subjectAt(exam.enem_model,position)}:question);
    const status=body.querySelector('#cxeStatus');try{const {error}=await db.from('class_exams').update({questions}).eq('id',exam.id).eq('school_id',schoolId).eq('created_by',userId).select('id').single();if(error)throw error;await load();renderExam(exams.find(item=>item.id===exam.id));}catch(reason){status.textContent=message(reason);}
  }
  async function finalize(exam) {
    const status=body.querySelector('#cxeStatus'),questions=exam.questions||[];
    if(!canEdit(exam))return;
    if(!questions.length){status.textContent='Cadastre ao menos uma questão antes de finalizar.';return;}
    if(exam.exam_type==='enem'&&questions.length!==total(exam.enem_model)){status.textContent='Complete todas as questões previstas neste caderno.';return;}
    if(exam.answer_format!=='LIVRE'&&questions.some(question=>!answers(exam.answer_format).includes(question.correct_answer))){status.textContent='Escolha a alternativa correta de todas as questões.';return;}
    if(!window.confirm('Finalizar a prova? Depois disso as questões não poderão ser editadas.'))return;
    try{const {error}=await db.from('class_exams').update({finalized_at:new Date().toISOString()}).eq('id',exam.id).eq('school_id',schoolId).eq('created_by',userId).is('finalized_at',null).select('id').single();if(error)throw error;await load();renderExam(exams.find(item=>item.id===exam.id));}catch(reason){status.textContent=message(reason);}
  }
  function renderHeader() {
    if(!managers.has(role()))return;dispose();
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button></div><form id="cxeHeaderForm"><h4>Cabeçalho de prova da escola</h4><p class="cxe-note">Este cabeçalho será usado em todas as provas da turma. Turma e nome do aluno entram automaticamente na impressão.</p><div class="cxe-row"><label>Nome do estado<input name="state_name" maxlength="100" value="${esc(header?.state_name||'')}"></label><label>Secretaria ou rede de ensino<input name="department_name" maxlength="160" value="${esc(header?.department_name||'')}"></label></div><label>Nome da escola<input name="school_name" maxlength="160" required value="${esc(header?.school_name||'')}"></label><label>Frase padrão para o aluno<input name="subtitle" maxlength="240" value="${esc(header?.subtitle||'Faça sua prova com atenção e confiança.')}"></label><label>Orientações gerais<textarea name="instructions" maxlength="1000">${esc(header?.instructions||'')}</textarea></label><div class="cxe-row"><label>Logo do estado<input name="state_logo" type="file" accept="image/png,image/jpeg,image/webp">${header?.state_logo_data?`<img class="cxe-logo-preview" alt="Logo do estado" src="${esc(header.state_logo_data)}">`:''}</label><label>Logo da escola<input name="school_logo" type="file" accept="image/png,image/jpeg,image/webp">${header?.school_logo_data?`<img class="cxe-logo-preview" alt="Logo da escola" src="${esc(header.school_logo_data)}">`:''}</label></div><p class="cxe-note">Cada logo deve ter até 300 KB.</p><p id="cxeHeaderStatus" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">Salvar cabeçalho</button></div></form>`;
    body.querySelector('#cxeBack').onclick=()=>renderList(viewType);
    const form=body.querySelector('#cxeHeaderForm');
    form.onsubmit=async event=>{
      event.preventDefault();const status=form.querySelector('#cxeHeaderStatus'),button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='';
      const readFile=file=>new Promise((resolve,reject)=>{if(!file)return resolve(null);if(file.size>300000||!['image/png','image/jpeg','image/webp'].includes(file.type))return reject(new Error('Use logo PNG, JPG ou WebP de até 300 KB.'));const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler o logo.'));reader.readAsDataURL(file);});
      try{const [stateLogo,schoolLogo]=await Promise.all([readFile(form.elements.state_logo.files[0]),readFile(form.elements.school_logo.files[0])]);const value=name=>form.elements[name].value.trim();const payload={school_id:schoolId,state_name:value('state_name'),department_name:value('department_name'),school_name:value('school_name'),subtitle:value('subtitle'),instructions:value('instructions'),state_logo_data:stateLogo||header?.state_logo_data||null,school_logo_data:schoolLogo||header?.school_logo_data||null,updated_by:userId};const {error}=await db.from('class_exam_headers').upsert(payload,{onConflict:'school_id'}).select('school_id').single();if(error)throw error;await load();renderList(viewType);}catch(reason){status.textContent=message(reason);button.disabled=false;}
    };
  }
  function printCss() {return `@page{size:A4;margin:14mm}body{font:11pt Arial,sans-serif;color:#111;margin:0}.student-copy{break-before:page}.student-copy:first-child{break-before:auto}.front{min-height:265mm;break-after:page}.identity{display:flex;align-items:center;justify-content:space-between;gap:8mm;text-align:center;border-bottom:2px solid #222;padding-bottom:5mm}.identity img{width:26mm;height:23mm;object-fit:contain}.identity h2{font-size:12pt;margin:2mm}.identity p{margin:1mm}.exam-title{text-align:center;font-size:16pt;margin:7mm 0}.student-line{border-bottom:1px solid #888;margin:6mm 0;padding-bottom:2mm}.instructions{font-size:10pt;white-space:pre-wrap}.answer-title{text-align:center;margin:12mm 0 7mm;font-size:15pt}.answer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm 7mm}.answer-row{border:1px solid #bbb;padding:3mm;white-space:nowrap;font-size:10pt}.bubble{display:inline-block;width:5mm;height:5mm;border:1.5px solid #333;border-radius:50%;vertical-align:middle;margin-left:2mm}.answer-grid.compact{grid-template-columns:repeat(6,1fr);gap:2mm}.answer-grid.compact .answer-row{padding:1mm;font-size:7pt}.answer-grid.compact .bubble{width:3.2mm;height:3.2mm;border-width:1px;margin-left:.4mm}.question{break-inside:avoid;margin:8mm 0;line-height:1.5}.question .cepi-rich-content{overflow-wrap:anywhere}.question img{display:block;max-width:100%;max-height:125mm;object-fit:contain}.question table{border-collapse:collapse}.question td,.question th{border:1px solid #888;padding:2mm}.question p{margin:2mm 0}.answer-space{height:32mm;border-bottom:1px solid #999}.key{padding-top:7mm}.key-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4mm}.key-cell{border:1px solid #999;padding:3mm;text-align:center}`;}
  function identity(exam) {return `<div class="identity">${header?.state_logo_data?`<img src="${esc(header.state_logo_data)}" alt="Logo do estado">`:'<span></span>'}<div>${header?.state_name?`<p>${esc(header.state_name)}</p>`:''}${header?.department_name?`<p>${esc(header.department_name)}</p>`:''}<h2>${esc(header?.school_name||exam.header_school_name||'')}</h2>${header?.subtitle?`<p>${esc(header.subtitle)}</p>`:''}</div>${header?.school_logo_data?`<img src="${esc(header.school_logo_data)}" alt="Logo da escola">`:'<span></span>'}</div>`;}
  function shell(title,contents) {return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${printCss()}</style></head><body>${contents}</body></html>`;}
  async function openPrint(html,popup=window.open('','_blank')) {
    if(!popup){window.alert('Permita a abertura da janela de impressão.');return;}
    popup.document.write(html);popup.document.close();
    await rich().hydrate(popup.document,db,schoolId,imageBucket);
    await Promise.all([...popup.document.images].map(image=>image.decode?.().catch(()=>{})||Promise.resolve()));
    popup.focus();popup.print();
  }
  async function studentRoster() {
    const roster=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('students').select('id,full_name').eq('school_id',schoolId).eq('class_id',context.classId).eq('enrollment_status','active').order('full_name').order('id').range(offset,offset+999);if(error)throw error;roster.push(...(data||[]));if((data||[]).length<1000)return roster;}
  }
  async function printProof(exam) {
    if(!exam?.finalized_at)return;
    const popup=window.open('','_blank');
    if(!popup){window.alert('Permita a abertura da janela de impressão.');return;}
    try{
      const students=await studentRoster();if(!students.length){popup.close?.();window.alert('Não há alunos ativos nesta turma para imprimir provas nominais.');return;}
      const choices=answers(exam.answer_format),date=exam.scheduled_on?String(exam.scheduled_on).split('-').reverse().join('/'):'____/____/________';
      const content=students.map(student=>`<section class="student-copy"><div class="front">${identity(exam)}<h1 class="exam-title">${esc(exam.title)}</h1><div class="student-line"><strong>Aluno(a): ${esc(student.full_name)}</strong></div><div class="student-line">Turma: ${esc(context.className)} · Disciplina: ${esc(exam.subject)} · Data: ${date}</div>${header?.instructions?`<p class="instructions">${esc(header.instructions)}</p>`:''}<h2 class="answer-title">Cartão-resposta</h2>${choices.length?`<div class="answer-grid${exam.questions.length>60?' compact':''}">${exam.questions.map((_,index)=>`<div class="answer-row"><strong>${String(index+1).padStart(2,'0')}</strong> ${choices.map(letter=>`${letter}<i class="bubble"></i>`).join(' ')}</div>`).join('')}</div>`:'<p>Responda às questões no espaço indicado em cada uma delas.</p>'}</div><div class="questions">${exam.questions.map((question,index)=>`<div class="question"><strong>QUESTÃO ${index+1}${question.subject?` · ${esc(question.subject)}`:''}</strong>${rich().render(question.statement,schoolId)}${!String(question.statement).startsWith(rich().marker)?Object.entries(question.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>`<p>${esc(letter)}) ${esc(text)}</p>`).join(''):''}${exam.answer_format==='LIVRE'?'<div class="answer-space"></div>':''}</div>`).join('')}</div></section>`).join('');
      await openPrint(shell(exam.title,content),popup);
    }catch(reason){popup.close?.();window.alert(message(reason));}
  }
  async function printKey(exam) {
    if(!exam?.finalized_at)return;const content=`<section class="key">${identity(exam)}<h1 class="exam-title">Gabarito oficial · ${esc(exam.title)}</h1><p>${esc(context.className)} · ${esc(exam.subject)} · ${exam.academic_year}</p>${exam.answer_format==='LIVRE'?'<p>Prova de resposta escrita. Corrija pelas respostas elaboradas pelos alunos.</p>':`<div class="key-grid">${exam.questions.map((question,index)=>`<div class="key-cell">${index+1}<br><strong>${esc(question.correct_answer)}</strong></div>`).join('')}</div>`}</section>`;try{await openPrint(shell(`Gabarito · ${exam.title}`,content));}catch(reason){window.alert(message(reason));}
  }
  window.getClassExamPanelAction=()=>roles.has(role())?'<button id="classExamAction" type="button" class="btn secondary">Provas da turma</button>':'';
  window.bindClassExamPanelAction=actionContext=>{const button=document.querySelector('#classExamAction');if(button)button.onclick=()=>open(actionContext);};
})();
