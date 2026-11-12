// Limpeza seletiva das importações feitas pelo professor no Painel da Turma.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const escape = value => { const node=document.createElement('span');node.textContent=String(value??'');return node.innerHTML; };
  const canManage = ({classId,permission}={}) => !!classId && !!window.getActiveSchoolId?.() &&
    (permission?.role==='admin' || permission?.is_coordinator===true ||
      window.getActiveSchoolRole?.()==='teacher' && permission?.can_import_siap_attendance===true);
  let context=null;
  let imports=[];
  const modal=document.createElement('div');
  modal.id='siapImportManagerModal';
  modal.className='modal-bg hidden';
  modal.innerHTML=`<section class="modal"><div class="modal-head"><h3>Gerenciar dados importados do SIAP</h3><button type="button" class="close" data-close-imports aria-label="Fechar">×</button></div>
    <div class="form"><p class="sub">Escolha a disciplina e o bimestre. Limpar uma captura retira seus dados dos cards e das etiquetas; a frequência da Secretaria permanece.</p>
    <p data-import-status class="meta" role="status"></p><div data-import-list></div>
    <div class="actions"><button type="button" class="btn secondary" data-close-imports>Fechar</button></div></div></section>`;
  document.body.appendChild(modal);
  const status=message=>{modal.querySelector('[data-import-status]').textContent=message;};
  modal.querySelectorAll('[data-close-imports]').forEach(button=>button.onclick=()=>modal.classList.add('hidden'));
  modal.onclick=event=>{if(event.target===modal)modal.classList.add('hidden');};

  async function fetchAll(table,columns,schoolId,classId){
    const all=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await db.from(table).select(columns).eq('school_id',schoolId).eq('class_id',classId).range(offset,offset+999);
      if(error)throw error;
      all.push(...(data||[]));
      if((data||[]).length<1000)return all;
    }
  }
  function render(){
    const host=modal.querySelector('[data-import-list]');
    if(!imports.length){host.innerHTML='<p class="meta">Nenhuma importação encontrada para esta turma.</p>';return;}
    const names={absences:'Faltas em Notas',grades:'Notas finais',calls:'Frequência pelas chamadas'};
    host.innerHTML=imports.map((item,index)=>`<div class="siap-import-manager-row"><div><strong>${names[item.kind]}</strong><small>${escape(item.subject)} · ${item.bimester}º bimestre/${item.year}</small></div><button type="button" class="btn secondary" data-clear-import="${index}">Limpar</button></div>`).join('');
    host.querySelectorAll('[data-clear-import]').forEach(button=>button.onclick=()=>clearImport(imports[Number(button.dataset.clearImport)],button));
  }
  async function load(){
    if(!context||!canManage(context))return;
    status('Carregando importações desta turma…');
    try{
      const schoolId=window.getActiveSchoolId();
      const [absences,grades,calls]=await Promise.all([
        fetchAll('siap_bimester_absences','academic_year,bimester,subject',schoolId,context.classId),
        fetchAll('siap_grade_batches','academic_year,bimester,subject,source_kind',schoolId,context.classId),
        fetchAll('siap_attendance_current','academic_year,term,subject',schoolId,context.classId)
      ]);
      const unique=new Map();
      const add=(kind,year,bimester,subject)=>{
        if(!Number.isInteger(year)||!Number.isInteger(bimester)||!subject)return;
        const item={kind,year,bimester,subject};
        unique.set([kind,year,bimester,subject].join('|'),item);
      };
      absences.forEach(row=>add('absences',row.academic_year,row.bimester,row.subject));
      grades.filter(row=>row.source_kind==='teacher').forEach(row=>add('grades',row.academic_year,row.bimester,row.subject));
      calls.forEach(row=>add('calls',row.academic_year,Number(String(row.term||'').match(/^([1-4])/)?.[1]),row.subject));
      imports=[...unique.values()].sort((a,b)=>b.year-a.year||b.bimester-a.bimester||a.subject.localeCompare(b.subject));
      render();status(`${imports.length} captura(s) disponível(is) para limpeza.`);
    }catch(error){imports=[];render();status(`Não foi possível listar as importações: ${error.message}`);}
  }
  async function clearImport(item,button){
    if(!item||!canManage(context))return;
    const label=`${item.subject} · ${item.bimester}º bimestre/${item.year}`;
    if(!confirm(`Limpar ${label}? Os dados importados deste tipo sairão dos cards e das etiquetas. Para restaurar, será preciso capturar novamente.`))return;
    button.disabled=true;status(`Limpando ${label}…`);
    try{
      const {data,error}=await db.rpc('clear_siap_class_import',{
        p_school_id:window.getActiveSchoolId(),p_class_id:context.classId,
        p_year:item.year,p_bimester:item.bimester,p_subject:item.subject,p_kind:item.kind
      });
      if(error)throw error;
      await Promise.all([window.refreshSiapAbsences?.(),window.refreshSiapGrades?.(),window.refreshEffectiveAttendanceLabels?.()]);
      document.dispatchEvent(new CustomEvent('carometro:attendance-data-changed'));
      await load();status(`${data} registro(s) removido(s) de ${label}.`);
    }catch(error){status(`Não foi possível limpar ${label}: ${error.message}`);button.disabled=false;}
  }
  window.getSiapImportManagerAction=actionContext=>canManage(actionContext)
    ? '<button id="openSiapImportManager" type="button" class="btn secondary">Gerenciar capturas do SIAP</button>' : '';
  window.bindSiapImportManagerAction=actionContext=>{
    const button=document.getElementById('openSiapImportManager');
    if(button)button.onclick=async()=>{context=actionContext;modal.classList.remove('hidden');await load();};
  };
});
