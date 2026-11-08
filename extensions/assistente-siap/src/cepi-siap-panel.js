(() => {
  'use strict';
  const Dom=window.CepiSiapDom;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let host=null,room=null,status=null,snapshot=null,entries=[],skipped=[],busy=false,message='',messageState='info';
  const send=data=>chrome.runtime.sendMessage(data);
  async function refresh(){
    if(busy)return;
    busy=true;message='Buscando os gabaritos lidos no Carômetro…';messageState='loading';draw();
    try{
      const found=await send({type:'SIAP_CEPI_ROOM_GET'});
      room=found?.room||null;
      if(!room || room.meta?.examType!=='bloco')throw new Error('Nenhuma leitura de prova de bloco foi encontrada. Abra a prova no Meu CEPI e conecte o celular.');
      const result=await send({type:'SIAP_EXAM_API',action:'status',room:room.id,token:room.desktop});
      if(!result?.ok)throw new Error(result?.error||'Não foi possível consultar os cartões.');
      status=result;
      snapshot=Dom.snapshot(document,room.meta,status.key);
      const plan=Dom.plan(snapshot,status,status.key);
      entries=plan.entries;skipped=plan.skipped;
      message=entries.length?`${entries.length} gabarito(s) lido(s) trazido(s) para o SIAP. Confira os alunos e envie os cartões.${skipped.length?` ${skipped.length} não pode(m) ser lançado(s); veja abaixo.`:''}`:'Nenhum cartão conferido foi encontrado. Confira as leituras no Carômetro e atualize novamente.';
      messageState=entries.length?'success':'info';
    }catch(error){status=null;entries=[];skipped=[];message=error.message||'Não foi possível atualizar os cartões.';messageState='error';}
    finally{busy=false;draw();}
  }
  function draw(){
    if(!host)return;
    host.innerHTML=`<section class="cm-card cm-exam"><h3>Cartões do Meu CEPI</h3><p>O gabarito e a divisão por disciplina vêm da prova salva no Carômetro.</p><button type="button" class="cm-btn" data-cepi-refresh ${busy?'disabled':''}>${busy?'Atualizando…':'Atualizar cartões'}</button><p role="status" aria-live="polite" class="cm-cepi-message" data-state="${messageState}" data-cepi-message>${escape(message)}</p>${entries.length?`<p><strong>${escape(snapshot.context.subject)}</strong> · ${snapshot.context.total} questões · ${escape(snapshot.context.className)} · 1ª chamada</p>${entries.map(entry=>`<p>${escape(entry.name)} · ${entry.marks.filter(Boolean).length}/${entry.marks.length} acertos</p>`).join('')}<button type="button" class="cm-btn cm-primary" data-cepi-apply ${busy?'disabled':''}>${busy?'Enviando…':'Enviar cartões para o SIAP'}</button><p>A extensão preencherá a 1ª chamada e os acertos dos cartões conferidos. Depois, clique em <strong>Salvar</strong> no SIAP.</p>`:''}${skipped.length?`<div role="status"><strong>Cartões não lançáveis:</strong><ul>${skipped.map(item=>`<li>${escape(item.name)} — ${escape(item.reason)}</li>`).join('')}</ul></div>`:''}</section>`;
    host.querySelector('[data-cepi-refresh]').onclick=refresh;
    host.querySelector('[data-cepi-apply]')?.addEventListener('click',applyAll);
  }
  async function applyAll(){
    if(busy||!room||!status)return;
    const ids=new Set(entries.map(entry=>entry.captureId));
    if(!ids.size){message='Nenhum cartão conferido está pronto para enviar.';messageState='error';draw();return;}
    const call=1;
    busy=true;
    message='Enviando cartões: marcando presença e preparando os campos de acertos…';messageState='loading';
    draw();
    try{
      const current=Dom.snapshot(document,room.meta,status.key);
      if(current.signature!==snapshot.signature)throw new Error('A avaliação ou a turma mudou no SIAP. Atualize os cartões.');
      const latest=await send({type:'SIAP_EXAM_API',action:'status',room:room.id,token:room.desktop});
      if(!latest?.ok||JSON.stringify(latest.key)!==JSON.stringify(status.key))throw new Error('O gabarito mudou. Atualize os cartões antes de lançar.');
      const latestPlan=Dom.plan(current,latest,latest.key);
      const ready=latestPlan.entries.filter(entry=>ids.has(entry.captureId));
      if(ready.length!==ids.size)throw new Error('Uma das correções mudou. Atualize os cartões.');
      ready.forEach(entry=>Dom.preflight(entry,call));
      ready.forEach(entry=>Dom.setPresence(entry,call));
      ready.forEach(entry=>Dom.ensureQuestionsEnabled(entry));
      ready.forEach(entry=>Dom.applyMarks(entry));
      message=`${ready.length} aluno(s) preenchido(s) na 1ª chamada. Confira e clique em Salvar no SIAP.${latestPlan.skipped.length?` ${latestPlan.skipped.length} cartão(ões) ignorado(s); veja a lista abaixo.`:''}`;messageState='success';
    }catch(error){message=error.message||'Não foi possível enviar os cartões.';messageState='error';}
    finally{busy=false;draw();}
  }
  function mount(container){
    if(host===container)return;
    host=container;message='Clique em Atualizar cartões para buscar as leituras do Carômetro.';messageState='info';draw();
  }
  window.CepiSiapPanel=Object.freeze({supports:Dom.supports,mount});
})();
