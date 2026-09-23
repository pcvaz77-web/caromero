import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fixture, selectionFixture } from './fixture.mjs';
const dir=new URL('../../../extensions/assistente-siap/src/',import.meta.url);
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
async function setup({selecting=false, initialState=null, ranges=null, html=null,mobile=false,scanRequested=false}={}) {
  const dom=new JSDOM(html || (selecting ? selectionFixture() : fixture()),{url:'https://siap.educacao.go.gov.br/' + (selecting ? 'LancamentoNotasModeloListagem.aspx' : 'LancamentoNotasModeloEdicao.aspx'),runScripts:'outside-only'}), w=dom.window;
  const timers=[]; w.setTimeout=fn=>{timers.push(fn);return timers.length;};w.clearTimeout=()=>{};
  const room={id:crypto.randomUUID(),desktop:'a'.repeat(64),mobile:'b'.repeat(64),expires:Date.now()+100000};
  let key={alphabet:'ABCD',answers:Array(15).fill('A'),ranges:ranges || [{subject:'Língua Portuguesa',from:1,to:15}]};
  const items=[{id:crypto.randomUUID(),kind:'official',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:''}}, {id:crypto.randomUUID(),kind:'student',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:'JOÃO PEDRO TESTE',answers:['B',...Array(14).fill('A')]}}];
  let stored=initialState,saves=0;const calls=[];
  const saveButton=w.document.querySelector('#cphFuncionalidade_btnAlterar');if(saveButton)saveButton.onclick=()=>saves++;
  const accessUpdates=[];w.SiapExamAccessUpdated=access=>accessUpdates.push(access);
  w.chrome={runtime:{sendMessage:async msg=>{
    if(msg.type==='SIAP_EXAM_STATE_GET')return {ok:true,value:structuredClone(stored)};
    if(msg.type==='SIAP_EXAM_STATE_PUT'){stored=structuredClone(msg.value);return {ok:true};}
    if(msg.action==='create'){calls.push(structuredClone(msg));if(stored?.room){items.length=0;key=null;}return {ok:true,...room,id:crypto.randomUUID()};}
    if(msg.type==='ASSISTENTE_SIAP_LICENSE_STATUS')return {ok:true,license:{examAccess:{active:true,status:'block',credits:0,openBlocks:1}}};
    if(msg.action==='review'){const item=items.find(i=>i.id===msg.body.id);item.review={studentId:msg.body.studentId,answers:msg.body.answers,reviewed:true};return {ok:true};}
    if(msg.action==='status')return {ok:true,key:structuredClone(key),items:structuredClone(items),active:true,mobileWorkflow:mobile,roster:[],scanRequested,activated:false};
    return {ok:true};
  }}};
  for(const file of ['exam-config.js','vendor/qrcode.js','exam-core.js','exam-dom.js','exam-panel.js'])w.eval(readFileSync(new URL(file,dir),'utf8'));
  const container=w.document.createElement('aside');w.document.body.append(container);w.SiapExamPanel.mount(container);await settle();
  if(!initialState)container.querySelector('[data-exam=start]')?.click();await settle();
  return {w,dom,container,items,timers,calls,accessUpdates,getState:()=>stored,getSaves:()=>saves,tick:async()=>{const fn=timers.shift();if(fn)await fn();await settle();}};
}
test('painel preenche lote confirmado e exige Salvar no SIAP mesmo quando completo',async()=>{
  const app=await setup();
  try{
    assert.ok(app.container.querySelector('[data-exam-qr] svg'));
    assert.equal(app.container.querySelector('[data-exam-student]').value,'1 - JOÃO PEDRO TESTE');
    const absent=app.container.querySelector('[data-exam-absent]:not(:disabled)');assert.equal(absent.dataset.examAbsent,'2 - MARIA TESTE');absent.checked=true;
    app.container.querySelector('[data-exam=prepare]').click();await settle();
    // Model the native SIAP mutual-exclusion behavior after its checkbox event.
    const row=app.w.document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista tr')[1];
    row.cells[2].querySelector('input').checked=false;
    for(let i=0;i<10;i++)await app.tick();
    assert.equal(row.cells[1].querySelector('input').checked,true);
    assert.equal(row.cells[5].querySelector('input').value,'14');
    assert.equal(app.getState().queue.phase,'done');assert.equal(app.getSaves(),0);
    assert.match(app.container.textContent,/clique em Salvar/);
  }finally{app.dom.window.close();}
});
test('lista de possíveis faltas não mostra aluno com lançamento já salvo na chamada',async()=>{
  const app=await setup({html:fixture({filled:'9'})});
  try{
    assert.equal(app.container.querySelectorAll('[data-exam-absent]').length,0);
    assert.match(app.container.textContent,/sem acerto, presença ou falta já registrados nesta chamada/i);
  }finally{app.dom.window.close();}
});
test('mudança de turma entre revisão e aplicação bloqueia o preenchimento',async()=>{
  const app=await setup();
  try{
    app.w.document.getElementById('cphFuncionalidade_cphCampos_txtTurma').value='7A';
    app.container.querySelector('[data-exam=prepare]').click();await settle();
    assert.equal(app.getState().queue,null);
    assert.equal(app.w.document.querySelector('#check_0_0').checked,false);
    assert.match(app.container.textContent,/mudou/);
  }finally{app.dom.window.close();}
});
test('resultado incerto permanece sem lançamento mesmo com confirmação do lote',async()=>{
  const app=await setup();
  try{
    app.container.querySelector('[data-exam-answers]').value=['?',...Array(14).fill('A')].join(' ');
    app.container.querySelector('[data-exam=prepare]').click();await settle();
    assert.equal(app.getState().queue,null);assert.equal(app.getSaves(),0);
    assert.match(app.container.textContent,/marcações duvidosas/);
  }finally{app.dom.window.close();}
});

test('QR somente após abrir a avaliação com alunos; criação automática ao entrar',async()=>{
 const selecting=await setup({selecting:true});try{assert.equal(selecting.container.querySelector('[data-exam=start]').disabled,true);assert.equal(selecting.container.querySelector('[data-exam-qr]'),null);}finally{selecting.dom.window.close();}
 const entry=await setup();try{assert.ok(entry.container.querySelector('[data-exam-qr] svg'));assert.equal(entry.getState().awaitingEvaluation,false);}finally{entry.dom.window.close();}
});

test('sessão de outra escola não é reaproveitada',async()=>{
 const app=await setup();const state=app.getState();app.dom.window.close();
 const wrong=await setup({initialState:state,html:fixture({school:'Outra escola'})});try{assert.equal(wrong.container.querySelector('[data-exam=adopt]'),null);assert.equal(wrong.container.querySelector('[data-exam=prepare]'),null);}finally{wrong.dom.window.close();}
});

test('painel explica ausência de provas e incompatibilidade de quantidade antes de liberar lote',async()=>{
 const empty=await setup();
 try {
  empty.items.splice(1);await empty.tick();
  assert.match(empty.container.querySelector('[data-exam-ready]').textContent,/apenas o gabarito/);
  assert.equal(empty.container.querySelector('[data-exam=prepare]').disabled,true);
 }finally{empty.dom.window.close();}
 const mismatch=await setup({html:fixture({total:20})});
 try {
  assert.match(mismatch.container.querySelector('[data-exam-ready]').textContent,/gabarito tem 15.*SIAP tem 20/);
  assert.equal(mismatch.container.querySelector('[data-exam=prepare]').disabled,true);
 }finally{mismatch.dom.window.close();}
});

test('identificados seguem sem nome ilegível e sem salvar parcialmente',async()=>{
 const app=await setup();try{
 app.items.push({...structuredClone(app.items[1]),id:crypto.randomUUID(),result:{...structuredClone(app.items[1].result),name:''}});
 await app.tick();
 assert.match(app.container.querySelector('[data-exam-summary]').textContent,/1 prova.*1 pend/);
 app.container.querySelector('[data-exam=prepare]').click();await settle();
 app.w.document.querySelector('#check_0_1').checked=false;
 for(let i=0;i<8;i++)await app.tick();
 assert.equal(app.getState().queue.phase,'done');assert.equal(app.getState().queue.autoSave,false);assert.equal(app.getSaves(),0);
 assert.equal(app.w.document.querySelector('#check_1_0').checked,false);
 assert.match(app.container.textContent,/complete manualmente/);
 }finally{app.dom.window.close();}
});


test('conferência no celular atualiza painel e libera só resultados confirmados',async()=>{
 const app=await setup({mobile:true});try{
 assert.equal(app.container.querySelector('[data-exam=prepare]').disabled,true);
 app.items[1].review={studentId:'1 - JOÃO PEDRO TESTE',answers:Array(15).fill('A'),reviewed:true};
 await app.tick();
 assert.equal(app.container.querySelector('[data-exam=prepare]').disabled,false);
 assert.equal(app.container.querySelector('[data-exam-answers]').value,Array(15).fill('A').join(' '));
 assert.match(app.container.querySelector('[data-exam-score]').textContent,/15\/15/);
 }finally{app.dom.window.close();}
});


test('troca de turma gera outra sessao com contexto atual e preserva a anterior',async()=>{
 const app=await setup({mobile:true});try{
  const old=app.getState();
  app.w.document.getElementById('cphFuncionalidade_cphCampos_txtTurma').value='7A';
  await app.tick();
  const next=app.getState();
  assert.notEqual(next.room.id,old.room.id);
  assert.match(app.calls.at(-1).body.context,/7A/);
  assert.equal(next.previousSessions[0].room.id,old.room.id);
  assert.ok(app.container.querySelector('[data-exam-qr] svg'));
  assert.equal(app.getSaves(),0);
 }finally{app.dom.window.close();}
});
test('resultado confirmado substitui acerto já preenchido na mesma chamada',async()=>{
 const app=await setup();try{
  const row=app.w.document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista tr')[1];
  row.cells[5].querySelector('input').value='9';
  app.container.querySelector('[data-exam-absent]:not(:disabled)').checked=true;
  app.container.querySelector('[data-exam=prepare]').click();await settle();
  const absentRow=app.w.document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista tr')[2];
  row.cells[2].querySelector('input').checked=false;
  for(let i=0;i<14;i++)await app.tick();
  assert.equal(row.cells[5].querySelector('input').value,'14');
  assert.equal(absentRow.cells[5].querySelector('input').value,'');
  assert.equal(app.getSaves(),0);
  assert.match(app.container.textContent,/substituem acertos/);
 }finally{app.dom.window.close();}
});
test('segunda chamada preserva o resultado já marcado como presente na primeira',async()=>{
 const app=await setup({html:fixture({filled:'9'})});try{
  const row=app.w.document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista tr')[1];
  row.cells[1].querySelector('input').checked=true;
  row.cells[2].querySelector('input').checked=false;
  const call=app.container.querySelector('[data-exam-call]');call.value='2';call.dispatchEvent(new app.w.Event('change'));
  app.container.querySelector('[data-exam=prepare]').click();await settle();
  assert.equal(row.cells[5].querySelector('input').value,'9');
  assert.equal(row.cells[3].querySelector('input').checked,false);
  assert.equal(row.cells[4].querySelector('input').checked,false);
  assert.match(app.container.textContent,/outra chamada/);
  assert.equal(app.getSaves(),0);
 }finally{app.dom.window.close();}
});

test('retomar a leitura usa a sessão e o crédito já abertos, sem criar outro bloco',async()=>{
 const app=await setup({mobile:true});try{
  const room=app.getState().room.id;
  const creates=app.calls.filter(call=>call.action==='create').length;
  const button=app.container.querySelector('[data-exam=continueCapture]');
  assert.ok(button);
  button.click();await settle();
  assert.equal(app.getState().room.id,room);
  assert.equal(app.calls.filter(call=>call.action==='create').length,creates);
  assert.equal(app.getSaves(),0);
 }finally{app.dom.window.close();}
});
test('troca de disciplina nao reutiliza QR de portugues',async()=>{
 const app=await setup({mobile:true});try{
  const old=app.getState();
  app.w.document.getElementById('cphFuncionalidade_cphCampos_txtDisciplina').value='Matemática';
  await app.tick();
  assert.notEqual(app.getState().room.id,old.room.id);
  assert.equal(app.calls.at(-1).body.assessment.subject,'Matemática');
  assert.equal(app.container.querySelector('[data-exam=adopt]'),null);
  assert.equal(app.getSaves(),0);
 }finally{app.dom.window.close();}
});

test('leitura do QR atualiza credito disponivel para bloco em andamento',async()=>{
 const app=await setup({mobile:true,scanRequested:true});try{
  await app.tick();
  assert.deepEqual(app.accessUpdates.at(-1),{active:true,status:'block',credits:0,openBlocks:1});
 }finally{app.dom.window.close();}
});


test('novas provas aparecem com foco preservado no painel e sem iniciar lote',async()=>{
 const a=await setup({mobile:true});try{
 a.container.querySelector('[data-exam=close]').focus();
 for(let n=0;n<2;n++){a.items.push({...structuredClone(a.items[1]),id:crypto.randomUUID(),selectedStudentId:'2 - MARIA TESTE'});await a.tick();}
 assert.equal(a.container.querySelectorAll('[data-exam-item]').length,3);
 assert.equal(a.w.document.activeElement.dataset.exam,'close');assert.equal(a.getState().queue,null);assert.equal(a.getSaves(),0);
 }finally{a.dom.window.close();}
});
test('poll preserva edição, cursor e detalhes abertos ao receber outra prova',async()=>{
 const a=await setup();try{
 const field=a.container.querySelector('[data-exam-answers]');field.value=Array(15).fill('B').join(' ');field.focus();field.setSelectionRange(2,4);
 const details=field.closest('details');details.open=true;
 a.items.push({...structuredClone(a.items[1]),id:crypto.randomUUID()});await a.tick();
 const current=a.container.querySelector('[data-exam-answers]');assert.equal(current.value,Array(15).fill('B').join(' '));assert.equal(a.w.document.activeElement,current);assert.equal(current.selectionStart,2);assert.equal(current.selectionEnd,4);assert.equal(current.closest('details').open,true);
 }finally{a.dom.window.close();}
});
test('erro transitório reconecta e mostra resultados sem retomar lote',async()=>{
 const a=await setup();try{
 const send=a.w.chrome.runtime.sendMessage;let statuses=0;
 a.w.chrome.runtime.sendMessage=async msg=>{if(msg.action==='status'){statuses++;return {ok:false,error:'falha transitória'};}return send(msg);};await a.tick();
 a.w.chrome.runtime.sendMessage=async msg=>{if(msg.action==='status')statuses++;return send(msg);};
 a.items.push({...structuredClone(a.items[1]),id:crypto.randomUUID()});await a.tick();
 assert.equal(statuses,2);assert.equal(a.container.querySelectorAll('[data-exam-item]').length,2);assert.equal(a.getSaves(),0);
 }finally{a.dom.window.close();}
});
test('fila persistida exige retomada explícita após recarregar',async()=>{
 const first=await setup();first.container.querySelector('[data-exam=prepare]').click();await settle();const state=first.getState();first.dom.window.close();
 const a=await setup({initialState:state});try{
 assert.equal(a.getState().queue.paused,true);assert.equal(a.w.document.querySelector('#check_0_0').checked,false);assert.ok(a.container.querySelector('[data-exam=resume]'));assert.equal(a.getSaves(),0);
 }finally{a.dom.window.close();}
});
test('mudança de gabarito ou respostas interrompe o lote antes da nota',async()=>{
 for(const change of ['key','review']){
 const a=await setup();try{
 a.container.querySelector('[data-exam=prepare]').click();await settle();a.w.document.querySelector('#check_0_1').checked=false;
 if(change==='key')a.items[0].result.answers.fill('B');else a.items[1].review.answers.fill('B');
 await a.tick();assert.equal(a.getState().queue.paused,true);assert.equal(a.w.document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista tr')[1].cells[5].querySelector('input').value,'');assert.equal(a.getSaves(),0);
 a.container.querySelector('[data-exam=cancelBatch]').click();await settle();assert.equal(a.getState().queue,null);
 }finally{a.dom.window.close();}}
});
test('resultado alterado antes do envio exige nova conferência',async()=>{
 const a=await setup();try{
 a.items[1].review={studentId:'1 - JOÃO PEDRO TESTE',answers:Array(15).fill('B'),reviewed:true};
 a.container.querySelector('[data-exam=prepare]').click();await settle();assert.equal(a.getState().queue,null);assert.equal(a.w.document.querySelector('#check_0_0').checked,false);
 }finally{a.dom.window.close();}
});
test('segunda chamada preserva o resultado já confirmado na primeira',async()=>{
 const a=await setup();try{
 a.container.querySelector('[data-exam=prepare]').click();await settle();a.w.document.querySelector('#check_0_1').checked=false;for(let i=0;i<8;i++)await a.tick();
 const call=a.container.querySelector('[data-exam-call]');call.value='2';call.dispatchEvent(new a.w.Event('change'));
 assert.equal(a.container.querySelector('[data-exam=prepare]').disabled,true);assert.match(a.container.querySelector('[data-exam-summary]').textContent,/outra chamada/);
 }finally{a.dom.window.close();}
});
test('encerrar tenta todas as sessões e preserva referência se exclusão falhar',async()=>{
 const a=await setup({mobile:true});try{
 a.w.document.getElementById('cphFuncionalidade_cphCampos_txtTurma').value='7A';await a.tick();const send=a.w.chrome.runtime.sendMessage,closed=[];
 a.w.chrome.runtime.sendMessage=async msg=>{if(msg.action==='close'){closed.push(msg.room);return {ok:false,error:'offline'};}return send(msg);};
 a.container.querySelector('[data-exam=close]').click();await settle();assert.ok(a.getState().room);assert.match(a.container.textContent,/Não foi possível confirmar/);
 a.w.chrome.runtime.sendMessage=async msg=>{if(msg.action==='close')closed.push(msg.room);return send(msg);};a.container.querySelector('[data-exam=close]').click();await settle();
 assert.equal(new Set(closed).size,2);assert.equal(a.getState(),null);
 }finally{a.dom.window.close();}
});


test('reconexão sem resultado novo reabilita painel e informa recuperação',async()=>{
 const a=await setup();try{
 const send=a.w.chrome.runtime.sendMessage;a.w.chrome.runtime.sendMessage=async msg=>msg.action==='status'?{ok:false,error:'offline'}:send(msg);await a.tick();assert.equal(a.container.querySelector('[data-exam=prepare]').disabled,true);
 a.w.chrome.runtime.sendMessage=send;await a.tick();assert.equal(a.container.querySelector('[data-exam=prepare]').disabled,false);assert.match(a.container.textContent,/Conexão recuperada/);
 }finally{a.dom.window.close();}
});
