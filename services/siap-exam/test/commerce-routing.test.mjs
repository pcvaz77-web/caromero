import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=readFileSync(new URL('../../../supabase/functions/hotmart-payment-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'');
test('oferta com correção e estorno seguem cobrança nova, sem tocar pagamento antigo',async()=>{
 for(const refund of [false,true]){
  const touched=[],forwarded=[];let handle;
  const admin={from:table=>{
   touched.push(table);const query={select(){return query},eq(){return query},limit(){return query},maybeSingle:async()=>({data:table==='siap_exam_offers'&&!refund?{offer_key:'monthly_exam'}:table==='siap_exam_purchases'&&refund?{order_id:'original'}:null,error:null})};return query;
  }};
  const env={HOTMART_HOTTOK:'secret-test',SUPABASE_URL:'https://project.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'};
  new Function('Deno','createClient','fetch',stripTypeScriptTypes(source))({env:{get:key=>env[key]},serve:fn=>handle=fn},()=>admin,async(url,options)=>{forwarded.push({url,options});return new Response('{"ok":true}',{status:200})});
  const body={version:'2.0.0',id:'event',event:refund?'PURCHASE_REFUNDED':'PURCHASE_APPROVED',data:{product:{id:8470115},purchase:{transaction:'tx-new',offer:refund?null:{code:'new-bundle'}}}};
  const result=await handle(new Request('https://project.invalid/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-hotmart-hottok':'secret-test'},body:JSON.stringify(body)}));
  assert.equal(result.status,200);assert.equal(forwarded.length,1);assert.equal(forwarded[0].url,'https://project.invalid/functions/v1/siap-exam-commerce');
  assert.deepEqual(JSON.parse(forwarded[0].options.body),body);
  assert.deepEqual(touched,['siap_exam_offers','siap_exam_purchases']);
 }
});
