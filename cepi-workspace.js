document.addEventListener('DOMContentLoaded', () => {
  const home = document.getElementById('cepiHome');
  if (!home || document.getElementById('cepiWorkspace')) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const year = new Date().getFullYear();
  const kinds = { bloco:'Prova de Bloco', bimestral:'Prova Bimestral', simulado:'Simulado', eletiva:'Eletivas', clube:'Clubes', oficina:'Oficinas' };
  const cards = [
    ['provas','▤','Provas','Provas de Bloco, Provas Bimestrais e Simulados.'],
    ['correcao','◎','Correção de provas','Corrija os cartões das provas com questões completas.'],
    ['ranking','▥','Ranking de médias','Acertos por disciplina, turma e bimestre.'],
    ['banco','✎','Banco de questões','Questões compartilhadas entre professores e coordenação.'],
    ['cabecalho','▣','Cabeçalho das provas','Identidade da escola e do estado para impressão.'],
    ['eletiva','✦','Eletivas','Propostas, turmas, vagas e participantes.'],
    ['clube','♧','Clubes','Clubes, líderes e estudantes participantes.'],
    ['oficina','◈','Oficinas','Oficinas e seus participantes.'],
    ['listas','▦','Imprimir listas','Alunos por turma com eletiva, clube e tutor.'],
    ['lideres','★','Líderes','Etiqueta aplicada ao cadastro dos alunos.']
  ];
  home.insertAdjacentHTML('beforeend', cards.map(([key,icon,title,description]) =>
    `<button class="cepi-feature-card${key==='listas'?' hidden':''}" ${key==='listas'?'id="cepiPrintListsCard"':''} type="button" data-cepi-workspace="${key}"><span class="cepi-feature-icon" aria-hidden="true">${icon}</span><span><b>${title}</b><small>${description}</small></span><strong aria-hidden="true">→</strong></button>`).join(''));

  const workspace = document.createElement('div');
  workspace.id = 'cepiWorkspace';
  workspace.className = 'modal-bg cepi-modal hidden';
  workspace.innerHTML = `<section class="modal cepi-dialog cepi-workspace-dialog"><div class="modal-head"><div><span class="cepi-kicker">MEU CEPI</span><h3 id="cepiWorkspaceTitle">Provas</h3><div class="meta" id="cepiWorkspaceSubtitle"></div></div><button class="close" id="cepiWorkspaceClose" type="button" aria-label="Fechar">×</button></div><div class="cepi-workspace-body"><div class="cepi-workspace-toolbar"><button class="btn secondary" id="cepiWorkspaceBack" type="button">← Meu CEPI</button><button class="btn primary" id="cepiWorkspaceNew" type="button">＋ Cadastrar</button></div><p id="cepiWorkspaceMessage" role="status"></p><div id="cepiWorkspaceContent"></div></div></section>`;
  document.body.appendChild(workspace);
  const style = document.createElement('style');
  style.textContent = `.cepi-workspace-dialog{width:min(1050px,100%)}.cepi-workspace-body{padding:20px;overflow:auto}.cepi-workspace-toolbar{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.cepi-workspace-list{display:grid;gap:10px}.cepi-workspace-item{padding:16px;border:1px solid #dce4f0;border-radius:12px;background:#fff}.cepi-workspace-item h4{margin:0 0 5px;color:var(--navy)}.cepi-workspace-item p{margin:4px 0 12px;color:var(--muted)}.cepi-workspace-actions{display:flex;flex-wrap:wrap;gap:8px}.cepi-workspace-form{display:grid;gap:13px}.cepi-workspace-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cepi-workspace-form label{display:grid;gap:5px;font-weight:700}.cepi-workspace-form input,.cepi-workspace-form select,.cepi-workspace-form textarea{width:100%;min-height:40px}.cepi-workspace-form textarea{min-height:90px}.cepi-workspace-form .actions{display:flex;gap:8px;justify-content:flex-end}.cepi-workspace-hint{padding:11px;background:#f3f7ff;border-radius:9px;color:#34466a}.cepi-workspace-questions{margin-top:18px}.cepi-workspace-print{display:none}@media(max-width:700px){.cepi-workspace-grid{grid-template-columns:1fr}.cepi-workspace-toolbar{flex-direction:column}.cepi-workspace-toolbar .btn{width:100%}}`;
  style.textContent += `#cepiWorkspace .cepi-proof-action{border-radius:10px;transform:translateY(0);transition:box-shadow .18s ease,transform .18s ease,filter .18s ease}`;
  style.textContent += `#cepiWorkspace .cepi-proof-action--quiet{border:1px solid #515b69;background:linear-gradient(135deg,#76808d,#4c5665);color:#fff;box-shadow:inset 1px 1px 0 #ffffff60,0 3px 9px #34405430}`;
  style.textContent += `#cepiWorkspace .cepi-proof-action--next{border:1px solid #4b55de;background:linear-gradient(125deg,var(--blue),#7042e8);color:#fff;box-shadow:inset 1px 1px 0 #ffffff38,0 5px 12px #4e55d636}`;
  style.textContent += `#cepiWorkspace .cepi-proof-action--danger{border:1px solid #d66d66;background:linear-gradient(135deg,#ffd7d3,#f5a9a2);color:#7f1d1d;box-shadow:inset 1px 1px 0 #ffffffa8,0 3px 9px #b4231828}`;
  style.textContent += `#cepiWorkspace .cepi-proof-action:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.07);box-shadow:0 8px 18px #34405440}#cepiWorkspace .cepi-proof-action:active:not(:disabled){transform:translateY(0)}#cepiWorkspace .cepi-proof-action:focus-visible{outline:3px solid #a9bfff;outline-offset:2px}#cepiWorkspace .cepi-proof-action:disabled{opacity:.55;box-shadow:none;cursor:not-allowed}@media(prefers-reduced-motion:reduce){#cepiWorkspace .cepi-proof-action{transition:none}#cepiWorkspace .cepi-proof-action:hover:not(:disabled){transform:none}}`;
  style.textContent += `.cepi-ranking-scroll{max-width:100%;overflow:auto;margin-top:14px}.cepi-ranking-table{width:100%;border-collapse:collapse;font-size:13px}.cepi-ranking-table th,.cepi-ranking-table td{padding:9px;border-bottom:1px solid #dce4f0;text-align:left;white-space:nowrap}.cepi-ranking-table th{background:#eef3ff;position:sticky;top:0}.cepi-ranking-table td small{color:var(--muted)}`;
  style.textContent += `#cepiQuestionForm .cepi-rich-editor[contenteditable="false"]{background:#f3f5f9;color:#667085;cursor:not-allowed}#cepiQuestionForm .cepi-rich-toolbar button:disabled{opacity:.45;cursor:not-allowed}`;
  style.textContent += `.cepi-rich-toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid #cbd5e1;border-bottom:0;border-radius:10px 10px 0 0;background:#f8faff}.cepi-rich-toolbar button{min-width:34px;padding:6px 9px;border:1px solid #d7dfec;border-radius:6px;background:#fff;color:#26385d;cursor:pointer}.cepi-rich-toolbar button:hover{background:#eaf0ff}.cepi-rich-editor{min-height:300px;padding:18px;border:1px solid #cbd5e1;border-radius:0 0 10px 10px;background:#fff;color:#17223d;line-height:1.55;outline:none;overflow:auto}.cepi-rich-editor:focus{border-color:#6255db;box-shadow:0 0 0 2px #6255db22}.cepi-rich-editor:empty:before{content:attr(data-placeholder);color:#7c89a3}.cepi-rich-content{line-height:1.55;overflow-wrap:anywhere}.cepi-rich-plain{white-space:pre-wrap}.cepi-rich-content img,.cepi-rich-editor img{display:block;max-width:100%;max-height:540px;object-fit:contain;margin:12px auto}.cepi-rich-content table,.cepi-rich-editor table{border-collapse:collapse;max-width:100%}.cepi-rich-content td,.cepi-rich-content th,.cepi-rich-editor td,.cepi-rich-editor th{border:1px solid #b8c3d6;padding:5px}.cepi-rich-content p{margin:7px 0}.cepi-question-editor-label{font-weight:700}.cepi-question-card .cepi-rich-content{margin:10px 0}.cepi-workspace-form .cepi-rich-hint{margin:0;color:#53627e;font-weight:400}`;
  style.textContent += `.cepi-rich-editor img{cursor:move}.cepi-rich-editor img.cepi-image-selected{outline:3px solid #6255db;outline-offset:3px}.cepi-image-tools{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%;padding-top:8px;border-top:1px solid #d7dfec}.cepi-image-tools[hidden]{display:none}.cepi-image-tools label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600}.cepi-image-tools input[type=range]{width:130px;min-height:auto}.cepi-image-tools output{min-width:38px;font-size:13px}.cepi-image-tools button[aria-pressed=true]{background:#dedaff;border-color:#6255db}.cepi-rich-toolbar .cepi-image-tools button{font-size:12px}.cepi-image-tools [data-image-remove]{color:#9f1d32;border-color:#e7b8c0}`;
  style.textContent += `#cepiTestForm{gap:18px}#cepiTestForm .cepi-test-heading{padding:19px 21px;border:1px solid #dbe5f6;border-radius:16px;background:linear-gradient(120deg,#f1f5ff,#fff);box-shadow:0 5px 18px #152b5410}#cepiTestForm .cepi-test-heading h4{margin:0 0 5px;color:var(--navy);font-size:24px;font-weight:850;letter-spacing:-.5px}#cepiTestForm .cepi-test-heading p{margin:0;color:#53627e;line-height:1.5}#cepiTestForm #cepiTestIdentity{margin:0;border-left:4px solid var(--blue);font-weight:750}#cepiTestForm .cepi-workspace-grid{gap:18px 20px;align-items:start}#cepiTestForm label{display:flex;flex-direction:column;align-items:stretch;align-self:start;gap:8px;margin:0;color:var(--navy);font-size:15px;font-weight:800}#cepiTestForm label[hidden]{display:none}#cepiTestForm label>select,#cepiTestForm label>input,#cepiTestForm label>textarea{min-height:48px;border-color:#cbd6e8;border-radius:10px;background:#fff;font-size:15px;font-weight:600;color:#17233a}#cepiTestForm label>select:focus,#cepiTestForm label>input:focus,#cepiTestForm label>textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px #dfe8ff}#cepiTestForm .cepi-test-classes{min-width:0;margin:0;padding:15px 16px;border:1px solid #d9e3f2;border-radius:12px;background:#f8faff}#cepiTestForm .cepi-test-classes legend{padding:0 4px;color:var(--navy);font-size:15px;font-weight:800}#cepiTestForm .cepi-class-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;max-height:160px;overflow:auto}#cepiTestForm .cepi-class-options label{display:flex;flex-direction:row;align-items:center;gap:8px;min-height:40px;padding:7px 10px;border:1px solid #d8e1f1;border-radius:9px;background:#fff;font-size:14px;cursor:pointer}#cepiTestForm .cepi-class-options label:has(input:checked){border-color:#9cb8f6;background:#edf3ff;color:#173e87}#cepiTestForm .cepi-class-options input{width:17px;min-height:0;height:17px;margin:0;accent-color:var(--blue)}#cepiTestForm .cepi-test-classes small{display:block;margin-top:9px;color:#53627e;font-size:12px}#cepiTestForm .cepi-test-empty{color:#667085;font-size:14px;line-height:1.4}#cepiTestForm .cepi-workspace-grid>.cepi-test-classes{align-self:start}#cepiTestForm .actions{padding-top:8px;border-top:1px solid #e4eaf4}#cepiTestForm .actions .btn{min-height:46px;border-radius:10px}@media(max-width:700px){#cepiTestForm .cepi-test-heading{padding:16px}#cepiTestForm .cepi-test-heading h4{font-size:21px}#cepiTestForm .cepi-workspace-grid{gap:16px}}`;
  style.textContent += `#cepiQuestionSaveStatus{margin:0;padding:10px 12px;border-radius:9px;background:#f3f7ff;color:#34466a;font-size:14px;font-weight:700}#cepiQuestionSaveStatus:empty{display:none}`;
  style.textContent += `.cepi-test-people{min-width:0;margin:0;padding:15px 16px;border:1px solid #d9e3f2;border-radius:12px;background:#f8faff}.cepi-test-people legend{padding:0 4px;color:var(--navy);font-size:15px;font-weight:800}.cepi-test-people>small{display:block;margin-top:9px;color:#53627e;font-size:12px}.cepi-person-picker{position:relative}.cepi-person-picker summary{min-height:48px;padding:12px 14px;border:1px solid #cbd6e8;border-radius:10px;background:#fff;color:#17233a;font-weight:700;cursor:pointer}.cepi-person-picker[open] summary{border-color:var(--blue);border-radius:10px 10px 0 0}.cepi-person-picker-content{padding:10px;border:1px solid #cbd6e8;border-top:0;border-radius:0 0 10px 10px;background:#fff}.cepi-person-picker input[type=search]{width:100%;min-height:42px;margin-bottom:9px;padding:8px 10px;border:1px solid #cbd6e8;border-radius:8px}.cepi-person-options{display:grid;gap:4px;max-height:240px;overflow:auto}.cepi-person-options button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 11px;border:1px solid transparent;border-radius:8px;background:#fff;color:#17233a;text-align:left;cursor:pointer}.cepi-person-options button:hover,.cepi-person-options button[aria-pressed=true]{border-color:#9cb8f6;background:#edf3ff}.cepi-person-options button[hidden]{display:none}.cepi-person-options small{display:block;margin-top:2px;color:#53627e;font-size:12px}.cepi-person-check{color:#315dbb;font-weight:900}`;
  style.textContent += `.cepi-test-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:0 0 16px;padding:14px;border:1px solid #dce4f0;border-radius:12px;background:#f8faff}.cepi-test-filters label{display:grid;gap:5px;font-size:13px;font-weight:750;color:var(--navy)}.cepi-test-filters select{width:100%;min-height:40px;background:#fff}.cepi-test-step{margin:10px 0 13px;padding:10px 12px;border-radius:9px;background:#f3f7ff;color:#34466a;line-height:1.45}`;
  style.textContent += `.cepi-import-entry{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 17px;padding:17px 19px;border:1px solid #cbd9f5;border-radius:14px;background:linear-gradient(110deg,#eff4ff,#fff)}.cepi-import-entry h4{margin:0 0 4px;color:var(--navy);font-size:18px}.cepi-import-entry p{margin:0;color:#53627e;line-height:1.45}.cepi-import-entry .btn{flex:none;min-height:48px;padding:11px 18px;border:0;border-radius:10px;background:linear-gradient(110deg,#3666dc,#6550d8);color:#fff;font-weight:800;box-shadow:0 5px 13px #2b4fb628}.cepi-import-entry .btn:hover{filter:brightness(1.06)}@media(max-width:700px){.cepi-import-entry{display:grid}.cepi-import-entry .btn{width:100%}}`;
  style.textContent += `#cepiTestSaveStatus{margin:0;font-weight:750}#cepiTestSaveStatus[data-state="error"]{background:#fff0ed;color:#9b3427;border:1px solid #efb8ae}#cepiTestSaveStatus[data-state="loading"]{background:#edf3ff;color:#294b83}#cepiTestSaveButton:disabled{opacity:.65;cursor:wait}`;
  style.textContent += `.cepi-import-source{padding:20px;border:1px solid #d9e4f7;border-radius:14px;background:#f8faff}.cepi-import-source h5{margin:0 0 7px;font-size:18px;color:var(--navy)}.cepi-import-source p{margin:0 0 15px;color:#53627e}.cepi-import-source #cepiExamImportRaw{min-height:280px;resize:vertical;font:15px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;background:#fff}.cepi-import-file-tools{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:4px 0 17px}.cepi-import-file-tools strong{overflow-wrap:anywhere;color:#294b83}.cepi-import-file-tools .btn{min-height:38px}.cepi-import-file-tools [hidden]{display:none}.cepi-import-review-head{margin:20px 0 4px;font-size:19px;color:var(--navy)}#cepiImportReview{display:grid;gap:16px}#cepiImportReview .cepi-workspace-item{display:grid;gap:15px;padding:20px;border-radius:14px}#cepiImportReview textarea{min-height:200px;resize:vertical;line-height:1.55;font-size:15px}#cepiImportReview .cepi-import-question-meta{display:grid;grid-template-columns:minmax(0,2fr) minmax(130px,1fr);gap:15px}#cepiImportStatus[data-state="error"],#cepiDuplicateStatus[data-state="error"]{background:#fff0ed;color:#9b3427;border:1px solid #efb8ae}#cepiImportStatus[data-state="success"]{background:#e4f5e9;color:#146335}@media(max-width:700px){#cepiImportReview .cepi-import-question-meta{grid-template-columns:1fr}}`;
  style.textContent += `.cepi-workspace-item.cepi-block-card{border-left:6px solid var(--cepi-block-color);padding-left:15px}.cepi-block-1{--cepi-block-strong:#4167d4;--cepi-block-soft:#94a9eb}.cepi-block-2{--cepi-block-strong:#087e83;--cepi-block-soft:#87c9c6}.cepi-block-3{--cepi-block-strong:#7148b9;--cepi-block-soft:#b59be0}.cepi-block-4{--cepi-block-strong:#a77513;--cepi-block-soft:#e3c27b}.cepi-block-5{--cepi-block-strong:#277c53;--cepi-block-soft:#94cbaa}.cepi-block-6{--cepi-block-strong:#365c8c;--cepi-block-soft:#8eaacb}.cepi-block-medio{--cepi-block-color:var(--cepi-block-strong)}.cepi-block-fundamental{--cepi-block-color:var(--cepi-block-soft)}`;
  style.textContent += `.cepi-connection-status{margin:10px 0 0;padding:10px 12px;border-radius:9px;background:#edf3ff;color:#294b83;font-weight:700}.cepi-connection-status[data-state="success"]{background:#e4f5e9;color:#146335;border:1px solid #a8dbb7}.cepi-connection-status[data-state="error"]{background:#fff0ed;color:#9b3427;border:1px solid #efb8ae}.cepi-class-status{margin:0;padding:10px 12px;border-radius:9px;background:#edf3ff;color:#294b83}.cepi-class-status[data-state="error"]{background:#fff0ed;color:#9b3427;border:1px solid #efb8ae}.cepi-correction-steps{margin:0;padding:15px 18px 15px 36px;border:1px solid #dce4f0;border-radius:12px;background:#f8faff;line-height:1.55}.cepi-correction-steps li+li{margin-top:7px}.cepi-workspace-form .actions #cepiCorrectionStart{width:100%;min-height:48px}.cepi-workspace-form .actions #cepiCorrectionStart:disabled{opacity:.55;cursor:not-allowed}#cepiCorrectionActionStatus[data-state="error"]{background:#fff0ed;color:#9b3427}#cepiCorrectionActionStatus[data-state="loading"]{background:#edf3ff;color:#294b83}#cepiCorrectionActionStatus[data-state="success"]{background:#e4f5e9;color:#146335}`;
  style.textContent += `#cepiGroupForm .cepi-group-heading{padding:18px 20px;border:1px solid #dbe5f6;border-radius:15px;background:linear-gradient(120deg,#f1f5ff,#fff)}#cepiGroupForm .cepi-group-heading h4{margin:0 0 5px;font-size:22px;color:var(--navy)}#cepiGroupForm .cepi-group-heading p{margin:0;color:#53627e}#cepiGroupForm fieldset{min-width:0;margin:0;padding:15px 16px;border:1px solid #d9e3f2;border-radius:12px;background:#f8faff}#cepiGroupForm legend{padding:0 5px;font-weight:800;color:var(--navy)}#cepiGroupForm fieldset>p{margin:3px 0 12px;color:#53627e;font-size:13px}#cepiGroupForm .cepi-group-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}#cepiGroupForm .cepi-group-options label{display:flex;align-items:center;gap:8px;min-height:42px;margin:0;padding:8px 10px;border:1px solid #d8e1f1;border-radius:9px;background:#fff;cursor:pointer}#cepiGroupForm .cepi-group-options label:has(input:checked),#cepiGroupForm .cepi-group-student:has(input:checked){border-color:#7299ef;background:#e7efff;box-shadow:inset 0 0 0 1px #7299ef;color:#173e87}#cepiGroupForm input[type=checkbox]{width:18px;min-height:18px;height:18px;margin:0;accent-color:var(--blue);flex:none}#cepiGroupForm .cepi-group-students{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;max-height:290px;overflow:auto}#cepiGroupForm .cepi-group-student{display:flex;align-items:center;gap:9px;margin:0;padding:8px;border:1px solid #d8e1f1;border-radius:10px;background:#fff;cursor:pointer;font-size:13px}#cepiGroupForm .cepi-group-student[hidden]{display:none}#cepiGroupForm .cepi-group-avatar{position:relative;display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:#dce6ff;color:#315dbb;overflow:hidden;font-weight:800}#cepiGroupForm .cepi-group-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#cepiGroupForm .cepi-group-student small{display:block;color:#53627e;font-weight:500}#cepiGroupForm .cepi-group-student input:disabled{opacity:.6}#cepiGroupForm .cepi-group-count{display:block;margin-top:10px;color:#415273;font-size:13px;font-weight:700}#cepiGroupForm .actions{padding-top:12px;border-top:1px solid #e4eaf4}`;
  style.textContent += `#cepiGroupForm .cepi-club-disciplines .cepi-group-options{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));max-height:240px;overflow:auto}#cepiGroupForm .cepi-club-disciplines .cepi-group-options label[hidden]{display:none}#cepiGroupForm .cepi-discipline-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}#cepiGroupForm .cepi-discipline-toolbar button{padding:7px 10px;border:1px solid #ccd8ed;border-radius:8px;background:#fff;color:#23488f;font-weight:700;cursor:pointer}#cepiGroupForm .cepi-discipline-toolbar button:hover{background:#e7efff}`;
  style.textContent += `.cepi-useful-list-preview{max-width:100%;overflow:auto;border:1px solid #dce4f0;border-radius:12px}.cepi-useful-table{width:100%;border-collapse:collapse;table-layout:fixed}.cepi-useful-table th,.cepi-useful-table td{padding:10px;border-bottom:1px solid #e2e8f2;text-align:left;vertical-align:top;overflow-wrap:anywhere}.cepi-useful-table th{background:#eaf0ff;color:#173e87;font-weight:800}.cepi-useful-table th:first-child{width:24%}.cepi-useful-table th:nth-child(2),.cepi-useful-table th:nth-child(3){width:28%}.cepi-useful-table th:last-child{width:20%}.cepi-useful-table .student-name{font-weight:800}.cepi-useful-table .allocation strong,.cepi-useful-table .allocation small{display:block}.cepi-useful-table .allocation small{margin-top:3px;color:#52617a;font-size:12px}.cepi-useful-table .allocation+.allocation{margin-top:8px}.cepi-useful-table .missing{color:#69758a}.cepi-useful-head{border-left:5px solid #4262d5;padding:14px 16px;background:#f3f7ff;border-radius:10px}.cepi-useful-head h4{margin:0 0 4px;font-size:20px}.cepi-useful-head p{margin:0;color:#53627e}.cepi-useful-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}@media(max-width:700px){.cepi-useful-list-preview{font-size:12px;min-width:0}.cepi-useful-table{min-width:720px}}`;
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
  let groupTeachers = [];
  let groupTeachersLoaded = false;
  let observationOptions = [];
  let classes = [];
  let students = [];
  let userId = null;
  let memberRole = '';
  let correction = null;
  let correctionPoll = null;
  const testFilters = {query:'',year:'',bimester:'',stage:'',block:'',status:''};
  const $ = id => document.getElementById(id);
  const message = value => { $('cepiWorkspaceMessage').textContent = value || ''; };
  const fail = error => message(error?.code === '42P01' || error?.code === 'PGRST205'
    ? 'Esta função ainda depende da ativação das tabelas CEPI no banco. Os demais recursos do Carômetro continuam disponíveis.'
    : error?.message || 'Não foi possível concluir a operação.');
  const manager = () => access?.enabled === true && ['school_admin','coordinator'].includes(memberRole);
  const editor = () => access?.enabled === true && ['school_admin','coordinator','teacher'].includes(memberRole);
  const activeTests = () => tests.filter(test => !test.deleted_at);
  const canEditTest = test => manager() && !test.deleted_at && test.status === 'draft';
  const assignedToTest = test => editor() && test?.assigned_teacher_ids?.includes(userId);
  const canEditQuestion = test => editor() && !test.deleted_at && assignedToTest(test) && (test.status === 'draft' || (test.status === 'ready' && !test.print_opened_at));
  const canAddQuestion = test => canEditQuestion(test) && test.status === 'draft';
  const ensureContext = () => schoolId && window.getActiveSchoolId?.() === schoolId && access?.enabled === true;
  const labelClass = id => classes.find(item => item.id === id)?.name || 'Turma não encontrada';
  const labelStudent = id => students.find(item => item.id === id)?.full_name || 'Estudante não encontrado';
  const groupLabel = key => ({eletiva:'Eletivas',clube:'Clubes',oficina:'Oficinas'})[key] || 'Agrupamentos';
  const rich = () => window.CepiRichText;
  const schoolHeaderExtra = header => {
    const value = String(header?.subtitle || '').trim();
    return /^Esta avaliação é composta\b|\b\d+\s+questões?\b/i.test(value) ? '' : value;
  };
  const instructionTail = header => header?.instructions == null
    ? window.CepiBlocks.defaultInstructionTail : String(header.instructions);
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
      fetchAll(()=>db.from('students').select('id,school_id,full_name,class_id,enrollment_status,has_report,photo_path').eq('school_id',requestedSchool).order('full_name').order('id'))
    ]);
    const firstError = [roleResult,testResult,questionResult,bankResult,headerResult,groupResult,groupClassResult,groupStudentResult,observationResult,classResult,studentResult].find(result => result.error)?.error;
    if (firstError) throw firstError;
    if (window.getActiveSchoolId?.() !== requestedSchool) throw new Error('A escola ativa mudou. Abra Meu CEPI novamente.');
    schoolId = requestedSchool; access = nextAccess; userId = auth.user?.id; memberRole = roleResult.data?.role || '';
    tests = testResult.data || []; questions = questionResult.data || []; questionBank = bankResult.data || []; results = []; examHeader = headerResult.data || null; groups = groupResult.data || [];
    groupClasses = groupClassResult.data || []; groupStudents = groupStudentResult.data || [];
    groupTeachers = []; groupTeachersLoaded = false;
    observationOptions = observationResult.data || [];
    classes = classResult.data || []; students = studentResult.data || [];
  }

  function openSection(key, testId = null) {
    if (correctionPoll) { clearInterval(correctionPoll); correctionPoll=null; }
    section = key;
    $('cepiModal').classList.add('hidden');
    workspace.classList.remove('hidden');
    $('cepiWorkspaceTitle').textContent = ({provas:'Provas',correcao:'Correção de provas',ranking:'Ranking de médias',banco:'Banco de questões',cabecalho:'Cabeçalho das provas',listas:'Imprimir listas',lideres:'Líderes'})[key] || groupLabel(key);
    $('cepiWorkspaceSubtitle').textContent = key === 'provas' ? 'Acompanhe a produção, imprima e corrija as provas da escola.' : key === 'correcao' ? 'Escolha uma prova com questões completas e a turma para ler os cartões no celular.' : key === 'banco' ? 'Professores e coordenação compartilham as questões.' : key === 'listas' ? 'Consulte e imprima a alocação dos alunos por turma.' : 'Registros específicos do CEPI, ligados à escola ativa.';
    $('cepiWorkspaceNew').classList.add('hidden');
    message('Carregando…');
    $('cepiWorkspaceContent').replaceChildren();
    load().then(() => { $('cepiWorkspaceNew').classList.toggle('hidden', !(manager() && ['provas','eletiva','clube','oficina'].includes(key)) && !(editor() && key === 'banco')); message(''); render(); if (key === 'provas' && testId && activeTests().some(test=>test.id===testId)) renderQuestions(testId); }).catch(fail);
  }
  window.openCepiTest = testId => openSection('provas',testId);
  home.querySelectorAll('[data-cepi-workspace]').forEach(button => button.onclick = () => openSection(button.dataset.cepiWorkspace));
  $('cepiWorkspaceClose').onclick = () => { workspace.classList.add('hidden'); if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;} };
  $('cepiWorkspaceBack').onclick = () => { workspace.classList.add('hidden'); $('cepiModal').classList.remove('hidden'); };
  workspace.onclick = event => { if (event.target === workspace) workspace.classList.add('hidden'); };
  document.addEventListener('carometro:school-context-ready', () => { if (!workspace.classList.contains('hidden') && window.getActiveSchoolId?.() !== schoolId) workspace.classList.add('hidden'); });
  $('signOut')?.addEventListener('click', () => { workspace.classList.add('hidden'); schoolId = null; access = null; memberRole=''; }, {capture:true});
  $('cepiWorkspaceNew').onclick = () => { if (!ensureContext()) return; if (section === 'provas' && manager()) testForm(); else if (section === 'banco' && editor()) bankQuestionForm(); else if (['eletiva','clube','oficina'].includes(section) && manager()) groupForm(); };

  function render() {
    if (!ensureContext()) { message('A escola ativa mudou. Abra Meu CEPI novamente.'); return; }
    if (section === 'provas') renderTests();
    else if (section === 'correcao') renderCorrectionHub();
    else if (section === 'ranking') renderRanking();
    else if (section === 'banco') renderBank();
    else if (section === 'cabecalho') renderHeader();
    else if (section === 'listas') void renderUsefulLists();
    else if (section === 'lideres') renderLeaders();
    else renderGroups();
  }
  const nextExamActions = new Set(['new-question','print','print-student','print-cards','correct-cards','record-result']);
  function actionButton(text,action,id,primary=false) {
    const tone=action==='delete-test'?'danger':primary||nextExamActions.has(action)?'next':'quiet';
    return `<button class="btn ${tone==='next'?'primary':'secondary'} cepi-proof-action cepi-proof-action--${tone}" type="button" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
  }
  function bindActions(actions) { $('cepiWorkspaceContent').querySelectorAll('[data-action]').forEach(button => { button.onclick = () => actions[button.dataset.action]?.(button.dataset.id); }); }
  const statusLabel = {draft:'Em produção',ready:'Questões completas · impressão e correção liberadas',applied:'Impressão e correção liberadas',archived:'Arquivada'};
  const testQuestions = test => questions.filter(q => q.test_id === test.id);
  function nextStep(test) {
    const count = testQuestions(test).length;
    if (test.status === 'draft') return `Faltam ${test.question_count-count} questões. Ao completar a prova, a coordenação será avisada e a impressão e a correção ficarão disponíveis.`;
    if (test.status === 'ready' || test.status === 'applied') return 'Impressão e correção disponíveis. A aplicação da prova é organizada pela escola, fora do sistema.';
    return 'Prova arquivada.';
  }
  const filterOptions = (items, selected, label) => `<option value="">${label}</option>${items.map(([value,text])=>`<option value="${esc(value)}" ${String(selected)===String(value)?'selected':''}>${esc(text)}</option>`).join('')}`;
  const blockCardClass = test => {
    const block=Number(test.block_number);
    if(test.kind!=='bloco'||!Number.isInteger(block)||block<1||block>6||!['medio','fundamental_ii'].includes(test.stage))return '';
    return ` cepi-block-card cepi-block-${block} cepi-block-${test.stage==='medio'?'medio':'fundamental'}`;
  };
  function renderTests() {
    $('cepiWorkspaceNew').classList.toggle('hidden',!manager());
    const visible=activeTests().filter(test=>(!testFilters.query||`${test.title} ${(test.subjects||[]).join(' ')}`.toLocaleLowerCase('pt-BR').includes(testFilters.query.toLocaleLowerCase('pt-BR')))&&(!testFilters.year||String(test.academic_year)===testFilters.year)&&(!testFilters.bimester||String(test.bimester)===testFilters.bimester)&&(!testFilters.stage||test.stage===testFilters.stage)&&(!testFilters.block||String(test.block_number)===testFilters.block)&&(!testFilters.status||test.status===testFilters.status));
    const years=[...new Set(activeTests().map(test=>test.academic_year))].sort((a,b)=>b-a).map(value=>[value,String(value)]);
    $('cepiWorkspaceContent').innerHTML = `<p class="cepi-workspace-hint">${manager()?'Cadastre, reutilize ou importe provas para esta escola. As pessoas selecionadas podem adicionar questões às provas em produção.':'Abra uma prova cadastrada pela coordenação para adicionar ou editar questões.'}</p><div class="cepi-test-filters" aria-label="Filtrar provas"><label>Buscar prova ou disciplina<input data-test-query type="search" value="${esc(testFilters.query)}" placeholder="Ex.: Arte, Bloco 4"></label><label>Ano letivo<select data-test-filter="year">${filterOptions(years,testFilters.year,'Todos')}</select></label><label>Bimestre<select data-test-filter="bimester">${filterOptions([1,2,3,4].map(value=>[value,`${value}º bimestre`]),testFilters.bimester,'Todos')}</select></label><label>Etapa<select data-test-filter="stage">${filterOptions([['fundamental_ii','Ensino Fundamental Anos Finais'],['medio','Ensino Médio']],testFilters.stage,'Todas')}</select></label><label>Bloco<select data-test-filter="block">${filterOptions([1,2,3,4,5,6].map(value=>[value,`Bloco ${value}`]),testFilters.block,'Todos')}</select></label><label>Situação<select data-test-filter="status">${filterOptions(Object.entries(statusLabel),testFilters.status,'Todas')}</select></label></div><p class="cepi-workspace-hint">As turmas vinculadas são escolhidas no cadastro da prova. Na correção, aparecem somente essas turmas e os alunos ativos da turma selecionada.</p><div class="cepi-workspace-list">${visible.map(test => `<article class="cepi-workspace-item${blockCardClass(test)}"><h4>${esc(test.title)}</h4><p>${esc(kinds[test.kind] || test.kind)}${test.block_number?` · Bloco ${test.block_number}`:''} · ${test.bimester}º bimestre de ${test.academic_year} · ${esc(test.stage === 'medio' ? 'Ensino Médio' : 'Ensino Fundamental Anos Finais')} · ${testQuestions(test).length}/${test.question_count} questões · <strong>${esc(statusLabel[test.status]||test.status)}</strong></p><p>Turmas: ${esc(test.class_ids?.map(id=>{const cls=classes.find(item=>item.id===id);return cls?`${cls.name}${cls.archived_at?' (arquivada)':''}`:'Turma não encontrada';}).join(', ')||'Nenhuma')}</p><p class="cepi-test-step">${esc(nextStep(test))}</p><div class="cepi-workspace-actions">${actionButton(canEditQuestion(test)?'Ver e editar questões':'Conferir questões','questions',test.id)}${manager()&&test.status!=='draft'?actionButton('Imprimir prova do aluno','print',test.id):''}${manager()&&test.status!=='draft'?actionButton('Imprimir cartões-resposta','print-cards',test.id)+actionButton('Gabarito oficial','print-key',test.id):''}${['ready','applied'].includes(test.status)&&assignedToTest(test)?actionButton('Corrigir cartões pelo celular','correct-cards',test.id)+actionButton('Registrar respostas manualmente','record-result',test.id):''}${canEditTest(test) ? actionButton('Editar dados da prova','edit-test',test.id) : ''}${manager()?actionButton('Escolher responsáveis','assign-teachers',test.id)+actionButton('Excluir prova','delete-test',test.id):''}</div></article>`).join('') || '<div class="cepi-empty">Nenhuma prova encontrada para estes filtros.</div>'}</div>`;
    if(manager()){
      $('cepiWorkspaceContent').querySelector('.cepi-test-filters').insertAdjacentHTML('beforebegin','<section class="cepi-import-entry"><div><h4>Trazer uma prova de fora</h4><p>Use um arquivo Word, PDF com texto selecionável ou TXT.</p></div><button class="btn" type="button" id="cepiImportExam">＋ Importar prova</button></section>');
      $('cepiImportExam').onclick=importExamForm;
      $('cepiWorkspaceContent').querySelectorAll('.cepi-workspace-list > article').forEach((card,index)=>card.querySelector('.cepi-workspace-actions')?.insertAdjacentHTML('beforeend',actionButton('Reutilizar esta prova','duplicate-test',visible[index].id)));
      const deleted=tests.filter(test=>test.deleted_at);
      if(deleted.length)$('cepiWorkspaceContent').insertAdjacentHTML('beforeend',`<details class="cepi-workspace-item"><summary>Provas excluídas (${deleted.length})</summary><div class="cepi-workspace-list">${deleted.map(test=>`<article class="cepi-workspace-item"><h4>${esc(test.title)}</h4><p>Questões e correções preservadas · excluída em ${esc(new Date(test.deleted_at).toLocaleDateString('pt-BR'))}</p>${actionButton('Restaurar prova','restore-test',test.id)}</article>`).join('')}</div></details>`);
    }
    $('cepiWorkspaceContent').querySelector('[data-test-query]').oninput=event=>{testFilters.query=event.target.value;const position=event.target.selectionStart;renderTests();const next=$('cepiWorkspaceContent').querySelector('[data-test-query]');next.focus();next.setSelectionRange(position,position);};
    $('cepiWorkspaceContent').querySelectorAll('[data-test-filter]').forEach(select=>select.onchange=()=>{testFilters[select.dataset.testFilter]=select.value;renderTests();});
    bindActions({'questions':id => renderQuestions(id),'duplicate-test':id=>duplicateTestForm(tests.find(t=>t.id===id)),'print':id => printTest(id),'print-cards':id=>answerSheetForm(id),'print-key':id=>printAnswerSheet(id,true),'correct-cards':id=>correctionForm(id),'record-result':id=>resultForm(tests.find(t=>t.id===id)),'edit-test':id => testForm(tests.find(t => t.id === id)),'assign-teachers':id=>assignmentForm(tests.find(t=>t.id===id)),'delete-test':id=>deleteTest(id),'restore-test':id=>restoreTest(id)});
  }
  async function deleteTest(id) {
    const test=activeTests().find(item=>item.id===id);
    if(!manager()||!ensureContext()||!test)return;
    if(!window.confirm(`Excluir a prova “${test.title}” das listas? As questões e correções serão preservadas e a coordenação poderá restaurá-la.`))return;
    const result=await db.from('cepi_tests').update({deleted_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',id).is('deleted_at',null).select('id').maybeSingle();
    if(result.error||!result.data)return fail(result.error||new Error('A prova não foi excluída. Atualize a lista e tente novamente.'));
    await load().then(()=>{renderTests();message('Prova excluída das listas. Ela pode ser restaurada.');}).catch(fail);
  }
  async function restoreTest(id) {
    const test=tests.find(item=>item.id===id&&item.deleted_at);
    if(!manager()||!ensureContext()||!test)return;
    const result=await db.from('cepi_tests').update({deleted_at:null}).eq('school_id',schoolId).eq('id',id).select('id').maybeSingle();
    if(result.error||!result.data)return fail(result.error||new Error('Não foi possível restaurar a prova.'));
    await load().then(()=>{renderTests();message('Prova restaurada.');}).catch(fail);
  }
  async function assignmentForm(test) {
    if(!manager()||!ensureContext()||!test||test.deleted_at)return;
    try { await loadClubTeachers(); } catch(error) { fail(error); return; }
    if(!ensureContext())return;
    $('cepiWorkspaceNew').classList.add('hidden');
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiAssignTeachersForm" class="cepi-workspace-form"><h4>Responsáveis pelas questões · ${esc(test.title)}</h4>${testTeacherFields(test.assigned_teacher_ids||[])}<p id="cepiAssignStatus" role="status"></p><div class="actions"><button class="btn secondary" id="cepiAssignCancel" type="button">Cancelar</button><button class="btn primary" type="submit">Salvar responsáveis</button></div></form>`;
    $('cepiAssignCancel').onclick=renderTests;
    $('cepiAssignTeachersForm').onsubmit=async event=>{
      event.preventDefault();if(!ensureContext())return;
      const ids=selectedTeacherIds(event.currentTarget);
      if(!validTeacherSelection(ids)){$('cepiAssignStatus').textContent='Escolha ao menos uma pessoa responsável pelas questões.';return;}
      const result=await db.from('cepi_tests').update({assigned_teacher_ids:ids}).eq('school_id',schoolId).eq('id',test.id).select('id').maybeSingle();
      if(result.error||!result.data){$('cepiAssignStatus').textContent=result.error?.message||'Não foi possível salvar os professores.';return;}
      await load().then(()=>{renderTests();message('Pessoas responsáveis atualizadas.');}).catch(fail);
    };
  }
  function renderCorrectionHub() {
    $('cepiWorkspaceNew').classList.add('hidden');
    const available=editor()?activeTests().filter(test=>['ready','applied'].includes(test.status)&&assignedToTest(test)):[];
    $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-item"><h4>Extensão neste computador</h4><p>O Carômetro verifica a extensão automaticamente. Depois, escolha uma prova com questões completas e uma turma ativa para gerar o QR Code. O celular abre a página de leitura ao apontar a câmera para o código exibido aqui.</p><p id="cepiHubStatus" class="cepi-connection-status" role="status">Verificando a extensão…</p><div class="cepi-workspace-actions"><a class="btn secondary" id="cepiHubInstall" target="_blank" rel="noopener noreferrer">Instalar extensão</a><button class="btn secondary" id="cepiHubConnect" type="button">Tentar conectar novamente</button></div></div><p class="cepi-workspace-hint">A correção fica disponível automaticamente quando todas as questões da prova forem lançadas.</p><div class="cepi-workspace-actions">${actionButton('Ver provas','show-tests','')}</div><div class="cepi-workspace-list cepi-workspace-questions">${available.map(test=>`<article class="cepi-workspace-item${blockCardClass(test)}"><h4>${esc(test.title)}</h4><p>${test.question_count} questões · ${test.class_ids?.length||0} turma(s) vinculada(s)</p>${actionButton('Corrigir cartões pelo celular','correct-cards',test.id,true)}</article>`).join('')||'<div class="cepi-empty">Nenhuma prova com questões completas nesta escola.</div>'}</div>`;
    $('cepiHubInstall').href=window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantStoreUrl||'https://chromewebstore.google.com/detail/fgpjjlikinpcjpmmjehbgbfonnbfibnc';
    const verifyHubExtension=async()=>{
      const button=$('cepiHubConnect'),status=$('cepiHubStatus'),install=$('cepiHubInstall');
      button.disabled=true;status.dataset.state='loading';status.textContent='Verificando a extensão neste computador…';
      const result=typeof window.connectCarometroCorrectionExtension==='function' ? await window.connectCarometroCorrectionExtension().catch(()=>null) : null;
      if(!status.isConnected||!ensureContext())return;
      const active=result?.ok===true&&result.license?.examAccess?.active===true;
      const ready=active&&window.CepiCorrection.supportsExtension(result.extensionVersion);
      status.dataset.state=ready?'success':'error';
      status.textContent=ready?'✓ Extensão instalada e conectada. Escolha uma prova com questões completas abaixo.':active?'Atualize a extensão pela loja e recarregue o Carômetro.':'A extensão não respondeu ou o acesso à correção não foi confirmado. Confira a instalação e tente novamente.';
      install.hidden=ready;install.style.display=ready?'none':'';button.hidden=ready;button.style.display=ready?'none':'';button.disabled=false;
      if(active&&!ready)install.textContent='Atualizar extensão';
    };
    $('cepiHubConnect').onclick=verifyHubExtension;
    verifyHubExtension();
    if(manager())$('cepiWorkspaceContent').querySelectorAll('.cepi-workspace-questions > article').forEach((card,index)=>card.insertAdjacentHTML('beforeend',actionButton('Excluir prova','delete-test',available[index].id)));
    bindActions({'show-tests':()=>openSection('provas'),'correct-cards':id=>correctionForm(id),'delete-test':id=>deleteTest(id)});
  }
  const testTeacherFields = selected => {
    const people=groupTeachers.filter(item=>['teacher','coordinator','school_admin'].includes(item.role));
    const count=people.filter(item=>selected?.includes(item.user_id)).length;
    return `<fieldset class="cepi-test-people"><legend>Responsáveis pelas questões</legend><details class="cepi-person-picker"><summary>Escolher pessoas · ${count} selecionada(s)</summary><div class="cepi-person-picker-content"><input type="search" aria-label="Buscar pessoa pelo nome" placeholder="Buscar pelo nome"><div class="cepi-person-options">${people.map(item=>`<button type="button" data-cepi-person-id="${esc(item.user_id)}" aria-pressed="${selected?.includes(item.user_id)?'true':'false'}"><span>${esc(item.full_name)}<small>${esc(({teacher:'Professor(a)',coordinator:'Coordenador(a)',school_admin:'Administrador(a)'})[item.role])}</small></span><span aria-hidden="true" class="cepi-person-check">${selected?.includes(item.user_id)?'✓':''}</span></button>`).join('') || '<p>Nenhum professor ou coordenador ativo desta escola.</p>'}</div></div></details><small>As pessoas escolhidas recebem o aviso e podem lançar, editar e corrigir as questões desta prova.</small></fieldset>`;
  };
  const selectedTeacherIds = form => [...form.querySelectorAll('[data-cepi-person-id][aria-pressed="true"]')].map(button=>button.dataset.cepiPersonId);
  const validTeacherSelection = ids => ids.length>=1 && new Set(ids).size===ids.length && ids.every(id=>groupTeachers.some(item=>item.user_id===id && ['teacher','coordinator','school_admin'].includes(item.role)));
  workspace.addEventListener('click', event=>{
    const option=event.target.closest('[data-cepi-person-id]');
    if(!option||!workspace.contains(option))return;
    const selected=option.getAttribute('aria-pressed')!=='true';
    option.setAttribute('aria-pressed',String(selected));
    option.querySelector('.cepi-person-check').textContent=selected?'✓':'';
    const picker=option.closest('.cepi-person-picker');
    const count=picker.querySelectorAll('[data-cepi-person-id][aria-pressed="true"]').length;
    picker.querySelector('summary').textContent=`Escolher pessoas · ${count} selecionada(s)`;
  });
  workspace.addEventListener('input',event=>{
    if(!event.target.matches('.cepi-person-picker input[type="search"]'))return;
    const query=event.target.value.trim().toLocaleLowerCase('pt-BR');
    event.target.closest('.cepi-person-picker').querySelectorAll('[data-cepi-person-id]').forEach(option=>{option.hidden=!option.textContent.toLocaleLowerCase('pt-BR').includes(query);});
  });
  async function testForm(test=null) {
    if (!manager()) return;
    if (test && !canEditTest(test)) return;
    try { await loadClubTeachers(); } catch(error) { fail(error); return; }
    if (!ensureContext()) return;
    const values = test || {kind:'bloco',academic_year:year,bimester:1,stage:'fundamental_ii',question_count:15,answer_format:'ABCD',status:'draft',subjects:[]};
    const option = (value,label,selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
    $('cepiWorkspaceContent').innerHTML = `<form class="cepi-workspace-form" id="cepiTestForm">
      <div class="cepi-test-heading"><h4>${test?'Editar prova':'Cadastrar prova'}</h4><p>Defina tipo, etapa, bloco e turmas. A identificação será preenchida automaticamente no cabeçalho da prova.</p></div>
      <p id="cepiTestIdentity" class="cepi-workspace-hint" aria-live="polite"></p>
      <div class="cepi-workspace-grid">
        <label>Tipo<select name="kind">${Object.entries({bloco:'Prova de Bloco',bimestral:'Prova Bimestral',simulado:'Simulado'}).map(([key,label]) => option(key,label,values.kind)).join('')}</select></label>
        <label id="cepiBlockField">Bloco<select name="block_number">${[1,2,3,4,5,6].map(n=>option(n,`Bloco ${n}`,Number(values.block_number)||1)).join('')}</select><small id="cepiBlockPlan" class="meta"></small></label>
        <label>Etapa<select name="stage">${option('fundamental_ii','Ensino Fundamental Anos Finais',values.stage)}${option('medio','Ensino Médio',values.stage)}</select></label>
        <fieldset class="cepi-test-classes"><legend>Turmas que farão esta prova</legend><div id="cepiClassOptions" class="cepi-class-options"></div><small id="cepiClassHelp"></small></fieldset>
        ${testTeacherFields(values.assigned_teacher_ids || [])}
        <label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" required value="${values.academic_year}"></label>
        <label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>option(n,`${n}º bimestre`,Number(values.bimester))).join('')}</select></label>
        <label>Data de aplicação (opcional)<input name="scheduled_on" type="date" value="${esc(values.scheduled_on || '')}"><small>Se informada, aparecerá na prova e no cartão-resposta.</small></label>
        <label>Quantidade de questões<input name="question_count" type="number" min="1" max="99" required value="${values.question_count}"></label>
        <label>Alternativas<select name="answer_format">${['ABCD','ABCDE','VF'].map(v=>option(v,v,values.answer_format)).join('')}</select><small>Preenchido conforme a etapa; você pode alterar.</small></label>
        ${test ? '' : '<p class="cepi-workspace-hint">A prova será cadastrada em produção. Quando todas as questões forem lançadas, a impressão e a correção serão liberadas automaticamente.</p>'}
      </div>
      <label>Componentes curriculares, separados por vírgula<input name="subjects" value="${esc((values.subjects||[]).join(', '))}"></label>
      <label>Observações<textarea name="notes">${esc(values.notes || '')}</textarea></label>
      <p id="cepiTestSaveStatus" class="cepi-workspace-hint" role="status" aria-live="polite" hidden></p>
      <div class="actions"><button class="btn secondary" type="button" id="cepiCancelForm">Cancelar</button><button class="btn primary" type="submit" id="cepiTestSaveButton">${test?'Salvar alterações':'Cadastrar prova'}</button></div>
    </form>`;
    const testFormElement = $('cepiTestForm');
    const saveStatus = $('cepiTestSaveStatus');
    const saveButton = $('cepiTestSaveButton');
    const showSaveStatus = (value, state = 'error') => {
      message(value);
      saveStatus.textContent = value;
      saveStatus.dataset.state = state;
      saveStatus.hidden = !value;
      if (state === 'error') saveStatus.scrollIntoView?.({block:'nearest'});
    };
    testFormElement.addEventListener('invalid', event => {
      showSaveStatus(`Confira o campo ${event.target.closest('label')?.firstChild?.textContent?.trim() || 'obrigatório'} antes de salvar.`);
    }, true);
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
    testFormElement.elements.stage.onchange=()=>{testFormElement.elements.answer_format.value=testFormElement.elements.stage.value==='medio'?'ABCDE':'ABCD';syncClasses();syncBlock();};
    testFormElement.elements.block_number.onchange=syncBlock;
    testFormElement.elements.bimester.onchange=syncBlock;
    testFormElement.elements.subjects.oninput=syncBlock;
    syncBlock();
    $('cepiCancelForm').onclick = render;
    $('cepiTestForm').onsubmit = async event => {
      event.preventDefault(); if (!ensureContext() || !manager() || (test && !canEditTest(test))) return;
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const plan = data.kind === 'bloco' ? window.CepiBlocks.plan(data.stage,Number(data.block_number)) : [];
      const classIds=[...testFormElement.querySelectorAll('input[name="classes"]:checked')].map(input=>input.value);
      if(!classIds.length){showSaveStatus('Selecione ao menos uma turma ativa para a prova.');return;}
      const teacherIds=selectedTeacherIds(testFormElement);
      if(!validTeacherSelection(teacherIds)){showSaveStatus('Escolha ao menos uma pessoa responsável pelas questões.');return;}
      const title=window.CepiBlocks.title({kind:data.kind,stage:data.stage,bimester:data.bimester,blockNumber:data.block_number,subjects:data.subjects.split(',')});
      if(!title){showSaveStatus('Confira a etapa, o bloco e o bimestre da prova.');return;}
      const payload = {school_id:schoolId,title,kind:data.kind,class_ids:classIds,block_number:data.kind==='bloco'?Number(data.block_number):null,subject_plan:plan,stage:data.stage,academic_year:Number(data.academic_year),bimester:Number(data.bimester),scheduled_on:data.scheduled_on || null,question_count:Number(data.question_count),answer_format:data.answer_format,status:test?.status||'draft',subjects:data.subjects.split(',').map(s=>s.trim()).filter(Boolean),assigned_teacher_ids:teacherIds,notes:data.notes.trim() || null};
      if (test && questions.some(q => q.test_id === test.id && (q.number > payload.question_count || !(payload.answer_format === 'VF' ? ['V','F'] : [...payload.answer_format]).includes(q.correct_answer)))) { showSaveStatus('A nova configuração conflita com questões já cadastradas. Ajuste as questões antes.'); return; }
      saveButton.disabled = true;
      showSaveStatus('Salvando prova…', 'loading');
      let saved = false;
      try {
        const result = test ? await db.from('cepi_tests').update(payload).eq('school_id',schoolId).eq('id',test.id).select('id').single() : await db.from('cepi_tests').insert({...payload,created_by:userId}).select('id').single();
        if (result.error) throw result.error;
        saved = true;
        showSaveStatus('Prova salva. Atualizando a lista…', 'loading');
        if (!ensureContext()) throw new Error('A escola ativa mudou. Abra Meu CEPI novamente.');
        await load();
        if (test) { renderTests(); message('Alterações da prova salvas.'); return; }
        renderTests();
        message('Prova cadastrada. Os professores já podem adicionar questões.');
      } catch (error) {
        showSaveStatus(saved ? 'A prova foi salva, mas a lista não atualizou. Feche e abra Provas novamente antes de tentar outro cadastro.' : error?.message || 'Não foi possível cadastrar a prova. Tente novamente.');
      } finally {
        saveButton.disabled = saved;
      }
    };
  }
  const activeStageClasses = stage => classes.filter(item => !item.archived_at && window.CepiBlocks.stageForClassName(item.name) === stage);

  async function duplicateTestForm(source) {
    if (!source || !manager() || !ensureContext()) return;
    try { await loadClubTeachers(); } catch(error) { fail(error); return; }
    if(!ensureContext())return;
    $('cepiWorkspaceNew').classList.add('hidden');
    message('');
    const originals=new Set((source.class_ids||[]).map(id=>classes.find(item=>item.id===id)?.name).filter(Boolean));
    const eligible=activeStageClasses(source.stage);
    $('cepiWorkspaceContent').innerHTML=`<form class="cepi-workspace-form" id="cepiDuplicateForm"><h4>Reutilizar prova anterior</h4><p class="cepi-workspace-hint">Origem: ${esc(source.title)} · ${testQuestions(source).length} questão(ões). A nova prova será independente. A original e os resultados dos alunos não serão alterados.</p><div class="cepi-workspace-grid"><label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" required value="${year}"></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>`<option value="${n}" ${n===source.bimester?'selected':''}>${n}º bimestre</option>`).join('')}</select></label><label>Data de aplicação (opcional)<input name="scheduled_on" type="date"><small>Se informada, aparecerá na prova e no cartão-resposta.</small></label></div><fieldset class="cepi-test-classes"><legend>Turmas ativas da nova prova</legend><div class="cepi-class-options">${eligible.map(item=>`<label><input type="checkbox" name="classes" value="${esc(item.id)}" ${originals.has(item.name)?'checked':''}>${esc(item.name)}</label>`).join('') || 'Nenhuma turma ativa desta etapa. Cadastre uma turma antes de reutilizar a prova.'}</div></fieldset>${testTeacherFields(source.assigned_teacher_ids||[])}<p id="cepiDuplicateStatus" class="cepi-workspace-hint" role="status" aria-live="polite" hidden></p><div class="actions"><button class="btn secondary" type="button" id="cepiDuplicateCancel">Cancelar</button><button class="btn primary" type="submit" id="cepiDuplicateSave">Criar cópia</button></div></form>`;
    const form=$('cepiDuplicateForm'),status=$('cepiDuplicateStatus'),button=$('cepiDuplicateSave');
    $('cepiDuplicateCancel').onclick=renderTests;
    form.onsubmit=async event=>{
      event.preventDefault();if(!ensureContext()||!manager())return;
      const values=new FormData(form),classIds=[...form.querySelectorAll('input[name="classes"]:checked')].map(input=>input.value);
      const teacherIds=selectedTeacherIds(form);
      const show=value=>{status.hidden=false;status.textContent=value;message(value);};
      if(!classIds.length){show('Escolha ao menos uma turma ativa para a cópia.');return;}
      if(!validTeacherSelection(teacherIds)){show('Escolha ao menos uma pessoa responsável pelas questões.');return;}
      const title=window.CepiBlocks.title({kind:source.kind,stage:source.stage,bimester:values.get('bimester'),blockNumber:source.block_number,subjects:source.subjects||[]});
      if(!title){show('Não foi possível gerar o nome da nova prova.');return;}
      button.disabled=true;show('Copiando a prova e as questões…');
      let saved=false;
      try{
        const response=await db.rpc('duplicate_cepi_test_as_draft',{p_school_id:schoolId,p_test_id:source.id,p_title:title,p_class_ids:classIds,p_academic_year:Number(values.get('academic_year')),p_bimester:Number(values.get('bimester')),p_scheduled_on:values.get('scheduled_on')||null});
        if(response.error)throw response.error;
        saved=true;
        const assignment=await db.from('cepi_tests').update({assigned_teacher_ids:teacherIds}).eq('school_id',schoolId).eq('id',response.data);
        if(assignment.error)throw new Error(`A cópia foi criada, mas os responsáveis não foram vinculados. Abra a prova e use Escolher responsáveis. ${assignment.error.message}`);
        show('Cópia criada. Abrindo para conferência…');
        await load();
        const copy=tests.find(item=>item.id===response.data);
        if(copy){renderQuestions(copy.id);message('Cópia criada. Confira as questões e o gabarito.');}
        else{renderTests();message('Cópia criada. Encontre-a na lista de provas.');}
      }catch(error){show(error.message|| (saved?'A cópia foi criada, mas a lista não atualizou. Reabra Provas antes de tentar novamente.':'Não foi possível copiar a prova.'));}
      finally{button.disabled=saved;}
    };
  }

  async function importExamForm() {
    if(!manager() || !ensureContext())return;
    try { await loadClubTeachers(); } catch(error) { fail(error); return; }
    if(!ensureContext())return;
    $('cepiWorkspaceNew').classList.add('hidden');message('');
    const state={questions:[],parsedSource:'',fileReadId:0};
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiExamImportForm" class="cepi-workspace-form"><h4>Importar prova de fora</h4><p class="cepi-workspace-hint">Escolha um Word (.docx), PDF com texto selecionável ou TXT. A extração acontece neste navegador. Revise o texto e informe o gabarito de cada questão antes de salvar. Imagens do arquivo devem ser adicionadas depois no editor de questões.</p><label>Arquivo da prova<input id="cepiExamImportFile" type="file" accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></label><label>Texto extraído ou colado<textarea id="cepiExamImportRaw" placeholder="Você também pode colar aqui o texto da prova. Separe cada questão com Questão 1, Questão 2… ou 1., 2.…"></textarea></label><button class="btn secondary" type="button" id="cepiExamImportParse">Separar questões</button><div class="cepi-workspace-grid"><label>Tipo<select name="kind"><option value="bimestral">Prova bimestral</option><option value="bloco">Prova de bloco</option><option value="simulado">Simulado</option></select></label><label id="cepiExamImportBlockField" hidden>Bloco<select name="block_number">${[1,2,3,4,5,6].map(n=>`<option value="${n}">Bloco ${n}</option>`).join('')}</select></label><label>Etapa<select name="stage"><option value="fundamental_ii">Ensino Fundamental Anos Finais</option><option value="medio">Ensino Médio</option></select></label><label>Alternativas<select name="answer_format"><option>ABCD</option><option>ABCDE</option><option>VF</option></select><small>Preenchido conforme a etapa; você pode alterar.</small></label><label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" required value="${year}"></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(n=>`<option value="${n}">${n}º bimestre</option>`).join('')}</select></label><label>Data de aplicação (opcional)<input name="scheduled_on" type="date"><small>Se informada, aparecerá na prova e no cartão-resposta.</small></label><label>Disciplina inicial<input name="default_subject" maxlength="100" placeholder="Ex.: Língua Portuguesa"></label></div><button class="btn secondary" type="button" id="cepiImportApplySubject">Aplicar disciplina a todas as questões</button><fieldset class="cepi-test-classes"><legend>Turmas ativas que farão a prova</legend><div id="cepiImportClasses" class="cepi-class-options"></div></fieldset><p id="cepiImportCount" class="cepi-workspace-hint">Selecione um arquivo ou cole o texto e separe as questões.</p><div id="cepiImportReview"></div><label><input type="checkbox" name="save_to_bank" style="width:auto;min-height:0"> Guardar também cada questão no banco de questões</label><p id="cepiImportStatus" class="cepi-workspace-hint" role="status" aria-live="polite" hidden></p><div class="actions"><button class="btn secondary" type="button" id="cepiImportCancel">Cancelar</button><button class="btn primary" type="submit" id="cepiImportSave">Salvar prova e questões revisadas</button></div></form>`;
    const form=$('cepiExamImportForm'),status=$('cepiImportStatus'),review=$('cepiImportReview'),save=$('cepiImportSave');
    $('cepiImportCount').insertAdjacentHTML('beforebegin',testTeacherFields([]));
    const fileInput=$('cepiExamImportFile'),raw=$('cepiExamImportRaw'),parse=$('cepiExamImportParse');
    const sourcePanel=document.createElement('section');sourcePanel.className='cepi-import-source';
    sourcePanel.innerHTML='<h5>1. Arquivo e texto da prova</h5><p>Selecione um arquivo ou cole o texto. Remover o arquivo limpa a extração e permite escolher outro.</p>';
    form.insertBefore(sourcePanel,fileInput.closest('label'));
    sourcePanel.append(fileInput.closest('label'));
    const fileTools=document.createElement('div');fileTools.className='cepi-import-file-tools';
    fileTools.innerHTML='<strong id="cepiImportFileName">Nenhum arquivo selecionado</strong><button class="btn secondary" type="button" id="cepiImportRemoveFile" hidden>Remover arquivo e extração</button>';
    sourcePanel.append(fileTools,raw.closest('label'),parse);
    const reviewHead=document.createElement('h5');reviewHead.className='cepi-import-review-head';reviewHead.textContent='2. Confira cada questão';
    review.before(reviewHead);
    const updateFileName=()=>{$('cepiImportFileName').textContent=fileInput.files?.[0]?.name||'Nenhum arquivo selecionado';$('cepiImportRemoveFile').hidden=!fileInput.files?.length;};
    const show=(value,kind='error')=>{status.hidden=false;status.dataset.state=kind;status.textContent=value;message(value);};
    const syncClasses=()=>{$('cepiImportClasses').innerHTML=activeStageClasses(form.elements.stage.value).map(item=>`<label><input type="checkbox" name="classes" value="${esc(item.id)}" checked>${esc(item.name)}</label>`).join('')||'Nenhuma turma ativa desta etapa foi encontrada.';};
    const capture=()=>{review.querySelectorAll('[data-import-question]').forEach(card=>{const item=state.questions[Number(card.dataset.importQuestion)];if(!item)return;item.statement=card.querySelector('[data-statement]').value;item.subject=card.querySelector('[data-subject]').value;item.correct_answer=card.querySelector('[data-answer]').value;});};
    const renderReview=()=>{
      const isBlock=form.elements.kind.value==='bloco',plan=isBlock?window.CepiBlocks.plan(form.elements.stage.value,Number(form.elements.block_number.value)):[];
      $('cepiExamImportBlockField').hidden=!isBlock;
      const count=plan?.reduce((total,item)=>total+item.count,0);
      $('cepiImportCount').textContent=state.questions.length?`${state.questions.length} questões identificadas${isBlock?` · o Bloco ${form.elements.block_number.value} exige ${count} questões`:''}. Confira texto, disciplina e gabarito antes de salvar.`:'Selecione um arquivo ou cole o texto e separe as questões.';
      const letters=form.elements.answer_format.value==='VF'?['V','F']:[...form.elements.answer_format.value];
      review.innerHTML=state.questions.map((item,index)=>{
        let planned='';
        if(isBlock){let offset=index;for(const entry of plan||[]){if(offset<entry.count){planned=entry.subject;break;}offset-=entry.count;}}
        const subject=isBlock?planned:(item.subject||form.elements.default_subject.value.trim());
        return `<article class="cepi-workspace-item" data-import-question="${index}"><strong>Questão ${index+1} <small>· número no arquivo: ${item.printedNumber}</small></strong><label>Enunciado e alternativas<textarea data-statement required>${esc(item.statement)}</textarea></label><div class="cepi-import-question-meta"><label>Componente curricular<input data-subject maxlength="100" required value="${esc(subject)}" ${isBlock?'readonly':''}></label><label>Gabarito<select data-answer required><option value="">Selecione</option>${letters.map(letter=>`<option value="${letter}" ${letter===item.correct_answer?'selected':''}>${letter}</option>`).join('')}</select></label></div></article>`;
      }).join('');
    };
    syncClasses();
    $('cepiImportCancel').onclick=renderTests;
    $('cepiImportRemoveFile').onclick=()=>{
      state.fileReadId++;fileInput.value='';raw.value='';state.questions=[];state.parsedSource='';updateFileName();renderReview();
      status.hidden=true;message('Arquivo removido. Escolha outro arquivo ou cole o texto da prova.');
    };
    raw.oninput=()=>{if(fileInput.files?.length){state.fileReadId++;fileInput.value='';updateFileName();}state.questions=[];state.parsedSource='';renderReview();status.hidden=true;};
    fileInput.onchange=async()=>{
      const file=fileInput.files?.[0];if(!file)return;
      const readId=++state.fileReadId;raw.value='';state.questions=[];state.parsedSource='';updateFileName();renderReview();
      show('Extraindo texto do arquivo…','loading');
      try{const extracted=await window.CepiExamImport.extractText(file);if(readId!==state.fileReadId)return;raw.value=extracted;show('Texto extraído. Confira a numeração e clique em Separar questões.','success');}
      catch(error){if(readId===state.fileReadId)show(error.message);}
    };
    $('cepiExamImportParse').onclick=()=>{
      try{state.questions=window.CepiExamImport.splitQuestions($('cepiExamImportRaw').value).map(item=>({...item,subject:'',correct_answer:''}));state.parsedSource=$('cepiExamImportRaw').value;renderReview();show(`${state.questions.length} questões separadas. Revise cada uma e escolha o gabarito.`, 'success');}
      catch(error){state.questions=[];state.parsedSource='';renderReview();show(error.message);}
    };
    for(const name of ['kind','stage','block_number','answer_format'])form.elements[name].onchange=()=>{capture();if(name==='stage'){form.elements.answer_format.value=form.elements.stage.value==='medio'?'ABCDE':'ABCD';syncClasses();}renderReview();};
    $('cepiImportApplySubject').onclick=()=>{capture();state.questions.forEach(item=>{item.subject=form.elements.default_subject.value.trim();});renderReview();};
    form.onsubmit=async event=>{
      event.preventDefault();if(!ensureContext()||!manager())return;
      capture();const values=new FormData(form),isBlock=values.get('kind')==='bloco',plan=isBlock?window.CepiBlocks.plan(values.get('stage'),Number(values.get('block_number'))):[];
      const classIds=[...form.querySelectorAll('input[name="classes"]:checked')].map(input=>input.value);
      const teacherIds=selectedTeacherIds(form);
      const expected=plan?.reduce((total,item)=>total+item.count,0);
      if(!state.questions.length){show('Separe as questões antes de salvar.');return;}
      if(state.parsedSource!==$('cepiExamImportRaw').value){show('O texto original foi alterado. Clique em Separar questões novamente antes de salvar.');return;}
      if(isBlock && expected!==state.questions.length){show(`Este bloco exige ${expected} questões; foram identificadas ${state.questions.length}.`);return;}
      if(!classIds.length){show('Escolha ao menos uma turma ativa.');return;}
      if(!validTeacherSelection(teacherIds)){show('Escolha ao menos uma pessoa responsável pelas questões.');return;}
      const allowed=values.get('answer_format')==='VF'?['V','F']:[...values.get('answer_format')];
      if(state.questions.some(item=>item.statement.trim().length<3||item.statement.trim().length>30000||item.subject.trim().length<2||item.subject.trim().length>100||!allowed.includes(item.correct_answer))){show('Confira o texto, a disciplina e o gabarito de todas as questões.');return;}
      const subjects=[...new Set(state.questions.map(item=>item.subject.trim()))];
      const title=window.CepiBlocks.title({kind:values.get('kind'),stage:values.get('stage'),bimester:values.get('bimester'),blockNumber:values.get('block_number'),subjects});
      if(!title){show('Confira o tipo, a etapa e o bimestre da prova.');return;}
      save.disabled=true;show('Salvando a prova e as questões…','loading');let saved=false;
      try{
        const response=await db.rpc('import_cepi_exam_from_text',{p_school_id:schoolId,p_title:title,p_kind:values.get('kind'),p_stage:values.get('stage'),p_block_number:isBlock?Number(values.get('block_number')):null,p_class_ids:classIds,p_academic_year:Number(values.get('academic_year')),p_bimester:Number(values.get('bimester')),p_scheduled_on:values.get('scheduled_on')||null,p_answer_format:values.get('answer_format'),p_subjects:subjects,p_questions:state.questions.map(item=>({subject:item.subject.trim(),statement:item.statement.trim(),correct_answer:item.correct_answer})),p_save_to_bank:values.get('save_to_bank')==='on'});
        if(response.error)throw response.error;
        saved=true;
        const assignment=await db.from('cepi_tests').update({assigned_teacher_ids:teacherIds}).eq('school_id',schoolId).eq('id',response.data);
        if(assignment.error)throw new Error(`A prova foi importada, mas os responsáveis não foram vinculados. Abra a prova e use Escolher responsáveis. ${assignment.error.message}`);
        show('Prova importada. Abrindo as questões para conferência final…','success');
        await load();const created=tests.find(item=>item.id===response.data);
        if(created){renderQuestions(created.id);message('Prova importada. Confira a formatação, imagens e gabarito.');}
        else{renderTests();message('Prova importada. Encontre-a na lista de provas.');}
      }catch(error){show(error.message||(saved?'A prova foi salva, mas a lista não atualizou. Reabra Provas antes de tentar novamente.':'Não foi possível importar a prova.'));}
      finally{save.disabled=saved;}
    };
  }
  async function correctionApi(action, body = {}, session = correction) {
    const authenticated = ['create','heartbeat'].includes(action);
    const accessToken = authenticated ? (await db.auth.getSession()).data?.session?.access_token : '';
    if (authenticated && !accessToken) throw new Error('Entre novamente no Carômetro para conectar a correção.');
    return window.CepiCorrection.request(action,{room:session?.room?.id,token:session?.room?.desktop,body,accessToken});
  }
  function expireCorrectionSession(session=correction) {
    if(!session||correction!==session||Number(session.room?.expires)>Date.now())return false;
    correction=null;
    if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}
    const live=$('cepiCorrectionLive');
    if(live)live.innerHTML='<div class="cepi-workspace-hint">A sessão de leitura expirou. Para lançar no SIAP, gere outro QR Code e leia os cartões novamente. Os resultados já registrados no Carômetro continuam salvos.</div>';
    const start=$('cepiCorrectionStart');
    if(start)start.textContent='Gerar QR Code para esta prova';
    return true;
  }
  function correctionForm(id) {
    const test=tests.find(item=>item.id===id);
    if(!test||test.deleted_at||!['ready','applied'].includes(test.status)||!editor()||!assignedToTest(test)||!ensureContext())return;
    try { window.CepiAnswerSheets.prepare(test,questions); }
    catch(error){message(error.message);return;}
    const expired=expireCorrectionSession();
    const relevant=classes.filter(item=>test.class_ids?.includes(item.id));
    $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-form"><div class="cepi-workspace-toolbar"><button type="button" class="btn secondary" id="cepiCorrectionBack">← Provas</button></div><h4>Corrigir cartões · ${esc(test.title)}</h4><ol class="cepi-correction-steps"><li>Selecione a turma ativa e a chamada desta prova.</li><li>Toque em <strong>Gerar QR Code para esta prova</strong>. O gabarito salvo e os alunos serão preparados automaticamente.</li><li>O código aparecerá <strong>nesta tela</strong>. No celular, abra a câmera e aponte para ele; a página de leitura abrirá para escolher o aluno e fotografar seu cartão-resposta.</li></ol><label>Turma<select id="cepiCorrectionClass"><option value="">Selecione</option>${relevant.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}${item.archived_at?' · turma arquivada':''}</option>`).join('')}</select></label><p id="cepiCorrectionClassStatus" class="cepi-class-status" role="status">Selecione uma turma ativa vinculada a esta prova.</p><div id="cepiCorrectionRecovery"></div><label>Chamada<select id="cepiCorrectionCall"><option value="1">1ª chamada</option><option value="2">2ª chamada</option></select></label><div id="cepiCorrectionExtensionSetup" class="cepi-workspace-hint"></div><div class="actions"><button type="button" class="btn primary" id="cepiCorrectionStart" disabled>Gerar QR Code para esta prova</button></div><p id="cepiCorrectionActionStatus" class="cepi-workspace-hint" role="status" hidden></p><div id="cepiCorrectionLive" role="status"></div></div>`;
    if(expired)$('cepiCorrectionLive').innerHTML='<div class="cepi-workspace-hint">A sessão de leitura expirou. Gere outro QR Code e leia os cartões novamente para lançar no SIAP. Os resultados já registrados no Carômetro continuam salvos.</div>';
    const setup=document.createElement('div');
    setup.innerHTML='<strong>Extensão neste computador</strong><p id="cepiCorrectionExtensionStatus" class="cepi-connection-status" role="status">Verificando a extensão…</p><div class="cepi-workspace-actions"><a id="cepiCorrectionInstall" class="btn secondary" target="_blank" rel="noopener noreferrer">Instalar extensão</a><button id="cepiCorrectionConnect" class="btn secondary" type="button">Tentar conectar novamente</button></div>';
    $('cepiCorrectionExtensionSetup').replaceWith(setup);
    const install=$('cepiCorrectionInstall'), connect=$('cepiCorrectionConnect'), start=$('cepiCorrectionStart'), extensionStatus=$('cepiCorrectionExtensionStatus'), actionStatus=$('cepiCorrectionActionStatus'), classStatus=$('cepiCorrectionClassStatus'), recovery=$('cepiCorrectionRecovery');
    const showActionStatus=(value,state='error')=>{actionStatus.textContent=value||'';actionStatus.dataset.state=state;actionStatus.hidden=!value;};
    const emptyClassMessage=classId=>{
      const selected=classes.find(item=>item.id===classId);
      const current=classes.find(item=>item.id!==classId&&!item.archived_at&&item.name===selected?.name);
      if(selected?.archived_at)return `Esta prova está vinculada à antiga turma ${selected.name}, que foi arquivada.${current?' Existe outra turma '+selected.name+' ativa no cadastro.':''} A coordenação precisa conferir o vínculo da prova antes da correção.`;
      return `Não há alunos ativos na turma ${selected?.name||'selecionada'} vinculada a esta prova.${current?' Existe outra turma com o mesmo nome no cadastro.':''} Confira o vínculo da prova e o cadastro dos alunos.`;
    };
    $('cepiCorrectionClass').onchange=()=>{
      const classId=$('cepiCorrectionClass').value;
      const selected=classes.find(item=>item.id===classId);
      classStatus.dataset.state=selected?.archived_at?'error':'ready';
      classStatus.textContent=selected?.archived_at?emptyClassMessage(classId):selected?`Turma ${selected.name} selecionada. Após gerar o QR Code, leia-o com a câmera do celular.`:'Selecione uma turma ativa vinculada a esta prova.';
      showActionStatus('');
      updateStartAvailability();
      recovery.replaceChildren();
      const candidates=classes.filter(item=>!item.archived_at&&item.name===selected?.name&&item.id!==classId);
      if(!manager()||!selected?.archived_at||candidates.length!==1)return;
      const button=document.createElement('button');
      button.type='button';button.className='btn secondary';button.textContent=`Copiar prova para a ${candidates[0].name} ativa`;
      recovery.appendChild(button);
      button.onclick=async()=>{
        if(!ensureContext()){showActionStatus('A escola ativa mudou. Abra Meu CEPI novamente.');return;}
        if(!window.confirm(`Criar uma cópia desta prova para a turma ${candidates[0].name} ativa? A prova original e seus resultados serão preservados. A cópia ficará disponível para impressão e correção.`))return;
        button.disabled=true;button.textContent='Copiando prova…';
        let copied=false;
        try{
          const result=await db.rpc('copy_applied_cepi_test_to_active_class',{p_school_id:schoolId,p_test_id:id,p_old_class_id:classId,p_new_class_id:candidates[0].id});
          if(result.error)throw result.error;
          copied=true;
          if(test.assigned_teacher_ids?.length){
            const assignment=await db.from('cepi_tests').update({assigned_teacher_ids:test.assigned_teacher_ids}).eq('school_id',schoolId).eq('id',result.data);
            if(assignment.error)throw new Error(`A prova foi copiada, mas os responsáveis não foram vinculados. Abra a cópia em Provas e use Escolher responsáveis. ${assignment.error.message}`);
          }
          await load();testFilters.status='';renderTests();
          message('Prova copiada para a turma ativa. Impressão e correção disponíveis para a cópia.');
        }catch(error){showActionStatus(error.message||(copied?'A prova foi copiada, mas a lista não atualizou. Reabra Meu CEPI antes de tentar novamente.':'Não foi possível copiar a prova.'));button.disabled=copied;button.textContent=copied?'Prova copiada':`Copiar prova para a ${candidates[0].name} ativa`;}
      };
    };
    install.href=window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantStoreUrl||'https://chromewebstore.google.com/detail/fgpjjlikinpcjpmmjehbgbfonnbfibnc';
    start.setAttribute('aria-describedby','cepiCorrectionClassStatus cepiCorrectionExtensionStatus');
    let extensionReady=false,connectionTask=null;
    const updateStartAvailability=()=>{
      if(!start.isConnected)return;
      const selected=classes.find(item=>item.id===$('cepiCorrectionClass').value);
      start.disabled=!!connectionTask||!extensionReady||!selected||!!selected.archived_at;
    };
    const connectExtension=()=>{
      if(connectionTask)return connectionTask;
      connectionTask=(async()=>{
        connect.disabled=true;
        start.disabled=true;
        connect.textContent='Verificando…';
        extensionStatus.dataset.state='loading';
        extensionStatus.textContent='Conectando à sua conta do Carômetro…';
        let result=null;
        try{
          result=typeof window.connectCarometroCorrectionExtension==='function'
            ? await window.connectCarometroCorrectionExtension() : null;
        }catch(error){result={ok:false,code:'CONNECTION_FAILED'};}
        if(!start.isConnected||!ensureContext())return false;
        const compatible=window.CepiCorrection.supportsExtension(result?.extensionVersion);
        const active=result?.ok===true&&result.license?.examAccess?.active===true;
        extensionReady=active&&compatible;
        install.hidden=extensionReady;
        install.style.display=install.hidden?'none':'';
        install.textContent=active&&!compatible?'Atualizar extensão':'Instalar extensão';
        connect.hidden=extensionReady;
        connect.style.display=connect.hidden?'none':'';
        connect.textContent='Tentar conectar novamente';
        const reason=result?.code==='SESSION_EXPIRED'
          ? 'Sua sessão do Carômetro expirou. Entre novamente para conectar a extensão.'
          : result?.code==='INVALID_SESSION'
            ? 'A sessão do Carômetro precisa ser renovada. Recarregue a página e tente novamente.'
            : result?.code==='LICENSE_CONNECTION_FAILED'||result?.code==='LICENSE_REQUEST_FAILED'
              ? 'Não foi possível validar o acesso à correção. Tente novamente em instantes.'
              : result?.ok===true
                ? 'A extensão respondeu, mas o acesso à correção não foi confirmado para esta conta.'
                : 'A extensão não respondeu neste navegador. Confira se está instalada e ativada, recarregue o Carômetro e tente novamente.';
        extensionStatus.dataset.state=extensionReady?'success':'error';
        extensionStatus.textContent=extensionReady
          ? '✓ Extensão instalada e conectada neste computador. Selecione uma turma ativa e gere o QR Code abaixo.'
          : active ? 'Esta prova exige a extensão 0.28.34 ou mais recente. Atualize pela Chrome Web Store e recarregue o Carômetro.' : reason;
        connect.disabled=false;
        return extensionReady;
      })().finally(()=>{connectionTask=null;updateStartAvailability();});
      return connectionTask;
    };
    connect.onclick=connectExtension;
    connectExtension();
    $('cepiCorrectionBack').onclick=()=>{if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}renderTests();};
    $('cepiCorrectionStart').onclick=async()=>{
      if(!ensureContext()){showActionStatus('A escola ativa mudou ou o acesso ao Meu CEPI expirou. Feche esta janela e abra o Meu CEPI novamente.');return;}
      const classId=$('cepiCorrectionClass').value;
      if(!classId){showActionStatus('Selecione uma turma ativa desta prova para gerar o QR Code.');return;}
      const selectedClass=classes.find(item=>item.id===classId);
      if(selectedClass?.archived_at){classStatus.dataset.state='error';classStatus.textContent=emptyClassMessage(classId);updateStartAvailability();return;}
      showActionStatus('');
      if(!extensionReady && !await connectExtension()){showActionStatus(extensionStatus.textContent);return;}
      expireCorrectionSession();
      if(correction && (correction.schoolId!==schoolId||correction.testId!==id||correction.classId!==classId)){showActionStatus('Encerre a sessão de correção anterior antes de trocar de prova ou turma.');return;}
      if(correction){renderCorrectionLive(test,true);return;}
      const button=$('cepiCorrectionStart');button.disabled=true;button.textContent='Preparando gabarito e QR Code…';showActionStatus(`Preparando o gabarito de ${test.question_count} questões e os alunos da turma ${selectedClass.name}…`,'loading');
      let room=null;
      try{
        const prepared=window.CepiAnswerSheets.prepare(test,questions);
        const currentStudents=await fetchAll(()=>db.from('students').select('id,school_id,full_name,class_id,enrollment_status,has_report,photo_path').eq('school_id',schoolId).eq('class_id',classId).eq('enrollment_status','active').order('full_name').order('id'));
        if(currentStudents.error)throw currentStudents.error;
        const roster=(currentStudents.data||[]).map(student=>({id:student.id,name:student.full_name}));
        if(!roster.length)throw new Error(emptyClassMessage(classId));
        students=students.filter(student=>student.class_id!==classId||student.enrollment_status!=='active').concat(currentStudents.data);
        const subjectMap=[...new Set(prepared.rows.map(row=>row.subject))].map(subject=>({subject,numbers:prepared.rows.filter(row=>row.subject===subject).map(row=>row.number)}));
        const created=await correctionApi('create',{context:`${test.title} · ${labelClass(classId)} · ${test.question_count} questões`,mobileWorkflow:true,cepiMeta:{schoolId,testId:id,schoolName:examHeader?.school_name||'',className:labelClass(classId),academicYear:test.academic_year,bimester:test.bimester,stage:test.stage,blockNumber:test.block_number,subjectMap}});
        room=created;
        const session={room,schoolId,testId:id,classId,saved:new Set(),lastStatus:null,heartbeatAt:Date.now()};
        await correctionApi('key',{key:window.CepiCorrection.key(prepared)},session);
        await correctionApi('roster',{roster,binding:`${schoolId}:${id}:${classId}`},session);
        correction=session;
        showActionStatus('QR Code pronto abaixo. Aponte a câmera do celular para ele e escolha o aluno na página que abrir.','success');
        renderCorrectionLive(test,true);
      }catch(error){if(room)correctionApi('close',{}, {room}).catch(()=>{});button.textContent='Gerar QR Code para esta prova';showActionStatus(error.message||'Não foi possível gerar o QR Code.');actionStatus.scrollIntoView({block:'nearest'});}
      finally{updateStartAvailability();}
    };
    if(correction?.schoolId===schoolId&&correction.testId===id){$('cepiCorrectionClass').value=correction.classId;$('cepiCorrectionClass').onchange();renderCorrectionLive(test,true);}
  }
  function renderCorrectionLive(test,reveal=false) {
    if(!correction || correction.testId!==test.id)return;
    if(expireCorrectionSession())return;
    const target=$('cepiCorrectionLive');if(!target)return;
    const qr=window.qrcode(0,'M');
    qr.addData(`https://correcao.sistemacarometro.com.br/#session=${correction.room.id}&token=${correction.room.mobile}`);qr.make();
    target.innerHTML=`<div class="cepi-workspace-item"><h4>QR Code pronto · turma ${esc(labelClass(correction.classId))}</h4><p>Abra a câmera do celular e aponte para o código abaixo. Toque no link que aparecer para abrir a página de leitura; nela, selecione o aluno e fotografe o cartão-resposta. O gabarito desta prova já está preparado. O código expira às ${new Date(correction.room.expires).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}. Não compartilhe esta imagem.</p><div id="cepiCorrectionQr" style="width:min(260px,100%);margin:auto"></div><div id="cepiCorrectionResults">Aguardando cartões dos alunos. Leia o QR Code no celular para começar.</div><div class="cepi-workspace-actions"><button type="button" class="btn primary" id="cepiCorrectionSave">Registrar correções conferidas</button><button type="button" class="btn secondary" id="cepiCorrectionClose">Encerrar leitura</button></div><p id="cepiCorrectionActionFeedback" role="status" aria-live="polite"></p></div>`;
    $('cepiCorrectionQr').innerHTML=qr.createSvgTag({cellSize:4,margin:8,scalable:true});
    const start=$('cepiCorrectionStart');
    if(start)start.textContent='Mostrar QR Code da sessão';
    if(reveal){
      const heading=target.querySelector('h4');
      heading.tabIndex=-1;
      target.scrollIntoView({block:'start',inline:'nearest'});
      heading.focus({preventScroll:true});
    }
    $('cepiCorrectionSave').onclick=()=>saveCorrectionResults(test);
    $('cepiCorrectionClose').onclick=async()=>{
      const button=$('cepiCorrectionClose'),feedback=$('cepiCorrectionActionFeedback');
      button.disabled=true;feedback.textContent='Encerrando leitura…';
      try{await correctionApi('close');correction=null;if(correctionPoll){clearInterval(correctionPoll);correctionPoll=null;}correctionForm(test.id);message('Leitura encerrada.');}
      catch(error){if(!expireCorrectionSession()){feedback.textContent=error.message||'Não foi possível encerrar a leitura.';button.disabled=false;feedback.scrollIntoView({block:'nearest'});}}
    };
    if(!correctionPoll)correctionPoll=setInterval(()=>pollCorrection(test),3500);
    pollCorrection(test);
  }
  async function pollCorrection(test) {
    const session=correction;
    if(!session||session.testId!==test.id||session.polling||!ensureContext()||workspace.classList.contains('hidden'))return;
    if(expireCorrectionSession(session))return;
    session.polling=true;
    try{
      if(Date.now()-session.heartbeatAt>30000){await correctionApi('heartbeat',{});session.heartbeatAt=Date.now();}
      const status=await correctionApi('status');
      if(correction!==session)return;
      session.lastStatus=status;
      const target=$('cepiCorrectionResults');if(!target)return;
      const names=new Map(students.map(student=>[student.id,student.full_name]));
      const cards=(status.items||[]).filter(item=>item.kind==='student'&&!item.discarded);
      target.innerHTML=cards.length?`<p>${cards.length} cartão(ões) recebido(s). Revise cada leitura no celular antes de registrar.</p><div class="cepi-workspace-list">${cards.map(item=>{const studentId=item.review?.studentId||item.selectedStudentId;const answers=item.review?.answers||item.result?.answers;const score=Array.isArray(answers)?window.CepiBlocks.summarize(test,questions,answers):null;return `<div class="cepi-workspace-item"><strong>${esc(names.get(studentId)||'Aluno não identificado')}</strong> · ${esc(item.status)} · ${item.review?.reviewed?'Conferido no celular':'Aguardando conferência'}${score?` · ${score.correct}/${score.total} acertos`:''}${session.saved.has(item.id)?' · Registrado no Carômetro':''}</div>`;}).join('')}</div>`:'Aguardando cartões…';
    }catch(error){if(!expireCorrectionSession(session))message(error.message);}
    finally{session.polling=false;}
  }
  async function saveCorrectionResults(test) {
    const session=correction;if(!session||!ensureContext())return;
    if(expireCorrectionSession(session))return;
    const button=$('cepiCorrectionSave'),feedback=$('cepiCorrectionActionFeedback');
    if(button){button.disabled=true;button.textContent='Registrando…';}
    if(feedback)feedback.textContent='Buscando as conferências e salvando no Carômetro…';
    try{
      const status=await correctionApi('status');session.lastStatus=status;
      const classStudents=students.filter(student=>student.class_id===session.classId&&student.enrollment_status==='active').map(student=>student.id);
      const entries=window.CepiCorrection.reviewedItems(status,classStudents,test);
      if(!entries.length)throw new Error('Ainda não há cartão conferido no celular.');
      const existing=await db.from('cepi_test_results').select('capture_ref').eq('school_id',schoolId).eq('test_id',test.id).in('capture_ref',entries.map(item=>item.capture_ref));
      if(existing.error)throw existing.error;
      const saved=new Set((existing.data||[]).map(item=>item.capture_ref));let count=0;
      for(const entry of entries.filter(item=>!saved.has(item.capture_ref))){
        const result=await db.from('cepi_test_results').insert({school_id:schoolId,test_id:test.id,student_id:entry.student_id,call_number:Number($('cepiCorrectionCall').value),answers:entry.answers,source:'extension',capture_ref:entry.capture_ref,reviewed_by:userId});
        if(result.error)throw result.error;
        session.saved.add(entry.capture_ref);count++;
      }
      const confirmation=count?`${count} correção(ões) registrada(s) no Carômetro. O ranking considera esses resultados.`:'Todos os cartões conferidos já estavam registrados no Carômetro.';
      if(feedback)feedback.textContent=confirmation;
      message(confirmation);
      pollCorrection(test);
    }catch(error){
      if(!expireCorrectionSession(session)){
        const detail=error.message||'Não foi possível registrar as correções.';
        if(feedback){feedback.textContent=`Falha ao registrar: ${detail}`;feedback.scrollIntoView({block:'nearest'});}
        message(detail);
      }
    }
    finally{if(button){button.disabled=false;button.textContent='Registrar correções conferidas';}}
  }
  function resultForm(test) {
    if(!test||test.deleted_at||!['ready','applied'].includes(test.status)||!editor()||!assignedToTest(test)||!ensureContext())return;
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiResultForm" class="cepi-workspace-form"><h4>Registrar respostas · ${esc(test.title)}</h4><p class="cepi-workspace-hint">Confira a identificação e cada marcação antes de salvar. Uma correção posterior cria um novo registro; a anterior fica preservada.</p><div class="cepi-workspace-grid"><label>Turma<select name="class_id" required><option value="">Selecione</option>${classes.filter(c=>test.class_ids?.includes(c.id)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Aluno<select name="student_id" required><option value="">Selecione a turma</option></select></label><label>Chamada<select name="call_number"><option value="1">1ª chamada</option><option value="2">2ª chamada</option></select></label></div><label>${test.question_count} respostas em ordem, usando ${esc(test.answer_format)}; use - para branco<textarea name="answers" required placeholder="Ex.: A B C D - A B..."></textarea></label><div id="cepiResultPreview" class="cepi-workspace-hint">Preencha as respostas para conferir os acertos.</div><div class="actions"><button type="button" id="cepiResultCancel" class="btn secondary">Cancelar</button><button class="btn primary" type="submit">Confirmar correção</button></div></form>`;
    const form=$('cepiResultForm');$('cepiResultCancel').onclick=renderTests;
    form.elements.class_id.onchange=()=>{form.elements.student_id.innerHTML='<option value="">Selecione</option>'+students.filter(s=>s.enrollment_status==='active'&&s.class_id===form.elements.class_id.value).map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)}</option>`).join('');};
    const parseAnswers=()=>String(form.elements.answers.value||'').toUpperCase().replace(/[\s,;]+/g,'').split('').filter(Boolean);
    const preview=()=>{const answers=parseAnswers(),allowed=test.answer_format==='VF'?['V','F','-']:[...test.answer_format,'-'];const valid=answers.length===test.question_count&&answers.every(answer=>allowed.includes(answer));const score=valid?window.CepiBlocks.summarize(test,questions,answers):null;$('cepiResultPreview').textContent=score?`${score.correct} de ${score.total} acertos · ${Object.entries(score.bySubject).map(([subject,item])=>`${subject}: ${item.correct}/${item.total}`).join(' · ')}`:`Informe exatamente ${test.question_count} respostas válidas em ordem.`;return score?answers:null;};
    form.elements.answers.oninput=preview;
    form.onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const answers=preview(),studentId=form.elements.student_id.value;if(!answers||!studentId){message('Confira o estudante e todas as respostas.');return;}const result=await db.from('cepi_test_results').insert({school_id:schoolId,test_id:test.id,student_id:studentId,call_number:Number(form.elements.call_number.value),answers,source:'manual',reviewed_by:userId});if(result.error)return fail(result.error);message('Correção registrada. O ranking usa a última correção revista desta chamada.');renderTests();};
  }
  function renderQuestions(testId) {
    const test = activeTests().find(item => item.id === testId); if (!test) return render();
    $('cepiWorkspaceNew').classList.toggle('hidden',!manager());
    const rows = questions.filter(q => q.test_id === testId).sort((a,b)=>a.number-b.number);
    $('cepiWorkspaceContent').innerHTML = `<div class="cepi-workspace-toolbar"><button type="button" class="btn secondary" id="cepiQuestionBack">← Provas</button>${canAddQuestion(test) ? actionButton('＋ Questão','new-question',testId,true) + actionButton('Usar banco','import-question',testId) : ''}${manager()&&test.status!=='draft'?actionButton('Imprimir prova do aluno','print-student',testId,true):''}${manager()&&test.status!=='draft'?actionButton('Imprimir cartões-resposta','print-cards',testId)+actionButton('Gabarito oficial','print-key',testId):''}${manager()&&(!examHeader?.school_name || !examHeader?.state_name) ? actionButton('Configurar cabeçalho','header',testId) : ''}${manager()?actionButton('Excluir prova','delete-test',testId):''}</div><h4>${esc(test.title)}</h4><p class="meta">${rows.length} de ${test.question_count} questões previstas · ${esc(test.answer_format)}</p>${manager()?`<p class="cepi-workspace-hint">Confira as questões enviadas pelos professores. O gabarito mostrado aqui é interno e não aparece na prova do aluno.${rows.length<test.question_count?` Faltam ${test.question_count-rows.length} questões para imprimir.`:''}</p>`:''}<div class="cepi-workspace-list cepi-workspace-questions">${rows.map(q=>`<article class="cepi-workspace-item cepi-question-card"><h4>Questão ${q.number} · ${esc(q.subject)}</h4>${rich().render(q.statement,schoolId)}${Object.entries(q.alternatives||{}).filter(([,value])=>value).map(([letter,value])=>`<p>${esc(letter)}) ${esc(value)}</p>`).join('')}<p>Gabarito interno: <strong>${esc(q.correct_answer)}</strong></p>${canEditQuestion(test)?actionButton('Editar questão','edit-question',q.id):''}${canAddQuestion(test)?actionButton('Retirar da prova','remove-question',q.id):''}</article>`).join('') || '<div class="cepi-empty">Nenhuma questão cadastrada.</div>'}</div>`;
    rich().hydrate($('cepiWorkspaceContent'),db,schoolId).catch(fail);
    $('cepiQuestionBack').onclick = renderTests;
    bindActions({'new-question':()=>questionForm(test),'edit-question':id=>questionForm(test,questions.find(q=>q.id===id)),'import-question':()=>importQuestionForm(test),'print-student':()=>printTest(test.id),'print-cards':()=>answerSheetForm(test.id),'print-key':()=>printAnswerSheet(test.id,true),'header':()=>openSection('cabecalho'),'delete-test':()=>deleteTest(test.id),'remove-question':async id=>{if(!canAddQuestion(test)||!ensureContext())return;const result=await db.from('cepi_test_questions').delete().eq('school_id',schoolId).eq('test_id',test.id).eq('id',id);if(result.error)return fail(result.error);await load().then(()=>renderQuestions(test.id)).catch(fail);}});
  }
  function questionForm(test,q=null,preferredSubject=null) {
    if (!canEditQuestion(test) || (!q && !canAddQuestion(test))) return;
    $('cepiWorkspaceNew').classList.add('hidden');
    const answerFormat = test.answer_format === 'VF' ? ['V','F'] : [...test.answer_format];
    const occupied=new Set(questions.filter(item=>item.test_id===test.id).map(item=>item.number));
    const next = q?.number || Array.from({length:test.question_count},(_,index)=>index+1).find(number=>!occupied.has(number));
    if(!next){message('Todas as questões desta prova já foram cadastradas.');return renderQuestions(test.id);}
    const selectedSubject=q?.subject || preferredSubject || test.subjects?.[0] || '';
    const initialCapacity=window.CepiBlocks.subjectCapacity(test,questions,selectedSubject,q?.id);
    const initialNumber=!q && initialCapacity?.full ? initialCapacity.lastNumber || next : next;
    $('cepiWorkspaceContent').innerHTML = `<form class="cepi-workspace-form" id="cepiQuestionForm"><h4>${q?'Editar':'Nova'} questão ${initialNumber} · ${esc(test.title)}</h4><div class="cepi-workspace-grid"><label>Número<input name="number" type="number" min="1" max="${test.question_count}" required value="${initialNumber}"></label><label>Componente curricular<input name="subject" maxlength="100" required value="${esc(selectedSubject)}"></label></div><div><div class="cepi-question-editor-label" id="cepiQuestionEditorLabel">Enunciado e alternativas *</div><p class="cepi-rich-hint">Cole a questão completa do Word ou de outro lugar. Imagens coladas ou inseridas aparecem no topo; depois você pode movê-las.</p>${richTools('cepiQuestionEditor')}<div id="cepiQuestionEditor" class="cepi-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="cepiQuestionEditorLabel" data-placeholder="Cole ou escreva aqui o texto de apoio, a pergunta e as alternativas..."></div></div><label>Gabarito<select name="correct_answer" required><option value="">Selecione</option>${answerFormat.map(letter=>`<option value="${letter}" ${q?.correct_answer===letter?'selected':''}>${letter}</option>`).join('')}</select></label><p id="cepiQuestionSaveStatus" role="status" aria-live="polite"></p><div class="actions"><button class="btn secondary" type="button" id="cepiCancelForm">Cancelar</button><button class="btn primary" type="submit">${q?'Salvar alterações':'Salvar e ir para a próxima'}</button></div></form>`;
    const form=$('cepiQuestionForm'),editorArea=$('cepiQuestionEditor');
    editorArea.innerHTML=rich().sanitize(legacyRich(q),{schoolId});
    rich().hydrate(editorArea,db,schoolId).catch(fail);
    const richControl=bindRichTools(form,editorArea);
    const unsavedUploads=new Set();
    if(test.kind==='bloco') {
      const subjectInput=form.elements.subject;
      const select=document.createElement('select');select.name='subject';
      select.innerHTML=(test.subject_plan||[]).map(item=>`<option value="${esc(item.subject)}" ${item.subject===selectedSubject?'selected':''}>${esc(item.subject)} · ${item.count} questões</option>`).join('');
      subjectInput.replaceWith(select);
    }
    const heading=form.querySelector('h4'),numberInput=form.elements.number,submit=form.querySelector('button[type="submit"]');
    const toolbar=form.querySelector('[data-editor="cepiQuestionEditor"]');
    const applySubjectCapacity=(resetNumber=false)=>{
      if(test.kind!=='bloco')return false;
      const subject=form.elements.subject.value;
      const capacity=window.CepiBlocks.subjectCapacity(test,questions,subject,q?.id);
      const blocked=!capacity || capacity.full;
      if(!q){
        if(resetNumber || blocked)numberInput.value=String(blocked ? capacity?.lastNumber || next : next);
        numberInput.readOnly=blocked;
        heading.textContent=`Nova questão ${numberInput.value} · ${test.title}`;
        editorArea.contentEditable=String(!blocked);
        editorArea.setAttribute('aria-disabled',String(blocked));
        toolbar.querySelectorAll('button,input').forEach(control=>{control.disabled=blocked;});
        form.elements.correct_answer.disabled=blocked;
      }
      submit.disabled=blocked;
      $('cepiQuestionSaveStatus').textContent=blocked
        ? capacity ? `${subject}: ${capacity.limit} de ${capacity.limit} questões cadastradas. Selecione outro componente curricular para continuar.` : 'Selecione um componente curricular válido.'
        : '';
      return blocked;
    };
    if(test.kind==='bloco')form.elements.subject.onchange=()=>applySubjectCapacity(true);
    applySubjectCapacity(true);
    $('cepiCancelForm').onclick = async () => {
      if(unsavedUploads.size)await richControl.rollback([...unsavedUploads]).catch(()=>{});
      richControl.dispose();renderQuestions(test.id);
    };
    form.addEventListener('invalid',()=>{$('cepiQuestionSaveStatus').textContent='Confira os campos obrigatórios antes de salvar.';},true);
    form.onsubmit = async event => {
      event.preventDefault();
      if(!ensureContext()){$('cepiQuestionSaveStatus').textContent='A escola ativa mudou. Abra Meu CEPI novamente.';return;}
      if(applySubjectCapacity())return;
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
        if (questions.filter(item=>item.test_id===test.id).length===test.question_count) {
          await load();
          renderQuestions(test.id);
          message('Questões completas. Impressão e correção liberadas automaticamente.');
        } else {
          message('Questão salva.');
          questionForm(test,null,editable.subject);
        }
      } catch(error) {
        const text=error?.message || 'Não foi possível salvar a questão.';
        saveStatus.textContent=text;
        message(text);
        submit.disabled=false;
      }
    };
  }
  function renderRanking() {
    const latest=activeTests().find(t=>t.kind==='bloco'&&['ready','applied'].includes(t.status))||activeTests().find(t=>t.kind==='bloco');
    const years=[...new Set([year,...activeTests().filter(t=>t.kind==='bloco').map(t=>t.academic_year)])].sort((a,b)=>b-a);
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiRankingFilters" class="cepi-workspace-form"><div class="cepi-workspace-grid"><label>Ano letivo<select name="academic_year">${years.map(value=>`<option value="${value}" ${value===(latest?.academic_year||year)?'selected':''}>${value}</option>`).join('')}</select></label><label>Bimestre<select name="bimester">${[1,2,3,4].map(value=>`<option value="${value}" ${value===(latest?.bimester||1)?'selected':''}>${value}º bimestre</option>`).join('')}</select></label><label>Etapa<select name="stage"><option value="fundamental_ii" ${latest?.stage!=='medio'?'selected':''}>Fundamental II</option><option value="medio" ${latest?.stage==='medio'?'selected':''}>Ensino Médio</option></select></label><label>Turma<select name="class_id"><option value="">Todas as turmas</option>${classes.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label>Bloco<select name="block_number"><option value="">Todos os blocos</option>${[1,2,3,4,5,6].map(value=>`<option value="${value}">Bloco ${value}</option>`).join('')}</select></label></div><div class="actions"><button class="btn primary" type="submit">Gerar ranking</button></div></form><p class="cepi-workspace-hint">Percentual total = acertos ÷ questões corrigidas. “Sem resultado” não vira zero; estudantes com provas pendentes aparecem sem colocação até completar as correções do filtro.</p><div id="cepiRankingResult"></div>`;
    $('cepiRankingFilters').onsubmit=event=>{event.preventDefault();generateRanking();};
    generateRanking();
  }
  async function generateRanking() {
    if(!ensureContext())return;
    const form=$('cepiRankingFilters');if(!form)return;
    const filters=Object.fromEntries(new FormData(form));
    const target=$('cepiRankingResult');target.textContent='Calculando…';
    const relevant=activeTests().filter(t=>t.kind==='bloco'&&['ready','applied'].includes(t.status)&&t.academic_year===Number(filters.academic_year)&&t.bimester===Number(filters.bimester)&&t.stage===filters.stage&&(!filters.block_number||t.block_number===Number(filters.block_number))&&(!filters.class_id||t.class_ids?.includes(filters.class_id)));
    if(!relevant.length){target.innerHTML='<div class="cepi-empty">Ainda não há Provas de Bloco com questões completas neste filtro.</div>';return;}
    const ids=relevant.map(t=>t.id),collected=[];
    for(let offset=0;;offset+=1000){const response=await db.from('cepi_test_results').select('*').eq('school_id',schoolId).in('test_id',ids).order('id').range(offset,offset+999);if(response.error)return fail(response.error);collected.push(...(response.data||[]));if((response.data||[]).length<1000)break;if(!ensureContext())return;}
    if(!ensureContext())return;
    results=collected;
    const ranking=window.CepiBlocks.ranking({tests:activeTests(),questions,results,students,academicYear:filters.academic_year,bimester:filters.bimester,stage:filters.stage,classId:filters.class_id||null,blockNumber:filters.block_number||null});
    const format=value=>value===null?'—':`${value.toFixed(1).replace('.',',')}%`;
    const totalLabel=row=>row.covered===0?'Sem resultado':`${format(row.percent)}${row.complete?'':' (pendente)'}`;
    const table=`<table class="cepi-ranking-table"><thead><tr><th>Posição</th><th>Aluno</th><th>Turma</th><th>Provas</th>${ranking.subjects.map(subject=>`<th>${esc(subject)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ranking.rows.map(row=>`<tr><td>${row.rank||'—'}</td><td>${esc(row.student.full_name)}</td><td>${esc(labelClass(row.student.class_id))}</td><td>${row.covered}/${row.expected}</td>${ranking.subjects.map(subject=>`<td>${format(row.bySubject[subject]?.total?row.bySubject[subject].correct/row.bySubject[subject].total*100:null)}</td>`).join('')}<td><strong>${esc(totalLabel(row))}</strong></td></tr>`).join('')}</tbody></table>`;
    target.innerHTML=`<div class="cepi-workspace-actions"><button class="btn secondary" type="button" id="cepiRankingCsv">Exportar CSV</button><button class="btn secondary" type="button" id="cepiRankingPrint">Imprimir / PDF</button></div><p class="meta">${ranking.tests.length} prova(s) com questões completas · ${ranking.rows.length} aluno(s) ativo(s)</p><div class="cepi-ranking-scroll">${table}</div>`;
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
    if(!canAddQuestion(test))return;
    const allowedSubjects=new Set((test.subject_plan||[]).map(item=>item.subject));
    const available=questionBank.filter(q=>q.active&&q.stage===test.stage&&q.answer_format===test.answer_format&&(!allowedSubjects.size||allowedSubjects.has(q.subject))&&(test.kind!=='bloco'||!window.CepiBlocks.subjectCapacity(test,questions,q.subject)?.full));
    const occupied=new Set(questions.filter(q=>q.test_id===test.id).map(q=>q.number));
    const next=Array.from({length:test.question_count},(_,i)=>i+1).find(n=>!occupied.has(n));
    if(!next){message('A prova já tem todas as questões previstas.');return;}
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiImportForm" class="cepi-workspace-form"><h4>Usar questão do banco · ${esc(test.title)}</h4><p>A prova recebe uma cópia. Alterações posteriores no banco não modificam uma prova já montada.</p><label>Questão<select name="question_id" required><option value="">Selecione</option>${available.map(q=>`<option value="${esc(q.id)}">${esc(q.subject)} · ${esc(rich().plain(q.statement).slice(0,130))}</option>`).join('')}</select></label><label>Número na prova<input name="number" type="number" min="1" max="${test.question_count}" value="${next}" required></label><div class="actions"><button type="button" class="btn secondary" id="cepiImportCancel">Cancelar</button><button class="btn primary">Adicionar à prova</button></div></form>`;
    $('cepiImportCancel').onclick=()=>renderQuestions(test.id);
    $('cepiImportForm').onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const data=new FormData(event.currentTarget),q=available.find(item=>item.id===data.get('question_id'));if(!q){message('Selecione uma questão.');return;}if(test.kind==='bloco'&&window.CepiBlocks.subjectCapacity(test,questions,q.subject)?.full){message(`A quantidade de questões de ${q.subject} já foi atingida.`);return;}const result=await db.from('cepi_test_questions').insert({school_id:schoolId,test_id:test.id,number:Number(data.get('number')),subject:q.subject,statement:q.statement,alternatives:q.alternatives,correct_answer:q.correct_answer,bank_question_id:q.id,created_by:userId});if(result.error)return fail(result.error);await load().then(()=>renderQuestions(test.id)).catch(fail);};
  }
  function answerSheetForm(id) {
    if (!manager() || !ensureContext()) return;
    const test = tests.find(item=>item.id===id);
    if (!test || test.status==='draft') return;
    try { window.CepiAnswerSheets.prepare(test,questions); }
    catch(error) { message(error.message); return; }
    const count=students.filter(student=>student.enrollment_status==='active' && test.class_ids?.includes(student.class_id)).length;
    $('cepiWorkspaceContent').innerHTML=`<form class="cepi-workspace-form" id="cepiCardForm"><h4>Imprimir cartões-resposta · ${esc(test.title)}</h4><p class="cepi-workspace-hint">Cada folha A4 terá até quatro cartões para recortar. O aluno preencherá o nome e as respostas; nenhuma alternativa correta aparece nos cartões.</p><p>${count} aluno(s) ativo(s) nas turmas desta prova.</p><label>Quantidade de cartões<input type="number" name="quantity" min="1" max="600" required value="${Math.max(1,count)}"></label><div class="actions"><button type="button" class="btn secondary" id="cepiCardCancel">Voltar</button><button type="submit" class="btn primary">Gerar para impressão</button></div></form>`;
    $('cepiCardCancel').onclick=renderTests;
    $('cepiCardForm').onsubmit=event=>{event.preventDefault();const quantity=Number(event.currentTarget.elements.quantity.value);if(!Number.isInteger(quantity)||quantity<1||quantity>600){message('Informe entre 1 e 600 cartões.');return;}printAnswerSheet(id,false,quantity);};
  }
  async function lockQuestionEditingForPrint(test,popup) {
    if(test.status!=='ready'||test.print_opened_at)return true;
    try {
      const result=await db.from('cepi_tests').update({print_opened_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',test.id).is('print_opened_at',null).is('deleted_at',null).select('print_opened_at').maybeSingle();
      if(result.error)throw result.error;
      if(result.data){test.print_opened_at=result.data.print_opened_at;return true;}
      const current=await db.from('cepi_tests').select('print_opened_at,deleted_at').eq('school_id',schoolId).eq('id',test.id).maybeSingle();
      if(current.error)throw current.error;
      if(!current.data?.print_opened_at||current.data.deleted_at)throw new Error('Não foi possível abrir a impressão desta prova. Atualize a lista.');
      test.print_opened_at=current.data.print_opened_at;
      return true;
    } catch(error) {popup.close();fail(error);return false;}
  }
  async function printAnswerSheet(id, official, quantity = 4) {
    if (!manager() || !ensureContext()) return;
    const test = tests.find(item => item.id === id);
    if (!test || test.deleted_at || test.status==='draft') return;
    const popup = window.open('','_blank');
    if (!popup) { message('Permita a janela de impressão para esta ação.'); return; }
    if(!await lockQuestionEditingForPrint(test,popup))return;
    let printQuestions=questions;
    if(test.status==='ready'){
      try {
        const current=await db.from('cepi_test_questions').select('*').eq('school_id',schoolId).eq('test_id',id).order('number');
        if(current.error)throw current.error;
        printQuestions=current.data||[];
      } catch(error) {popup.close();fail(error);return;}
    }
    let prepared;
    try { prepared = window.CepiAnswerSheets.prepare(test,printQuestions); }
    catch(error) { popup.close();message(error.message); return; }
    const html = official ? window.CepiAnswerSheets.officialHtml(prepared,examHeader?.school_name) : window.CepiAnswerSheets.studentHtml(prepared,examHeader?.school_name,quantity);
    popup.document.write(html); popup.document.close(); popup.focus();
  }
  async function printTest(id) {
    if (!manager() || !ensureContext()) return;
    const test = tests.find(item=>item.id===id); if (!test || test.deleted_at || test.status==='draft') return;
    if(questions.filter(q=>q.test_id===id).length!==test.question_count){message('Complete a quantidade prevista de questões antes de imprimir.');return;}
    if (!examHeader?.school_name || !examHeader?.state_name) {
      message('Configure o cabeçalho da escola uma vez. Depois, volte à prova e clique em imprimir.');
      headerForm(true);
      return;
    }
    const popup = window.open('','_blank'); if (!popup) { message('Permita a janela de impressão para esta ação.'); return; }
    if(!await lockQuestionEditingForPrint(test,popup))return;
    let rows=questions.filter(q=>q.test_id===id).sort((a,b)=>a.number-b.number);
    if(test.status==='ready'){
      try {
        const current=await db.from('cepi_test_questions').select('*').eq('school_id',schoolId).eq('test_id',id).order('number');
        if(current.error)throw current.error;
        rows=current.data||[];
      } catch(error) {popup.close();fail(error);return;}
    }
    if (rows.length !== test.question_count) {popup.close();message('Complete a quantidade prevista de questões antes de imprimir.'); return; }
    const logo = (value,klass,label) => value ? `<img src="${esc(value)}" alt="${label}" class="logo ${klass}">` : `<div class="logo ${klass}" aria-hidden="true"></div>`;
    const stateMark = examHeader.state_logo_data ? logo(examHeader.state_logo_data,'logo-state','Logo do estado') : `<div class="state-fallback"><strong>${esc(examHeader.state_name)}</strong><span>${esc(examHeader.department_name)}</span></div>`;
    const multipleSubjects = new Set(rows.map(q=>q.subject)).size > 1;
    const applicationDate = window.CepiAnswerSheets.formatApplicationDate(test.scheduled_on);
    const headerExtra = schoolHeaderExtra(examHeader);
    const examInstructions = window.CepiBlocks.instructions(test, rows, instructionTail(examHeader));
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(test.title)}</title><style>body{font:12pt Arial;margin:18mm;color:#111}.print-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-8mm 0 12mm;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f5f7ff;font:14px Arial}.print-actions button{padding:9px 15px;border:0;border-radius:7px;background:#5149dc;color:#fff;font-weight:700;cursor:pointer}.brand-row{display:grid;grid-template-columns:1fr 1fr;align-items:start;min-height:26mm}.logo{display:block;object-fit:contain}.logo-school{width:26mm;height:26mm;justify-self:start}.logo-state{width:55mm;height:26mm;justify-self:end}.state-fallback{display:grid;gap:3px;align-self:center;justify-self:end;text-align:right;font-size:10pt}.school-name{text-align:center;margin:5mm 0 4mm;font-size:12pt}h1{font-size:12pt;font-weight:400;text-align:center;margin:0 0 3mm}.meta{display:grid;grid-template-columns:minmax(0,2.5fr) minmax(0,1fr);gap:8px;margin:22px 0;border-bottom:1px solid #333;padding-bottom:10px}.meta.has-date{grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto}.meta-field.date-fixed::after{display:none}.meta-field{display:flex;gap:4px;white-space:nowrap}.meta-field::after{content:"";border-bottom:1px solid #111;flex:1;min-width:12px;margin-bottom:2px}.exam-instructions{margin:12px 0 20px;line-height:1.4}.question{margin:22px 0}.question-subject{font-weight:700;margin:20px 0 8px;break-after:avoid}.question .cepi-rich-plain{white-space:pre-wrap}.question .cepi-rich-content img{max-width:100%;max-height:150mm;display:block;margin:8px auto}.question table{border-collapse:collapse}.question td,.question th{border:1px solid #555;padding:5px}.answer{margin:8px 0}@page{margin:18mm}@media print{body{margin:0}.print-actions{display:none}}</style><div class="print-actions"><strong>Prévia da prova do aluno</strong><button id="cepiPrintNow" type="button">Imprimir / salvar PDF</button></div><header class="brand-row">${logo(examHeader.school_logo_data,'logo-school','Logo da escola')}${stateMark}</header><div class="school-name">${esc(examHeader.school_name)}${headerExtra?`<div>${esc(headerExtra)}</div>`:''}</div><h1>${esc(test.title)}</h1><div class="meta${applicationDate?' has-date':''}"><span class="meta-field">Nome:</span><span class="meta-field">Turma:</span>${applicationDate?`<span class="meta-field date-fixed">Data: ${esc(applicationDate)}</span>`:''}</div><p class="exam-instructions">${esc(examInstructions)}</p>${rows.map((q,index)=>`<div class="question">${multipleSubjects && (index===0 || q.subject!==rows[index-1].subject)?`<div class="question-subject">${esc(q.subject)}</div>`:''}<b>${q.number}.</b>${rich().render(q.statement,schoolId)}${Object.entries(q.alternatives||{}).filter(([,v])=>v).map(([letter,value])=>`<div class="answer">${letter}) ${esc(value)}</div>`).join('')}</div>`).join('')}</html>`;
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
    $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-item"><h4>Identidade das provas desta escola</h4><p>Configure somente os dados fixos da escola. Tipo, bloco, etapa, bimestre e composição da prova são preenchidos automaticamente a partir do cadastro.</p><div class="cepi-workspace-grid"><div>${h.state_logo_data?`<img src="${esc(h.state_logo_data)}" alt="Logo do estado" style="max-width:100px;max-height:100px">`:'Sem logo do estado'}</div><div>${h.school_logo_data?`<img src="${esc(h.school_logo_data)}" alt="Logo da escola" style="max-width:100px;max-height:100px">`:'Sem logo da escola'}</div></div><p>${esc(h.state_name||'Estado não configurado')} · ${esc(h.department_name||'')}</p><p><strong>${esc(h.school_name||'Escola não configurada')}</strong></p><p>${esc(schoolHeaderExtra(h)||'Nenhum complemento fixo da escola.')}</p><p>${esc(instructionTail(h))}</p>${manager()?actionButton('Editar cabeçalho','edit-header','header'):''}</div>`;
    bindActions({'edit-header':()=>headerForm()});
  }
  function headerForm(returnToTests=false) {
    if(!manager()||!ensureContext())return;
    const h=examHeader||{};
    const headerExtra=schoolHeaderExtra(h);
    $('cepiWorkspaceContent').innerHTML=`<form id="cepiHeaderForm" class="cepi-workspace-form"><h4>Cabeçalho da escola</h4><p class="cepi-workspace-hint">Os dados da escola são comuns a todas as provas. Tipo, bloco, etapa, total e disciplinas vêm automaticamente de cada prova. Use imagens PNG, JPG ou WebP de até 300 KB.</p><label>Estado<input name="state_name" maxlength="160" required value="${esc(h.state_name||'')}"></label><label>Secretaria de Educação ou órgão<input name="department_name" maxlength="160" value="${esc(h.department_name||'')}"></label><label>Nome da escola<input name="school_name" maxlength="160" required value="${esc(h.school_name||'')}"></label><label>Complemento fixo da escola (opcional)<input name="subtitle" maxlength="240" value="${esc(headerExtra)}"><small>Não informe aqui disciplinas nem quantidade de questões.</small></label><label>Frase escolhida para as provas<textarea id="cepiHeaderInstructions" name="instructions" maxlength="500">${esc(instructionTail(h))}</textarea><small>Esta frase aparece após a composição automática da prova.</small></label><div class="cepi-workspace-grid"><label>Logo do estado<input name="state_logo" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Logo da escola<input name="school_logo" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div class="actions"><button type="button" id="cepiHeaderCancel" class="btn secondary">Cancelar</button><button class="btn primary" type="submit">Salvar cabeçalho</button></div></form>`;
    $('cepiHeaderCancel').onclick=()=>returnToTests?renderTests():renderHeader();
    $('cepiHeaderForm').onsubmit=async event=>{event.preventDefault();if(!ensureContext())return;const form=event.currentTarget,data=new FormData(form);const readLogo=async(name,existing)=>{const file=form.elements[name].files?.[0];if(!file)return existing||null;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>300000)throw new Error('Use uma imagem PNG, JPG ou WebP de até 300 KB.');return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});};try{const payload={school_id:schoolId,state_name:String(data.get('state_name')).trim(),department_name:String(data.get('department_name')).trim(),school_name:String(data.get('school_name')).trim(),subtitle:String(data.get('subtitle')).trim(),instructions:String(data.get('instructions') ?? '').trim(),state_logo_data:await readLogo('state_logo',h.state_logo_data),school_logo_data:await readLogo('school_logo',h.school_logo_data),updated_by:userId};const result=await db.from('cepi_exam_headers').upsert(payload,{onConflict:'school_id'});if(result.error)return fail(result.error);await load().then(()=>{returnToTests?renderTests():renderHeader();if(returnToTests)message('Cabeçalho salvo. Agora clique em Imprimir prova do aluno.');}).catch(fail);}catch(error){fail(error);}};
  }

  async function loadClubTeachers() {
    if(groupTeachersLoaded)return;
    const requestedSchool=schoolId;
    const {data,error}=await db.rpc('list_cepi_tutor_candidates',{p_school_id:requestedSchool});
    if(error)throw error;
    if(!ensureContext()||schoolId!==requestedSchool)throw new Error('A escola ativa mudou. Abra Meu CEPI novamente.');
    groupTeachers=data||[];
    groupTeachersLoaded=true;
  }

  function renderGroups() {
    if(['clube','eletiva'].includes(section)&&manager()&&!groupTeachersLoaded){$('cepiWorkspaceContent').textContent='Carregando professores…';loadClubTeachers().then(renderGroups).catch(fail);return;}
    const subset = groups.filter(item=>item.kind===section);
    $('cepiWorkspaceContent').innerHTML = `<div class="cepi-workspace-list">${subset.map(group=>{ const classNames=groupClasses.filter(item=>item.group_id===group.id).map(item=>labelClass(item.class_id)); const count=groupStudents.filter(item=>item.group_id===group.id).length; const teacher=groupTeachers.find(item=>item.user_id===group.responsible_user_id); return `<article class="cepi-workspace-item"><h4>${esc(group.title)}</h4><p>${group.academic_year}${group.semester?` · ${group.semester}º semestre`:''} · ${group.active?'Ativo':'Encerrado'} · ${count}${group.seats?`/${group.seats}`:''} participantes${classNames.length?` · ${esc(classNames.join(', '))}`:''}</p>${['clube','eletiva'].includes(section)&&manager()?`<p>Professor responsável: <strong>${esc(teacher?.full_name||(group.responsible_user_id?'Usuário indisponível':'Não definido'))}</strong></p>`:''}<div class="cepi-workspace-actions">${actionButton('Ver participantes','members',group.id)}${manager()?actionButton('Editar','edit-group',group.id):''}</div></article>`;}).join('') || `<div class="cepi-empty">Nenhum registro em ${esc(groupLabel(section))}.</div>`}</div>`;
    bindActions({'members':id=>renderMembers(id),'edit-group':id=>groupForm(groups.find(g=>g.id===id))});
  }
  async function renderUsefulLists() {
    if (!manager() || !ensureContext()) { message('Somente coordenação e administração podem imprimir estas listas.'); return; }
    $('cepiWorkspaceContent').textContent='Carregando alocações da turma…';
    const requestedSchool=schoolId;
    try {
      const [tutorResult,assignmentResult]=await Promise.all([
        fetchAll(()=>db.from('cepi_tutors').select('id,school_id,display_name').eq('school_id',requestedSchool).order('id')),
        fetchAll(()=>db.from('cepi_tutor_students').select('school_id,student_id,tutor_id,active').eq('school_id',requestedSchool).eq('active',true).order('id')),
        loadClubTeachers()
      ]);
      if (tutorResult.error || assignmentResult.error) throw tutorResult.error || assignmentResult.error;
      if (!ensureContext() || schoolId!==requestedSchool || section!=='listas') return;
      const schoolClasses=classes.filter(item=>!item.archived_at);
      const years=[...new Set([year,...groups.filter(item=>item.active).map(item=>Number(item.academic_year)).filter(Number.isInteger)])].sort((a,b)=>b-a);
      const defaultYear=years.includes(year)?year:years[0];
      const defaultSemester=new Date().getMonth()<6?1:2;
      $('cepiWorkspaceContent').innerHTML=`<div class="cepi-workspace-form"><div class="cepi-useful-head"><h4>Alocação dos alunos</h4><p>Escolha a turma para conferir Eletiva, Clube, seus responsáveis e o tutor de cada aluno. A lista impressa mostra a turma apenas no cabeçalho.</p></div><div class="cepi-workspace-grid"><label>Turma<select id="cepiUsefulClass"><option value="">Selecione a turma</option>${schoolClasses.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label>Ano letivo<select id="cepiUsefulYear">${years.map(item=>`<option value="${item}" ${item===defaultYear?'selected':''}>${item}</option>`).join('')}</select></label><label>Semestre<select id="cepiUsefulSemester"><option value="1" ${defaultSemester===1?'selected':''}>1º semestre</option><option value="2" ${defaultSemester===2?'selected':''}>2º semestre</option></select></label></div><div class="cepi-useful-actions"><strong id="cepiUsefulCount">Selecione uma turma.</strong><button type="button" class="btn primary" id="cepiUsefulPrint" disabled>Imprimir lista da turma</button></div><div id="cepiUsefulPreview" class="cepi-useful-list-preview" hidden></div></div>`;
      const classField=$('cepiUsefulClass'),yearField=$('cepiUsefulYear'),semesterField=$('cepiUsefulSemester'),preview=$('cepiUsefulPreview'),printButton=$('cepiUsefulPrint');
      let currentRows=[];
      const refresh=()=>{
        const classId=classField.value;
        if(!classId){currentRows=[];preview.hidden=true;preview.innerHTML='';$('cepiUsefulCount').textContent='Selecione uma turma.';printButton.disabled=true;return;}
        currentRows=window.CepiUsefulLists.prepare({schoolId, classId,year:Number(yearField.value),semester:Number(semesterField.value),students,groups,groupStudents,groupTeachers,tutors:tutorResult.data,tutorAssignments:assignmentResult.data});
        $('cepiUsefulCount').textContent=`${currentRows.length} aluno(s) ativo(s) na turma ${labelClass(classId)}.`;
        preview.innerHTML=currentRows.length?window.CepiUsefulLists.table(currentRows):'<p class="cepi-workspace-hint">Nenhum aluno ativo nesta turma.</p>';
        preview.hidden=false;printButton.disabled=!currentRows.length;
      };
      [classField,yearField,semesterField].forEach(field=>field.onchange=refresh);
      printButton.onclick=()=>{
        if(!manager()||!ensureContext()||!currentRows.length)return;
        const html=window.CepiUsefulLists.printHtml({rows:currentRows,schoolName:examHeader?.school_name,className:labelClass(classField.value),year:Number(yearField.value),semester:Number(semesterField.value)});
        const popup=window.open('','_blank');
        if(!popup){message('Permita a janela de impressão para gerar a lista.');return;}
        popup.document.write(html);popup.document.close();popup.focus();
      };
    } catch(error) { fail(error); }
  }
  function groupForm(group=null) {
    if (!manager()) return;
    if (['clube','eletiva'].includes(section)) return clubForm(group);
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

  async function clubForm(group=null) {
    if(!manager()||!ensureContext())return;
    $('cepiWorkspaceContent').textContent='Carregando professores e alunos…';
    try{await loadClubTeachers();}catch(error){fail(error);return;}
    if(!['clube','eletiva'].includes(section)||!ensureContext())return;
    const isClub=section==='clube',groupKind=section,groupNoun=isClub?'clube':'eletiva';
    const leaderFields=isClub?'<div class="cepi-workspace-grid"><label>Líder<select name="leader_student_id"><option value="">Selecione</option></select></label><label>Co-líder<select name="coleader_student_id"><option value="">Selecione</option></select></label></div>':'';
    const value=group||{academic_year:year,subjects:[],active:true};
    const disciplineCatalog=['Arte','Biologia','Ciências','Educação Física','Espanhol','Filosofia','Física','Geografia','História','Inglês','Língua Portuguesa','Matemática','Química','Sociologia'];
    const savedDisciplines=(value.subjects||[]).map(item=>String(item).trim()).filter(Boolean);
    const disciplineOptions=[...disciplineCatalog,...savedDisciplines.filter(item=>!disciplineCatalog.includes(item))];
    const disciplineChoices=disciplineOptions.map(item=>`<label><input type="checkbox" name="subjects" value="${esc(item)}" ${savedDisciplines.includes(item)?'checked':''}><span>${esc(item)}</span></label>`).join('');
    const selectedClasses=groupClasses.filter(item=>item.group_id===group?.id).map(item=>item.class_id);
    const existingMembers=groupStudents.filter(item=>item.group_id===group?.id).map(item=>item.student_id);
    const availableStudents=students.filter(item=>item.enrollment_status==='active'&&classes.some(cls=>cls.id===item.class_id&&!cls.archived_at))
      .sort((a,b)=>a.full_name.localeCompare(b.full_name,'pt-BR'));
    const teacherOptions=groupTeachers.map(item=>`<option value="${esc(item.user_id)}" ${item.user_id===value.responsible_user_id?'selected':''}>${esc(item.full_name)}</option>`).join('');
    const studentOptions=availableStudents.map(item=>`<label class="cepi-group-student" data-class="${esc(item.class_id)}" hidden><input type="checkbox" name="students" value="${esc(item.id)}" ${existingMembers.includes(item.id)?'checked disabled':''}><span class="cepi-group-avatar">${esc((item.full_name.match(/\p{L}/u)?.[0]||'?').toLocaleUpperCase('pt-BR'))}${item.photo_path?`<img data-photo-path="${esc(item.photo_path)}" alt="" hidden>`:''}</span><span>${esc(item.full_name)}<small>${esc(labelClass(item.class_id))}${existingMembers.includes(item.id)?' · Já participa':''}</small></span></label>`).join('');
    $('cepiWorkspaceContent').innerHTML=`<form class="cepi-workspace-form" id="cepiGroupForm"><div class="cepi-group-heading"><h4>${group?'Editar':'Cadastrar'} ${groupNoun}</h4><p>Escolha o responsável entre os usuários ativos desta escola, selecione as turmas e marque os estudantes participantes.</p></div><label>Título ${isClub?'do clube':'da eletiva'}<input name="title" maxlength="200" required value="${esc(value.title||'')}"></label><div class="cepi-workspace-grid"><label>Professor responsável<select name="responsible_user_id" required><option value="">Selecione um responsável</option>${teacherOptions}</select></label><label>Ano letivo<input name="academic_year" type="number" min="2000" max="2100" value="${value.academic_year}" required></label><label>Semestre<select name="semester"><option value="">Não informado</option><option value="1" ${value.semester===1?'selected':''}>1º</option><option value="2" ${value.semester===2?'selected':''}>2º</option></select></label><label>Vagas<input name="seats" type="number" min="1" max="999" value="${value.seats||''}"></label></div><fieldset><legend>Turmas do público alvo</legend><p>Clique nas turmas desejadas. Você pode marcar várias.</p><div class="cepi-group-options">${classes.filter(item=>!item.archived_at).map(item=>`<label><input type="checkbox" name="classes" value="${esc(item.id)}" ${selectedClasses.includes(item.id)?'checked':''}><span>${esc(item.name)}</span></label>`).join('')}</div><small id="cepiGroupClassCount" class="cepi-group-count"></small></fieldset><fieldset><legend>Estudantes ${isClub?'do clube':'da eletiva'}</legend><p>Escolha as turmas acima para ver os alunos cadastrados. A foto aparece quando o estudante a possui no Carômetro.</p><input id="cepiGroupStudentSearch" type="search" placeholder="Buscar estudante pelo nome" aria-label="Buscar estudante pelo nome"><div class="cepi-group-students" id="cepiGroupStudents">${studentOptions}</div><small id="cepiGroupStudentCount" class="cepi-group-count"></small></fieldset>${leaderFields}<fieldset class="cepi-club-disciplines"><legend>Disciplinas</legend><p>Selecione uma ou mais disciplinas base ${isClub?'do clube':'da eletiva'}.</p><input id="cepiDisciplineSearch" type="search" placeholder="Buscar disciplina" aria-label="Buscar disciplina"><div class="cepi-discipline-toolbar"><button id="cepiDisciplineSelectAll" type="button">Selecionar todas</button><button id="cepiDisciplineClear" type="button">Desmarcar todas</button></div><div class="cepi-group-options" id="cepiDisciplineOptions">${disciplineChoices}</div><small id="cepiDisciplineCount" class="cepi-group-count"></small></fieldset><label>Proposta<textarea name="proposal">${esc(value.proposal||'')}</textarea></label><label>Práticas<textarea name="practices">${esc(value.practices||'')}</textarea></label><label>Culminância<textarea name="culmination">${esc(value.culmination||'')}</textarea></label><label><input name="active" type="checkbox" ${value.active?'checked':''}> Ativo</label><div class="actions"><button class="btn secondary" id="cepiCancelForm" type="button">Cancelar</button><button class="btn primary" type="submit">Salvar ${groupNoun}</button></div></form>`;
    const form=$('cepiGroupForm'),classChecks=[...form.querySelectorAll('input[name=classes]')],studentChecks=[...form.querySelectorAll('input[name=students]')];
    const disciplineChecks=[...form.querySelectorAll('input[name=subjects]')];
    const updateDisciplineCount=()=>{$('cepiDisciplineCount').textContent=`${disciplineChecks.filter(input=>input.checked).length} disciplina(s) selecionada(s)`;};
    $('cepiDisciplineSearch').oninput=event=>{const query=event.target.value.trim().toLocaleLowerCase('pt-BR');disciplineChecks.forEach(input=>{input.closest('label').hidden=!!query&&!input.value.toLocaleLowerCase('pt-BR').includes(query);});};
    $('cepiDisciplineSelectAll').onclick=()=>{disciplineChecks.forEach(input=>{input.checked=true;});updateDisciplineCount();};
    $('cepiDisciplineClear').onclick=()=>{disciplineChecks.forEach(input=>{input.checked=false;});updateDisciplineCount();};
    disciplineChecks.forEach(input=>input.onchange=updateDisciplineCount);
    updateDisciplineCount();
    const selectedClassIds=()=>classChecks.filter(input=>input.checked).map(input=>input.value);
    const photoCache=new Map();
    async function showPhotos(){
      const pending=[...form.querySelectorAll('.cepi-group-student:not([hidden]) img[data-photo-path]')].filter(img=>!img.src&&!photoCache.has(img.dataset.photoPath));
      const paths=[...new Set(pending.map(img=>img.dataset.photoPath))];
      for(let index=0;index<paths.length;index+=100){
        const {data}=await db.storage.from('student-photos').createSignedUrls(paths.slice(index,index+100),3600);
        (data||[]).forEach(item=>{if(item?.signedUrl)photoCache.set(item.path,item.signedUrl);});
      }
      if(!form.isConnected||!ensureContext())return;
      form.querySelectorAll('img[data-photo-path]').forEach(img=>{const url=photoCache.get(img.dataset.photoPath);if(url&&!img.src){img.src=url;img.hidden=false;img.onerror=()=>{img.hidden=true;};}});
    }
    const refresh=()=>{
      const selected=selectedClassIds(),query=$('cepiGroupStudentSearch').value.trim().toLocaleLowerCase('pt-BR');
      let visible=0;
      studentChecks.forEach(input=>{
        const card=input.closest('.cepi-group-student'),student=availableStudents.find(item=>item.id===input.value);
        const inClass=selected.includes(student.class_id);
        if(!inClass&&!input.disabled)input.checked=false;
        card.hidden=!inClass||!!query&&!student.full_name.toLocaleLowerCase('pt-BR').includes(query);
        if(!card.hidden)visible++;
      });
      $('cepiGroupClassCount').textContent=`${selected.length} turma(s) selecionada(s)`;
      $('cepiGroupStudentCount').textContent=`${studentChecks.filter(input=>input.checked).length} participante(s) marcado(s) · ${visible} aluno(s) exibido(s)`;
      for(const name of (isClub?['leader_student_id','coleader_student_id']:[])){
        const field=form.elements[name],previous=field.value||value[name]||'';
        field.innerHTML='<option value="">Selecione</option>'+availableStudents.filter(item=>selected.includes(item.class_id)).map(item=>`<option value="${esc(item.id)}">${esc(item.full_name)} · ${esc(labelClass(item.class_id))}</option>`).join('');
        field.value=previous;
      }
      void showPhotos();
    };
    classChecks.forEach(input=>input.onchange=refresh);
    studentChecks.forEach(input=>input.onchange=refresh);
    $('cepiGroupStudentSearch').oninput=refresh;
    for(const name of (isClub?['leader_student_id','coleader_student_id']:[]))form.elements[name].onchange=event=>{
      const studentCheck=studentChecks.find(input=>input.value===event.target.value);
      if(studentCheck&&!studentCheck.checked){studentCheck.checked=true;refresh();}
    };
    $('cepiCancelForm').onclick=render;
    refresh();
    form.onsubmit=async event=>{
      event.preventDefault();if(!ensureContext()||!manager())return;
      const data=new FormData(form),targetClasses=selectedClassIds();
      if(!targetClasses.length){message('Selecione ao menos uma turma.');return;}
      if(group&&selectedClasses.some(id=>!targetClasses.includes(id))){message('Para preservar o histórico, encerre os vínculos antes de retirar uma turma do público alvo.');return;}
      const responsibleUserId=String(data.get('responsible_user_id')||'');
      if(!groupTeachers.some(item=>item.user_id===responsibleUserId)){message('Selecione um usuário ativo desta escola.');return;}
      const leaderId=String(data.get('leader_student_id')||''),coleaderId=String(data.get('coleader_student_id')||'');
      if(leaderId&&leaderId===coleaderId){message('Líder e co-líder precisam ser estudantes diferentes.');return;}
      const targetStudents=studentChecks.filter(input=>input.checked).map(input=>input.value);
      if(Number(data.get('seats'))>0&&targetStudents.length>Number(data.get('seats'))){message('O número de participantes excede as vagas.');return;}
      const payload={school_id:schoolId,kind:groupKind,title:String(data.get('title')).trim(),academic_year:Number(data.get('academic_year')),semester:data.get('semester')?Number(data.get('semester')):null,seats:data.get('seats')?Number(data.get('seats')):null,profile:group?.profile||null,responsible_user_id:responsibleUserId,proposal:data.get('proposal')||null,practices:data.get('practices')||null,culmination:data.get('culmination')||null,subjects:data.getAll('subjects').map(item=>String(item)),active:data.has('active')};
      if(isClub){payload.leader_student_id=leaderId||null;payload.coleader_student_id=coleaderId||null;}
      const save=group?await db.from('cepi_groups').update(payload).eq('school_id',schoolId).eq('id',group.id).select('id').single():await db.from('cepi_groups').insert({...payload,created_by:userId}).select('id').single();
      if(save.error)return fail(save.error);
      const missingClasses=targetClasses.filter(id=>!selectedClasses.includes(id));
      if(missingClasses.length){const links=await db.from('cepi_group_classes').insert(missingClasses.map(class_id=>({school_id:schoolId,group_id:save.data.id,class_id})));if(links.error){message('Agrupamento salvo, mas não foi possível vincular as turmas: '+links.error.message);return;}}
      const newStudents=targetStudents.filter(id=>!existingMembers.includes(id));
      if(newStudents.length){const links=await db.from('cepi_group_students').insert(newStudents.map(student_id=>({school_id:schoolId,group_id:save.data.id,student_id})));if(links.error){message('Agrupamento salvo, mas não foi possível vincular todos os alunos: '+links.error.message);return;}}
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
