import test from 'node:test';
import assert from 'node:assert/strict';
import {examAccessForUser} from '../supabase/functions/generate-siap-ai-draft/exam-access.mjs';
function adminFor({account='active',member='active',school='active',subscription='active',expires=null,legacy=null}={}){
 const rows={platform_account_access:account?{user_id:'user-1',status:account}:null,school_members:member?[{user_id:'user-1',school_id:'school-1',status:member}]:[],schools:school?[{id:'school-1',status:school}]:[],school_subscriptions:subscription?[{school_id:'school-1',status:subscription,grant_expires_at:expires}]:[],siap_exam_access_grants:null};
 return {from(name){const filters=[];const read=()=>{let data=rows[name];if(Array.isArray(data))data=data.filter(row=>filters.every(([column,value])=>row[column]===value));else if(data&&filters.some(([column,value])=>data[column]!==value))data=null;return {data,error:null};};const query={select(){return this;},eq(column,value){filters.push([column,value]);return this;},in(){return this;},maybeSingle:async()=>read(),then(resolve,reject){return Promise.resolve(read()).then(resolve,reject);}};return query;},rpc:async()=>({data:legacy,error:null})};
}
test('acesso ativo ao Carômetro inclui correção sem crédito',async()=>{
 assert.deepEqual(await examAccessForUser(adminFor(),'user-1'),{active:true,expiresAt:null,status:'carometro'});
});
test('escola suspensa ou assinatura vencida não liberam nova sessão',async()=>{
 assert.equal((await examAccessForUser(adminFor({school:'suspended'}),'user-1')).active,false);
 assert.equal((await examAccessForUser(adminFor({expires:'2020-01-01T00:00:00Z'}),'user-1')).active,false);
});
test('acesso legado já comprado continua válido',async()=>{
 const legacy={active:true,status:'credits',credits:1};
 assert.deepEqual(await examAccessForUser(adminFor({account:null,legacy}),'user-1'),legacy);
});
