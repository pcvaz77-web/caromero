const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/service-worker.js'), 'utf8');
function startWorker(deviceSession, fetchImpl, onBroadcast) {
  const listeners = [];
  const local = {carometroAiDeviceSession:deviceSession}; const sessionStore = {};
  const store = data => ({get:async()=>({...data}),set:async values=>Object.assign(data,values),remove:async keys=>{for(const key of [keys].flat()) delete data[key];}});
  const chrome = {
    runtime: { getManifest: () => ({version:'0.23.0'}), onMessage:{addListener: fn => listeners.push(fn)}, onMessageExternal:{addListener: () => {}} },
    storage: {local:store(local),session:store(sessionStore)},
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


test('sair remove as duas sessoes e exige reconexao explicita validada', async () => {
  let calls=0;const updates=[];
  const worker=startWorker({deviceToken:'old',expiresAt:Date.now()+60000},async()=>{
    calls++;return {ok:true,status:200,json:async()=>({ok:true,deviceToken:'new',expiresAt:new Date(Date.now()+120000).toISOString(),license:{active:true,accountEmail:'new@example.com'}})};
  },message=>updates.push(message));
  assert.equal((await worker({type:'ASSISTENTE_SIAP_SIGN_OUT'})).ok,true);
  assert.equal((await worker({type:'ASSISTENTE_SIAP_AI_STATUS'})).connected,false);
  const connect={type:'CAROMETRO_SIAP_CONNECT_INTERNAL',accessToken:'authenticated',expiresAt:Date.now()+60000};
  const sender={tab:{url:'https://sistemacarometro.com.br/'}};
  assert.equal((await worker(connect,sender)).code,'ASSISTANT_SIGNED_OUT');
  assert.equal(calls,0);
  assert.equal((await worker({...connect,explicit:true},sender)).ok,true);
  assert.equal((await worker({type:'ASSISTENTE_SIAP_AI_STATUS'})).connected,true);
  assert.equal(updates.at(-1).license.accountEmail,'new@example.com');
});

test('requisicao de conexao em andamento nao desfaz sair', async () => {
  let complete;let started;
  const ready=new Promise(resolve=>started=resolve);
  const worker=startWorker(null,()=>new Promise(resolve=>{complete=resolve;started();}));
  const pending=worker({type:'CAROMETRO_SIAP_CONNECT_INTERNAL',explicit:true,accessToken:'authenticated',expiresAt:Date.now()+60000},{tab:{url:'https://sistemacarometro.com.br/'}});
  await ready;await worker({type:'ASSISTENTE_SIAP_SIGN_OUT'});
  complete({ok:true,status:200,json:async()=>({ok:true,deviceToken:'late',expiresAt:new Date(Date.now()+120000).toISOString(),license:{active:true}})});
  assert.equal((await pending).code,'ASSISTANT_SIGNED_OUT');
  assert.equal((await worker({type:'ASSISTENTE_SIAP_AI_STATUS'})).connected,false);
});

test('email direto consulta o servidor e conecta apenas resposta autorizada', async()=>{
  let request;
  const worker=startWorker(null,async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,deviceToken:'credit-session',expiresAt:new Date(Date.now()+60000).toISOString(),license:{active:false,accountEmail:'paid@example.com',examAccess:{active:true}}})};});
  const result=await worker({type:'ASSISTENTE_SIAP_EMAIL_SIGN_IN',email:' Paid@Example.com '});
  assert.equal(request.action,'email_device_session');assert.equal(request.email,'paid@example.com');
  assert.equal(result.ok,true);assert.equal(result.license.active,false);assert.equal((await worker({type:'ASSISTENTE_SIAP_AI_STATUS'})).connected,true);
});
test('email sem direito nao grava sessao e falha de rede nao libera acesso', async()=>{
  for(const fetchImpl of [async()=>({ok:false,json:async()=>({ok:false,code:'no_active_access'})}),async()=>{throw Error('offline');}]) {
    const worker=startWorker(null,fetchImpl);
    assert.equal((await worker({type:'ASSISTENTE_SIAP_EMAIL_SIGN_IN',email:'none@example.com'})).ok,false);
    assert.equal((await worker({type:'ASSISTENTE_SIAP_AI_STATUS'})).connected,false);
  }
});
