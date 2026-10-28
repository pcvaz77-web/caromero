// Provas do professor vinculadas à turma aberta. Cabeçalho comum à escola.
(() => {
  'use strict';
  const roles = new Set(['teacher','coordinator','school_admin']);
  const managers = new Set(['coordinator','school_admin']);
  const imageBucket = 'class-exam-images';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const answers = format => format === 'VF' ? ['V','F'] : format === 'ABCD' ? ['A','B','C','D'] : format === 'LIVRE' ? [] : ['A','B','C','D','E'];
  const questionFormat = (exam,question) => exam.answer_format === 'MISTA' ? question?.answer_format || 'ABCDE' : exam.answer_format;
  const formatName = {ABCDE:'A, B, C, D, E',ABCD:'A, B, C, D',VF:'V ou F',LIVRE:'Resposta escrita'};
  const labels = {mensal:'Prova mensal',bimestral:'Prova bimestral',enem:'Simulado do ENEM'};
  const models = {caderno_1:'Caderno 1 · 45 questões',caderno_2:'Caderno 2 · 45 questões',simuladao:'Simuladão ENEM · 90 questões'};
  const displayTitle = value => window.CepiBlocks.displayTitle(value);
  let modal, body, context, schoolId, userId, exams=[], header=null, pendingMedia=[], cepiEnabled=false, viewType=null, current=null, richControl=null, pendingUploads=[], correctionSession=null, correctionPoll=null, contributionDraft=null;

  const style = document.createElement('style');
  style.textContent = `#classExamModal{z-index:225}#classExamModal .modal{width:min(980px,100%)}#classExamModal .form{max-height:calc(94vh - 75px);overflow:auto}.cxe-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cxe-row.three{grid-template-columns:repeat(3,minmax(0,1fr))}.cxe-item,.cxe-menu-card,.cxe-question{border:1px solid #dce4f3;border-radius:10px;padding:14px;margin:12px 0}.cxe-toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:15px 0}.cxe-toolbar .btn{width:auto}.cxe-item{display:flex;align-items:center;justify-content:space-between;gap:15px}.cxe-item p{margin:5px 0;color:#667085;font-size:13px}.cxe-note{font-size:13px;color:#53627e}.cxe-error{color:#b42318;font-weight:700}.cxe-plan{background:#f3f6fc;border-radius:9px;padding:12px;margin:12px 0;font-size:13px}.cxe-question .cepi-rich-content{margin:8px 0}.cxe-logo-preview{max-width:120px;max-height:70px;object-fit:contain;display:block;margin:6px 0}.cxe-rich-toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid #cbd5e1;border-bottom:0;border-radius:10px 10px 0 0;background:#f8faff}.cxe-rich-toolbar button{min-width:34px;padding:6px 9px;border:1px solid #d7dfec;border-radius:6px;background:white;color:#26385d;cursor:pointer}.cxe-rich-editor{min-height:300px;padding:18px;border:1px solid #cbd5e1;border-radius:0 0 10px 10px;background:white;line-height:1.55;outline:none;overflow:auto}.cxe-rich-editor:empty:before{content:attr(data-placeholder);color:#7c89a3}.cxe-rich-editor img,.cepi-rich-content img{display:block;max-width:100%;max-height:540px;object-fit:contain;margin:12px auto}.cxe-rich-editor img.cepi-image-selected{outline:3px solid #6255db}.cxe-rich-editor table,.cepi-rich-content table{border-collapse:collapse;max-width:100%}.cxe-rich-editor td,.cxe-rich-editor th,.cepi-rich-content td,.cepi-rich-content th{border:1px solid #b8c3d6;padding:5px}.cxe-image-tools{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%;padding-top:8px;border-top:1px solid #d7dfec}.cxe-image-tools[hidden]{display:none}.cxe-image-tools input[type=range]{width:130px;min-height:auto}.cxe-image-tools button[aria-pressed=true]{background:#dedaff}.cxe-rich-toolbar .cxe-image-tools button{font-size:12px}@media(max-width:650px){.cxe-row,.cxe-row.three{grid-template-columns:1fr}.cxe-item{display:block}}`;
  style.textContent += `.cxe-delete{color:#b42318;border-color:#f1c0c0}.cxe-deleted{margin-top:18px;padding:10px 14px;border:1px solid #dce4f3;border-radius:10px}.cxe-deleted summary{cursor:pointer;font-weight:700}.cxe-print-count{max-width:440px}.cxe-print-count input{max-width:160px}.cxe-model-answer{width:100%;min-height:140px;white-space:pre-wrap}.cxe-subjects{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:16px 0}.cxe-subjects .btn{text-align:left}.cxe-subjects .btn:disabled{opacity:.55;cursor:not-allowed}`;
  document.head.appendChild(style);

  const rich = () => window.CepiRichText;
  const role = () => window.getActiveSchoolRole?.();
  const canEdit = exam => exam?.created_by === userId && !exam.finalized_at && !exam.deleted_at;
  const canContribute = exam => exam?.exam_type === 'enem' && !cepiEnabled && !exam.finalized_at && !exam.deleted_at && roles.has(role());
  const canManageExam = exam => !!exam && (managers.has(role()) || exam.created_by === userId);
  const canPurgeExam = exam => !!exam?.deleted_at && role()==='school_admin';
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
  async function close() {
    if(contributionDraft?.questions.length&&!window.confirm('Descartar as questões preparadas que ainda não foram enviadas?'))return;
    if(contributionDraft?.uploads.length){
      const removed=await db.storage.from(imageBucket).remove(contributionDraft.uploads);
      if(removed.error){window.alert('Não foi possível limpar as imagens preparadas. Tente novamente.');return;}
    }
    contributionDraft=null;dispose();endCorrection();modal?.classList.add('hidden');current=null;
  }
  function isThirdClass() {return /^(?:ENSINO\s+MEDIO\s+)?3(?=\D|$)/.test(String(context?.className||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase());}
  async function load() {
    const [proofs,sharedEnem,heading,media]=await Promise.all([
      db.from('class_exams').select('*').eq('school_id',schoolId).eq('class_id',context.classId).order('updated_at',{ascending:false}),
      !cepiEnabled&&isThirdClass()?db.from('class_exams').select('*').eq('school_id',schoolId).eq('exam_type','enem').order('updated_at',{ascending:false}):Promise.resolve({data:[],error:null}),
      db.from('class_exam_headers').select('*').eq('school_id',schoolId).maybeSingle(),
      role()==='school_admin'?db.rpc('class_exam_purge_media_pending',{p_school_id:schoolId}):Promise.resolve({data:[],error:null})
    ]);
    if(proofs.error)throw proofs.error;if(sharedEnem.error)throw sharedEnem.error;if(heading.error)throw heading.error;if(media.error)throw media.error;
    exams=[...new Map([...(proofs.data||[]),...(sharedEnem.data||[])].map(exam=>[exam.id,exam])).values()];header=heading.data||null;pendingMedia=media.data||[];
  }
  async function open(nextContext,requestedExamId=null) {
    if(!roles.has(role())||!nextContext?.classId)return;
    ensureModal();schoolId=window.getActiveSchoolId?.();if(!schoolId)return;
    const {data:{user},error}=await db.auth.getUser();if(error||!user)return;
    userId=user.id;context={classId:nextContext.classId,className:nextContext.className||'Turma'};
    modal.querySelector('#classExamMeta').textContent=context.className;modal.classList.remove('hidden');body.innerHTML='<p>Carregando provas…</p>';
    try{const cepi=await db.rpc('get_cepi_access_context',{p_school_id:schoolId});if(cepi.error)throw cepi.error;cepiEnabled=Boolean(cepi.data?.enabled);await load();const requested=exams.find(item=>item.id===requestedExamId&&!item.deleted_at);requested?renderExam(requested):renderMenu();}catch(reason){showError(message(reason));}
  }
  function showError(text) {body.innerHTML=`<p class="cxe-error" role="alert">${esc(text)}</p><button type="button" class="btn secondary" id="cxeBack">Voltar</button>`;body.querySelector('#cxeBack').onclick=renderMenu;}
  function renderMenu() {
    dispose();current=null;viewType=null;
    body.innerHTML=`<p class="cxe-note">Crie uma prova para ${esc(context.className)}. A autoria é de quem está acessando o Painel da Turma.</p><div class="cxe-menu-card"><h4>Provas do professor</h4><p class="cxe-note">Provas mensais e bimestrais de qualquer disciplina, com questões e imagens.</p><button type="button" class="btn primary" data-type="regular">Abrir provas da turma</button></div>${!cepiEnabled?`<div class="cxe-menu-card"><h4>Simulado do ENEM</h4><p class="cxe-note">Cadernos 1 e 2 ou Simuladão.</p>${isThirdClass()?'<button type="button" class="btn primary" data-type="enem">Abrir simulados do ENEM</button>':'<p class="cxe-note">Disponível na 3ª série do Ensino Médio.</p>'}</div>`:''}`;
    body.querySelectorAll('[data-type]').forEach(button=>button.onclick=()=>renderList(button.dataset.type));
  }
  function renderList(type=viewType) {
    dispose();viewType=type;current=null;
    const matchesType = exam => type==='regular'?exam.exam_type!=='enem':exam.exam_type==='enem';
    const rows=exams.filter(exam=>!exam.deleted_at&&matchesType(exam));
    const deleted=exams.filter(exam=>exam.deleted_at&&matchesType(exam)&&canManageExam(exam));
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeMenu">← Menu de provas</button><button type="button" class="btn primary" id="cxeNew">Criar provas</button>${managers.has(role())?'<button type="button" class="btn secondary" id="cxeHeader">Criar cabeçalho de prova</button>':''}</div><h4>${type==='enem'?'Simulados do ENEM':'Provas da turma'} · ${esc(context.className)}</h4>${rows.length?rows.map(exam=>`<div class="cxe-item"><div><strong>${esc(displayTitle(exam.title))}</strong><p>${esc(labels[exam.exam_type]||'Prova')} · ${esc(exam.subject)} · ${exam.academic_year} · ${(exam.questions||[]).length} questão(ões) · ${exam.finalized_at?'Finalizada':'Rascunho'}${exam.created_by!==userId?' · Outro professor':''}</p></div><div class="cxe-toolbar"><button type="button" class="btn secondary" data-open="${exam.id}">Abrir</button>${exam.finalized_at?`<button type="button" class="btn secondary" data-print="${exam.id}">Imprimir prova</button><button type="button" class="btn secondary" data-key="${exam.id}">Imprimir gabarito</button>`:''}</div></div>`).join(''):'<p class="cxe-note">Ainda não há provas deste tipo nesta turma.</p>'}`;
    body.querySelector('#cxeMenu').onclick=renderMenu;body.querySelector('#cxeNew').onclick=()=>renderExamForm(null,type);
    body.querySelector('#cxeHeader')?.addEventListener('click',renderHeader);
    body.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>renderExam(exams.find(item=>item.id===button.dataset.open)));
    body.querySelectorAll('[data-print]').forEach(button=>button.onclick=()=>printProof(exams.find(item=>item.id===button.dataset.print)));
    body.querySelectorAll('[data-key]').forEach(button=>button.onclick=()=>printKey(exams.find(item=>item.id===button.dataset.key)));
    body.querySelectorAll('.cxe-item').forEach((item,index)=>{
      const exam=rows[index];
      if(!canManageExam(exam))return;
      const button=document.createElement('button');
      button.type='button';button.className='btn secondary cxe-delete';button.textContent='Excluir prova';
      item.querySelector('.cxe-toolbar').append(button);
      button.onclick=()=>setExamDeleted(exam,false,button);
    });
    if(deleted.length){
      const box=document.createElement('details');box.className='cxe-deleted';
      box.innerHTML=`<summary>Provas excluídas (${deleted.length})</summary>${deleted.map(exam=>`<div class="cxe-item"><div><strong>${esc(displayTitle(exam.title))}</strong><p>${esc(labels[exam.exam_type]||'Prova')} · ${esc(exam.subject)} · questões e correções preservadas</p></div><div class="cxe-toolbar"><button type="button" class="btn secondary" data-restore="${esc(exam.id)}">Restaurar prova</button>${canPurgeExam(exam)?`<button type="button" class="btn secondary cxe-delete" data-purge="${esc(exam.id)}">Excluir definitivamente</button>`:''}</div></div>`).join('')}`;
      body.append(box);
      box.querySelectorAll('[data-restore]').forEach(button=>button.onclick=()=>setExamDeleted(deleted.find(exam=>exam.id===button.dataset.restore),true,button));
      box.querySelectorAll('[data-purge]').forEach(button=>button.onclick=()=>purgeExam(deleted.find(exam=>exam.id===button.dataset.purge),button));
    }
    if(pendingMedia.length){
      body.insertAdjacentHTML('beforeend',`<div class="cxe-deleted"><p class="cxe-note">${pendingMedia.length} imagem(ns) de provas já excluídas aguardam limpeza.</p><button type="button" class="btn secondary" id="cxeCleanMedia">Concluir limpeza de imagens</button></div>`);
      body.querySelector('#cxeCleanMedia').onclick=()=>cleanupPurgedMedia();
    }
    body.insertAdjacentHTML('beforeend','<p id="cxeListStatus" class="cxe-note" role="status"></p>');
  }
  async function setExamDeleted(exam,restore,button){
    if(!canManageExam(exam)||Boolean(exam.deleted_at)!==restore||window.getActiveSchoolId?.()!==schoolId)return;
    if(!restore&&!window.confirm(`Excluir a prova “${displayTitle(exam.title)}” desta turma? As questões e correções serão preservadas, e a prova poderá ser restaurada.`))return;
    button.disabled=true;
    const status=body.querySelector('#cxeListStatus');
    try{
      const {data,error}=await db.rpc('set_class_exam_deleted',{p_school_id:schoolId,p_class_id:exam.class_id,p_exam_id:exam.id,p_restore:restore});
      if(error||data!==true)throw error||new Error('A prova mudou. Atualize a lista e tente novamente.');
      if(window.getActiveSchoolId?.()!==schoolId)return;
      await load();renderList(viewType);
      body.querySelector('#cxeListStatus').textContent=restore?'Prova restaurada.':'Prova excluída das listas. Ela pode ser restaurada.';
    }catch(reason){if(status?.isConnected){status.className='cxe-error';status.textContent=message(reason);}}
    finally{if(button.isConnected)button.disabled=false;}
  }
  async function purgeExam(exam,button){
    if(!canPurgeExam(exam)||window.getActiveSchoolId?.()!==schoolId)return;
    const answer=window.prompt(`Excluir definitivamente a prova “${displayTitle(exam.title)}”? A prova, as questões, o gabarito e todas as correções serão apagados sem possibilidade de restauração. Digite EXCLUIR para confirmar.`);
    if(answer!=='EXCLUIR')return;
    button.disabled=true;
    const status=body.querySelector('#cxeListStatus');
    try{
      const {data,error}=await db.rpc('purge_class_exam',{p_school_id:schoolId,p_class_id:exam.class_id,p_exam_id:exam.id});
      if(error||!data)throw error||new Error('Não foi possível excluir a prova.');
      await load();renderList(viewType);
      const next=body.querySelector('#cxeListStatus');
      next.textContent=`Prova excluída definitivamente. ${data.results_deleted||0} correção(ões) apagada(s).`;
      if(pendingMedia.length)await cleanupPurgedMedia();
    }catch(reason){if(status?.isConnected){status.className='cxe-error';status.textContent=message(reason);}}
    finally{if(button.isConnected)button.disabled=false;}
  }
  async function cleanupPurgedMedia(){
    if(role()!=='school_admin'||window.getActiveSchoolId?.()!==schoolId)return;
    const status=body.querySelector('#cxeListStatus');
    try{
      for(let offset=0;offset<pendingMedia.length;offset+=100){
        const paths=pendingMedia.slice(offset,offset+100);
        const removed=await db.storage.from(imageBucket).remove(paths);
        if(removed.error)throw removed.error;
        const acknowledged=await db.rpc('class_exam_purge_media_ack',{p_school_id:schoolId,p_paths:paths});
        if(acknowledged.error||acknowledged.data!==paths.length)throw acknowledged.error||new Error('A limpeza das imagens ainda está pendente.');
      }
      await load();renderList(viewType);
      body.querySelector('#cxeListStatus').textContent='Imagens da prova removidas. A exclusão definitiva foi concluída.';
    }catch(reason){
      if(status?.isConnected){status.className='cxe-error';status.textContent=`A prova foi excluída, mas a limpeza das imagens ficou pendente: ${message(reason)} Use “Concluir limpeza de imagens” para tentar novamente.`;}
    }
  }
  function renderExamForm(exam=null,type=viewType) {
    dispose();if(exam&&!canEdit(exam))return renderExam(exam);if(type==='enem'&&(cepiEnabled||!isThirdClass()))return;
    const model=exam?.enem_model||'caderno_1',format=exam?.answer_format||'ABCDE';
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button></div><form id="cxeForm"><h4>${exam?'Editar':'Criar'} ${type==='enem'?'simulado':'prova'}</h4>${type==='enem'?`<div class="cxe-row"><label>Caderno<select name="enem_model" ${exam?.questions?.length?'disabled':''}>${Object.entries(models).map(([value,label])=>`<option value="${value}"${model===value?' selected':''}>${label}</option>`).join('')}</select></label><label>Nome da prova<input name="title" readonly value="${esc(exam?.title||'')}"></label></div><div id="cxePlan" class="cxe-plan"></div><label>Frase para transcrição no cartão-resposta<input name="transcription_phrase" maxlength="240" required value="${esc(exam?.transcription_phrase||'Faça sua prova com atenção e confiança.')}"></label>`:`<div class="cxe-row"><label>Tipo de prova<select name="exam_type"><option value="mensal"${exam?.exam_type==='mensal'?' selected':''}>Prova mensal</option><option value="bimestral"${exam?.exam_type==='bimestral'?' selected':''}>Prova bimestral</option></select></label><label>Disciplina<input name="subject" maxlength="100" required value="${esc(exam?.subject||'')}"></label></div><label>Nome da prova<input name="title" maxlength="200" required value="${esc(exam?.title||'')}"></label>`}<div class="cxe-row three"><label>Ano<input name="academic_year" type="number" min="2000" max="2100" required value="${exam?.academic_year||new Date().getFullYear()}"></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>`<option value="${n}"${(exam?.bimester||(type==='enem'?4:1))===n?' selected':''}>${n}º bimestre</option>`).join('')}</select></label><label>Data da prova (opcional)<input name="scheduled_on" type="date" value="${esc(exam?.scheduled_on||'')}"></label></div>${type!=='enem'?`<label>Formato das respostas<select name="answer_format"><option value="ABCDE"${format==='ABCDE'?' selected':''}>A, B, C, D, E</option><option value="ABCD"${format==='ABCD'?' selected':''}>A, B, C, D</option><option value="VF"${format==='VF'?' selected':''}>V ou F</option><option value="LIVRE"${format==='LIVRE'?' selected':''}>Resposta escrita</option><option value="MISTA"${format==='MISTA'?' selected':''}>Mista (escolher em cada questão)</option></select></label>`:''}<p class="cxe-note">O cabeçalho geral da escola e os nomes da turma e dos alunos serão inseridos automaticamente ao imprimir.</p><p id="cxeFormError" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">Salvar e cadastrar questões</button></div></form>`;
    body.querySelector('#cxeBack').onclick=()=>renderList(type);
    const form=body.querySelector('#cxeForm');
    const sync=()=>{if(type!=='enem')return;const model=form.elements.enem_model.value;form.elements.title.value=window.CepiBlocks.title({kind:'simulado',stage:'medio',bimester:form.elements.bimester.value,academicYear:form.elements.academic_year.value,enemModel:model})||'';form.querySelector('#cxePlan').textContent=plan(model).map(item=>`${item.subject}: ${item.count}`).join(' · ');};
    form.elements.enem_model?.addEventListener('change',sync);form.elements.bimester.addEventListener('change',sync);form.elements.academic_year.addEventListener('input',sync);sync();
    form.onsubmit=async event=>{
      event.preventDefault();const errorBox=form.querySelector('#cxeFormError'),submit=form.querySelector('[type="submit"]');
      const value=name=>form.elements[name]?.value.trim()||'';
      const payload={exam_type:type==='enem'?'enem':value('exam_type'),enem_model:type==='enem'?(exam?.enem_model||value('enem_model')):null,subject:type==='enem'?'Simulado do ENEM':value('subject'),title:value('title'),academic_year:Number(value('academic_year')),bimester:Number(value('bimester')),scheduled_on:value('scheduled_on')||null,answer_format:type==='enem'?'ABCDE':value('answer_format'),transcription_phrase:type==='enem'?value('transcription_phrase'):''};
      if(type==='enem' && payload.enem_model!=='simuladao')payload.title=payload.title.replace(/^SIMULADO ENEM - CADERNO /,'SIMULA - ENEM - CADERNO ');
      if(payload.subject.length<2||payload.title.length<3){errorBox.textContent='Informe a disciplina e o nome da prova.';return;}
      if(exam?.questions?.length && exam.answer_format!==payload.answer_format){errorBox.textContent='O formato de resposta não pode mudar após cadastrar questões.';return;}
      submit.disabled=true;errorBox.textContent='';
      try{let query=exam?db.from('class_exams').update(payload).eq('id',exam.id).eq('school_id',schoolId).eq('class_id',exam.class_id).eq('created_by',userId):db.from('class_exams').insert({...payload,school_id:schoolId,class_id:context.classId,created_by:userId});if(exam?.exam_type==='enem')query=query.eq('updated_at',exam.updated_at);const result=await query.select('id').single();if(result.error)throw result.error;await load();renderExam(exams.find(item=>item.id===(exam?.id||result.data.id)));}
      catch(reason){errorBox.textContent=message(reason);submit.disabled=false;}
    };
  }
  function legacyRich(question) {
    const value=String(question?.statement||'');if(value.startsWith(rich().marker))return value.slice(rich().marker.length);
    const paragraph=text=>`<p>${esc(text).replace(/\r?\n/g,'<br>')}</p>`;
    return paragraph(value)+Object.entries(question?.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>paragraph(`${letter}) ${text}`)).join('');
  }
  function renderExam(exam) {
    dispose();current=exam;if(!exam||exam.deleted_at)return renderList();
    const questions=exam.questions||[],limit=exam.exam_type==='enem'?total(exam.enem_model):null;
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar às provas</button>${canEdit(exam)?'<button type="button" class="btn secondary" id="cxeEdit">Editar dados da prova</button>':''}${exam.finalized_at?'<button type="button" class="btn primary" id="cxePrint">Imprimir prova</button><button type="button" class="btn secondary" id="cxeKey">Imprimir gabarito</button>':''}</div><h4>${esc(displayTitle(exam.title))}</h4><p class="cxe-note">${esc(exam.subject)} · ${esc(context.className)} · ${questions.length}${limit?` de ${limit}`:''} questão(ões) · ${exam.finalized_at?'Finalizada':'Rascunho'}</p>${exam.exam_type==='enem'?`<div class="cxe-plan">${plan(exam.enem_model).map(item=>`${esc(item.subject)}: ${item.count}`).join(' · ')}</div>`:''}${questions.map((question,index)=>`<div class="cxe-question"><strong>Questão ${index+1}${question.subject?` · ${esc(question.subject)}`:''}</strong><div class="cxe-question-content">${rich().render(question.statement,schoolId)}${!String(question.statement).startsWith(rich().marker)?Object.entries(question.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>`<p>${esc(letter)}) ${esc(text)}</p>`).join(''):''}</div>${exam.answer_format==='LIVRE'?'<p class="cxe-note" style="white-space:pre-wrap"><strong>Resposta correta:</strong> '+esc(question.model_answer||'Ainda não cadastrada.')+'</p>':`<p class="cxe-note">Gabarito: ${esc(question.correct_answer)}</p>`}${canEdit(exam)?`<button type="button" class="btn secondary" data-edit-question="${index}">Editar questão</button>${exam.exam_type!=='enem'||index===questions.length-1?`<button type="button" class="btn secondary" data-remove-question="${index}">Remover questão</button>`:''}`:''}</div>`).join('')}${canEdit(exam)?`<div class="cxe-toolbar">${!limit||questions.length<limit?'<button type="button" class="btn primary" id="cxeAdd">Adicionar questão</button>':''}<button type="button" class="btn secondary" id="cxeFinalize">Finalizar prova</button></div>`:''}<p id="cxeStatus" class="cxe-error" role="alert"></p>`;
    body.querySelectorAll('.cxe-question').forEach((element,index)=>{
      const question=questions[index],format=questionFormat(exam,question),answer=element.querySelector('.cxe-note');
      if(answer)answer.innerHTML=format==='LIVRE'?`<strong>Resposta escrita:</strong> ${esc(question.model_answer||'Ainda não cadastrada.')}`:`<strong>${esc(formatName[format])}:</strong> ${esc(question.correct_answer)}`;
      if(answer)answer.style.whiteSpace=format==='LIVRE'?'pre-wrap':'';
    });
    if(exam.exam_type==='enem'){
      const distribution=plan(exam.enem_model).map(item=>`${esc(item.subject)}: ${(exam.questions||[]).filter(question=>question.subject===item.subject).length}/${item.count}`).join(' · ');
      const progress=body.querySelector('.cxe-plan');if(progress)progress.innerHTML=distribution;
      const refresh=document.createElement('button');refresh.type='button';refresh.className='btn secondary';refresh.textContent='Atualizar simulado';
      body.querySelector('.cxe-toolbar').append(refresh);refresh.onclick=async()=>{
        refresh.disabled=true;
        try{await load();const updated=exams.find(item=>item.id===exam.id);if(!updated)throw new Error('Simulado não encontrado.');renderExam(updated);}
        catch(reason){const status=body.querySelector('#cxeStatus');if(status)status.textContent=message(reason);refresh.disabled=false;}
      };
      if(canEdit(exam))body.querySelectorAll('.cxe-question').forEach((element,index)=>{
        if(index===questions.length-1)return;
        const button=document.createElement('button');button.type='button';button.className='btn secondary';button.dataset.removeQuestion=String(index);button.textContent='Remover questão';element.append(button);
      });
      const addButton=body.querySelector('#cxeAdd');if(addButton)addButton.textContent='Adicionar questões por disciplina';
      if(canContribute(exam)&&questions.length<limit&&!canEdit(exam)){
        const button=document.createElement('button');button.type='button';button.id='cxeAdd';button.className='btn primary';button.textContent='Adicionar questões por disciplina';
        body.querySelector('#cxeStatus').before(button);
      }
    }
    if(exam.exam_type==='enem'&&exam.finalized_at&&exam.created_by===userId){
      const button=document.createElement('button');button.type='button';button.id='cxeCorrect';button.className='btn primary';button.textContent='Corrigir cartões pelo celular';body.querySelector('.cxe-toolbar').append(button);button.onclick=()=>renderCorrection(exam);
    }
    body.querySelector('#cxeBack').onclick=()=>renderList(exam.exam_type==='enem'?'enem':'regular');
    body.querySelector('#cxeEdit')?.addEventListener('click',()=>renderExamForm(exam,exam.exam_type==='enem'?'enem':'regular'));
    body.querySelector('#cxePrint')?.addEventListener('click',()=>printProof(exam));body.querySelector('#cxeKey')?.addEventListener('click',()=>printKey(exam));
    body.querySelector('#cxeAdd')?.addEventListener('click',()=>renderQuestionForm(exam));
    body.querySelector('#cxeFinalize')?.addEventListener('click',()=>finalize(exam));
    body.querySelectorAll('[data-edit-question]').forEach(button=>button.onclick=()=>renderQuestionForm(exam,Number(button.dataset.editQuestion)));
    body.querySelectorAll('[data-remove-question]').forEach(button=>button.onclick=()=>removeQuestion(exam,Number(button.dataset.removeQuestion)));
    body.querySelectorAll('.cxe-question-content').forEach(element=>rich().hydrate(element,db,schoolId,imageBucket).catch(()=>{}));
  }
  function toolbar() { return rich().toolbar('cxeEditor', 'cxe-rich-toolbar'); }
  function bindToolbar(form, editor, status) { richControl=rich().bindToolbar(form, editor, { db, schoolId, imageBucket, onError:text=>status.textContent=text }); }

  async function openSubjectPicker(exam){
    if(!canContribute(exam)||window.getActiveSchoolId?.()!==schoolId)return;
    try{await load();const updated=exams.find(item=>item.id===exam.id);if(!updated||!canContribute(updated))throw new Error('Este simulado não recebe mais questões.');renderSubjectPicker(updated);}
    catch(reason){const status=body.querySelector('#cxeStatus');if(status)status.textContent=message(reason);else showError(message(reason));}
  }
  function renderSubjectPicker(exam){
    contributionDraft=null;dispose();current=exam;
    const distribution=plan(exam.enem_model).map(item=>({ ...item,used:(exam.questions||[]).filter(question=>question.subject===item.subject).length }));
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar ao simulado</button><button type="button" class="btn secondary" id="cxeRefreshSubjects">Atualizar disciplinas</button></div><h4>Escolha a disciplina</h4><p class="cxe-note">As questões enviadas entram no mesmo simulado para todas as turmas de 3ª série da escola. Ao atingir a quantidade prevista, a disciplina fecha para todos.</p><div class="cxe-subjects">${distribution.map(item=>`<button type="button" class="btn secondary" data-subject="${esc(item.subject)}" ${item.used>=item.count?'disabled':''}>${esc(item.subject)} · ${item.used}/${item.count}${item.used>=item.count?' · completa':''}</button>`).join('')}</div><p id="cxeSubjectStatus" class="cxe-error" role="status"></p>`;
    body.querySelector('#cxeBack').onclick=()=>renderExam(exam);
    body.querySelector('#cxeRefreshSubjects').onclick=()=>openSubjectPicker(exam);
    body.querySelectorAll('[data-subject]').forEach(button=>button.onclick=()=>renderContributionForm(exam,{subject:button.dataset.subject,questions:[],uploads:[]}));
  }
  function renderContributionForm(exam,state){
    if(!canContribute(exam))return renderExam(exam);
    contributionDraft=state;dispose();current=exam;
    const entry=plan(exam.enem_model).find(item=>item.subject===state.subject);
    const used=(exam.questions||[]).filter(question=>question.subject===state.subject).length;
    const remaining=entry.count-used-state.questions.length;
    if(remaining<0)return renderSubjectPicker(exam);
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Escolher outra disciplina</button></div><h4>${esc(state.subject)} · ${used+state.questions.length}/${entry.count} questões</h4><p class="cxe-note">${state.questions.length} questão(ões) preparadas nesta contribuição. Envie as questões para salvar e avisar quem criou o simulado.</p>${remaining?`<form id="cxeContributionForm"><div><strong>Nova questão ${used+state.questions.length+1}</strong><p class="cxe-note">Cole o enunciado e as cinco alternativas. Você pode usar imagens e tabelas.</p>${toolbar()}<div id="cxeEditor" class="cxe-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Enunciado e alternativas"></div></div><label>Alternativa correta<select name="correct_answer" required><option value="">Selecione</option>${answers('ABCDE').map(letter=>`<option value="${letter}">${letter}</option>`).join('')}</select></label><div class="actions"><button type="submit" class="btn primary">Preparar questão</button></div></form>`:'<p class="cxe-note">Quantidade prevista preenchida. Envie as questões para concluir esta disciplina.</p>'}<div class="cxe-toolbar"><button type="button" class="btn primary" id="cxeSendSubject" ${state.questions.length?'':'disabled'}>Enviar ${state.questions.length} questão(ões) de ${esc(state.subject)}</button></div><p id="cxeContributionStatus" class="cxe-error" role="status"></p>`;
    const status=body.querySelector('#cxeContributionStatus');
    body.querySelector('#cxeBack').onclick=async()=>{
      if(state.questions.length&&!window.confirm('Descartar as questões preparadas que ainda não foram enviadas?'))return;
      if(state.uploads.length){const removed=await db.storage.from(imageBucket).remove(state.uploads);if(removed.error){status.textContent='Não foi possível limpar as imagens preparadas. Tente novamente.';return;}}
      contributionDraft=null;renderSubjectPicker(exam);
    };
    body.querySelector('#cxeSendSubject').onclick=()=>sendEnemContribution(exam,state,status);
    if(!remaining)return;
    const form=body.querySelector('#cxeContributionForm'),editor=form.querySelector('#cxeEditor');
    bindToolbar(form,editor,status);
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Preparando questão…';
      try{
        if(!form.elements.correct_answer.value)throw new Error('Escolha a alternativa correta.');
        const saved=await richControl.serialize();
        if(!saved.value||saved.value.length<3)throw new Error('Escreva o enunciado e as alternativas.');
        state.questions.push({statement:saved.value,alternatives:{},correct_answer:form.elements.correct_answer.value});
        state.uploads.push(...saved.uploaded);
        renderContributionForm(exam,state);
      }catch(reason){status.textContent=message(reason);button.disabled=false;}
    };
  }
  async function sendEnemContribution(exam,state,status){
    if(!state.questions.length||window.getActiveSchoolId?.()!==schoolId)return;
    const button=body.querySelector('#cxeSendSubject');button.disabled=true;status.textContent='Enviando questões…';
    try{
      const {data,error}=await db.rpc('class_exam_add_enem_questions',{p_school_id:schoolId,p_exam_id:exam.id,p_subject:state.subject,p_questions:state.questions});
      if(error||data!==state.questions.length)throw error||new Error('Não foi possível confirmar todas as questões.');
      await load();const updated=exams.find(item=>item.id===exam.id);
      contributionDraft=null;
      if(canContribute(updated)){
        renderSubjectPicker(updated);
        body.querySelector('#cxeSubjectStatus').textContent=`${data} questão(ões) de ${state.subject} inseridas. Escolha outra disciplina ou volte ao simulado.`;
      }else renderExam(updated);
    }catch(reason){status.textContent=message(reason);button.disabled=false;}
  }
  function renderQuestionForm(exam,index=null) {
    if(exam?.exam_type==='enem'&&index===null)return openSubjectPicker(exam);
    if(!canEdit(exam))return;dispose();current=exam;
    const question=index===null?null:exam.questions[index],number=index===null?exam.questions.length+1:index+1;
    const initialFormat=questionFormat(exam,question);
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBack">← Voltar à prova</button></div><form id="cxeQuestionForm"><h4>${question?'Editar':'Nova'} questão ${number}${exam.exam_type==='enem'?` · ${esc(question?.subject||subjectAt(exam.enem_model,number-1))}`:''}</h4>${exam.answer_format==='MISTA'?`<label>Tipo de resposta desta questão<select name="question_format">${Object.entries(formatName).map(([value,label])=>`<option value="${value}"${initialFormat===value?' selected':''}>${label}</option>`).join('')}</select></label>`:''}<div><strong>Enunciado e alternativas *</strong><p class="cxe-note">Cole o enunciado completo do Word${initialFormat==='LIVRE'?'':', inclusive alternativas'}. Você pode formatar texto, inserir tabelas e imagens.</p>${toolbar()}<div id="cxeEditor" class="cxe-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Enunciado e alternativas" data-placeholder="Cole ou escreva aqui o texto de apoio, a pergunta e as alternativas..."></div></div><div id="cxeAnswerFields"></div><p id="cxeQuestionStatus" class="cxe-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">${question?'Salvar alterações':'Salvar e ir para a próxima'}</button></div></form>`;
    const form=body.querySelector('#cxeQuestionForm'),editor=form.querySelector('#cxeEditor'),status=form.querySelector('#cxeQuestionStatus');
    const answerFields=form.querySelector('#cxeAnswerFields');
    const renderAnswerFields=()=>{
      const format=form.elements.question_format?.value||exam.answer_format;
      const letters=answers(format);
      form.querySelector('.cxe-note').textContent=`Cole o enunciado completo do Word${format==='LIVRE'?'':', inclusive alternativas'}. Você pode formatar texto, inserir tabelas e imagens.`;
      answerFields.innerHTML=letters.length?`<label>Gabarito correto<select name="correct_answer" required><option value="">Selecione</option>${letters.map(letter=>`<option value="${letter}"${question?.correct_answer===letter&&initialFormat===format?' selected':''}>${letter}</option>`).join('')}</select></label>`:`<p class="cxe-note">Resposta escrita: o aluno responde no espaço indicado na prova.</p><label>Resposta correta para o gabarito do professor *<textarea class="cxe-model-answer" name="model_answer" rows="6" maxlength="10000" required placeholder="Escreva a resposta esperada para corrigir esta questão.">${esc(initialFormat===format?question?.model_answer||'':'')}</textarea></label><p class="cxe-note">Esta resposta aparece somente no gabarito, nunca na prova do aluno.</p>`;
    };
    renderAnswerFields();if(form.elements.question_format)form.elements.question_format.onchange=renderAnswerFields;
    editor.innerHTML=rich().sanitize(legacyRich(question),{schoolId});rich().hydrate(editor,db,schoolId,imageBucket).catch(reason=>status.textContent=message(reason));bindToolbar(form,editor,status);
    body.querySelector('#cxeBack').onclick=async()=>{if(pendingUploads.length)await richControl.rollback(pendingUploads).catch(()=>{});renderExam(exam);};
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Salvando questão…';
      try{
        const format=form.elements.question_format?.value||exam.answer_format;
        const modelAnswer=form.elements.model_answer?.value.trim()||'';
        if(format==='LIVRE'&&(!modelAnswer||modelAnswer.length>10000))throw new Error('Escreva a resposta correta para o gabarito, com até 10.000 caracteres.');
        if(format!=='LIVRE'&&!answers(format).includes(form.elements.correct_answer?.value))throw new Error('Escolha o gabarito correto desta questão.');
        const saved=await richControl.serialize();pendingUploads.push(...saved.uploaded);
        const questionValue={statement:saved.value,alternatives:{},correct_answer:form.elements.correct_answer?.value||''};
        if(format==='LIVRE')questionValue.model_answer=modelAnswer;
        if(exam.answer_format==='MISTA')questionValue.answer_format=format;
        if(exam.exam_type==='enem'){questionValue.subject=question.subject; if(question.created_by)questionValue.created_by=question.created_by;}
        const questions=[...(exam.questions||[])];if(index===null)questions.push(questionValue);else questions[index]=questionValue;
        let query=db.from('class_exams').update({questions}).eq('id',exam.id).eq('school_id',schoolId).eq('class_id',exam.class_id).eq('created_by',userId);
        if(exam.exam_type==='enem')query=query.eq('updated_at',exam.updated_at);
        const {error}=await query.select('id').single();
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
    if(!canEdit(exam)||!window.confirm(`Remover a questão ${index+1}?`))return;
    const questions=exam.questions.filter((_,position)=>position!==index);
    const status=body.querySelector('#cxeStatus');try{let query=db.from('class_exams').update({questions}).eq('id',exam.id).eq('school_id',schoolId).eq('created_by',userId);if(exam.exam_type==='enem')query=query.eq('updated_at',exam.updated_at);const {error}=await query.select('id').single();if(error)throw error;await load();renderExam(exams.find(item=>item.id===exam.id));}catch(reason){status.textContent=message(reason);}
  }
  async function finalize(exam) {
    const status=body.querySelector('#cxeStatus'),questions=exam.questions||[];
    if(!canEdit(exam))return;
    if(!questions.length){status.textContent='Cadastre ao menos uma questão antes de finalizar.';return;}
    if(exam.exam_type==='enem'&&questions.length!==total(exam.enem_model)){status.textContent='Complete todas as questões previstas neste caderno.';return;}
    if(questions.some(question=>questionFormat(exam,question)==='LIVRE'&&!String(question.model_answer||'').trim())){status.textContent='Escreva a resposta correta de todas as questões antes de finalizar.';return;}
    if(questions.some(question=>questionFormat(exam,question)!=='LIVRE'&&!answers(questionFormat(exam,question)).includes(question.correct_answer))){status.textContent='Escolha a alternativa correta de todas as questões.';return;}
    if(!window.confirm('Finalizar a prova? Depois disso as questões não poderão ser editadas.'))return;
    try{let query=db.from('class_exams').update({finalized_at:new Date().toISOString()}).eq('id',exam.id).eq('school_id',schoolId).eq('created_by',userId).is('finalized_at',null);if(exam.exam_type==='enem')query=query.eq('updated_at',exam.updated_at);const {error}=await query.select('id').single();if(error)throw error;await load();renderExam(exams.find(item=>item.id===exam.id));}catch(reason){status.textContent=message(reason);}
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
  function printCss() {return `@page{size:A4;margin:14mm}body{font:11pt Arial,sans-serif;color:#111;margin:0}.student-copy{break-before:page}.student-copy:first-child{break-before:auto}.front{min-height:265mm;break-after:page}.identity{display:flex;align-items:center;justify-content:space-between;gap:8mm;text-align:center;border-bottom:2px solid #222;padding-bottom:5mm}.identity img{width:26mm;height:23mm;object-fit:contain}.identity h2{font-size:12pt;margin:2mm}.identity p{margin:1mm}.exam-title{text-align:center;font-size:16pt;margin:7mm 0}.student-line{border-bottom:1px solid #888;margin:6mm 0;padding-bottom:2mm}.instructions{font-size:10pt;white-space:pre-wrap}.answer-title{text-align:center;margin:12mm 0 7mm;font-size:15pt}.answer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm 7mm}.answer-row{border:1px solid #bbb;padding:3mm;white-space:nowrap;font-size:10pt}.answer-row.written{white-space:normal;overflow-wrap:anywhere}.bubble{display:inline-block;width:5mm;height:5mm;border:1.5px solid #333;border-radius:50%;vertical-align:middle;margin-left:2mm}.answer-grid.compact{grid-template-columns:repeat(6,1fr);gap:2mm}.answer-grid.compact .answer-row{padding:1mm;font-size:7pt}.answer-grid.compact .bubble{width:3.2mm;height:3.2mm;border-width:1px;margin-left:.4mm}.questions{column-count:2;column-gap:8mm;column-fill:auto;font-size:9.5pt;line-height:1.35}.question{break-inside:avoid;page-break-inside:avoid;margin:0 0 6mm;line-height:1.35;overflow-wrap:anywhere}.question .cepi-rich-content{overflow-wrap:anywhere}.question img{display:block;max-width:100%;max-height:100mm;object-fit:contain}.question table{border-collapse:collapse;max-width:100%;table-layout:fixed}.question td,.question th{border:1px solid #888;padding:2mm}.question p{margin:2mm 0}.answer-space{height:32mm;border-bottom:1px solid #999}.key{padding-top:7mm}.key-written-question{break-inside:avoid;page-break-inside:avoid;margin:7mm 0}.key-written-answer{white-space:pre-wrap;line-height:1.45}.key-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4mm}.key-cell{border:1px solid #999;padding:3mm;text-align:center}`;}
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
  async function correctionRequest(action,body={},session=correctionSession){
    const authenticated=['create','heartbeat'].includes(action);
    const accessToken=authenticated?(await db.auth.getSession()).data?.session?.access_token:'';
    if(authenticated&&!accessToken)throw new Error('Entre novamente no Carômetro para iniciar a correção.');
    return window.CepiCorrection.request(action,{room:session?.room?.id,token:session?.room?.desktop,body,accessToken});
  }
  function endCorrection(){
    if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}
    const session=correctionSession;correctionSession=null;
    if(session)correctionRequest('close',{},session).catch(()=>{});
  }
  async function renderCorrection(exam){
    if(exam.deleted_at||exam.exam_type!=='enem'||!exam.finalized_at||exam.created_by!==userId||cepiEnabled)return;
    if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}
    body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxeBackCorrection">← Voltar à prova</button></div><h4>Correção do Simulado do ENEM · ${esc(context.className)}</h4><p class="cxe-note">Confira os cartões no celular. Os acertos serão guardados nesta turma; este simulado não faz lançamento no SIAP.</p><div class="cxe-toolbar"><button type="button" class="btn primary" id="cxeStartCorrection">Gerar QR Code</button><button type="button" class="btn secondary" id="cxeStopCorrection" hidden>Encerrar leitura</button></div><p id="cxeCorrectionStatus" role="status"></p><div id="cxeCorrectionQr"></div><div id="cxeCorrectionLive"></div><h4>Resultados registrados</h4><div id="cxeCorrectionSaved">Carregando…</div>`;
    body.querySelector('#cxeBackCorrection').onclick=()=>{endCorrection();renderExam(exam);};
    body.querySelector('#cxeStartCorrection').onclick=()=>startCorrection(exam);
    body.querySelector('#cxeStopCorrection').onclick=async()=>{const session=correctionSession;if(session){await correctionRequest('close',{},session).catch(()=>{});correctionSession=null;}if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}renderCorrection(exam);};
    try{await renderSavedResults(exam);}catch(error){body.querySelector('#cxeCorrectionSaved').textContent=message(error);}
    if(correctionSession?.examId===exam.id){showCorrectionRoom(exam);pollCorrection(exam);}
  }
  async function renderSavedResults(exam){
    const results=await db.from('class_exam_results').select('student_id,correct_count,call_number,reviewed_at').eq('school_id',schoolId).eq('exam_id',exam.id).order('reviewed_at',{ascending:false});
    if(results.error)throw results.error;
    const roster=await studentRoster(),names=new Map(roster.map(item=>[item.id,item.full_name]));
    const target=body.querySelector('#cxeCorrectionSaved');if(!target)return;
    const classResults=(results.data||[]).filter(item=>names.has(item.student_id));
    target.innerHTML=classResults.length?`<div class="cxe-item"><div>${classResults.map(item=>`<p><strong>${esc(names.get(item.student_id))}</strong> · ${item.correct_count}/${exam.questions.length} acertos · ${item.call_number}ª chamada</p>`).join('')}</div></div>`:'<p class="cxe-note">Nenhum cartão registrado nesta turma.</p>';
  }
  async function startCorrection(exam){
    const start=body.querySelector('#cxeStartCorrection'),status=body.querySelector('#cxeCorrectionStatus');if(!start||!status)return;
    start.disabled=true;status.textContent='Conectando a extensão e preparando os cartões…';
    try{
      if(correctionSession&&correctionSession.examId!==exam.id)throw new Error('Encerre a leitura da outra prova antes de começar esta.');
      if(correctionSession){showCorrectionRoom(exam);return;}
      const connection=await window.connectCarometroCorrectionExtension?.();
      if(connection?.ok!==true||connection.license?.examAccess?.active!==true||!window.CepiCorrection.supportsExtension(connection.extensionVersion))throw new Error('Instale ou atualize o Assistente SIAP e confira o acesso à Correção de Provas neste computador.');
      if(window.getActiveSchoolId?.()!==schoolId)throw new Error('A escola ativa mudou. Abra o Painel da Turma novamente.');
      const roster=await studentRoster();if(!roster.length)throw new Error('Não há alunos ativos nesta turma.');
      const answers=exam.questions.map(item=>item.correct_answer);
      if(answers.some(answer=>!['A','B','C','D','E'].includes(answer)))throw new Error('Confira o gabarito antes de corrigir.');
      const created=await correctionRequest('create',{context:`${displayTitle(exam.title)} · ${context.className} · ${exam.questions.length} questões`,mobileWorkflow:true});
      const session={room:created,schoolId,examId:exam.id,classId:context.classId,roster,saved:new Set(),heartbeatAt:Date.now()};
      try{
        await correctionRequest('key',{key:{firstQuestion:1,alphabet:'ABCDE',answers,ranges:[{subject:'Simulado do ENEM',from:1,to:answers.length}]}},session);
        await correctionRequest('roster',{roster:roster.map(item=>({id:item.id,name:item.full_name})),binding:`${schoolId}:${exam.id}:${context.classId}`},session);
      }catch(error){await correctionRequest('close',{},session).catch(()=>{});throw error;}
      correctionSession=session;showCorrectionRoom(exam);pollCorrection(exam);
      correctionPoll=setInterval(()=>pollCorrection(exam),4000);
    }catch(error){status.textContent=message(error);}
    finally{if(start.isConnected)start.disabled=false;}
  }
  function showCorrectionRoom(exam){
    const session=correctionSession;if(!session||session.examId!==exam.id)return;
    const qr=window.qrcode(0,'M');qr.addData(`https://correcao.sistemacarometro.com.br/#session=${session.room.id}&token=${session.room.mobile}`);qr.make();
    const target=body.querySelector('#cxeCorrectionQr');if(target)target.innerHTML=qr.createSvgTag({cellSize:4,margin:8,scalable:true});
    const status=body.querySelector('#cxeCorrectionStatus');if(status)status.textContent='QR Code pronto. Escolha o aluno no celular, fotografe o cartão e confira as respostas antes de registrar.';
    const stop=body.querySelector('#cxeStopCorrection');if(stop)stop.hidden=false;
    const start=body.querySelector('#cxeStartCorrection');if(start)start.textContent='Mostrar QR Code';
  }
  async function pollCorrection(exam){
    const session=correctionSession;if(!session||session.examId!==exam.id||session.polling||modal.classList.contains('hidden'))return;
    if(Number(session.room.expires)<=Date.now()){correctionSession=null;if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}const status=body.querySelector('#cxeCorrectionStatus');if(status)status.textContent='A sessão expirou. Gere outro QR Code. Os resultados registrados foram preservados.';return;}
    session.polling=true;
    try{
      if(Date.now()-session.heartbeatAt>30000){await correctionRequest('heartbeat',{},session);session.heartbeatAt=Date.now();}
      const response=await correctionRequest('status',{},session);if(correctionSession!==session)return;
      const names=new Map(session.roster.map(item=>[item.id,item.full_name]));
      const items=(response.items||[]).filter(item=>item.kind==='student'&&!item.discarded);
      const target=body.querySelector('#cxeCorrectionLive');if(!target)return;
      target.innerHTML=items.length?`<div class="cxe-item"><div>${items.map(item=>{const id=item.review?.studentId||item.selectedStudentId,read=item.review?.answers||item.result?.answers,score=Array.isArray(read)?read.filter((answer,index)=>answer===exam.questions[index]?.correct_answer).length:null;return `<p><strong>${esc(names.get(id)||'Aluno não identificado')}</strong> · ${esc(item.status)}${score===null?'':` · ${score}/${exam.questions.length} acertos`}${item.review?.reviewed?' · Conferido no celular':''}${session.saved.has(item.id)?' · Registrado':''}</p>`;}).join('')}</div></div><button type="button" class="btn primary" id="cxeSaveCorrection">Registrar correções conferidas</button>`:'<p class="cxe-note">Aguardando cartões do celular…</p>';
      target.querySelector('#cxeSaveCorrection')?.addEventListener('click',()=>saveCorrection(exam));
    }catch(error){const status=body.querySelector('#cxeCorrectionStatus');if(status)status.textContent=message(error);}
    finally{session.polling=false;}
  }
  async function saveCorrection(exam){
    const session=correctionSession,button=body.querySelector('#cxeSaveCorrection'),status=body.querySelector('#cxeCorrectionStatus');if(!session||!button||!status)return;
    button.disabled=true;
    try{
      if(window.getActiveSchoolId?.()!==session.schoolId)throw new Error('A escola ativa mudou. Abra o Painel da Turma novamente.');
      const response=await correctionRequest('status',{},session);
      const entries=window.CepiCorrection.reviewedItems(response,session.roster.map(item=>item.id),{answer_format:'ABCDE',question_count:exam.questions.length});
      if(!entries.length)throw new Error('Ainda não há cartão conferido no celular.');
      const existing=await db.from('class_exam_results').select('capture_ref').eq('school_id',session.schoolId).eq('exam_id',exam.id).in('capture_ref',entries.map(item=>item.capture_ref));
      if(existing.error)throw existing.error;
      const saved=new Set((existing.data||[]).map(item=>item.capture_ref));let count=0;
      for(const entry of entries.filter(item=>!saved.has(item.capture_ref))){
        const result=await db.from('class_exam_results').insert({school_id:session.schoolId,exam_id:exam.id,student_id:entry.student_id,call_number:1,answers:entry.answers,correct_count:0,capture_ref:entry.capture_ref,reviewed_by:userId});
        if(result.error)throw result.error;session.saved.add(entry.capture_ref);count++;
      }
      status.textContent=count?`${count} correção(ões) registrada(s) no Carômetro.`:'Todos os cartões conferidos já estavam registrados.';
      await renderSavedResults(exam);pollCorrection(exam);
    }catch(error){status.textContent=message(error);}
    finally{if(button.isConnected)button.disabled=false;}
  }
  async function printProof(exam) {
    if(!exam?.finalized_at||exam.deleted_at)return;
    const fromExam=current?.id===exam.id;
    body.innerHTML='<p class="cxe-note">Contando alunos ativos da turma…</p>';
    try{
      const students=await studentRoster();
      const suggested=Math.max(1,students.length);
      body.innerHTML=`<div class="cxe-toolbar"><button type="button" class="btn secondary" id="cxePrintBack">← Voltar às provas</button></div><h4>Imprimir prova · ${esc(displayTitle(exam.title))}</h4><p class="cxe-note">Alunos ativos na turma: <strong>${students.length}</strong>.</p><form id="cxePrintForm"><label class="cxe-print-count">Quantidade de cópias da prova<input name="copies" type="number" min="1" max="500" step="1" required value="${suggested}"></label><p id="cxePrintHint" class="cxe-note"></p><p id="cxePrintError" class="cxe-error" role="alert"></p><button type="submit" class="btn primary">Imprimir prova</button></form>`;
      body.querySelector('#cxePrintBack').onclick=()=>fromExam?renderExam(exam):renderList(viewType);
      const form=body.querySelector('#cxePrintForm'),input=form.elements.copies,hint=body.querySelector('#cxePrintHint');
      const updateHint=()=>{hint.textContent=Number(input.value)===students.length&&students.length?'Será impressa uma prova nominal para cada aluno ativo.':'A quantidade é diferente do total de alunos. As cópias serão impressas sem nome.';};
      input.addEventListener('input',updateHint);updateHint();
      form.onsubmit=event=>{
        event.preventDefault();const quantity=Number(input.value),status=body.querySelector('#cxePrintError');status.textContent='';
        if(!Number.isInteger(quantity)||quantity<1||quantity>500){status.textContent='Informe de 1 a 500 cópias.';return;}
        if(window.getActiveSchoolId?.()!==schoolId){status.textContent='A escola ativa mudou. Abra a turma novamente.';return;}
        printProofCopies(exam,quantity===students.length?students:Array.from({length:quantity},()=>({full_name:'__________________________________'}))).catch(reason=>{status.textContent=message(reason);});
      };
    }catch(reason){showError(message(reason));}
  }
  async function printProofCopies(exam,students) {
    const popup=window.open('','_blank');
    if(!popup){window.alert('Permita a abertura da janela de impressão.');return;}
    try{
      if(exam.exam_type==='enem'){
        if(!header?.school_name)throw new Error('A coordenação precisa configurar o cabeçalho da escola antes de imprimir o Simulado do ENEM.');
        const print=window.CarometroEnemPrint;
        const normalized={model:exam.enem_model,year:Number(exam.academic_year),bimester:Number(exam.bimester),count:exam.questions.length,plan:plan(exam.enem_model),scheduledOn:exam.scheduled_on,phrase:exam.transcription_phrase||header?.subtitle};
        const questions=exam.questions.map((question,index)=>`<div class="question"><strong>QUESTÃO ${index+1} · ${esc(question.subject||subjectAt(exam.enem_model,index))}</strong>${rich().render(question.statement,schoolId)}${!String(question.statement).startsWith(rich().marker)?Object.entries(question.alternatives||{}).filter(([,value])=>value).map(([letter,value])=>`<p>${esc(letter)}) ${esc(value)}</p>`).join(''):''}</div>`).join('');
        await openPrint(print.documentHtml(normalized,header||{},students.map(student=>({name:student.full_name,className:context.className})),questions),popup);return;
      }
      const date=exam.scheduled_on?String(exam.scheduled_on).split('-').reverse().join('/'):'____/____/________';
      const answerRows=exam.questions.map((question,index)=>{
        const choices=answers(questionFormat(exam,question));
        return `<div class="answer-row${choices.length?'':' written'}"><strong>${String(index+1).padStart(2,'0')}</strong> ${choices.length?choices.map(letter=>`${letter}<i class="bubble"></i>`).join(' '):'Resposta escrita: responda na questão'}</div>`;
      }).join('');
      const questionHtml=exam.questions.map((question,index)=>`<div class="question"><strong>QUESTÃO ${index+1}${question.subject?` · ${esc(question.subject)}`:''}</strong>${rich().render(question.statement,schoolId)}${!String(question.statement).startsWith(rich().marker)?Object.entries(question.alternatives||{}).filter(([,text])=>text).map(([letter,text])=>`<p>${esc(letter)}) ${esc(text)}</p>`).join(''):''}${questionFormat(exam,question)==='LIVRE'?'<div class="answer-space"></div>':''}</div>`).join('');
      const content=students.map(student=>`<section class="student-copy"><div class="front">${identity(exam)}<h1 class="exam-title">${esc(displayTitle(exam.title))}</h1><div class="student-line"><strong>Aluno(a): ${esc(student.full_name)}</strong></div><div class="student-line">Turma: ${esc(context.className)} · Disciplina: ${esc(exam.subject)} · Data: ${date}</div>${header?.instructions?`<p class="instructions">${esc(header.instructions)}</p>`:''}<h2 class="answer-title">Cartão-resposta</h2>${exam.answer_format==='LIVRE'?'<p>Responda às questões no espaço indicado em cada uma delas.</p>':`<div class="answer-grid${exam.questions.length>60?' compact':''}">${answerRows}</div>`}</div><div class="questions">${questionHtml}</div></section>`).join('');
      await openPrint(shell(exam.title,content),popup);
    }catch(reason){popup.close?.();throw reason;}
  }
  function writtenKey(exam){
    return exam.questions.map((question,index)=>`<div class="key-written-question"><h2>Questão ${index+1}</h2><div class="key-written-answer">${esc(String(question.model_answer||'').trim()||'Resposta correta ainda não cadastrada.')}</div></div>`).join('');
  }
  async function printKey(exam) {
    if(!exam?.finalized_at||exam.deleted_at)return;
    const answersHtml=exam.answer_format==='LIVRE'?writtenKey(exam):exam.answer_format==='MISTA'?exam.questions.map((question,index)=>questionFormat(exam,question)==='LIVRE'?`<div class="key-written-question"><h2>Questão ${index+1} · Resposta escrita</h2><div class="key-written-answer">${esc(String(question.model_answer||'').trim())}</div></div>`:`<div class="key-written-question"><h2>Questão ${index+1} · ${esc(formatName[questionFormat(exam,question)])}</h2><strong>Gabarito: ${esc(question.correct_answer)}</strong></div>`).join(''):`<div class="key-grid">${exam.questions.map((question,index)=>`<div class="key-cell">${index+1}<br><strong>${esc(question.correct_answer)}</strong></div>`).join('')}</div>`;
    const content=`<section class="key">${identity(exam)}<h1 class="exam-title">Gabarito oficial · ${esc(displayTitle(exam.title))}</h1><p>${esc(context.className)} · ${esc(exam.subject)} · ${exam.academic_year}</p>${answersHtml}</section>`;
    try{await openPrint(shell(`Gabarito · ${displayTitle(exam.title)}`,content));}catch(reason){window.alert(message(reason));}
  }
  window.getClassExamPanelAction=()=>roles.has(role())?'<button id="classExamAction" type="button" class="btn secondary">Provas da turma</button>':'';
  window.bindClassExamPanelAction=actionContext=>{const button=document.querySelector('#classExamAction');if(button)button.onclick=()=>open(actionContext);};
  window.openClassExamById=({examId,classId,className})=>open({classId,className},examId);
})();
