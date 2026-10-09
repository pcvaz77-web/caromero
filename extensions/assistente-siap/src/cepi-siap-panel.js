(() => {
  'use strict';
  const Dom=window.CepiSiapDom;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let host=null,room=null,status=null,snapshot=null,entries=[],busy=false,message='',timer=null;
  const send=data=>chrome.runtime.sendMessage(data);
  async function refresh(){
    if(busy)return;
    busy=true;
    try{
      const found=await send({type:'SIAP_CEPI_ROOM_GET'});
      room=found?.room||null;
      if(!room){status=null;entries=[];message='Abra a prova em Meu CEPI no Carômetro e conecte o celular para corrigir.';return;}
      const result=await send({type:'SIAP_EXAM_API',action:'status',room:room.id,token:room.desktop});
      if(!result?.ok)throw new Error(result?.error||'Não foi possível consultar os cartões.');
      status=result;
      snapshot=Dom.snapshot(document,room.meta,status.key);
      entries=Dom.plan(snapshot,status,status.key);
      message=entries.length?`${entries.length} cartão(ões) conferido(s) no celular. Confira os nomes e acertos antes de preencher o SIAP.`:'Aguardando cartões conferidos no celular.';
    }catch(error){status=null;entries=[];message=error.message;}
    finally{busy=false;draw();}
  }
  function draw(){
    if(!host)return;
    const selected=new Set([...host.querySelectorAll('[data-cepi-capture]:checked')].map(box=>box.value));
    const call=host.querySelector('[data-cepi-call]')?.value||'1';
    host.innerHTML=`<section class="cm-card cm-exam"><h3>Cartões do Meu CEPI</h3><p>O gabarito e a divisão por disciplina vêm da prova salva no Carômetro.</p><p role="status" data-cepi-message>${escape(message)}</p><button type="button" class="cm-btn" data-cepi-refresh>Atualizar cartões</button>${entries.length?`<p><strong>${escape(snapshot.context.subject)}</strong> · ${snapshot.context.total} questões · ${escape(snapshot.context.className)}</p><label>Chamada<select data-cepi-call><option value="1">1ª chamada</option><option value="2">2ª chamada</option></select></label>${entries.map(entry=>`<label><input type="checkbox" data-cepi-capture value="${escape(entry.captureId)}" ${selected.has(entry.captureId)?'checked':''}>${escape(entry.name)} · ${entry.marks.filter(Boolean).length}/${entry.marks.length} acertos</label>`).join('')}<button type="button" class="cm-btn cm-primary" data-cepi-apply>Preencher selecionados no SIAP</button><p>Depois de conferir os campos, clique em <strong>Salvar</strong> no próprio SIAP.</p>`:''}</section>`;
    host.querySelector('[data-cepi-call]')?.setAttribute('value',call);
    if(host.querySelector('[data-cepi-call]'))host.querySelector('[data-cepi-call]').value=call;
    host.querySelector('[data-cepi-refresh]').onclick=refresh;
    host.querySelector('[data-cepi-apply]')?.addEventListener('click',applySelected);
  }
  async function applySelected(){
    if(busy||!room||!status)return;
    const ids=new Set([...host.querySelectorAll('[data-cepi-capture]:checked')].map(box=>box.value));
    if(!ids.size){message='Selecione pelo menos um aluno conferido.';draw();return;}
    const call=Number(host.querySelector('[data-cepi-call]').value);
    busy=true;
    try{
      const current=Dom.snapshot(document,room.meta,status.key);
      if(current.signature!==snapshot.signature)throw new Error('A avaliação ou a turma mudou no SIAP. Atualize os cartões.');
      const latest=await send({type:'SIAP_EXAM_API',action:'status',room:room.id,token:room.desktop});
      if(!latest?.ok||JSON.stringify(latest.key)!==JSON.stringify(status.key))throw new Error('O gabarito mudou. Atualize os cartões antes de lançar.');
      const ready=Dom.plan(current,latest,latest.key).filter(entry=>ids.has(entry.captureId));
      if(ready.length!==ids.size)throw new Error('Uma das correções mudou. Atualize os cartões.');
      ready.forEach(entry=>Dom.preflight(entry,call));
      for(const entry of ready)Dom.apply(entry,call);
      message=`${ready.length} aluno(s) preenchido(s). Confira cada campo e clique em Salvar no SIAP.`;
    }catch(error){message=error.message;}
    finally{busy=false;draw();}
  }
  function mount(container){
    if(host===container)return;
    clearInterval(timer);host=container;message='Verificando sessão de correção…';draw();refresh();
    timer=setInterval(()=>{if(host?.isConnected)refresh();},4000);
  }
  window.CepiSiapPanel=Object.freeze({supports:Dom.supports,mount});
})();
