(function (root, factory) {
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.CepiCorrection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function key(prepared) {
    return {alphabet:prepared.test.answer_format,answers:[...prepared.answers],ranges:[{subject:'Prova CEPI',from:1,to:prepared.answers.length}]};
  }
  function reviewedItems(status, studentIds, test) {
    const allowed=new Set(studentIds), seen=new Set(), entries=[];
    for(const item of status?.items||[]) {
      if(item.kind!=='student'||item.discarded||item.status!=='ready'||item.review?.reviewed!==true) continue;
      const id=item.review.studentId;
      if(!allowed.has(id)) throw new Error('Há cartão associado a aluno de outra turma. Confira a seleção no celular.');
      if(seen.has(id)) throw new Error('Há dois cartões do mesmo aluno. Descarte um deles no celular.');
      seen.add(id);
      const answers=item.review.answers;
      const choices=test.answer_format==='VF'?['V','F','-']:[...test.answer_format,'-'];
      if(!Array.isArray(answers)||answers.length!==test.question_count||answers.some(value=>!choices.includes(value))) throw new Error('Há marcação ambígua ou quantidade incorreta. Corrija no celular antes de registrar.');
      entries.push({capture_ref:item.id,student_id:id,answers:[...answers]});
    }
    return entries;
  }
  function request(action, {room='',token='',body={},accessToken=''}={}) {
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('A extensão não respondeu. Confira se está instalada e atualizada.'));},15000);
      function onMessage(event) {
        if(event.source!==window||event.origin!==window.location.origin||event.data?.source!=='CAROMETRO_EXTENSION'||event.data?.type!=='CAROMETRO_CEPI_EXAM_RESULT'||event.data.requestId!==requestId)return;
        clearTimeout(timer);window.removeEventListener('message',onMessage);
        const result=event.data.response;
        if(result?.ok)resolve(result);else reject(new Error(result?.error||'Não foi possível comunicar com a extensão.'));
      }
      window.addEventListener('message',onMessage);
      window.postMessage({source:'CAROMETRO_WEB',type:'CAROMETRO_CEPI_EXAM_REQUEST',requestId,action,room,token,body,accessToken},window.location.origin);
    });
  }
  return Object.freeze({key,reviewedItems,request});
});
