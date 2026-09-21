import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../../../supabase/functions/siap-exam-commerce/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
function app({logged=true}={}) {
 const calls=[],writes=[];
 const order={id:'order',user_id:'real-user',offer_key:'exam_one',amount:20,credits:1,months:0,product_id:123,offer_code:'real-offer',payer_email:'test@example.invalid'};
 const rows={siap_exam_offers:{...order,active:true,checkout_url:'https://pay.hotmart.com/TEST?off=real-offer'},siap_exam_orders:order,siap_exam_purchases:null};
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id:'real-user',email:'test@example.invalid'}}})}},rpc:async(name,args)=>{calls.push({name,args});return {data:{active:true,credits:1},error:null};},from:table=>{
  const filters=[];const b={select(){return b},eq(k,v){filters.push([k,v]);return b},in(){return b},order(){return b},limit(){return b},insert(v){writes.push({table,v});return Promise.resolve({error:null})},maybeSingle(){let data=rows[table];if(data&&filters.some(([k,v])=>data[k]!==v))data=null;return Promise.resolve({data,error:null})},single(){return b.maybeSingle()}};return b;
 }};
 const caller={auth:{getUser:async()=>({data:{user:logged?{id:'real-user',email:'test@example.invalid'}:null}})}};
 let handle;const values={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'service-test',SUPABASE_ANON_KEY:'anon-test',HOTMART_HOTTOK:'test-secret',ALLOWED_ORIGINS:'https://site.test'};
 new Function('Deno','createClient',stripTypeScriptTypes(source))({env:{get:k=>values[k]},serve:fn=>handle=fn},(_url,key)=>key==='service-test'?admin:caller);
 return {calls,writes,rows,request:(body,headers={})=>handle(new Request('https://test.invalid/function',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}))};
}
const event=(extra={})=>({version:'2.0.0',event:'PURCHASE_APPROVED',data:{product:{id:123},buyer:{email:'test@example.invalid'},purchase:{transaction:'tx',approved_date:Date.now(),offer:{code:'real-offer'},price:{value:20,currency_value:'BRL'},payment:{type:'PIX'},...extra}}});
test('checkout exige conta real e aceite; preço e quantidade vêm do catálogo',async()=>{
 const a=app();let r=await a.request({action:'checkout',offerKey:'exam_one',legalAccepted:true,amount:0,user_id:'other'},{Origin:'https://site.test'});
 assert.equal(r.status,200);assert.equal(a.writes[0].v.amount,20);assert.equal(a.writes[0].v.user_id,'real-user');
 assert.equal((await a.request({action:'checkout',offerKey:'exam_one'},{Origin:'https://site.test'})).status,400);
 assert.equal((await app({logged:false}).request({action:'checkout',legalAccepted:true},{Origin:'https://site.test'})).status,401);
 assert.equal((await a.request({action:'checkout',legalAccepted:true},{Origin:'https://evil.test'})).status,403);
});
test('webhook exige autenticação, valor, moeda e oferta corretos antes da concessão',async()=>{
 const a=app(),headers={'x-hotmart-hottok':'test-secret'};
 assert.equal((await a.request(event())).status,401);
 for(const change of [{price:{value:1,currency_value:'BRL'}},{price:{value:20,currency_value:'USD'}},{offer:{code:'wrong'}}]) assert.equal((await a.request(event(change),headers)).status,409);
 assert.equal(a.calls.length,0);assert.equal((await a.request(event(),headers)).status,200);
 assert.equal(a.calls[0].args.p_event,'approved');
});
test('compra avulsa aceita Pix e cartão aprovados pela Hotmart, mas não pagamento pendente',async()=>{
 for(const type of ['PIX','CREDIT_CARD']) {
  const a=app(),headers={'x-hotmart-hottok':'test-secret'};
  const pending=event({payment:{type}});pending.event='PURCHASE_BILLET_PRINTED';
  assert.equal((await a.request(pending,headers)).status,200);assert.equal(a.calls.length,0);
  assert.equal((await a.request(event({payment:{type}}),headers)).status,200);
  assert.equal(a.calls[0].args.p_event,'approved');
 }
});
test('reembolso usa a transação original, sem exigir oferta ainda ativa',async()=>{
 const a=app();a.rows.siap_exam_offers=null;a.rows.siap_exam_purchases={transaction_id:'tx',order_id:'order'};
 const body=event({offer:null,payment:null});body.event='PURCHASE_REFUNDED';
 assert.equal((await a.request(body,{'x-hotmart-hottok':'test-secret'})).status,200);assert.equal(a.calls[0].args.p_event,'revoked');
});
