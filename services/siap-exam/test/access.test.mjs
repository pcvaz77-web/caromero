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
 w.db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='platform_list_siap_school_users'?members:{},error:null};}};
 w.eval('const siapSchoolAccessState = { query:"", openSchools:new Set() };'+source.slice(source.indexOf('  function renderSiapSchoolAccess('),source.indexOf('  function limitLabel('))+';window.renderAccess=renderSiapSchoolAccess;window.refreshAccess=refreshSiapSchoolAccess;');
 w.renderAccess(members,null);return {w,calls,dom};
}
test('painel do dono mostra apenas concessão do Assistente SIAP',async()=>{
 const {w,calls,dom}=setup();
 w.document.querySelector('[data-school-id="s2"]').open=true;
 await w.refreshAccess();
 assert.equal(calls.length,1);assert.equal(calls[0].name,'platform_list_siap_school_users');
 assert.equal(w.document.querySelectorAll('[data-exam-access],[data-exam-grant],[data-exam-revoke]').length,0);
 assert.equal(w.document.querySelectorAll('[data-siap-grant]').length,2);
 assert.equal(w.document.querySelector('[data-school-id="s2"]').open,true);
 dom.window.close();
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
