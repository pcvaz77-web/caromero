import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fixture, selectionFixture } from './fixture.mjs';
const dir=new URL('../../../extensions/assistente-siap/src/',import.meta.url);
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
async function setup({selecting=false, initialState=null, ranges=null, html=null,mobile=false}={}) {
  const dom=new JSDOM(html || (selecting ? selectionFixture() : fixture()),{url:'https://siap.educacao.go.gov.br/' + (selecting ? 'LancamentoNotasModeloListagem.aspx' : 'LancamentoNotasModeloEdicao.aspx'),runScripts:'outside-only'}), w=dom.window;
  const timers=[]; w.setTimeout=fn=>{timers.push(fn);return timers.length;};w.clearTimeout=()=>{};
  const room={id:crypto.randomUUID(),desktop:'a'.repeat(64),mobile:'b'.repeat(64),expires:Date.now()+100000};
  const key={alphabet:'ABCD',answers:Array(15).fill('A'),ranges:ranges || [{subject:'Língua Portuguesa',from:1,to:15}]};
  const items=[{id:crypto.randomUUID(),kind:'official',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:''}}, {id:crypto.randomUUID(),kind:'student',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:'JOÃO PEDRO TESTE',answers:['B',...Array(14).fill('A')]}}];
  let stored=initialState,saves=0;
  const saveButton=w.document.querySelector('#cphFuncionalidade_btnAlterar');if(saveButton)saveButton.onclick=()=>saves++;
  w.chrome={runtime:{sendMessage:async msg=>{
    if(msg.type==='SIAP_EXAM_STATE_GET')return {ok:true,value:structuredClone(stored)};
    if(msg.type==='SIAP_EXAM_STATE_PUT'){stored=structuredClone(msg.value);return {ok:true};}
    if(msg.action==='create')return {ok:true,...room};
    if(msg.action==='status')return {ok:true,key,items:structuredClone(items),active:true,mobileWorkflow:mobile,roster:[]};
    return {ok:true};
  }}};
  for(const file of ['exam-config.js','vendor/qrcode.js','exam-core.js','exam-dom.js','exam-panel.js'])w.eval(readFileSync(new URL(file,dir),'utf8'));
  const container=w.document.createElement('aside');w.document.body.append(container);w.SiapExamPanel.mount(container);await settle();
  if(!initialState)container.querySelector('[data-exam=start]')?.click();await settle();
  return {w,dom,container,items,timers,getState:()=>stored,getSaves:()=>saves,tick:async()=>{const fn=timers.shift();if(fn)await fn();await settle();}};
}
test('painel gera QR e salva uma única vez quando todos têm resultado ou falta confirmada',async()=>{
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
    assert.equal(app.getState().queue.phase,'done');assert.equal(app.getSaves(),1);
    assert.match(app.container.textContent,/Salvamento solicitado/);
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
