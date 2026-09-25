const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');

function workerFor(license) {
  const listeners = [];
  const local = { carometroAiDeviceSession: { deviceToken:'active-device-token', expiresAt:Date.now()+60000 } };
  const storage = data => ({
    get:async key => key === null ? {...data} : Object.fromEntries([key].flat().map(name => [name,data[name]])),
    set:async values => Object.assign(data,values),
    remove:async key => { for (const name of [key].flat()) delete data[name]; }
  });
  const chrome = {
    runtime:{getManifest:()=>({version:'0.28.10'}),onMessage:{addListener:fn=>listeners.push(fn)},onMessageExternal:{addListener:()=>{}}},
    storage:{local:storage(local),session:storage({})},
    tabs:{onRemoved:{addListener:()=>{}},query:async()=>[]}
  };
  const requests = [];
  const fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {ok:true,status:200,json:async()=>({ok:true,license})};
  };
  const context = vm.createContext({chrome,fetch,URL,Date,JSON,String,Number,Promise,AbortSignal});
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(srcDir,file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(srcDir,'service-worker.js'),'utf8'),context);
  return {
    requests,
    send:message => new Promise(resolve => { for (const fn of listeners) if (fn(message,{},resolve) === true) break; })
  };
}

test('sessão persistente só consome recurso com concessão ou compra ativa', async () => {
  for (const mode of ['carometro','subscription']) {
    const worker = workerFor({active:true,mode});
    const result = await worker.send({type:'ASSISTENTE_SIAP_CONSUME_FEATURE',feature:'planning'});
    assert.equal(result.ok,true,mode);
    assert.deepEqual(worker.requests,[{action:'license_status'}]);
  }
});

test('sessão persistente bloqueia recurso quando licença venceu ou só há correção de provas', async () => {
  for (const license of [
    {active:false,mode:'subscription',status:'expired'},
    {active:false,mode:'external',examAccess:{active:true}},
    {active:true,mode:'external',status:'free'},
    null
  ]) {
    const worker = workerFor(license);
    const result = await worker.send({type:'ASSISTENTE_SIAP_CONSUME_FEATURE',feature:'planning'});
    assert.equal(result.ok,false);
    assert.equal(result.code,'license_expired');
  }
});
