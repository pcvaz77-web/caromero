document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const normalizeName = value => String(value || '').replace(/^\s*\d+\s*[.\-)–—:]\s*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeClass = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const escapeHtml = value => { const node=document.createElement('span'); node.textContent=String(value || ''); return node.innerHTML; };
  const STATUS = {
    frequent:{ label:'Frequente', className:'attendance-frequent' },
    absent:{ label:'Faltoso', className:'attendance-absent' },
    active_search:{ label:'Necessita de Busca Ativa', className:'attendance-active-search' }
  };
  const classify = percentage => percentage >= 75 ? 'frequent' : percentage >= 60 ? 'absent' : 'active_search';
  const captures = new Map();
  const currentBadges = new Map();
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const SHIFT_END_HOUR = { matutino:12, vespertino:18, noturno:23, integral:18 };
  const selectedMonths = new Set();
  let activeContext = null;
  let saving = false;

  const nav = document.querySelector('.nav');
  const anchor = document.getElementById('reportsNav') || document.getElementById('permissionsNav');
  if (!nav || !anchor) return;
  const button = document.createElement('button');
  button.id = 'assistedAttendanceNav';
  button.type = 'button';
  button.className = 'hidden';
  button.innerHTML = '<span>✓ &nbsp; Frequência Assistida</span>';
  nav.insertBefore(button, anchor);
  const isMobileDevice = () => matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  let lastAllowed = null;
  const syncAccess = () => {
    const allowed=!isMobileDevice()&&(permission?.role==='admin'||permission?.is_coordinator||permission?.can_import_siap_attendance);
    if(allowed===lastAllowed)return;
    lastAllowed=allowed;
    button.classList.toggle('hidden',!allowed);
    button.hidden=!allowed;
    if(isMobileDevice())document.getElementById('assistedAttendanceModal')?.classList.add('hidden');
  };
  syncAccess();
  setInterval(syncAccess,1000);
  addEventListener('resize',syncAccess);

  const modal = document.createElement('div');
  modal.id = 'assistedAttendanceModal';
  modal.className = 'modal-bg assisted-attendance-modal hidden';
  modal.innerHTML = `<section class="modal assisted-attendance-dialog"><div class="modal-head"><div><h3>Frequência Assistida</h3><div class="meta" data-aa-context>Escolha os meses e abra as chamadas verdes no SIAP.</div></div><button class="close" type="button" data-aa-close>×</button></div><div class="assisted-attendance-body"><div class="assisted-attendance-guide"><b>Coleta segura e assistida</b><span>Escolha os meses abaixo. Depois, abra cada chamada verde desses meses no SIAP e clique em capturar. O relatório somente será concluído quando todas forem capturadas.</span></div><fieldset class="aa-months"><legend>Meses do relatório</legend>${MONTHS.map((month,index)=>`<label><input type="checkbox" data-aa-month="${escapeHtml(month)}"><span>${String(index+1).padStart(2,'0')} · ${escapeHtml(month)}</span></label>`).join('')}</fieldset><div class="assisted-attendance-actions"><button class="btn primary" type="button" data-aa-capture>Capturar chamada aberta</button><button class="btn secondary hidden" type="button" data-aa-import>Importar para os cards</button><button class="btn secondary" type="button" data-aa-clear>Limpar coleta</button><a class="btn secondary" href="downloads/carometro-frequencia-leitura-0.6.2.zip" download>Baixar extensão</a></div><div class="aa-install-help">Depois de baixar, descompacte o arquivo e use <b>Carregar sem compactação</b> em <b>chrome://extensions</b>.</div><div class="meta" data-aa-status>Escolha pelo menos um mês para iniciar.</div><div data-aa-summary></div><div data-aa-students></div></div></section>`;
  document.body.appendChild(modal);
  const style = document.createElement('style');
  style.textContent = `.assisted-attendance-modal{z-index:360!important}.assisted-attendance-dialog{width:min(980px,100%);max-height:94vh}.assisted-attendance-body{padding:22px}.assisted-attendance-guide{display:grid;gap:4px;padding:14px 16px;border:1px solid #bfd2f6;border-radius:12px;background:#f4f7ff}.assisted-attendance-guide span{font-size:13px;color:var(--muted)}.aa-months{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0;padding:14px;border:1px solid var(--line);border-radius:12px}.aa-months legend{padding:0 6px;font-weight:800}.aa-months label{display:flex;align-items:center;gap:7px;padding:8px;border-radius:8px;background:#f7f9fc}.aa-months input{width:18px;height:18px}.assisted-attendance-actions{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0 7px}.assisted-attendance-actions a{text-decoration:none}.aa-install-help{margin:0 0 16px;color:var(--muted);font-size:12px}.aa-progress{display:grid;gap:8px;margin:16px 0}.aa-progress>div{display:grid;gap:3px;padding:12px 14px;border:1px solid #f3c27a;border-radius:10px;background:#fff9ed}.aa-progress>div.complete{border-color:#86d7ae;background:#effcf5}.aa-progress span,.aa-progress small{color:var(--muted)}.aa-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.aa-summary div{padding:13px;border:1px solid var(--line);border-radius:11px;background:#fff}.aa-summary b{display:block;font-size:22px}.aa-table{display:grid;gap:7px}.aa-row{display:grid;grid-template-columns:minmax(220px,2fr) 90px minmax(120px,1fr) 210px;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:10px}.aa-bar{height:9px;border-radius:99px;background:#e9edf5;overflow:hidden}.aa-bar i{display:block;height:100%;background:#356ae6}.attendance-badge{display:inline-flex;width:max-content;padding:5px 9px;border-radius:99px;font-size:12px;font-weight:800}.attendance-frequent{background:#d1fae5;color:#047857}.attendance-absent{background:#fef3c7;color:#92400e}.attendance-active-search{background:#fee2e2;color:#b91c1c}.aa-unmatched{color:#b42318;font-size:12px}@media(max-width:700px){.aa-months{grid-template-columns:1fr 1fr}.aa-summary{grid-template-columns:1fr 1fr}.aa-row{grid-template-columns:1fr 70px}.aa-row .aa-bar,.aa-row .attendance-badge{grid-column:1/-1}}`;
  document.head.appendChild(style);

  const by = selector => modal.querySelector(selector);
  const close = () => modal.classList.add('hidden');
  by('[data-aa-close]').onclick = close;
  modal.onclick = event => { if (event.target === modal) close(); };
  button.onclick = () => { if(isMobileDevice())return;modal.classList.remove('hidden'); loadCurrentBadges(); render(); };
  modal.querySelectorAll('[data-aa-month]').forEach(input=>input.addEventListener('change',()=>{input.checked?selectedMonths.add(input.dataset.aaMonth):selectedMonths.delete(input.dataset.aaMonth);render();}));

  function aggregate() {
    const people = new Map();
    captures.forEach(snapshot => snapshot.entries.filter(entry => !entry.blocked).forEach(entry => {
      const key = normalizeName(entry.name);
      const person = people.get(key) || { name:entry.name, presences:0, absences:0, lessons:new Set() };
      if (entry.absent) person.absences += 1; else person.presences += 1;
      person.lessons.add(`${entry.date}|${entry.lesson}`);
      people.set(key, person);
    }));
    return [...people.values()].map(person => {
      const total=person.presences+person.absences;
      const percentage=Math.round(person.presences/Math.max(1,total)*100);
      return { ...person, lessons:person.lessons.size, percentage, status:classify(percentage) };
    }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
  }

  function completedMonths() {
    const months = new Map();
    captures.forEach(snapshot => {
      const eligible=eligibleRegisteredDays(snapshot);
      const item=months.get(snapshot.month)||{ expected:new Set(eligible), captured:new Set() };
      item.captured.add(Number.parseInt(snapshot.selectedDate.slice(0,2),10));
      eligible.forEach(day=>item.expected.add(day));
      months.set(snapshot.month,item);
    });
    return [...months].filter(([,item])=>item.expected.size>0 && [...item.expected].every(day=>item.captured.has(day))).map(([month])=>month);
  }

  function eligibleRegisteredDays(snapshot,now=new Date()){
    const monthIndex=MONTHS.indexOf(snapshot.month);
    const year=Number(snapshot.context?.year);
    if(monthIndex<0||!Number.isInteger(year))return [];
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const shiftKey=normalizeName(snapshot.context?.shift);
    const endHour=Object.entries(SHIFT_END_HOUR).find(([key])=>shiftKey.includes(key))?.[1]??23;
    return (snapshot.registeredDays||[]).filter(day=>{
      const date=new Date(year,monthIndex,day);
      if(date<today)return true;
      if(date>today)return false;
      return now.getHours()>=endHour;
    });
  }

  function collectionState(){
    const completed=new Set(completedMonths());
    const pending=[...selectedMonths].filter(month=>!completed.has(month)).sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b));
    return { completed:[...selectedMonths].filter(month=>completed.has(month)), pending, ready:selectedMonths.size>0&&pending.length===0 };
  }

  function monthProgress(){
    return [...selectedMonths].sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b)).map(month=>{
      const snapshots=[...captures.values()].filter(item=>item.month===month);
      const expected=new Set(snapshots.flatMap(item=>eligibleRegisteredDays(item)));
      const captured=new Set(snapshots.map(item=>Number.parseInt(item.selectedDate.slice(0,2),10)));
      const missing=[...expected].filter(day=>!captured.has(day)).sort((a,b)=>a-b);
      return {month,expected:[...expected].sort((a,b)=>a-b),captured:[...captured].sort((a,b)=>a-b),missing};
    });
  }

  function matchStudents(rows) {
    const classKey=normalizeClass(activeContext?.className);
    const candidates=students.filter(student=>normalizeClass(student.className)===classKey);
    const index=new Map();
    candidates.forEach(student=>{ const key=normalizeName(student.name); index.set(key,[...(index.get(key)||[]),student]); });
    return rows.map(row=>({ ...row, matches:index.get(normalizeName(row.name))||[] }));
  }

  function render(statusMessage='') {
    const rows=matchStudents(aggregate());
    const state=collectionState();
    const progress=monthProgress();
    const importControl=by('[data-aa-import]');
    importControl.classList.toggle('hidden',!state.ready);
    importControl.disabled=!state.ready||saving;
    by('[data-aa-context]').textContent=activeContext ? `${activeContext.shift} · ${activeContext.className} · ${activeContext.subject} · ${activeContext.term}` : 'Escolha os meses e abra as chamadas verdes no SIAP.';
    by('[data-aa-summary]').innerHTML=state.ready&&rows.length?`<div class="aa-summary"><div><b>${captures.size}</b><span>chamadas capturadas</span></div><div><b>${rows.length}</b><span>alunos</span></div><div><b>${rows.filter(x=>x.status==='absent').length}</b><span>faltosos</span></div><div><b>${rows.filter(x=>x.status==='active_search').length}</b><span>busca ativa</span></div></div>`:'';
    const progressHtml=selectedMonths.size?`<div class="aa-progress">${progress.map(item=>{if(!item.expected.length)return `<div><b>${escapeHtml(item.month)}</b><span>Aguardando abrir e capturar a primeira chamada deste mês no SIAP.</span></div>`;const done=item.captured.length===item.expected.length;return `<div class="${done?'complete':'pending'}"><b>${escapeHtml(item.month)}: ${item.captured.length} de ${item.expected.length}</b><span>${done?'Todas as chamadas verdes foram capturadas.':`Faltam: ${item.missing.map(day=>String(day).padStart(2,'0')).join(', ')}.`}</span><small>Capturadas: ${item.captured.map(day=>String(day).padStart(2,'0')).join(', ')||'nenhuma'}.</small></div>`}).join('')}</div>`:'';
    by('[data-aa-students]').innerHTML=progressHtml+(state.ready&&rows.length?`<div class="aa-table">${rows.map(row=>{const status=STATUS[row.status];const match=row.matches.length===1;return `<div class="aa-row"><div><b>${escapeHtml(row.name)}</b>${match?'':`<div class="aa-unmatched">${row.matches.length?'Nome duplicado no Carômetro':'Não identificado no Carômetro'}</div>`}</div><b>${row.percentage}%</b><div class="aa-bar"><i style="width:${row.percentage}%"></i></div><span class="attendance-badge ${status.className}">${status.label}</span></div>`}).join('')}</div>`:`<div class="empty">${selectedMonths.size?'O relatório será liberado quando todas as datas indicadas acima forem capturadas.':'Escolha os meses que deseja incluir no relatório.'}</div>`);
    if(statusMessage)by('[data-aa-status]').textContent=statusMessage;
    else if(!selectedMonths.size)by('[data-aa-status]').textContent='Escolha pelo menos um mês para iniciar.';
    else if(!state.ready)by('[data-aa-status]').textContent='Aguardando as datas indicadas abaixo. Confirme no SIAP se a Data Selecionada realmente mudou antes de capturar.';
    else by('[data-aa-status]').textContent='Todos os meses escolhidos foram concluídos. Gerando o relatório e sincronizando as etiquetas.';
  }

  function requestCapture() {
    return new Promise(resolve => {
      const requestId=crypto.randomUUID();
      const timer=setTimeout(()=>{window.removeEventListener('message',receive);resolve({ok:false,message:'A extensão demorou para responder. Confirme se o SIAP terminou de carregar e tente novamente.'});},15000);
      function receive(event){const data=event.data;if(event.source!==window||event.origin!==location.origin||data?.source!=='CAROMETRO_FREQUENCY_EXTENSION'||data?.type!=='CAROMETRO_ASSISTED_CAPTURE_RESULT'||data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);resolve(data.response||{ok:false,message:'Resposta vazia da extensão.'});}
      window.addEventListener('message',receive);
      window.postMessage({source:'CAROMETRO_WEB',type:'CAROMETRO_ASSISTED_CAPTURE_REQUEST',requestId},location.origin);
    });
  }

  by('[data-aa-capture]').onclick=async()=>{
    if(!selectedMonths.size){by('[data-aa-status]').textContent='Escolha pelo menos um mês antes de capturar.';return;}
    const control=by('[data-aa-capture]'); control.disabled=true; by('[data-aa-status]').textContent='Lendo a chamada aberta no SIAP…';
    try{
    const response=await requestCapture();
    if(!response?.ok){by('[data-aa-status]').textContent=response?.message||'Não foi possível capturar.';return;}
    const snapshot=response.result;
    if(!selectedMonths.has(snapshot.month)){by('[data-aa-status]').textContent=`O mês aberto no SIAP é ${snapshot.month}. Ele não foi escolhido no Carômetro.`;return;}
    const openedDay=Number.parseInt(snapshot.selectedDate.slice(0,2),10);
    if(!eligibleRegisteredDays(snapshot).includes(openedDay)){by('[data-aa-status]').textContent=`A chamada de ${snapshot.selectedDate} ainda não pode entrar no relatório. Somente datas verdes já vencidas e, no dia atual, turnos encerrados são considerados.`;return;}
    if(activeContext && ['year','className','shift','subject','term'].some(key=>normalizeName(activeContext[key])!==normalizeName(snapshot.context[key]))){by('[data-aa-status]').textContent='Esta chamada pertence a outra turma, disciplina ou período. Limpe a coleta antes de continuar.';return;}
    activeContext ||= snapshot.context;
    if(captures.has(snapshot.selectedDate)){render(`A chamada de ${snapshot.selectedDate} já foi capturada. O SIAP pode não ter mudado de data; confira o campo Data Selecionada.`);return;}
    captures.set(snapshot.selectedDate,snapshot);
    render(`Chamada de ${snapshot.selectedDate} capturada com sucesso.`);
    }catch(error){
      by('[data-aa-status]').textContent=`A leitura foi interrompida com segurança: ${error?.message||'erro inesperado'}. Tente novamente depois que o SIAP terminar de carregar.`;
    }finally{
      control.disabled=false;
    }
  };
  by('[data-aa-import]').onclick=async()=>{
    const control=by('[data-aa-import]');
    control.disabled=true;
    by('[data-aa-status]').textContent='Importando as etiquetas para os cards dos alunos…';
    await persistCompleteCollection();
    control.disabled=false;
  };
  by('[data-aa-clear]').onclick=()=>{captures.clear();activeContext=null;selectedMonths.clear();modal.querySelectorAll('[data-aa-month]').forEach(input=>{input.checked=false;});render();};

  async function persistCompleteCollection(){
    if(saving)return; saving=true;
    try{
      const schoolId=window.getActiveSchoolId?.();
      if(!schoolId)throw new Error('Selecione uma escola no Carômetro.');
      const state=collectionState();
      if(!state.ready)throw new Error('Ainda existem meses escolhidos aguardando leitura no SIAP.');
      const complete=new Set(state.completed);
      const validCaptures=[...captures.values()].filter(item=>complete.has(item.month));
      const validDates=new Set(validCaptures.map(item=>item.selectedDate));
      const rows=matchStudents(aggregate()).filter(row=>row.matches.length===1);
      if(!rows.length)throw new Error('Nenhum aluno foi identificado com segurança pelo nome completo.');
      const periodKey=[activeContext.year,activeContext.term,activeContext.subject,[...complete].sort().join(',')].join('|');
      const payload=rows.map(row=>({school_id:schoolId,student_id:row.matches[0].id,class_id:row.matches[0].classId,academic_year:Number(activeContext.year),term:activeContext.term,subject:activeContext.subject,months:[...complete],lesson_count:row.lessons,presences:row.presences,absences:row.absences,percentage:row.percentage,status:row.status,period_key:periodKey,source_dates:[...validDates]}));
      const imported=await db.rpc('import_siap_attendance_results',{p_rows:payload});
      if(imported.error)throw imported.error;
      payload.forEach(row=>currentBadges.set(row.student_id,row.status));
      render();
      window.render?.();
      document.dispatchEvent(new CustomEvent('carometro:attendance-status-changed'));
      by('[data-aa-status]').textContent=`${payload.length} aluno(s) sincronizados. Nomes não identificados não foram alterados.`;
    }catch(error){by('[data-aa-status]').textContent=`Coleta concluída, mas ainda não foi gravada: ${error.message}`;}finally{saving=false;}
  }

  async function loadCurrentBadges(){
    const schoolId=window.getActiveSchoolId?.();
    if(!schoolId)return;
    const {data,error}=await db.from('siap_attendance_current').select('student_id,status').eq('school_id',schoolId);
    if(error)return;
    currentBadges.clear();
    const weight={frequent:0,absent:1,active_search:2};
    (data||[]).forEach(item=>{const previous=currentBadges.get(item.student_id);if(!previous||weight[item.status]>weight[previous])currentBadges.set(item.student_id,item.status);});
    window.render?.();
    document.dispatchEvent(new CustomEvent('carometro:attendance-status-changed'));
  }

  window.getSiapAttendanceStatus=studentId=>currentBadges.get(studentId)||null;
  window.getSiapAttendanceBadge=studentId=>{const key=currentBadges.get(studentId);if(!key||key==='frequent')return '';const status=STATUS[key];return `<span class="attendance-badge ${status.className}">${status.label}</span>`;};
  window.getAssistedAttendanceForReports=()=>{const state=collectionState();return {context:activeContext,students:state.ready?matchStudents(aggregate()):[],selectedMonths:[...selectedMonths],completeMonths:state.completed,ready:state.ready};};
  document.addEventListener('carometro:school-context-changed',loadCurrentBadges);
  setTimeout(loadCurrentBadges,1500);
});
