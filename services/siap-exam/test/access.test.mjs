import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import worker from '../worker.mjs';
import {examAccessForUser} from '../../../supabase/functions/generate-siap-ai-draft/exam-access.mjs';
const adminFor=(data,error=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data,error})})})})});
test('correção concede acesso separado e falha fechada em ausência, erro, revogação e vencimento',async()=>{
 const now=Date.now();
 for(const [data,error] of [[null,null],[null,{}],[{expires_at:new Date(now-1).toISOString(),revoked_at:null},null],[{expires_at:null,revoked_at:'2026-01-01'},null],[{expires_at:'invalid',revoked_at:null},null]]) assert.equal((await examAccessForUser(adminFor(data,error),'test',now)).active,false);
 for(const expires_at of [null,new Date(now+86400000).toISOString()]) assert.equal((await examAccessForUser(adminFor({expires_at,revoked_at:null}),'test',now)).active,true);
});
test('serviço não aceita licença geral como acesso à correção',async()=>{
 const original=globalThis.fetch;let license={active:true,mode:'subscription'},created=false;
 const env={EXTENSION_ORIGINS:'chrome-extension://test',LICENSE_ENDPOINT:'https://license.test',EXAMS:{idFromName:x=>x,get:()=>({fetch:async req=>{if(new URL(req.url).pathname==='/init')created=true;return Response.json({ok:true});}})}};
 const request=()=>new Request('https://exam.test/api/create',{method:'POST',headers:{Origin:'chrome-extension://test',Authorization:'Bearer fake'},body:'{}'});
 try{
 globalThis.fetch=async()=>Response.json({ok:true,license});
 assert.equal((await worker.fetch(request(),env)).status,403);assert.equal(created,false);
 license={active:false,examAccess:{active:true,expiresAt:null}};
 assert.equal((await worker.fetch(request(),env)).status,200);assert.equal(created,true);
 }finally{globalThis.fetch=original;}
});
const source=readFileSync(new URL('../../../platform-owner-dashboard.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<div id="platformSiapSchoolAccess"></div>',{runScripts:'outside-only'});const w=dom.window,calls=[];
 const members=[{school_id:'s1',school_name:'Escola A',user_id:'u1',full_name:'Professor Teste',member_role:'teacher',member_status:'active'},{school_id:'s2',school_name:'Escola B',user_id:'u1',full_name:'Professor Teste',member_role:'teacher',member_status:'active'}];
 w.esc=s=>String(s??'').replaceAll('<','&lt;');w.shortDate=s=>s.slice(0,10);w.toast=()=>{};
 w.db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='platform_list_siap_school_users'?members:name==='platform_list_siap_exam_access'?[{user_id:'u1',active:true,expires_at:null}]:{},error:null};}};
 w.eval(source.slice(source.indexOf('  function renderSiapSchoolAccess('),source.indexOf('  function limitLabel('))+';window.renderAccess=renderSiapSchoolAccess;window.updateAccess=updateExamAccess;');
 w.renderAccess(members,null,[],null);return {w,calls,dom};
}
test('dono concede correção pela conta, mantém escola aberta e atualiza conta nas duas escolas',async()=>{
 const {w,calls,dom}=setup();
 w.document.querySelector('[data-school-id="s2"]').open=true;
 const card=w.document.querySelector('[data-school-id="s2"] [data-exam-access]');
 card.querySelector('select').value='permanent';
 await w.updateAccess(card.querySelector('[data-exam-grant]'),true);
 assert.equal(calls[0].name,'platform_set_siap_exam_access');assert.equal(calls[0].args.p_user_id,'u1');assert.equal(calls[0].args.p_expires_at,null);
 assert.equal(w.document.querySelectorAll('[data-exam-revoke]').length,2);
 assert.equal(w.document.querySelector('[data-school-id="s2"]').open,true);
 assert.equal(calls.some(c=>c.name==='platform_set_siap_assistant_access'),false);dom.window.close();
});
test('data final é local ao usuário selecionado, inválida não grava; cancelamento só altera correção',async()=>{
 const {w,calls,dom}=setup();const card=w.document.querySelector('[data-school-id="s2"] [data-exam-access]'),select=card.querySelector('select');
 select.value='custom';select.onchange();assert.equal(card.querySelector('input').classList.contains('hidden'),false);
 await w.updateAccess(card.querySelector('button'),true);assert.equal(calls.length,0);
 card.querySelector('input').value='2099-05-10';await w.updateAccess(card.querySelector('button'),true);
 assert.equal(calls[0].args.p_expires_at,'2099-05-11T02:59:59.000Z');
 const revoke=w.document.querySelector('[data-exam-revoke]');await w.updateAccess(revoke,false);
 assert.equal(calls.find(c=>c.args?.p_enabled===false).name,'platform_set_siap_exam_access');dom.window.close();
});

test('revogação detectada no heartbeat pausa a sessão anterior',async()=>{
 const original=globalThis.fetch;let paused=false;
 const id=crypto.randomUUID();
 try{
 globalThis.fetch=async()=>Response.json({ok:true,license:{active:true,examAccess:{active:false,status:'revoked'}}});
 const env={EXTENSION_ORIGINS:'chrome-extension://test',LICENSE_ENDPOINT:'https://license.test',EXAMS:{idFromName:x=>x,get:()=>({fetch:async req=>{paused=new URL(req.url).pathname==='/pause'&&(await req.json()).paused===true;return Response.json({ok:true});}})}};
 const response=await worker.fetch(new Request(`https://exam.test/api/${id}/heartbeat`,{method:'POST',headers:{Origin:'chrome-extension://test','X-Exam-Token':'a'.repeat(64)},body:'{}'}),env);
 assert.equal(response.status,403);assert.equal(paused,true);
 }finally{globalThis.fetch=original;}
});
