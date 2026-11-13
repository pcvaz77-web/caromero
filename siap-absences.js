// Totais de faltas e carga horária ministrada da aba Notas do SIAP.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const studentKey = value => normalize(value).replace(/^\d+\s*[.\-)–—:]\s*/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const classKey = value => normalize(value).replace(/[^a-z0-9]/g, '');
  const schoolKey = value => normalize(value).replace(/\bcol\b/g, 'colegio').replace(/\best\b/g, 'estadual');
  const escape = value => { const node=document.createElement('span');node.textContent=String(value ?? '');return node.innerHTML; };
  const escapeAttribute = value => escape(value).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const extensionStoreUrl = window.CAROMETRO_RUNTIME_CONFIG?.attendanceCaptureStoreUrl || 'https://chromewebstore.google.com/detail/carometro-frequencia-leitura/knidplehphfpgaeeogjpfldhgbfkogbc';
  const updatedAt = value => {
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);
  };
  const capturedDate = value => {
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(date);
  };
  const schoolId = () => window.getActiveSchoolId?.() || null;
  const canCapture = classId => window.getActiveSchoolRole?.() === 'teacher' && permission?.can_import_siap_attendance===true && !!classId && !!schoolId();
  let rows = [];
  let snapshot = null;
  let targetClassId = null;
  let targetClassName = '';
  let token = 0;

  async function loadRows() {
    const current = ++token;
    const school = schoolId();
    if (!school) { rows=[];return; }
    try {
      const all=[];
      for (let offset=0;;offset+=1000) {
        const {data,error}=await db.from('siap_bimester_absences')
          .select('class_id,student_id,academic_year,bimester,subject,absences,taught_hours,planned_hours,imported_at')
          .eq('school_id',school).range(offset,offset+999);
        if (error) throw error;
        all.push(...(data||[]));
        if ((data||[]).length<1000) break;
      }
      if (current!==token || school!==schoolId()) return;
      rows=all;
      window.render?.();
      if (targetClassId) mountPanel(targetClassId);
    } catch (error) {
      if (current!==token) return;
      rows=[];
      console.warn('Não foi possível carregar as faltas bimestrais:',error);
    }
  }
  window.refreshSiapAbsences = loadRows;

  window.getStudentSiapAbsences = studentId => rows.filter(row => row.student_id===studentId)
    .sort((a,b) => b.academic_year-a.academic_year || b.bimester-a.bimester || a.subject.localeCompare(b.subject))
    .map(row => ({ ...row }));
  window.getStudentSiapAbsenceBadge = studentId => {
    const items=window.getStudentSiapAbsences(studentId);
    if(!items.length)return '';
    const latest=items[0];
    const period=items.filter(row=>row.academic_year===latest.academic_year&&row.bimester===latest.bimester);
    const total=period.reduce((sum,row)=>sum+row.absences,0);
    const captured=period.map(row=>row.imported_at).filter(Boolean).sort().at(-1);
    const subjects=period.map(row=>`${row.subject.replace(/^\d+\s*-\s*/,'')}: ${row.absences}`).join(' · ');
    return `<span class="siap-absence-badge" title="${escapeAttribute(subjects)} · ${latest.bimester}º Bim./${latest.academic_year} · Fonte: SIAP · Capturado em: ${escapeAttribute(updatedAt(captured))}">Total: ${total} falta${total===1?'':'s'} · ${latest.bimester}º Bim.${captured?` · ${escape(capturedDate(captured))}`:''}</span>`;
  };
  window.getStudentSiapAbsenceDetails = studentId => {
    if (window.getStudentAttendanceDetails?.(studentId)?.some(item => item.source === 'SIAP')) return '';
    const items=window.getStudentSiapAbsences(studentId);
    if(!items.length)return '';
    const latest=items[0];
    const period=items.filter(row=>row.academic_year===latest.academic_year&&row.bimester===latest.bimester);
    const total=period.reduce((sum,row)=>sum+row.absences,0);
    return `<div class="siap-absence-detail"><strong>Total registrado: ${total} falta${total===1?'':'s'}</strong><small>${latest.bimester}º Bim./${latest.academic_year} · ${period.length} disciplina${period.length===1?'':'s'} com captura</small></div>`+
      items.map(row => `<div class="siap-absence-detail"><strong>${escape(row.subject.replace(/^\d+\s*-\s*/,''))}</strong><span>${row.absences} falta${row.absences===1?'':'s'} · ${row.bimester}º Bim./${row.academic_year}</span><small>Fonte: SIAP${row.imported_at?` · Capturado em: ${escape(updatedAt(row.imported_at))}`:''}</small></div>`).join('');
  };

  const criteriaHtml=`<section class="siap-absence-criteria" aria-label="Critérios das etiquetas pelas faltas"><strong>Como as faltas geram etiquetas</strong>
    <p>Presença = (aulas ministradas − faltas) ÷ aulas ministradas × 100. O sistema soma as disciplinas extraídas no mesmo Bim. e arredonda o percentual. Exemplo: 6 faltas em 19 aulas resultam em 68% de presença.</p>
    <p data-siap-absence-criteria-limits>Padrão: Frequente a partir de 75%; Faltoso de 60% a 74%; Necessita de Busca Ativa abaixo de 60%.</p>
    <p>Uma disciplina com carga incompatível impede o cálculo da etiqueta pelas faltas. Os limites podem ser alterados em Configurar frequência.</p></section>`;
  const modal=document.createElement('div');
  modal.id='siapAbsencesModal';
  modal.className='modal-bg hidden';
  modal.innerHTML=`<section class="modal siap-absences-dialog"><div class="modal-head"><h3>Faltas bimestrais do SIAP</h3><div class="siap-absence-header-actions"><a class="btn secondary siap-absence-install-link" href="${escapeAttribute(extensionStoreUrl)}" target="_blank" rel="noopener noreferrer">Instalar extensão</a><button type="button" class="close" data-absence-close aria-label="Fechar">×</button></div></div>
    <div class="form"><p class="sub">Abra a aba Notas da turma, disciplina e bimestre no SIAP. A extensão lê “Faltas” e a carga horária, inclusive no bimestre em andamento.</p>
    <div data-absence-context class="meta"></div><div class="actions"><button type="button" class="btn siap-absence-capture" data-absence-capture>Capturar tela aberta</button></div>
    <p class="meta">Se a captura não responder, atualize a extensão pela Chrome Web Store.</p>
    <p data-absence-status class="meta" role="status"></p><div data-absence-preview></div>
    ${criteriaHtml}
    <div class="actions"><button type="button" class="btn secondary" data-absence-close>Fechar</button><button type="button" class="btn primary" data-absence-import disabled>Importar faltas conferidas</button></div>
    <p data-absence-import-feedback class="siap-absence-import-feedback hidden" role="status" aria-live="polite"></p></div></section>`;
  document.body.appendChild(modal);
  const by = selector => modal.querySelector(selector);
  const status = message => { by('[data-absence-status]').textContent=message; };
  const importFeedback = (message,kind='') => {
    const feedback=by('[data-absence-import-feedback]');
    feedback.textContent=message;
    feedback.classList.toggle('hidden',!message);
    feedback.classList.toggle('siap-absence-import-success',kind==='success');
    feedback.classList.toggle('siap-absence-import-error',kind==='error');
    if(message)feedback.scrollIntoView({block:'nearest'});
  };
  modal.querySelectorAll('[data-absence-close]').forEach(button=>button.onclick=()=>modal.classList.add('hidden'));
  modal.onclick=event=>{if(event.target===modal)modal.classList.add('hidden');};

  function matchedRows() {
    const candidates=students.filter(student=>student.classId===targetClassId);
    const byName=new Map();
    candidates.forEach(student=>{const key=studentKey(student.name);byName.set(key,[...(byName.get(key)||[]),student]);});
    const counts=new Map();
    (snapshot?.entries||[]).forEach(entry=>{const key=studentKey(entry.name);counts.set(key,(counts.get(key)||0)+1);});
    return (snapshot?.entries||[]).map(entry=>{
      const key=studentKey(entry.name);
      const matches=byName.get(key)||[];
      const duplicate=counts.get(key)>1;
      return {...entry,studentId:!duplicate&&matches.length===1?matches[0].id:null,duplicate,matchCount:matches.length};
    });
  }

  function renderPreview() {
    const matches=matchedRows();
    const eligible=matches.filter(row=>row.studentId&&!row.blocked&&row.absences!==null);
    const withoutValidLoad=eligible.filter(row=>!Number.isInteger(snapshot?.taughtHours)||snapshot.taughtHours<=0||row.absences>snapshot.taughtHours).length;
    by('[data-absence-import]').disabled=!eligible.length;
    by('[data-absence-preview]').innerHTML=snapshot
      ? `<p class="meta">${eligible.length} alunos identificados · ${matches.filter(row=>row.absences===null).length} sem faltas informadas · ${matches.filter(row=>row.absences!==null&&!row.studentId).length} sem vínculo único.${withoutValidLoad?` ${withoutValidLoad} sem base válida para etiqueta nesta disciplina; as faltas ainda podem ser importadas.`:''}</p>
        <div class="siap-absence-preview-list">${matches.map((row,index)=>{
          const valid=row.studentId&&!row.blocked&&row.absences!==null;
          const reason=row.absences===null?'Campo vazio':row.blocked?'Matrícula bloqueada no SIAP':row.duplicate?'Nome duplicado no SIAP':
            !row.studentId?row.matchCount?'Nome duplicado no Carômetro':'Não identificado no Carômetro':'';
          return `<label class="siap-absence-preview-row"><input type="checkbox" data-absence-row="${index}" ${valid?'checked':'disabled'}>
            <span>${escape(row.name)}<small>${escape(reason)}</small></span><b>${row.absences===null?'—':`${row.absences} falta${row.absences===1?'':'s'}`}</b></label>`;
        }).join('')}</div>` : '';
  }

  function openCapture(classId,className) {
    if (!canCapture(classId)) { toast('Somente professores da escola ativa podem importar faltas.');return; }
    snapshot=null;targetClassId=classId;targetClassName=className||'';
    by('[data-absence-context]').textContent=`Turma ${targetClassName}`;
    status('Nenhuma tela capturada.');importFeedback('');renderPreview();modal.classList.remove('hidden');refreshCriteria();
  }
  window.getSiapAbsencePanelAction=({classId}={})=>canCapture(classId)
    ? '<button id="openSiapAbsences" type="button" class="btn primary">Extrair faltas do SIAP</button>' : '';
  async function refreshCriteria(){
    const label=by('[data-siap-absence-criteria-limits]');
    const currentSchool=schoolId();
    if(!label||!currentSchool||modal.classList.contains('hidden'))return;
    const {data,error}=await db.from('school_siap_attendance_settings')
      .select('frequent_minimum,absent_minimum').eq('school_id',currentSchool).maybeSingle();
    if(!label.isConnected||currentSchool!==schoolId())return;
    if(error){label.textContent='Não foi possível consultar os limites desta escola. Veja Configurar frequência.';return;}
    const frequent=data?Number(data.frequent_minimum):75;
    const absent=data?Number(data.absent_minimum):60;
    label.textContent=`${data?'Nesta escola':'Padrão'}: Frequente a partir de ${frequent}%; Faltoso de ${absent}% a ${frequent-1}%; Necessita de Busca Ativa abaixo de ${absent}%.`;
  }
  document.addEventListener('carometro:attendance-data-changed',refreshCriteria);
  window.bindSiapAbsencePanelAction=({classId,className}={})=>{
    const button=document.getElementById('openSiapAbsences');
    if(button)button.onclick=()=>openCapture(classId,className);
  };

  function requestCapture() {
    return new Promise(resolve=>{
      const requestId=crypto.randomUUID();
      const timer=setTimeout(()=>{window.removeEventListener('message',receive);resolve({ok:false,message:'A extensão demorou para responder.'});},25000);
      function receive(event) {
        const data=event.data;
        if(event.source!==window||event.origin!==location.origin||data?.source!=='CAROMETRO_ABSENCES_EXTENSION'||
           data?.type!=='CAROMETRO_ABSENCES_CAPTURE_RESULT'||data.requestId!==requestId)return;
        clearTimeout(timer);window.removeEventListener('message',receive);
        resolve(data.response||{ok:false,message:'Resposta vazia da extensão.'});
      }
      window.addEventListener('message',receive);
      window.postMessage({source:'CAROMETRO_WEB',type:'CAROMETRO_ABSENCES_CAPTURE_REQUEST',requestId},location.origin);
    });
  }

  by('[data-absence-capture]').onclick=async()=>{
    const button=by('[data-absence-capture]');button.disabled=true;status('Lendo a coluna Faltas da tela aberta…');
    try {
      const response=await requestCapture();
      if(!response.ok)throw new Error(response.message||'A leitura falhou.');
      const result=response.result;
      const membership=window.getActiveSchoolMembership?.();
      const activeSchoolName=membership?.schools?.name||membership?.name||'';
      if(!result.schoolName||!activeSchoolName||schoolKey(result.schoolName)!==schoolKey(activeSchoolName))
        throw new Error('A escola aberta no SIAP não corresponde à escola ativa no Carômetro.');
      if(classKey(result.context?.className)!==classKey(targetClassName))
        throw new Error(`A tela do SIAP não pertence à turma ${targetClassName}.`);
      const target=classes.find(item=>item.id===targetClassId);
      if(!target||(target.shift&&normalize(result.context?.shift)!==normalize(target.shift)))
        throw new Error('O turno da tela do SIAP não corresponde à turma selecionada.');
      const bimester=Number(String(result.context?.term||'').match(/^([1-4])º?\s*Bimestre/i)?.[1]);
      const year=Number(result.context?.year);
      if(!Number.isInteger(bimester)||!Number.isInteger(year)||!result.context?.subject||!Array.isArray(result.entries))
        throw new Error('Ano, bimestre, disciplina ou alunos não identificados no SIAP.');
      if(result.taughtHours!==null&&(!Number.isInteger(result.taughtHours)||result.taughtHours<0||result.taughtHours>9999))
        throw new Error('Carga Horária Ministrada em formato inválido.');
      if(result.entries.some(entry=>entry.absences!==null&&(!Number.isInteger(entry.absences)||entry.absences<0||entry.absences>9999)))
        throw new Error('O SIAP retornou uma quantidade de faltas inválida.');
      snapshot=result;
      by('[data-absence-context]').textContent=`${targetClassName} · ${result.context.subject} · ${bimester}º Bim./${year}`;
      renderPreview();status('Confira os nomes e as faltas. A etiqueta será calculada somente quando a carga ministrada for compatível.');
    }catch(error){snapshot=null;renderPreview();status(error.message);}
    finally{button.disabled=false;}
  };

  by('[data-absence-import]').onclick=async()=>{
    if(!snapshot||!canCapture(targetClassId)){importFeedback('A captura não está disponível para esta turma.','error');return;}
    const matches=matchedRows();
    const selected=[...modal.querySelectorAll('[data-absence-row]:checked')]
      .map(input=>matches[Number(input.dataset.absenceRow)])
      .filter(row=>row?.studentId&&!row.blocked&&row.absences!==null);
    if(!selected.length){importFeedback('Selecione ao menos um aluno com faltas válidas.','error');return;}
    const bimester=Number(String(snapshot.context.term).match(/^([1-4])º?\s*Bimestre/i)?.[1]);
    const button=by('[data-absence-import]');button.disabled=true;importFeedback('Importando faltas conferidas…');
    try{
      const {data,error}=await db.rpc('import_siap_bimester_absences',{
        p_school_id:schoolId(),p_class_id:targetClassId,p_year:Number(snapshot.context.year),
        p_bimester:bimester,p_subject:snapshot.context.subject,
        p_taught_hours:snapshot.taughtHours,p_planned_hours:snapshot.plannedHours,
        p_rows:selected.map(row=>({student_id:row.studentId,absences:row.absences}))
      });
      if(error)throw error;
      await loadRows();
      document.dispatchEvent(new CustomEvent('carometro:attendance-data-changed'));
      importFeedback(`Dados importados para os cards de ${data} aluno${Number(data)===1?'':'s'}.`,'success');
    }catch(error){importFeedback(`Nenhuma importação concluída: ${error.message}`,'error');}
    finally{button.disabled=false;}
  };

  function mountPanel(classId) {
    const host=document.getElementById('classroomMapContent');
    const panel=document.getElementById('classroomMapModal');
    if(!host||!classId||!panel?.classList.contains('classroom-panel-mode')||panel.classList.contains('hidden'))return;
    let section=host.querySelector('[data-siap-absence-panel]');
    if(!section){section=document.createElement('section');section.className='classroom-panel-card siap-absence-panel';section.dataset.siapAbsencePanel='';host.appendChild(section);}
    const classRows=rows.filter(row=>row.class_id===classId);
    if(!classRows.length){section.innerHTML='<h4>Faltas por disciplina</h4><p>Ainda não há faltas importadas para esta turma.</p>';return;}
    const periods=[...new Set(classRows.map(row=>`${row.academic_year}|${row.bimester}`))].sort((a,b)=>b.localeCompare(a,'pt-BR',{numeric:true}));
    const previous=section.querySelector('[data-absence-period]')?.value;
    const chosen=periods.includes(previous)?previous:periods[0];
    const [year,bimester]=chosen.split('|').map(Number);
    const periodRows=classRows.filter(row=>row.academic_year===year&&row.bimester===bimester);
    const byStudent=new Map();
    periodRows.forEach(row=>{const list=byStudent.get(row.student_id)||[];list.push(row);byStudent.set(row.student_id,list);});
    const visible=students.filter(student=>student.classId===classId&&byStudent.has(student.id))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const totals=window.SiapAbsenceCalculations.totalsForPeriod(periodRows.filter(row=>visible.some(student=>student.id===row.student_id)));
    const subjects=new Set(periodRows.map(row=>row.subject)).size;
    const mean=totals.mean?.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}) || '0,0';
    section.innerHTML=`<div class="siap-absence-panel-head"><div><h4>Faltas da turma</h4><p>Totais das disciplinas já capturadas no SIAP · o Bim. em andamento pode mudar</p></div>
      <select data-absence-period aria-label="Ano e Bim. das faltas">${periods.map(value=>{const [y,b]=value.split('|');return `<option value="${value}" ${value===chosen?'selected':''}>${b}º Bim./${y}</option>`;}).join('')}</select></div>
      <div class="siap-absence-summary"><div><small>Média geral da turma</small><strong>${mean} faltas por aluno</strong><span>Média dos totais dos ${visible.length} aluno${visible.length===1?'':'s'} com captura.</span></div><div><small>Disciplinas registradas</small><strong>${subjects}</strong><span>Novas capturas acrescentam faltas ao total.</span></div></div>
      <div class="siap-absence-table">${visible.map(student=>{
        const studentRows=byStudent.get(student.id).sort((a,b)=>a.subject.localeCompare(b.subject));
        const total=totals.byStudent.get(student.id)?.total || 0;
        return `<div class="siap-absence-student"><strong>${escape(student.name)} <span class="siap-absence-name-total">· ${total} falta${total===1?'':'s'}</span></strong><span><b>Total: ${total} falta${total===1?'':'s'} · ${bimester}º Bim.</b><small>${studentRows.map(row=>`${escape(row.subject.replace(/^\d+\s*-\s*/,''))}: ${row.absences} · capturado em ${escape(updatedAt(row.imported_at))}`).join(' · ')}</small></span></div>`;
      }).join('')}</div>`;
    section.querySelector('[data-absence-period]').onchange=()=>mountPanel(classId);
  }
  window.mountSiapAbsencePanel=({classId}={})=>{targetClassId=classId;mountPanel(classId);};
  document.addEventListener('carometro:data-loaded',loadRows);
  document.addEventListener('carometro:school-context-ready',loadRows);
  db.auth.onAuthStateChange((_event,session)=>{if(!session){++token;rows=[];}});
});
