import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const landing=readFileSync(new URL('../../../assistente-siap.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../../../assistente-siap.js',import.meta.url),'utf8');
async function setup(ready=true){
 const dom=new JSDOM(landing,{url:'https://site.test/assistente-siap.html',runScripts:'outside-only'}),w=dom.window;
 w.IntersectionObserver=class {observe(){}};
 w.CAROMETRO_RUNTIME_CONFIG={backendConfigured:true};
 const plans=[{plan_key:'monthly',amount:79.90,billing_months:1},{plan_key:'quarterly',amount:129.90,billing_months:3}];
 const offers=[{offer_key:'monthly_exam',amount:114.90,active:ready},{offer_key:'quarterly_exam',amount:174.90,active:ready},{offer_key:'exam_one',amount:20,active:ready},{offer_key:'exam_four',amount:80,active:ready}];
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},from:table=>{const chain={select:()=>chain,eq:()=>chain,order:()=>chain,then:(resolve,reject)=>Promise.resolve({data:table==='siap_exam_offers'?offers:plans,error:null}).then(resolve,reject)};return chain;}})};
 w.eval(js);for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));return {w,dom};
}
test('preços atuais permanecem; marcar correção soma 35 ou 45 ao total',async()=>{
 const {w,dom}=await setup();try{
 for(const [plan,total] of [['monthly','114,90'],['quarterly','174,90']]){
 const addon=w.document.querySelector(`[data-exam-addon="${plan}"]`),button=w.document.querySelector(`[data-assistant-plan="${plan}"]`);
 assert.equal(button.disabled,false);addon.checked=true;addon.dispatchEvent(new w.Event('change'));
 assert.match(button.closest('article').querySelector('.price').textContent,new RegExp(total));assert.equal(button.disabled,false);
 }
 assert.equal(w.document.querySelector('[data-exam-offer="exam_one"]').disabled,false);
 }finally{dom.window.close();}
});
test('ofertas não configuradas nunca abrem compra; mensal antigo continua disponível',async()=>{
 const {w,dom}=await setup(false);try{
 const addon=w.document.querySelector('[data-exam-addon="monthly"]'),button=w.document.querySelector('[data-assistant-plan="monthly"]');
 assert.equal(button.disabled,false);addon.checked=true;addon.dispatchEvent(new w.Event('change'));assert.equal(button.disabled,true);
 addon.checked=false;addon.dispatchEvent(new w.Event('change'));assert.equal(button.disabled,false);
 assert.equal(w.document.querySelector('[data-exam-offer="exam_one"]').disabled,true);
 }finally{dom.window.close();}
});
