const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/service-worker.js'), 'utf8');
function startWorker(deviceSession, fetchImpl, onBroadcast) {
  const listeners = [];
  const chrome = {
    runtime: { getManifest: () => ({version:'0.23.0'}), onMessage:{addListener: fn => listeners.push(fn)}, onMessageExternal:{addListener: () => {}} },
    storage: { local:{get: async () => ({carometroAiDeviceSession:deviceSession}), set:async()=>{}, remove:async()=>{}}, session:{get:async()=>({}),set:async()=>{}} },
    tabs:{onRemoved:{addListener:()=>{}},query:async()=>onBroadcast ? [{id:1}] : [],sendMessage:async(_id, message)=>onBroadcast?.(message)}
  };
  const context = vm.createContext({chrome,fetch:fetchImpl,URL,Date,JSON,String,Number,Promise,AbortSignal});
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context));
  vm.runInContext(source, context);
  return (message, sender={}) => new Promise(resolve => { for (const fn of listeners) if (fn(message,sender,resolve) === true) break; });
}
test('licença concedida usa sessão do Assistente sem sessão web do Carômetro', async () => {
  const session = {deviceToken:'test-device-token',expiresAt:Date.now()+60000};
  let call;
  const worker = startWorker(session, async (url, options) => {
    call={url,options};
    return {ok:true,status:200,json:async()=>({ok:true,fields:['a','b','c','d'],license:{active:true,mode:'carometro',daysRemaining:4}})};
  });
  const result = await worker({type:'ASSISTENTE_SIAP_AI_DRAFT',payload:{kind:'planning'}});
  assert.equal(result.ok,true);
  assert.equal(result.license.mode,'carometro');
  assert.equal(call.options.headers['X-Assistant-Session'],'test-device-token');
});
test('sessão local ausente preserva prévias e não chama IA', async () => {
  const worker = startWorker(null, async () => { throw new Error('fetch não esperado'); });
  const result = await worker({type:'ASSISTENTE_SIAP_AI_DRAFT',payload:{kind:'planning'}});
  assert.equal(result.ok,false);
  assert.equal(result.code,'ASSISTANT_SESSION_REQUIRED');
  assert.match(result.message,/prévias foram preservadas/);
  assert.doesNotMatch(result.message,/Carômetro/);
});
test('outra conta gratuita nao substitui o cartao da licenca concedida', async () => {
  const session = {deviceToken:'granted-device-token',expiresAt:Date.now()+60000};
  const broadcasts=[];
  const worker = startWorker(session, async () => ({ok:false,status:402,json:async()=>({
    ok:false,code:'persistent_session_not_allowed',license:{active:true,mode:'external',freeUses:{planning:2}}
  })}), message => broadcasts.push(message));
  const result = await worker({type:'CAROMETRO_SIAP_CONNECT_INTERNAL',accessToken:'other-user-token',expiresAt:Date.now()+60000}, {tab:{url:'https://sistemacarometro.com.br/'}});
  assert.equal(result.ok,true);
  assert.equal(result.temporary,true);
  assert.equal(broadcasts.length,0);
});
