document.addEventListener('DOMContentLoaded', () => {
  const home = document.getElementById('cepiHome');
  if (!home || document.getElementById('cepiWorkspace')) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const year = new Date().getFullYear();
  const kinds = { bloco:'Prova de Bloco', bimestral:'Prova Bimestral', simulado:'Simulado', eletiva:'Eletivas', clube:'Clubes', oficina:'Oficinas' };
  const cards = [
    ['provas','▤','Provas','Provas de Bloco, Provas Bimestrais e Simulados.'],
    ['ranking','▥','Ranking de médias','Acertos por disciplina, turma e bimestre.'],
    ['banco','✎','Banco de questões','Questões compartilhadas entre professores e coordenação.'],
    ['cabecalho','▣','Cabeçalho das provas','Identidade da escola e do estado para impressão.'],
    ['eletiva','✦','Eletivas','Propostas, turmas, vagas e participantes.'],
    ['clube','♧','Clubes','Clubes, líderes e estudantes participantes.'],
    ['oficina','◈','Oficinas','Oficinas e seus participantes.'],
    ['lideres','★','Líderes','Etiqueta aplicada ao cadastro dos alunos.']
  ];
  home.insertAdjacentHTML('beforeend', cards.map(([key,icon,title,description]) =>
    `<button class="cepi-feature-card" type="button" data-cepi-workspace="${key}"><span class="cepi-feature-icon" aria-hidden="true">${icon}</span><span><b>${title}</b><small>${description}</small></span><strong aria-hidden="true">→</strong></button>`).join(''));

  const workspace = document.createElement('div');
  workspace.id = 'cepiWorkspace';
  workspace.className = 'modal-bg cepi-modal hidden';
  workspace.innerHTML = `<section class="modal cepi-dialog cepi-workspace-dialog"><div class="modal-head"><div><span class="cepi-kicker">MEU CEPI</span><h3 id="cepiWorkspaceTitle">Provas</h3><div class="meta" id="cepiWorkspaceSubtitle"></div></div><button class="close" id="cepiWorkspaceClose" type="button" aria-label="Fechar">×</button></div><div class="cepi-workspace-body"><div class="cepi-workspace-toolbar"><button class="btn secondary" id="cepiWorkspaceBack" type="button">← Meu CEPI</button><button class="btn primary" id="cepiWorkspaceNew" type="button">＋ Cadastrar</button></div><p id="cepiWorkspaceMessage" role="status"></p><div id="cepiWorkspaceContent"></div></div></section>`;
  document.body.appendChild(workspace);
  const style = document.createElement('style');
  style.textContent = `.cepi-workspace-dialog{width:min(1050px,100%)}.cepi-workspace-body{padding:20px;overflow:auto}.cepi-workspace-toolbar{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.cepi-workspace-list{display:grid;gap:10px}.cepi-workspace-item{padding:16px;border:1px solid #dce4f0;border-radius:12px;background:#fff}.cepi-workspace-item h4{margin:0 0 5px;color:var(--navy)}.cepi-workspace-item p{margin:4px 0 12px;color:var(--muted)}.cepi-workspace-actions{display:flex;flex-wrap:wrap;gap:8px}.cepi-workspace-form{display:grid;gap:13px}.cepi-workspace-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cepi-workspace-form label{display:grid;gap:5px;font-weight:700}.cepi-workspace-form input,.cepi-workspace-form select,.cepi-workspace-form textarea{width:100%;min-height:40px}.cepi-workspace-form textarea{min-height:90px}.cepi-workspace-form .actions{display:flex;gap:8px;justify-content:flex-end}.cepi-workspace-hint{padding:11px;background:#f3f7ff;border-radius:9px;color:#34466a}.cepi-workspace-questions{margin-top:18px}.cepi-workspace-print{display:none}@media(max-width:700px){.cepi-workspace-grid{grid-template-columns:1fr}.cepi-workspace-toolbar{flex-direction:column}.cepi-workspace-toolbar .btn{width:100%}}`;
  style.textContent += `.cepi-ranking-scroll{max-width:100%;overflow:auto;margin-top:14px}.cepi-ranking-table{width:100%;border-collapse:collapse;font-size:13px}.cepi-ranking-table th,.cepi-ranking-table td{padding:9px;border-bottom:1px solid #dce4f0;text-align:left;white-space:nowrap}.cepi-ranking-table th{background:#eef3ff;position:sticky;top:0}.cepi-ranking-table td small{color:var(--muted)}`;
  style.textContent += `.cepi-rich-toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid #cbd5e1;border-bottom:0;border-radius:10px 10px 0 0;background:#f8faff}.cepi-rich-toolbar button{min-width:34px;padding:6px 9px;border:1px solid #d7dfec;border-radius:6px;background:#fff;color:#26385d;cursor:pointer}.cepi-rich-toolbar button:hover{background:#eaf0ff}.cepi-rich-editor{min-height:300px;padding:18px;border:1px solid #cbd5e1;border-radius:0 0 10px 10px;background:#fff;color:#17223d;line-height:1.55;outline:none;overflow:auto}.cepi-rich-editor:focus{border-color:#6255db;box-shadow:0 0 0 2px #6255db22}.cepi-rich-editor:empty:before{content:attr(data-placeholder);color:#7c89a3}.cepi-rich-content{line-height:1.55;overflow-wrap:anywhere}.cepi-rich-plain{white-space:pre-wrap}.cepi-rich-content img,.cepi-rich-editor img{display:block;max-width:100%;max-height:540px;object-fit:contain;margin:12px auto}.cepi-rich-content table,.cepi-rich-editor table{border-collapse:collapse;max-width:100%}.cepi-rich-content td,.cepi-rich-content th,.cepi-rich-editor td,.cepi-rich-editor th{border:1px solid #b8c3d6;padding:5px}.cepi-rich-content p{margin:7px 0}.cepi-question-editor-label{font-weight:700}.cepi-question-card .cepi-rich-content{margin:10px 0}.cepi-workspace-form .cepi-rich-hint{margin:0;color:#53627e;font-weight:400}`;
  style.textContent += `.cepi-rich-editor img{cursor:move}.cepi-rich-editor img.cepi-image-selected{outline:3px solid #6255db;outline-offset:3px}.cepi-image-tools{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%;padding-top:8px;border-top:1px solid #d7dfec}.cepi-image-tools[hidden]{display:none}.cepi-image-tools label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600}.cepi-image-tools input[type=range]{width:130px;min-height:auto}.cepi-image-tools output{min-width:38px;font-size:13px}.cepi-image-tools button[aria-pressed=true]{background:#dedaff;border-color:#6255db}.cepi-rich-toolbar .cepi-image-tools button{font-size:12px}.cepi-image-tools [data-image-remove]{color:#9f1d32;border-color:#e7b8c0}`;
  style.textContent += `#cepiTestForm{gap:18px}#cepiTestForm .cepi-test-heading{padding:19px 21px;border:1px solid #dbe5f6;border-radius:16px;background:linear-gradient(120deg,#f1f5ff,#fff);box-shadow:0 5px 18px #152b5410}#cepiTestForm .cepi-test-heading h4{margin:0 0 5px;color:var(--navy);font-size:24px;font-weight:850;letter-spacing:-.5px}#cepiTestForm .cepi-test-heading p{margin:0;color:#53627e;line-height:1.5}#cepiTestForm #cepiTestIdentity{margin:0;border-left:4px solid var(--blue);font-weight:750}#cepiTestForm .cepi-workspace-grid{gap:18px 20px;align-items:start}#cepiTestForm label{display:flex;flex-direction:column;align-items:stretch;align-self:start;gap:8px;margin:0;color:var(--navy);font-size:15px;font-weight:800}#cepiTestForm label[hidden]{display:none}#cepiTestForm label>select,#cepiTestForm label>input,#cepiTestForm label>textarea{min-height:48px;border-color:#cbd6e8;border-radius:10px;background:#fff;font-size:15px;font-weight:600;color:#17233a}#cepiTestForm label>select:focus,#cepiTestForm label>input:focus,#cepiTestForm label>textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px #dfe8ff}#cepiTestForm .cepi-test-classes{min-width:0;margin:0;padding:15px 16px;border:1px solid #d9e3f2;border-radius:12px;background:#f8faff}#cepiTestForm .cepi-test-classes legend{padding:0 4px;color:var(--navy);font-size:15px;font-weight:800}#cepiTestForm .cepi-class-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;max-height:160px;overflow:auto}#cepiTestForm .cepi-class-options label{display:flex;flex-direction:row;align-items:center;gap:8px;min-height:40px;padding:7px 10px;border:1px solid #d8e1f1;border-radius:9px;background:#fff;font-size:14px;cursor:pointer}#cepiTestForm .cepi-class-options label:has(input:checked){border-color:#9cb8f6;background:#edf3ff;color:#173e87}#cepiTestForm .cepi-class-options input{width:17px;min-height:0;height:17px;margin:0;accent-color:var(--blue)}#cepiTestForm .cepi-test-classes small{display:block;margin-top:9px;color:#53627e;font-size:12px}#cepiTestForm .cepi-test-empty{color:#667085;font-size:14px;line-height:1.4}#cepiTestForm .cepi-workspace-grid>.cepi-test-classes{align-self:start}#cepiTestForm .actions{padding-top:8px;border-top:1px solid #e4eaf4}#cepiTestForm .actions .btn{min-height:46px;border-radius:10px}@media(max-width:700px){#cepiTestForm .cepi-test-heading{padding:16px}#cepiTestForm .cepi-test-heading h4{font-size:21px}#cepiTestForm .cepi-workspace-grid{gap:16px}}`;
  style.textContent += `#cepiQuestionSaveStatus{margin:0;padding:10px 12px;border-radius:9px;background:#f3f7ff;color:#34466a;font-size:14px;font-weight:700}#cepiQuestionSaveStatus:empty{display:none}`;
  document.head.appendChild(style);

  let section = 'provas';
  let schoolId = null;
  let access = null;
  let tests = [];
  let questions = [];
  let questionBank = [];
  let results = [];
  let examHeader = null;
  let groups = [];
  let groupClasses = [];
  let groupStudents = [];
  let observationOptions = [];
  let classes = [];
  let students = [];
  let userId = null;
  let memberRole = '';
  const $ = id => document.getElementById(id);
  const message = value => { $('cepiWorkspaceMessage').textContent = value || ''; };
  const fail = error => message(error?.code === '42P01' || error?.code === 'PGRST205'
    ? 'Esta função ainda depende da ativação das tabelas CEPI no banco. Os demais recursos do Carômetro continuam disponíveis.'
    : error?.message || 'Não foi possível concluir a operação.');
  const manager = () => access?.enabled === true && ['school_admin','coordinator'].includes(memberRole);
  const editor = () => access?.enabled === true && ['school_admin','coordinator','teacher'].includes(memberRole);
  const canEditTest = test => (manager() || test.created_by === userId) && !['applied','archived'].includes(test.status);
  const canEditQuestion = test => editor() && test.status === 'draft';
  const ensureContext = () => schoolId && window.getActiveSchoolId?.() === schoolId && access?.enabled === true;
  const labelClass = id => classes.find(item => item.id === id)?.name || 'Turma não encontrada';
  const labelStudent = id => students.find(item => item.id === id)?.full_name || 'Estudante não encontrado';
  const groupLabel = key => ({eletiva:'Eletivas',clube:'Clubes',oficina:'Oficinas'})[key] || 'Agrupamentos';
  const rich = () => window.CepiRichText;
  const legacyRich = item => {
    if (!item) return '';
    if (String(item.statement||'').startsWith(rich().marker)) return item.statement.slice(rich().marker.length);
    if (!item.statement && !Object.values(item.alternatives||{}).some(Boolean)) return '';
    const paragraph = value => `<p>${esc(value).replace(/\r?\n/g,'<br>')}</p>`;
    return paragraph(item.statement||'') + Object.entries(item.alternatives||{}).filter(([,value])=>value).map(([letter,value])=>paragraph(`${letter}) ${value}`)).join('');
  };
  const richTools = id => `<div class="cepi-rich-toolbar" data-editor="${id}" aria-label="Formatação da questão"><button type="button" data-command="undo" title="Desfazer">↶</button><button type="button" data-command="redo" title="Refazer">↷</button><button type="button" data-command="bold" title="Negrito"><b>B</b></button><button type="button" data-command="italic" title="Itálico"><i>I</i></button><button type="button" data-command="underline" title="Sublinhado"><u>S</u></button><button type="button" data-command="justifyLeft" title="Alinhar à esquerda">☰</button><button type="button" data-command="justifyCenter" title="Centralizar">≡</button><button type="button" data-command="justifyRight" title="Alinhar à direita">☷</button><button type="button" data-command="insertUnorderedList" title="Lista com marcadores">• Lista</button><button type="button" data-command="insertOrderedList" title="Lista numerada">1. Lista</button><button type="button" data-table="1" title="Inserir tabela 2 por 2">▦ Tabela</button><button type="button" data-image="1">▧ Imagem</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="cepi-image-tools" hidden><strong>Imagem selecionada</strong><label>Tamanho <input type="range" min="10" max="100" step="5" aria-label="Tamanho da imagem"><output>100%</output></label><button type="button" data-image-align="left">Esquerda</button><button type="button" data-image-align="center">Centro</button><button type="button" data-image-align="right">Direita</button><button type="button" data-image-move="-1">↑ Subir</button><button type="button" data-image-move="1">↓ Descer</button><button type="button" data-image-remove="1">Excluir imagem</button><small>Ou arraste a imagem para outra posição no texto.</small></div></div>`;
  const bindRichTools = (form,editor) => {
    const tools=form.querySelector(`[data-editor="${editor.id}"]`);
    const picker=tools.querySelector('input[type="file"]');
    const imageTools=tools.querySelector('.cepi-image-tools');
    const widthInput=imageTools.querySelector('input[type="range"]');
    const control=rich().mount(editor,{db,schoolId,onError:message,onImageSelection:image=>{
      imageTools.hidden=!image;
      if(!image)return;
      widthInput.value=String(image.width);
      imageTools.querySelector('output').textContent=`${image.width}%`;
      imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.imageAlign===image.align)));
    }});
    tools.querySelectorAll('[data-command]').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>{editor.focus();document.execCommand(button.dataset.command,false,null);};});
    tools.querySelector('[data-table]').onmousedown=event=>event.preventDefault();
    tools.querySelector('[data-table]').onclick=()=>{editor.focus();document.execCommand('insertHTML',false,'<table><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table><p><br></p>');};
    tools.querySelector('[data-image]').onclick=()=>picker.click();
    picker.onchange=async()=>{const file=picker.files?.[0];if(file)await control.insertImage(file);picker.value='';};
    widthInput.oninput=()=>control.setImageWidth(Number(widthInput.value));
    imageTools.querySelectorAll('button').forEach(button=>button.onmousedown=event=>event.preventDefault());
    imageTools.querySelectorAll('[data-image-align]').forEach(button=>button.onclick=()=>control.setImageAlign(button.dataset.imageAlign));
    imageTools.querySelectorAll('[data-image-move]').forEach(button=>button.onclick=()=>control.moveImage(Number(button.dataset.imageMove)));
    imageTools.querySelector('[data-image-remove]').onclick=()=>control.removeImage();
    return control;
  };

  async function fetchAll(buildQuery) {
    const data=[];
    for(let offset=0;;offset+=1000) {
      const response=await buildQuery().range(offset,offset+999);
      if(response.error)return response;
      data.push(...(response.data||[]));
      if((response.data||[]).length<1000)return {data,error:null};
    }
  }

  async function load() {
    const requestedSchool = window.getActiveSchoolId?.();
    if (!requestedSchool) throw new Error('Selecione uma escola.');
    const [{data:context,error:accessError},{data:auth,error:authError}] = await Promise.all([
      db.rpc('get_cepi_access_context', {p_school_id:requestedSchool}), db.auth.getUser()
    ]);
    if (accessError || authError) throw accessError || authError;
    if (!auth?.user?.id) throw new Error('Entre novamente para acessar o Meu CEPI.');
    const nextAccess = Array.isArray(context) ? context[0] : context;
    if (!nextAccess?.enabled) throw new Error('Meu CEPI não está habilitado nesta escola.');
    const [roleResult,testResult,questionResult,bankResult,headerResult,groupResult,groupClassResult,groupStudentResult,observationResult,classResult,studentResult] = await Promise.all([
      db.from('school_members').select('role').eq('school_id',requestedSchool).eq('user_id',auth.user.id).eq('status','active').maybeSingle(),
      fetchAll(()=>db.from('cepi_tests').select('*').eq('school_id',requestedSchool).order('created_at',{ascending:false}).order('id')),
      fetchAll(()=>db.from('cepi_test_questions').select('*').eq('school_id',requestedSchool).order('id')),
      fetchAll(()=>db.from('cepi_question_bank').select('*').eq('school_id',requestedSchool).order('created_at',{ascending:false}).order('id')),
      db.from('cepi_exam_headers').select('*').eq('school_id',requestedSchool).maybeSingle(),
      fetchAll(()=>db.from('cepi_groups').select('*').eq('school_id',requestedSchool).order('created_at',{ascending:false}).order('id')),
      fetchAll(()=>db.from('cepi_group_classes').select('*').eq('school_id',requestedSchool).order('group_id').order('class_id')),
      fetchAll(()=>db.from('cepi_group_students').select('*').eq('school_id',requestedSchool).is('ended_at',null).order('id')),
      db.from('observation_options').select('label,is_pinned,is_top_priority').eq('school_id',requestedSchool),
      db.from('classes').select('id,name,archived_at').eq('school_id',requestedSchool).order('name'),
      fetchAll(()=>db.from('students').select('id,full_name,class_id,enrollment_status,has_report').eq('school_id',requestedSchool).order('full_name').order('id'))
    ]);
    const firstError = [roleResult,testResult,questionResult,bankResult,headerResult,groupResult,groupClassResult,groupStudentResult,observationResult,classResult,studentResult].find(result => result.error)?.error;
    if (firstError) throw firstError;
    if (window.getActiveSchoolId?.() !== requestedSchool) throw new Error('A escola ativa mudou. Abra Meu CEPI novamente.');
    schoolId = requestedSchool; access = nextAccess; userId = auth.user?.id; memberRole = roleResult.data?.role || '';
    tests = testResult.data || []; questions = questionResult.data || []; questionBank = bankResult.data || []; results = []; examHeader = headerResult.data || null; groups = groupResult.data || [];
    groupClasses = groupClassResult.data || []; groupStudents = groupStudentResult.data || [];
    observationOptions = observationResult.data || [];
    classes = classResult.data || []; students = studentResult.data || [];
  }

  function openSection(key) {
    section = key;
    $('cepiModal').classList.add('hidden');
    workspace.classList.remove('hidden');
    $('cepiWorkspaceTitle').textContent = ({provas:'Provas',ranking:'Ranking de médias',banco:'Banco de questões',cabecalho:'Cabeçalho das provas',lideres:'Líderes'})[key] || groupLabel(key);
    $('cepiWorkspaceSubtitle').textContent = key === 'provas' ? 'Escolha o teste pelo bimestre, etapa e bloco.' : key === 'banco' ? 'Professores e coordenação compartilham as questões.' : 'Registros específicos do CEPI, ligados à escola ativa.';
    $('cepiWorkspaceNew').classList.add('hidden');
    message('Carregando…');
    $('cepiWorkspaceContent').replaceChildren();
    load().then(() => { $('cepiWorkspaceNew').classList.toggle('hidden', !(editor() && ['provas','banco'].includes(key)) && !(manager() && ['eletiva','clube','oficina'].includes(key))); message(''); render(); }).catch(fail);
  }
  home.querySelectorAll('[data-cepi-workspace]').forEach(button => button.onclick = () => openSection(button.dataset.cepiWorkspace));
  $('cepiWorkspaceClose').onclick = () => workspace.classList.add('hidden');
  $('cepiWorkspaceBack').onclick = () => { workspace.classList.add('hidden'); $('cepiModal').classList.remove('hidden'); };
  workspace.onclick = event => { if (event.target === workspace) workspace.classList.add('hidden'); };
  document.addEventListener('carometro:school-context-ready', () => { if (!workspace.classList.contains('hidden') && window.getActiveSchoolId?.() !== schoolId) workspace.classList.add('hidden'); });
  $('signOut')?.addEventListener('click', () => { workspace.classList.add('hidden'); schoolId = null; access = null; memberRole=''; }, {capture:true});
  $('cepiWorkspaceNew').onclick = () => { if (!ensureContext()) return; if (section === 'provas') testForm(); else if (section === 'banco') bankQuestionForm(); else if (['eletiva','clube','oficina'].includes(section)) groupForm(); };

  function render() {
    if (!ensureContext()) { message('A escola ativa mudou. Abra Meu CEPI novamente.'); return; }
    if (section === 'provas') renderTests();
    else if (section === 'ranking') renderRanking();
    else if (section === 'banco') renderBank();
    else if (section === 'cabecalho') renderHeader();
    else if (section === 'lideres') renderLeaders();
    else renderGroups();
  }
  function actionButton(text,action,id,primary=false) { return `<button class="btn ${primary?'primary':'secondary'}" type="button" data-action="${action}" data-id="${esc(id)}">${text}</button>`; }
  function bindActions(actions) { $('cepiWorkspaceContent').querySelectorAll('[data-action]').forEach(button => { button.onclick = () => actions[button.dataset.action]?.(button.dataset.id); }); }
  function renderTests() {
    $('cepiWorkspaceContent').innerHTML = `<div class="cepi-workspace-list">${tests.map(test => `<article class="cepi-workspace-item"><h4>${esc(test.title)}</h4><p>${esc(kinds[test.kind] || test.kind)}${test.block_number?` · Bloco ${test.block_number}`:''} · ${test.bimester}º bimestre de ${test.academic_year} · ${esc(test.stage === 'medio' ? 'Ensino Médio' : 'Fundamental II')} · ${questions.filter(q => q.test_id === test.id).length}/${test.question_count} questões · ${esc(test.status)}</p><div class="cepi-workspace-actions">${actionButton(manager()?'Conferir e editar questões':'Ver e editar questões','questions',test.id)}${manager()?actionButton('Imprimir prova do aluno','print',test.id):''}${test.status==='applied'&&editor()?actionButton('Registrar respostas','record-result',test.id):''}${canEditTest(test) ? actionButton('Editar dados da prova','edit-test',test.id) : ''}</div></article>`).join('') || '<div class="cepi-empty">Nenhuma prova CEPI cadastrada nesta escola.</div>'}</div>`;
    bindActions({'questions':id => renderQuestions(id),'print':id => printTest(id),'record-result':id=>resultForm(tests.find(t=>t.id===id)),'edit-test':id => testForm(tests.find(t => t.id === id))});
  }
  function testForm(test=null) {
    if (!editor()) return;
    if (test && !canEditTest(test)) return;
    const values = test || {kind:'bloco',academic_year:year,bimester:1,stage:'fundamental_ii',question_count:15,answer_format:'ABCD',status:'draft',subjects:[]};
    const option = (value,label,selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
    $('cepiWorkspaceContent').innerHTML = `<form class="cepi-workspace-form" id="cepiTestForm">
      <div class="cepi-test-heading"><h4>${test?'Editar prova':'Cadastrar prova'}</h4><p>Defina a etapa, o bloco e as turmas. O nome da prova será preenchido automaticamente.</p></div>
      <p id="cepiTestIdentity" class="cepi-workspace-hint" aria-live="polite"></p>
      <div class="cepi-workspace-grid">
        <label>Tipo<select name="kind">${Object.entries({bloco:'Prova de Bloco',bimestral:'Prova Bimestral',simulado:'Simulado'}).map(([key,label]) => option(key,label,values.kind)).join('')}</select></label>
        <label id="cepiBlockField">Bloco<select name="block_number">${[1,2,3,4,5,6].map(n=>option(n,`Bloco ${n}`,Number(values.block_number)||1)).join('')}</select><small id="cepiBlockPlan" class="meta"></small></label>
        <label>Etapa<select name="stage">${option('fundamental_ii','Ensino Fundamental Anos Finais',values.stage)}${option('medio','Ensino Médio',values.stage)}</select></label>
        <fieldset class="cepi-test-classes"><legend>Turmas que farão esta prova</legend><div id="cepiClassOptions" class="cepi-class-options"></div><small id="cepiClassHelp"></small></fieldset>
        <label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" required value="${values.academic_year}"></label>
        <label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>option(n,`${n}º bimestre`,Number(values.bimester))).join('')}</select></label>
        <label>Data de aplicação<input name="scheduled_on" type="date" value="${esc(values.scheduled_on || '')}"></label>
        <label>Quantidade de questões<input name="question_count" type="number" min="1" max="99" required value="${values.question_count}"></label>
        <label>Alternativas<select name="answer_format">${['ABCD','ABCDE','VF'].map(v=>option(v,v,values.answer_format)).join('')}</select></label>
        <label>Situação<select name="status">${Object.entries({draft:'Em produção',ready:'Pronta',applied:'Aplicada',archived:'Arquivada'}).map(([v,label])=>option(v,label,values.status)).join('')}</select></label>
      </div>
      <label>Componentes curriculares, separados por vírgula<input name="subjects" value="${esc((values.subjects||[]).join(', '))}"></label>
      <label>Observações<textarea name="notes">${esc(values.notes || '')}</textarea></label>
      <div class="actions"><button class="btn secondary" type="button" id="cepiCancelForm">Cancelar</button><button class="btn primary" type="submit">${test?'Salvar alterações':'Salvar e adicionar questão'}</button></div>
    </form>`;
    const testFormElement = $('cepiTestForm');
    const blockField = $('cepiBlockField');
    const syncClasses = (preserveSelection = false) => {
      const selected = preserveSelection ? new Set(values.class_ids || []) : new Set();
      const eligible = classes.filter(item => !item.archived_at && window.CepiBlocks.stageForClassName(item.name) === testFormElement.elements.stage.value);
      $('cepiClassOptions').innerHTML = eligible.length
        ? eligible.map(item => `<label><input type="checkbox" name="classes" value="${esc(item.id)}" ${(!test || !preserveSelection || selected.has(item.id))?'checked':''}>${esc(item.name)}</label>`).join('')
        : '<span class="cepi-test-empty">Nenhuma turma desta etapa foi encontrada na escola.</span>';
      $('cepiClassHelp').textContent = eligible.length
        ? `${eligible.length} turma${eligible.length===1?'':'s'} da etapa. Desmarque as que não farão a prova.`
        : 'Confira se o nome da turma começa pelo ano ou série (ex.: 6A ou 1A).';
    };
    syncClasses(true);
    const syncBlock = () => {
      const isBlock = testFormElement.elements.kind.value === 'bloco';
      blockField.hidden = !isBlock;
      testFormElement.elements.question_count.readOnly = isBlock;
      testFormElement.elements.subjects.readOnly = isBlock;
      if (isBlock) {
        const plan = window.CepiBlocks.plan(testFormElement.elements.stage.value, Number(testFormElement.elements.block_number.value));
        testFormElement.elements.question_count.value = plan.reduce((total,item)=>total+item.count,0);
        testFormElement.elements.subjects.value = plan.map(item=>item.subject).join(', ');
        $('cepiBlockPlan').textContent = plan.map(item=>`${item.subject}: ${item.count} questões`).join(' · ');
      }
      const generatedTitle=window.CepiBlocks.title({kind:testFormElement.elements.kind.value,stage:testFormElement.elements.stage.value,bimester:testFormElement.elements.bimester.value,blockNumber:testFormElement.elements.block_number.value,subjects:testFormElement.elements.subjects.value.split(',')});
      $('cepiTestIdentity').textContent=generatedTitle?`Teste: ${generatedTitle}`:'Escolha um teste válido.';
    };
    testFormElement.elements.kind.onchange=()=>{
      if(testFormElement.elements.kind.value!=='bloco')testFormElement.elements.subjects.value='';
      syncBlock();
    };
    testFormElement.elements.stage.onchange=()=>{syncClasses();syncBlock();};
    testFormElement.elements.block_number.onchange=syncBlock;
    testFormElement.elements.bimester.onchange=syncBlock;
    testFormElement.elements.subjects.oninput=syncBlock;
    syncBlock();
    $('cepiCancelForm').onclick = render;
    $('cepiTestForm').onsubmit = async event => {
      event.preventDefault(); if (!ensureContext()) return;
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const plan = data.kind === 'bloco' ? window.CepiBlocks.plan(data.stage,Number(data.block_number)) : [];
      const classIds=[...testFormElement.querySelectorAll('input[name="classes"]:checked')].map(input=>input.value);
      if(!classIds.length){message('Selecione ao menos uma turma para a prova.');return;}
      const title=window.CepiBlocks.title({kind:data.kind,stage:data.stage,bimester:data.bimester,blockNumber:data.block_number,subjects:data.subjects.split(',')});
      if(!title){message('Selecione um teste válido.');return;}
      const payload = {school_id:schoolId,title,kind:data.kind,class_ids:classIds,block_number:data.kind==='bloco'?Number(data.block_number):null,subject_plan:plan,stage:data.stage,academic_year:Number(data.academic_year),bimester:Number(data.bimester),scheduled_on:data.scheduled_on || null,question_count:Number(data.question_count),answer_format:data.answer_format,status:data.status,subjects:data.subjects.split(',').map(s=>s.trim()).filter(Boolean),notes:data.notes.trim() || null};
      if (!test && payload.status !== 'draft') { message('Cadastre a prova em produção. Depois de preencher todas as questões, altere a situação.'); return; }
      if (test && questions.some(q => q.test_id === test.id && (q.number > payload.question_count || !(payload.answer_format === 'VF' ? ['V','F'] : [...payload.answer_format]).includes(q.correct_answer)))) { message('A nova configuração conflita com questões já cadastradas. Ajuste as questões antes.'); return; }
      if (test && payload.status !== 'draft' && questions.filter(q => q.test_id === test.id).length !== payload.question_count) { message('Complete a quantidade prevista de questões antes de mudar a situação da prova.'); return; }
      const result = test ? await db.from('cepi_tests').update(payload).eq('school_id',schoolId).eq('id',test.id) : await db.from('cepi_tests').insert({...payload,created_by:userId}).select('id').single();
      if (result.error) return fail(result.error);
      await load().then(()=>{
        if(test)return renderTests();
        const created=tests.find(item=>item.id===result.data?.id);
        if(created)return questionForm(created);
        renderTests();
      }).catch(fail);
    };
  }
  function resultForm(test) {
    if(!test||test.status!=='applied'||!editor()||!ensureContext())return;
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiResultForm" class="cepi-workspace-form"><h4>Registrar respostas · ${esc(test.title)}</h4><p class="cepi-workspace-hint">Confira a identificação e cada marcação antes de salvar. Uma correção posterior cria um novo registro; a anterior fica preservada.</p><div class="cepi-workspace-grid"><label>Turma<select name="class_id" required><option value="">Selecione</option>${classes.filter(c=>test.class_ids?.includes(c.id)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Aluno<select name="student_id" required><option value="">Selecione a turma</option></select></label><label>Chamada<select name="call_number"><option value="1">1ª chamada</option><option value="2">2ª chamada</option></select></label></div><label>${test.question_count} respostas em ordem, usando ${esc(test.answer_format)}; use - para branco<textarea name="answers" required placeholder="Ex.: A B C D - A B..."></textarea></label><div id="cepiResultPreview" class="cepi-workspace-hint">Preencha as respostas para conferir os acertos.</div><div class="actions"><button type="button" id="cepiResultCancel" class="btn secondary">Cancelar</button><button class="btn primary" type="submit">Confirmar correção</button></div></form>`;
    const form=$('cepiResultForm');$('cepiResultCancel').onclick=renderTests;
    form.elements.class_id.onchange=()=>{form.elements.student_id.innerHTML='<option value="">Selecione</option>'+students.filter(s=>s.enrollment_status==='active'&&s.class_id===form.elements.class_id.value).map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)}</option>`).join('');};
    const parseAnswers=()=>String(form.elements.answers.value||'').toUpperCase().replace(/[\s,;]+/g,'').split('').filter(Boolean);
    const preview=()=>{const answers=parseAnswers(),allowed=test.answer_format==='VF'?['V','F','-']:[...test.answer_format,'-'];const valid=answers.length===test.question_count&&answers.every(answer=>allowed.includes(answer));const score=valid?window.CepiBlocks.summarize(test,questions,answers):null;$('cepiResultPreview').textContent=score?`${score.correct} de ${score.total} acertos · ${Object.entries(score.bySubject).map(([subject,item])=>`${subject}: ${item.correct}/${item.total}`).join(' · ')}`:`Informe exatamente ${test.question_count} respostas válidas em ordem.`;return score?answers:null;};
    form.elements.answers.oninput=preview;
    form.onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const answers=preview(),studentId=form.elements.student_id.value;if(!answers||!studentId){message('Confira o estudante e todas as respostas.');return;}const result=await db.from('cepi_test_results').insert({school_id:schoolId,test_id:test.id,student_id:studentId,call_number:Number(form.elements.call_number.value),answers,source:'manual',reviewed_by:userId});if(result.error)return fail(result.error);message('Correção registrada. O ranking usa a última correção revista desta chamada.');renderTests();};
  }
  function renderQuestions(testId) {
    const test = tests.find(item => item.id === testId); if (!test) return render();
    $('cepiWorkspaceNew').classList.remove('hidden');
    const rows = questions.filter(q => q.test_id === testId).sort((a,b)=>a.number-b.number);
    $('cepiWorkspaceContent').innerHTML = `<div class="cepi-workspace-toolbar"><button type="button" class="btn secondary" id="cepiQuestionBack">← Provas</button>${canEditQuestion(test) ? actionButton('＋ Questão','new-question',testId,true) + actionButton('Usar banco','import-question',testId) : ''}${manager()?actionButton('Imprimir prova do aluno','print-student',testId,true) + (!examHeader?.school_name || !examHeader?.state_name ? actionButton('Configurar cabeçalho','header',testId) : ''):''}</div><h4>${esc(test.title)}</h4><p class="meta">${rows.length} de ${test.question_count} questões previstas · ${esc(test.answer_format)}</p>${manager()?`<p class="cepi-workspace-hint">Confira as questões enviadas pelos professores. O gabarito mostrado aqui é interno e não aparece na prova do aluno.${rows.length<test.question_count?` Faltam ${test.question_count-rows.length} questões para imprimir.`:''}</p>`:''}<div class="cepi-workspace-list cepi-workspace-questions">${rows.map(q=>`<article class="cepi-workspace-item cepi-question-card"><h4>Questão ${q.number} · ${esc(q.subject)}</h4>${rich().render(q.statement,schoolId)}${Object.entries(q.alternatives||{}).filter(([,value])=>value).map(([letter,value])=>`<p>${esc(letter)}) ${esc(value)}</p>`).join('')}<p>Gabarito interno: <strong>${esc(q.correct_answer)}</strong></p>${canEditQuestion(test)?actionButton('Editar questão','edit-question',q.id)+actionButton('Retirar da prova','remove-question',q.id):''}</article>`).join('') || '<div class="cepi-empty">Nenhuma questão cadastrada.</div>'}</div>`;
    rich().hydrate($('cepiWorkspaceContent'),db,schoolId).catch(fail);
    $('cepiQuestionBack').onclick = renderTests;
    bindActions({'new-question':()=>questionForm(test),'edit-question':id=>questionForm(test,questions.find(q=>q.id===id)),'import-question':()=>importQuestionForm(test),'print-student':()=>printTest(test.id),'header':()=>openSection('cabecalho'),'remove-question':async id=>{if(!canEditQuestion(test)||!ensureContext())return;const result=await db.from('cepi_test_questions').delete().eq('school_id',schoolId).eq('test_id',test.id).eq('id',id);if(result.error)return fail(result.error);await load().then(()=>renderQuestions(test.id)).catch(fail);}});
  }
  function questionForm(test,q=null) {
    if (!canEditQuestion(test)) return;
    $('cepiWorkspaceNew').classList.add('hidden');
    const answerFormat = test.answer_format === 'VF' ? ['V','F'] : [...test.answer_format];
    const occupied=new Set(questions.filter(item=>item.test_id===test.id).map(item=>item.number));
    const next = q?.number || Array.from({length:test.question_count},(_,index)=>index+1).find(number=>!occupied.has(number));
    if(!next){message('Todas as questões desta prova já foram cadastradas.');return renderQuestions(test.id);}
    $('cepiWorkspaceContent').innerHTML = `<form class="cepi-workspace-form" id="cepiQuestionForm"><h4>${q?'Editar':'Nova'} questão ${next} · ${esc(test.title)}</h4><div class="cepi-workspace-grid"><label>Número<input name="number" type="number" min="1" max="${test.question_count}" required value="${next}"></label><label>Componente curricular<input name="subject" maxlength="100" required value="${esc(q?.subject || test.subjects?.[0] || '')}"></label></div><div><div class="cepi-question-editor-label" id="cepiQuestionEditorLabel">Enunciado e alternativas *</div><p class="cepi-rich-hint">Cole a questão completa do Word ou de outro lugar. Imagens coladas ou inseridas aparecem no topo; depois você pode movê-las.</p>${richTools('cepiQuestionEditor')}<div id="cepiQuestionEditor" class="cepi-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="cepiQuestionEditorLabel" data-placeholder="Cole ou escreva aqui o texto de apoio, a pergunta e as alternativas..."></div></div><label>Gabarito<select name="correct_answer" required><option value="">Selecione</option>${answerFormat.map(letter=>`<option value="${letter}" ${q?.correct_answer===letter?'selected':''}>${letter}</option>`).join('')}</select></label><p id="cepiQuestionSaveStatus" role="status" aria-live="polite"></p><div class="actions"><button class="btn secondary" type="button" id="cepiCancelForm">Cancelar</button><button class="btn primary" type="submit">${q?'Salvar alterações':'Salvar e ir para a próxima'}</button></div></form>`;
    const form=$('cepiQuestionForm'),editorArea=$('cepiQuestionEditor');
    editorArea.innerHTML=rich().sanitize(legacyRich(q),{schoolId});
    rich().hydrate(editorArea,db,schoolId).catch(fail);
    const richControl=bindRichTools(form,editorArea);
    const unsavedUploads=new Set();
    if(test.kind==='bloco') {
      const subjectInput=form.elements.subject;
      const select=document.createElement('select');select.name='subject';
      select.innerHTML=(test.subject_plan||[]).map(item=>`<option value="${esc(item.subject)}" ${item.subject===(q?.subject||test.subjects?.[0])?'selected':''}>${esc(item.subject)} · ${item.count} questões</option>`).join('');
      subjectInput.replaceWith(select);
    }
    $('cepiCancelForm').onclick = async () => {
      if(unsavedUploads.size)await richControl.rollback([...unsavedUploads]).catch(()=>{});
      richControl.dispose();renderQuestions(test.id);
    };
    form.addEventListener('invalid',()=>{$('cepiQuestionSaveStatus').textContent='Confira os campos obrigatórios antes de salvar.';},true);
    form.onsubmit = async event => {
      event.preventDefault();
      if(!ensureContext()){$('cepiQuestionSaveStatus').textContent='A escola ativa mudou. Abra Meu CEPI novamente.';return;}
      const submit=form.querySelector('button[type="submit"]');
      const saveStatus=$('cepiQuestionSaveStatus');
      submit.disabled=true;
      saveStatus.textContent='Salvando questão…';
      const data = Object.fromEntries(new FormData(event.currentTarget));
      let saved;
      try {
        saved=await richControl.serialize();
        saved.uploaded.forEach(path=>unsavedUploads.add(path));
        if(!ensureContext())throw new Error('A escola ativa mudou. Abra Meu CEPI novamente.');
        const editable = {number:Number(data.number),subject:data.subject.trim(),statement:saved.value,alternatives:{},correct_answer:data.correct_answer};
        const result = q
          ? await db.from('cepi_test_questions').update(editable).eq('school_id',schoolId).eq('test_id',test.id).eq('id',q.id).select('id').single()
          : await db.from('cepi_test_questions').insert({school_id:schoolId,test_id:test.id,...editable,created_by:userId}).select('id').single();
        if(result.error || !result.data?.id)throw result.error || new Error('A questão não foi confirmada no banco. Tente novamente.');
        const unused=[...unsavedUploads].filter(path=>!saved.value.includes(path));
        if(unused.length)await richControl.rollback(unused).catch(()=>{});
        unsavedUploads.clear();
        richControl.dispose();
        if(q){Object.assign(q,editable);message('Questão salva.');return renderQuestions(test.id);}
        questions.push({id:result.data.id,school_id:schoolId,test_id:test.id,created_by:userId,...editable});
        message('Questão salva.');
        questionForm(test);
      } catch(error) {
        const text=error?.message || 'Não foi possível salvar a questão.';
        saveStatus.textContent=text;
        message(text);
        submit.disabled=false;
      }
    };
  }
  function renderRanking() {
    const latest=tests.find(t=>t.kind==='bloco'&&t.status==='applied')||tests.find(t=>t.kind==='bloco');
    const years=[...new Set([year,...tests.filter(t=>t.kind==='bloco').map(t=>t.academic_year)])].sort((a,b)=>b-a);
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiRankingFilters" class="cepi-workspace-form"><div class="cepi-workspace-grid"><label>Ano letivo<select name="academic_year">${years.map(value=>`<option value="${value}" ${value===(latest?.academic_year||year)?'selected':''}>${value}</option>`).join('')}</select></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(value=>`<option value="${value}" ${value===(latest?.bimester||1)?'selected':''}>${value}º bimestre</option>`).join('')}</select></label><label>Etapa<select name="stage"><option value="fundamental_ii" ${latest?.stage!=='medio'?'selected':''}>Fundamental II</option><option value="medio" ${latest?.stage==='medio'?'selected':''}>Ensino Médio</option></select></label><label>Turma<select name="class_id"><option value="">Todas as turmas</option>${classes.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label>Bloco<select name="block_number"><option value="">Todos os blocos</option>${[1,2,3,4,5,6].map(value=>`<option value="${value}">Bloco ${value}</option>`).join('')}</select></label></div><div class="actions"><button class="btn primary" type="submit">Gerar ranking</button></div></form><p class="cepi-workspace-hint">Percentual total = acertos ÷ questões corrigidas. “Sem resultado” não vira zero; estudantes com provas pendentes aparecem sem colocação até completar as provas aplicadas do filtro.</p><div id="cepiRankingResult"></div>`;
    $('cepiRankingFilters').onsubmit=event=>{event.preventDefault();generateRanking();};
    generateRanking();
  }
  async function generateRanking() {
    if(!ensureContext())return;
    const form=$('cepiRankingFilters');if(!form)return;
    const filters=Object.fromEntries(new FormData(form));
    const target=$('cepiRankingResult');target.textContent='Calculando…';
    const relevant=tests.filter(t=>t.kind==='bloco'&&t.status==='applied'&&t.academic_year===Number(filters.academic_year)&&t.bimester===Number(filters.bimester)&&t.stage===filters.stage&&(!filters.block_number||t.block_number===Number(filters.block_number))&&(!filters.class_id||t.class_ids?.includes(filters.class_id)));
    if(!relevant.length){target.innerHTML='<div class="cepi-empty">Ainda não há Provas de Bloco aplicadas neste filtro.</div>';return;}
    const ids=relevant.map(t=>t.id),collected=[];
    for(let offset=0;;offset+=1000){const response=await db.from('cepi_test_results').select('*').eq('school_id',schoolId).in('test_id',ids).order('id').range(offset,offset+999);if(response.error)return fail(response.error);collected.push(...(response.data||[]));if((response.data||[]).length<1000)break;if(!ensureContext())return;}
    if(!ensureContext())return;
    results=collected;
    const ranking=window.CepiBlocks.ranking({tests,questions,results,students,academicYear:filters.academic_year,bimester:filters.bimester,stage:filters.stage,classId:filters.class_id||null,blockNumber:filters.block_number||null});
    const format=value=>value===null?'—':`${value.toFixed(1).replace('.',',')}%`;
    const totalLabel=row=>row.covered===0?'Sem resultado':`${format(row.percent)}${row.complete?'':' (pendente)'}`;
    const table=`<table class="cepi-ranking-table"><thead><tr><th>Posição</th><th>Aluno</th><th>Turma</th><th>Provas</th>${ranking.subjects.map(subject=>`<th>${esc(subject)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ranking.rows.map(row=>`<tr><td>${row.rank||'—'}</td><td>${esc(row.student.full_name)}</td><td>${esc(labelClass(row.student.class_id))}</td><td>${row.covered}/${row.expected}</td>${ranking.subjects.map(subject=>`<td>${format(row.bySubject[subject]?.total?row.bySubject[subject].correct/row.bySubject[subject].total*100:null)}</td>`).join('')}<td><strong>${esc(totalLabel(row))}</strong></td></tr>`).join('')}</tbody></table>`;
    target.innerHTML=`<div class="cepi-workspace-actions"><button class="btn secondary" type="button" id="cepiRankingCsv">Exportar CSV</button><button class="btn secondary" type="button" id="cepiRankingPrint">Imprimir / PDF</button></div><p class="meta">${ranking.tests.length} prova(s) aplicada(s) · ${ranking.rows.length} aluno(s) ativo(s)</p><div class="cepi-ranking-scroll">${table}</div>`;
    $('cepiRankingCsv').onclick=()=>{const quote=value=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};const rows=[['Posição','Aluno','Turma','Provas',...ranking.subjects,'Total'],...ranking.rows.map(row=>[row.rank||'',row.student.full_name,labelClass(row.student.class_id),`${row.covered}/${row.expected}`,...ranking.subjects.map(subject=>format(row.bySubject[subject]?.total?row.bySubject[subject].correct/row.bySubject[subject].total*100:null)),format(row.percent)])];const blob=new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`ranking-cepi-${filters.academic_year}-${filters.bimester}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('cepiRankingPrint').onclick=()=>{const popup=window.open('','_blank');if(!popup){message('Permita a janela de impressão.');return;}popup.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Ranking de médias</title><style>body{font:12px Arial;margin:15mm}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;text-align:left}th{background:#eee}@page{size:landscape}</style><h1>Ranking de médias · ${esc(filters.bimester)}º bimestre de ${esc(filters.academic_year)}</h1>${table}</html>`);popup.document.close();popup.focus();popup.print();};
  }
  function renderBank() {
    $('cepiWorkspaceNew').classList.remove('hidden');
    $('cepiWorkspaceContent').innerHTML = `<p class="cepi-workspace-hint">Cada professor pode cadastrar questões da sua matéria. Professores e coordenação podem revisar e editar as questões da escola. Ao usar uma questão numa prova, fica uma cópia vinculada àquela prova.</p><div class="cepi-workspace-list">${questionBank.filter(q=>q.active).map(q=>`<article class="cepi-workspace-item cepi-question-card"><h4>${esc(q.subject)} · ${esc(q.stage === 'medio' ? 'Ensino Médio' : 'Fundamental II')}</h4>${rich().render(q.statement,schoolId)}${Object.entries(q.alternatives||{}).filter(([,value])=>value).map(([letter,value])=>`<p>${esc(letter)}) ${esc(value)}</p>`).join('')}<p>Gabarito: ${esc(q.correct_answer)}</p>${editor()?`<div class="cepi-workspace-actions">${actionButton('Editar','edit-bank',q.id)}${actionButton('Retirar do banco','archive-bank',q.id)}</div>`:''}</article>`).join('') || '<div class="cepi-empty">Nenhuma questão cadastrada no banco desta escola.</div>'}</div>`;
    rich().hydrate($('cepiWorkspaceContent'),db,schoolId).catch(fail);
    bindActions({'edit-bank':id=>bankQuestionForm(questionBank.find(q=>q.id===id)),'archive-bank':async id=>{if(!editor()||!ensureContext())return;const result=await db.from('cepi_question_bank').update({active:false}).eq('school_id',schoolId).eq('id',id);if(result.error)return fail(result.error);await load().then(renderBank).catch(fail);}});
  }
  function bankQuestionForm(question=null) {
    if (!editor() || !ensureContext()) return;
    $('cepiWorkspaceNew').classList.add('hidden');
    const q = question || {stage:'fundamental_ii',answer_format:'ABCD',alternatives:{}};
    const letters = q.answer_format === 'VF' ? ['V','F'] : [...q.answer_format];
    $('cepiWorkspaceContent').innerHTML = `<form id="cepiBankForm" class="cepi-workspace-form"><h4>${question?'Editar':'Nova'} questão compartilhada</h4><div class="cepi-workspace-grid"><label>Componente curricular<input name="subject" maxlength="100" required value="${esc(q.subject||'')}"></label><label>Etapa<select name="stage"><option value="fundamental_ii" ${q.stage==='fundamental_ii'?'selected':''}>Fundamental II</option><option value="medio" ${q.stage==='medio'?'selected':''}>Ensino Médio</option></select></label><label>Formato de resposta<select name="answer_format"><option ${q.answer_format==='ABCD'?'selected':''}>ABCD</option><option ${q.answer_format==='ABCDE'?'selected':''}>ABCDE</option><option ${q.answer_format==='VF'?'selected':''}>VF</option></select></label></div><div><div class="cepi-question-editor-label" id="cepiBankEditorLabel">Enunciado e alternativas *</div><p class="cepi-rich-hint">Cole a questão completa, inclusive imagens, neste espaço. A imagem entra no topo e pode ser movida depois.</p>${richTools('cepiBankEditor')}<div id="cepiBankEditor" class="cepi-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="cepiBankEditorLabel" data-placeholder="Cole ou escreva a questão completa..."></div></div><label>Gabarito<select name="correct_answer" required></select></label><div class="actions"><button type="button" id="cepiBankCancel" class="btn secondary">Cancelar</button><button type="submit" class="btn primary">Salvar questão</button></div></form>`;
    const form=$('cepiBankForm'),editorArea=$('cepiBankEditor');
    editorArea.innerHTML=rich().sanitize(legacyRich(q),{schoolId});
    rich().hydrate(editorArea,db,schoolId).catch(fail);
    const richControl=bindRichTools(form,editorArea);
    const renderChoices=()=>{const alphabet=form.elements.answer_format.value==='VF'?['V','F']:[...form.elements.answer_format.value];form.elements.correct_answer.innerHTML='<option value="">Selecione</option>'+alphabet.map(letter=>`<option value="${letter}" ${q.correct_answer===letter?'selected':''}>${letter}</option>`).join('');};
    form.elements.answer_format.onchange=renderChoices;renderChoices();
    $('cepiBankCancel').onclick=()=>{richControl.dispose();renderBank();};
    form.onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const data=new FormData(form);let saved;try{saved=await richControl.serialize();if(!ensureContext()){await richControl.rollback(saved.uploaded);message('A escola ativa mudou. Abra Meu CEPI novamente.');return;}const payload={school_id:schoolId,subject:String(data.get('subject')).trim(),stage:data.get('stage'),statement:saved.value,answer_format:String(data.get('answer_format')),alternatives:{},correct_answer:data.get('correct_answer')};const result=question?await db.from('cepi_question_bank').update(payload).eq('school_id',schoolId).eq('id',question.id):await db.from('cepi_question_bank').insert({...payload,created_by:userId});if(result.error){await richControl.rollback(saved.uploaded);return fail(result.error);}richControl.dispose();await load().then(renderBank).catch(fail);}catch(error){fail(error);}};
  }
  function importQuestionForm(test) {
    if(!canEditQuestion(test))return;
    const allowedSubjects=new Set((test.subject_plan||[]).map(item=>item.subject));
    const available=questionBank.filter(q=>q.active&&q.stage===test.stage&&q.answer_format===test.answer_format&&(!allowedSubjects.size||allowedSubjects.has(q.subject)));
    const occupied=new Set(questions.filter(q=>q.test_id===test.id).map(q=>q.number));
    const next=Array.from({length:test.question_count},(_,i)=>i+1).find(n=>!occupied.has(n));
    if(!next){message('A prova já tem todas as questões previstas.');return;}
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiImportForm" class="cepi-workspace-form"><h4>Usar questão do banco · ${esc(test.title)}</h4><p>A prova recebe uma cópia. Alterações posteriores no banco não modificam uma prova já montada.</p><label>Questão<select name="question_id" required><option value="">Selecione</option>${available.map(q=>`<option value="${esc(q.id)}">${esc(q.subject)} · ${esc(rich().plain(q.statement).slice(0,130))}</option>`).join('')}</select></label><label>Número na prova<input name="number" type="number" min="1" max="${test.question_count}" value="${next}" required></label><div class="actions"><button type="button" class="btn secondary" id="cepiImportCancel">Cancelar</button><button class="btn primary">Adicionar à prova</button></div></form>`;
    $('cepiImportCancel').onclick=()=>renderQuestions(test.id);
    $('cepiImportForm').onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const data=new FormData(event.currentTarget),q=available.find(item=>item.id===data.get('question_id'));if(!q){message('Selecione uma questão.');return;}const result=await db.from('cepi_test_questions').insert({school_id:schoolId,test_id:test.id,number:Number(data.get('number')),subject:q.subject,statement:q.statement,alternatives:q.alternatives,correct_answer:q.correct_answer,bank_question_id:q.id,created_by:userId});if(result.error)return fail(result.error);await load().then(()=>renderQuestions(test.id)).catch(fail);};
  }
  async function printTest(id) {
    if (!manager() || !ensureContext()) return;
    const test = tests.find(item=>item.id===id); if (!test) return;
    const rows = questions.filter(q=>q.test_id===id).sort((a,b)=>a.number-b.number);
    if (rows.length !== test.question_count) { message('Complete a quantidade prevista de questões antes de imprimir.'); return; }
    if (!examHeader?.school_name || !examHeader?.state_name) {
      message('Configure o cabeçalho da escola uma vez. Depois, volte à prova e clique em imprimir.');
      headerForm(true);
      return;
    }
    const logo = (value,klass,label) => value ? `<img src="${esc(value)}" alt="${label}" class="logo ${klass}">` : `<div class="logo ${klass}" aria-hidden="true"></div>`;
    const stateMark = examHeader.state_logo_data ? logo(examHeader.state_logo_data,'logo-state','Logo do estado') : `<div class="state-fallback"><strong>${esc(examHeader.state_name)}</strong><span>${esc(examHeader.department_name)}</span></div>`;
    const multipleSubjects = new Set(rows.map(q=>q.subject)).size > 1;
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(test.title)}</title><style>body{font:12pt Arial;margin:18mm;color:#111}.print-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-8mm 0 12mm;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f5f7ff;font:14px Arial}.print-actions button{padding:9px 15px;border:0;border-radius:7px;background:#5149dc;color:#fff;font-weight:700;cursor:pointer}.brand-row{display:grid;grid-template-columns:1fr 1fr;align-items:start;min-height:26mm}.logo{display:block;object-fit:contain}.logo-school{width:26mm;height:26mm;justify-self:start}.logo-state{width:55mm;height:26mm;justify-self:end}.state-fallback{display:grid;gap:3px;align-self:center;justify-self:end;text-align:right;font-size:10pt}.school-name{text-align:center;margin:5mm 0 4mm;font-size:12pt}h1{font-size:12pt;font-weight:400;text-align:center;margin:0 0 3mm}.meta{display:grid;grid-template-columns:minmax(0,2.5fr) minmax(0,1fr) minmax(0,1fr);gap:8px;margin:22px 0;border-bottom:1px solid #333;padding-bottom:10px}.meta-field{display:flex;gap:4px;white-space:nowrap}.meta-field::after{content:"";border-bottom:1px solid #111;flex:1;min-width:12px;margin-bottom:2px}.question{margin:22px 0}.question-subject{font-weight:700;margin:20px 0 8px;break-after:avoid}.question .cepi-rich-plain{white-space:pre-wrap}.question .cepi-rich-content img{max-width:100%;max-height:150mm;display:block;margin:8px auto}.question table{border-collapse:collapse}.question td,.question th{border:1px solid #555;padding:5px}.answer{margin:8px 0}@page{margin:18mm}@media print{body{margin:0}.print-actions{display:none}}</style><div class="print-actions"><strong>Prévia da prova do aluno</strong><button id="cepiPrintNow" type="button">Imprimir / salvar PDF</button></div><header class="brand-row">${logo(examHeader.school_logo_data,'logo-school','Logo da escola')}${stateMark}</header><div class="school-name">${esc(examHeader.school_name)}${examHeader.subtitle?`<div>${esc(examHeader.subtitle)}</div>`:''}</div><h1>${esc(test.title)}</h1><div class="meta"><span class="meta-field">Nome:</span><span class="meta-field">Turma:</span><span class="meta-field">Data:</span></div>${rows.map((q,index)=>`<div class="question">${multipleSubjects && (index===0 || q.subject!==rows[index-1].subject)?`<div class="question-subject">${esc(q.subject)}</div>`:''}<b>${q.number}.</b>${rich().render(q.statement,schoolId)}${Object.entries(q.alternatives||{}).filter(([,v])=>v).map(([letter,value])=>`<div class="answer">${letter}) ${esc(value)}</div>`).join('')}</div>`).join('')}</html>`;
    const popup = window.open('','_blank'); if (!popup) { message('Permita a janela de impressão para esta ação.'); return; }
    popup.document.write(html); popup.document.close();
    popup.document.getElementById('cepiPrintNow').onclick=()=>popup.print();
    popup.focus();
    try {
      await rich().hydrate(popup.document,db,schoolId);
      await Promise.all([...popup.document.images].map(img => img.decode?.().catch(()=>{}) || Promise.resolve()));
      if(!popup.closed)popup.print();
    } catch(error) {
      message(`A prévia abriu, mas algumas imagens não carregaram: ${error?.message || error}`);
    }
  }
  function renderHeader() {
    const h=examHeader||{};
    $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-item"><h4>Identidade das provas desta escola</h4><p>Este cabeçalho é salvo uma vez e usado em todas as impressões. A coordenação pode editá-lo quando necessário.</p><div class="cepi-workspace-grid"><div>${h.state_logo_data?`<img src="${esc(h.state_logo_data)}" alt="Logo do estado" style="max-width:100px;max-height:100px">`:'Sem logo do estado'}</div><div>${h.school_logo_data?`<img src="${esc(h.school_logo_data)}" alt="Logo da escola" style="max-width:100px;max-height:100px">`:'Sem logo da escola'}</div></div><p>${esc(h.state_name||'Estado não configurado')} · ${esc(h.department_name||'')}</p><p><strong>${esc(h.school_name||'Escola não configurada')}</strong></p><p>${esc(h.subtitle||'')}</p>${manager()?actionButton('Editar cabeçalho','edit-header','header'):''}</div>`;
    bindActions({'edit-header':()=>headerForm()});
  }
  function headerForm(returnToTests=false) {
    if(!manager()||!ensureContext())return;
    const h=examHeader||{};
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiHeaderForm" class="cepi-workspace-form"><h4>Cabeçalho da escola</h4><p class="cepi-workspace-hint">Escolha imagens PNG, JPG ou WebP de até 300 KB. Os dados ficam vinculados somente a esta escola.</p><label>Estado<input name="state_name" maxlength="160" required value="${esc(h.state_name||'')}"></label><label>Secretaria ou órgão<input name="department_name" maxlength="160" value="${esc(h.department_name||'')}"></label><label>Nome da escola<input name="school_name" maxlength="160" required value="${esc(h.school_name||'')}"></label><label>Outras informações do cabeçalho<input name="subtitle" maxlength="240" value="${esc(h.subtitle||'')}"></label><div class="cepi-workspace-grid"><label>Logo do estado<input name="state_logo" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Logo da escola<input name="school_logo" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div class="actions"><button type="button" id="cepiHeaderCancel" class="btn secondary">Cancelar</button><button class="btn primary" type="submit">Salvar cabeçalho</button></div></form>`;
    $('cepiHeaderCancel').onclick=()=>returnToTests?renderTests():renderHeader();
    $('cepiHeaderForm').onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const form=event.currentTarget,data=new FormData(form);const readLogo=async(name,existing)=>{const file=form.elements[name].files?.[0];if(!file)return existing||null;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>300000)throw new Error('Use uma imagem PNG, JPG ou WebP de até 300 KB.');return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});};try{const payload={school_id:schoolId,state_name:String(data.get('state_name')).trim(),department_name:String(data.get('department_name')).trim(),school_name:String(data.get('school_name')).trim(),subtitle:String(data.get('subtitle')).trim(),state_logo_data:await readLogo('state_logo',h.state_logo_data),school_logo_data:await readLogo('school_logo',h.school_logo_data),updated_by:userId};const result=await db.from('cepi_exam_headers').upsert(payload,{onConflict:'school_id'});if(result.error)return fail(result.error);await load().then(()=>{returnToTests?renderTests():renderHeader();if(returnToTests)message('Cabeçalho salvo. Agora clique em Imprimir prova do aluno.');}).catch(fail);}catch(error){fail(error);}};
  }

  function renderGroups() {
    const subset = groups.filter(item=>item.kind===section);
    $('cepiWorkspaceContent').innerHTML = `<div class="cepi-workspace-list">${subset.map(group=>{ const classNames=groupClasses.filter(item=>item.group_id===group.id).map(item=>labelClass(item.class_id)); const count=groupStudents.filter(item=>item.group_id===group.id).length; return `<article class="cepi-workspace-item"><h4>${esc(group.title)}</h4><p>${group.academic_year}${group.semester?` · ${group.semester}º semestre`:''} · ${group.active?'Ativo':'Encerrado'} · ${count}${group.seats?`/${group.seats}`:''} participantes${classNames.length?` · ${esc(classNames.join(', '))}`:''}</p><div class="cepi-workspace-actions">${actionButton('Ver participantes','members',group.id)}${manager()?actionButton('Editar','edit-group',group.id):''}</div></article>`;}).join('') || `<div class="cepi-empty">Nenhum registro em ${esc(groupLabel(section))}.</div>`}</div>`;
    bindActions({'members':id=>renderMembers(id),'edit-group':id=>groupForm(groups.find(g=>g.id===id))});
  }
  function groupForm(group=null) {
    if (!manager()) return;
    const value=group || {kind:section,academic_year:year,subjects:[],active:true};
    const selectedClasses=groupClasses.filter(item=>item.group_id===group?.id).map(item=>item.class_id);
    $('cepiWorkspaceContent').innerHTML = `<form class="cepi-workspace-form" id="cepiGroupForm"><h4>${group?'Editar':'Cadastrar'} ${esc(groupLabel(section))}</h4><label>Título<input name="title" maxlength="200" required value="${esc(value.title||'')}"></label><div class="cepi-workspace-grid"><label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" value="${value.academic_year}" required></label><label>Semestre<select name="semester"><option value="">Não informado</option><option value="1" ${value.semester===1?'selected':''}>1º</option><option value="2" ${value.semester===2?'selected':''}>2º</option></select></label><label>Vagas<input name="seats" type="number" min="1" max="999" value="${value.seats||''}"></label><label>Perfil<input name="profile" value="${esc(value.profile||'')}"></label></div><label>Turmas do público alvo<select name="classes" multiple size="${Math.min(6,Math.max(2,classes.length))}">${classes.map(item=>`<option value="${esc(item.id)}" ${selectedClasses.includes(item.id)?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label>${section==='clube'?`<div class="cepi-workspace-grid"><label>Líder<select name="leader_student_id"><option value="">Selecione</option>${students.filter(s=>s.enrollment_status==='active'||s.id===value.leader_student_id).map(s=>`<option value="${esc(s.id)}" ${value.leader_student_id===s.id?'selected':''}>${esc(s.full_name)} · ${esc(labelClass(s.class_id))}</option>`).join('')}</select></label><label>Co-líder<select name="coleader_student_id"><option value="">Selecione</option>${students.filter(s=>s.enrollment_status==='active'||s.id===value.coleader_student_id).map(s=>`<option value="${esc(s.id)}" ${value.coleader_student_id===s.id?'selected':''}>${esc(s.full_name)} · ${esc(labelClass(s.class_id))}</option>`).join('')}</select></label></div>`:''}<label>Componentes curriculares<input name="subjects" value="${esc((value.subjects||[]).join(', '))}"></label><label>Proposta<textarea name="proposal">${esc(value.proposal||'')}</textarea></label><label>Práticas<textarea name="practices">${esc(value.practices||'')}</textarea></label><label>Culminância<textarea name="culmination">${esc(value.culmination||'')}</textarea></label><label><input name="active" type="checkbox" ${value.active?'checked':''}> Ativo</label><div class="actions"><button class="btn secondary" id="cepiCancelForm" type="button">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`;
    $('cepiCancelForm').onclick=render;
    $('cepiGroupForm').onsubmit=async event=>{
      event.preventDefault(); if(!ensureContext()) return;
      const form=event.currentTarget,data=new FormData(form),targetClasses=[...form.elements.classes.selectedOptions].map(o=>o.value);
      if(group && selectedClasses.some(id=>!targetClasses.includes(id))) { message('Para preservar o histórico, encerre vínculos da turma em uma etapa própria antes de retirá-la do público alvo.'); return; }
      const payload={school_id:schoolId,kind:section,title:String(data.get('title')).trim(),academic_year:Number(data.get('academic_year')),semester:data.get('semester')?Number(data.get('semester')):null,seats:data.get('seats')?Number(data.get('seats')):null,profile:data.get('profile')||null,proposal:data.get('proposal')||null,practices:data.get('practices')||null,culmination:data.get('culmination')||null,subjects:String(data.get('subjects')||'').split(',').map(s=>s.trim()).filter(Boolean),leader_student_id:data.get('leader_student_id')||null,coleader_student_id:data.get('coleader_student_id')||null,active:data.has('active')};
      if(payload.leader_student_id && payload.leader_student_id===payload.coleader_student_id){message('Líder e co-líder precisam ser estudantes diferentes.');return;}
      const result=group?await db.from('cepi_groups').update(payload).eq('school_id',schoolId).eq('id',group.id).select('id').single():await db.from('cepi_groups').insert({...payload,created_by:userId}).select('id').single();
      if(result.error)return fail(result.error);
      const missing=targetClasses.filter(id=>!selectedClasses.includes(id));
      if(missing.length){const links=await db.from('cepi_group_classes').insert(missing.map(class_id=>({school_id:schoolId,group_id:result.data.id,class_id})));if(links.error){await load().catch(()=>{});message('O agrupamento foi salvo, mas as turmas não foram vinculadas. Reabra o cadastro e tente novamente. '+links.error.message);return;}}
      await load().then(render).catch(fail);
    };
  }
  function renderMembers(groupId) {
    const group=groups.find(item=>item.id===groupId);if(!group)return render();
    const members=groupStudents.filter(item=>item.group_id===groupId);
    const targetClasses=groupClasses.filter(item=>item.group_id===groupId).map(item=>item.class_id);
    const candidates=students.filter(s=>s.enrollment_status==='active' && !members.some(m=>m.student_id===s.id) && (!targetClasses.length || targetClasses.includes(s.class_id)));
    $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-toolbar"><button class="btn secondary" type="button" id="cepiMembersBack">← ${esc(groupLabel(section))}</button></div><h4>${esc(group.title)}</h4><div class="cepi-workspace-list">${members.map(m=>`<article class="cepi-workspace-item">${esc(labelStudent(m.student_id))} · ${esc(labelClass(students.find(s=>s.id===m.student_id)?.class_id))}${manager()?`<div class="cepi-workspace-actions">${actionButton('Encerrar participação','end-member',m.id)}</div>`:''}</article>`).join('')||'<p>Nenhum participante.</p>'}</div>${manager()?`<form class="cepi-workspace-form" id="cepiMemberForm"><h4>Adicionar participante</h4><select name="student_id" required><option value="">Selecione um estudante</option>${candidates.map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)} · ${esc(labelClass(s.class_id))}</option>`).join('')}</select><button class="btn primary" type="submit">Adicionar</button></form>`:''}`;
    $('cepiMembersBack').onclick=render;
    bindActions({'end-member':async id=>{if(!manager()||!ensureContext())return;const result=await db.from('cepi_group_students').update({ended_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',id);if(result.error)return fail(result.error);await load().then(()=>renderMembers(groupId)).catch(fail);}});
    if(manager())$('cepiMemberForm').onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;if(group.seats&&members.length>=group.seats){message('Todas as vagas estão ocupadas.');return;}const studentId=new FormData(event.currentTarget).get('student_id');const result=await db.from('cepi_group_students').insert({school_id:schoolId,group_id:groupId,student_id:studentId});if(result.error)return fail(result.error);await load().then(()=>renderMembers(groupId)).catch(fail);};
  }
  function renderLeaders() {
    const labels=observationOptions.filter(o=>/l[ií]der|representante/i.test(o.label)).map(o=>o.label);
    const tagged=students.filter(s=>s.enrollment_status==='active').flatMap(s=>{const values=window.decodeObservationValues?.(s.has_report)||[];return values.filter(v=>labels.includes(v)).map(v=>({student:s,label:v}));});
    const canManage=!!$('observationsNav') && !$('observationsNav').classList.contains('hidden');
    $('cepiWorkspaceContent').innerHTML=`<p class="cepi-workspace-hint">Líder de turma é uma etiqueta do cadastro do aluno. Crie ou edite a etiqueta em “Gerenciar observações”, marque “Fixar no card” e aplique-a ao editar o estudante. Representante de turma usa o mesmo recurso.</p><div class="cepi-workspace-actions">${canManage?actionButton('Gerenciar etiquetas','manage-labels','labels'):''}</div><h4>Estudantes com etiqueta de liderança</h4><div class="cepi-workspace-list">${tagged.map(({student,label})=>`<article class="cepi-workspace-item"><b>${esc(student.full_name)}</b> · ${esc(labelClass(student.class_id))} · ${esc(label)} ${actionButton('Editar aluno','edit-student',student.id)}</article>`).join('')||'<div class="cepi-empty">Nenhum estudante com etiqueta de liderança nesta escola.</div>'}</div>`;
    bindActions({'manage-labels':()=>{workspace.classList.add('hidden');$('observationsNav')?.click();},'edit-student':id=>{workspace.classList.add('hidden');window.editStudent?.(id);}});
  }
});
