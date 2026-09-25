import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeDeviceFreeUse} from '../../../supabase/functions/generate-siap-ai-draft/device-free-use.mjs';

function fakeUsageStore() {
  const rows=new Map();
  return {
    rows,
    admin:{from(table) {
      assert.equal(table,'siap_assistant_free_usage');
      const query={filters:{},operation:'',value:null};
      const builder={
        select(){return builder;},
        eq(key,value){query.filters[key]=value;return builder;},
        lt(key,value){query.filters[`lt:${key}`]=value;return builder;},
        insert(value){query.operation='insert';query.value=value;return builder;},
        update(value){query.operation='update';query.value=value;return builder;},
        async maybeSingle(){
          const key=`${query.filters.user_id??query.value.user_id}:${query.filters.feature_key??query.value.feature_key}`;
          const current=rows.get(key);
          if(query.operation==='insert') {
            if(current) return {data:null,error:{code:'23505'}};
            rows.set(key,{...query.value});return {data:rows.get(key),error:null};
          }
          if(query.operation==='update') {
            if(!current || current.used_count!==query.filters.used_count || current.used_count>=query.filters['lt:used_count']) return {data:null,error:null};
            rows.set(key,{...current,...query.value});return {data:rows.get(key),error:null};
          }
          return {data:current??null,error:null};
        }
      };
      return builder;
    }}
  };
}

test('sessão por e-mail consome exatamente os dois usos do teste grátis',async()=>{
  const store=fakeUsageStore();
  const status=async()=>{
    const used=store.rows.get('user-1:planning')?.used_count??0;
    return {active:used<2,mode:'external',status:'free',freeUses:{planning:2-used}};
  };
  assert.equal((await consumeDeviceFreeUse(store.admin,'user-1','planning',status)).remaining,1);
  assert.equal((await consumeDeviceFreeUse(store.admin,'user-1','planning',status)).remaining,0);
  assert.equal((await consumeDeviceFreeUse(store.admin,'user-1','planning',status)).allowed,false);
  assert.equal(store.rows.get('user-1:planning').used_count,2);
});

test('concessão vigente não consome cota e concessão encerrada é negada',async()=>{
  const store=fakeUsageStore();
  const grant=await consumeDeviceFreeUse(store.admin,'user-1','planning',async()=>({active:true,mode:'carometro'}));
  const ended=await consumeDeviceFreeUse(store.admin,'user-1','planning',async()=>({active:false,mode:'external',status:'grant_ended'}));
  assert.equal(grant.unlimited,true);
  assert.equal(ended.allowed,false);
  assert.equal(store.rows.size,0);
});
