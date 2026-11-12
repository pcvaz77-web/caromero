// Totais de faltas e carga horária ministrada da aba Notas do SIAP.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const studentKey = value => normalize(value).replace(/^\d+\s*[.\-)–—:]\s*/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const classKey = value => normalize(value).replace(/[^a-z0-9]/g, '');
  const schoolKey = value => normalize(value).replace(/\bcol\b/g, 'colegio').replace(/\best\b/g, 'estadual');
  const escape = value => { const node=document.createElement('span');node.textContent=String(value ?? '');return node.innerHTML; };
  const escapeAttribute = value => escape(value).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
    return items.filter(row=>row.academic_year===latest.academic_year&&row.bimester===latest.bimester)
      .map(row=>`<span class="siap-absence-badge" title="${escapeAttribute(row.subject)} · ${row.bimester}º bimestre/${row.academic_year} · Fonte: SIAP/Notas · Capturado em: ${escapeAttribute(updatedAt(row.imported_at))}">${escape(row.subject.replace(/^\d+\s*-\s*/,''))}: ${row.absences} falta${row.absences===1?'':'s'} · ${row.bimester}º bimestre${row.imported_at?` · ${escape(capturedDate(row.imported_at))}`:''}</span>`).join('');
  };
  window.getStudentSiapAbsenceDetails = studentId => window.getStudentSiapAbsences(studentId)
    .map(row => `<div class="siap-absence-detail"><strong>${escape(row.subject.replace(/^\d+\s*-\s*/,''))}</strong><span>${row.absences} falta${row.absences===1?'':'s'} · ${row.bimester}º bimestre/${row.academic_year}</span><small>Fonte: SIAP · Notas${row.imported_at?` · Capturado em: ${escape(updatedAt(row.imported_at))}`:''}</small></div>`).join('');

  const modal=document.createElement('div');
  modal.id='siapAbsencesModal';
  modal.className='modal-bg hidden';
  modal.innerHTML=`<section class="modal siap-absences-dialog"><div class="modal-head"><h3>Faltas bimestrais do SIAP</h3><button type="button" class="close" data-absence-close aria-label="Fechar">×</button></div>
    <div class="form"><p class="sub">Abra a aba Notas da turma, disciplina e bimestre no SIAP. A extensão lê “Faltas” e a carga horária, inclusive no bimestre em andamento.</p>
    <div data-absence-context class="meta"></div><div class="actions"><button type="button" class="btn secondary" data-absence-capture>Capturar tela aberta</button><a class="btn secondary" href="downloads/carometro-frequencia-leitura-0.7.7.zip" download>Baixar extensão 0.7.7</a></div>
    <p class="meta">Se a captura não responder, atualize a extensão. Para usar o pacote local, descompacte e carregue a pasta em chrome://extensions.</p>
    <p data-absence-status class="meta" role="status"></p><div data-absence-preview></div>
    <p class="meta">Esta captura mostra as faltas por bimestre. As etiquetas de frequência continuam vindo das chamadas por datas.</p>
    <div class="actions"><button type="button" class="btn secondary" data-absence-close>Fechar</button><button type="button" class="btn primary" data-absence-import disabled>Importar faltas conferidas</button></div></div></section>`;
  document.body.appendChild(modal);
  const by = selector => modal.querySelector(selector);
  const status = message => { by('[data-absence-status]').textContent=message; };
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
    by('[data-absence-import]').disabled=!eligible.length;
    by('[data-absence-preview]').innerHTML=snapshot
      ? `<p class="meta">${eligible.length} alunos identificados · ${matches.filter(row=>row.absences===null).length} sem faltas informadas · ${matches.filter(row=>row.absences!==null&&!row.studentId).length} sem vínculo único. Nenhuma etiqueta será criada por esta captura.</p>
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
    status('Nenhuma tela capturada.');renderPreview();modal.classList.remove('hidden');
  }
  window.getSiapAbsencePanelAction=({classId}={})=>canCapture(classId)
    ? '<button id="openSiapAbsences" type="button" class="btn primary">Capturar faltas em Notas</button>' : '';
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
      by('[data-absence-context]').textContent=`${targetClassName} · ${result.context.subject} · ${bimester}º bimestre/${year}`;
      renderPreview();status('Confira os nomes e as faltas antes de importar. Esta leitura não gera etiquetas.');
    }catch(error){snapshot=null;renderPreview();status(error.message);}
    finally{button.disabled=false;}
  };

  by('[data-absence-import]').onclick=async()=>{
    if(!snapshot||!canCapture(targetClassId)){status('A captura não está disponível para esta turma.');return;}
    const matches=matchedRows();
    const selected=[...modal.querySelectorAll('[data-absence-row]:checked')]
      .map(input=>matches[Number(input.dataset.absenceRow)])
      .filter(row=>row?.studentId&&!row.blocked&&row.absences!==null);
    if(!selected.length){status('Selecione ao menos um aluno com faltas válidas.');return;}
    const bimester=Number(String(snapshot.context.term).match(/^([1-4])º?\s*Bimestre/i)?.[1]);
    const button=by('[data-absence-import]');button.disabled=true;status('Importando faltas conferidas…');
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
      status(`${data} aluno(s) atualizados. Nenhuma etiqueta foi gerada. Campos vazios e nomes sem vínculo único não foram alterados.`);
    }catch(error){status(`Nenhuma importação concluída: ${error.message}`);}
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
    section.innerHTML=`<div class="siap-absence-panel-head"><div><h4>Faltas por disciplina</h4><p>Dados da aba Notas do SIAP · bimestre em andamento pode mudar · etiquetas vêm das chamadas</p></div>
      <select data-absence-period aria-label="Ano e bimestre das faltas">${periods.map(value=>{const [y,b]=value.split('|');return `<option value="${value}" ${value===chosen?'selected':''}>${b}º bimestre/${y}</option>`;}).join('')}</select></div>
      <div class="siap-absence-table">${students.filter(student=>student.classId===classId&&byStudent.has(student.id))
        .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
        .map(student=>`<div class="siap-absence-student"><strong>${escape(student.name)}</strong><span>${byStudent.get(student.id).sort((a,b)=>a.subject.localeCompare(b.subject)).map(row=>`${escape(row.subject.replace(/^\d+\s*-\s*/,''))}: <b>${row.absences} falta${row.absences===1?'':'s'} · ${row.bimester}º bimestre</b> <small>Capturado em ${escape(updatedAt(row.imported_at))}</small>`).join(' · ')}</span></div>`).join('')}</div>`;
    section.querySelector('[data-absence-period]').onchange=()=>mountPanel(classId);
  }
  window.mountSiapAbsencePanel=({classId}={})=>{targetClassId=classId;mountPanel(classId);};
  document.addEventListener('carometro:data-loaded',loadRows);
  document.addEventListener('carometro:school-context-ready',loadRows);
  db.auth.onAuthStateChange((_event,session)=>{if(!session){++token;rows=[];}});
});
