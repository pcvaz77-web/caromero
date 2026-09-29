const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');

function workerFor(result) {
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
    return {ok:result.ok,status:result.status || (result.ok ? 200 : 402),json:async()=>result};
  };
  const context = vm.createContext({chrome,fetch,URL,Date,JSON,String,Number,Promise,AbortSignal});
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(srcDir,file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(srcDir,'service-worker.js'),'utf8'),context);
  return {
    requests,
    send:message => new Promise(resolve => { for (const fn of listeners) if (fn(message,{},resolve) === true) break; })
  };
}

test('sessão persistente consulta o consumo de concessão e compra ativas', async () => {
  for (const mode of ['carometro','subscription']) {
    const worker = workerFor({ok:true,license:{active:true,mode},usage:{allowed:true,unlimited:true}});
    const result = await worker.send({type:'ASSISTENTE_SIAP_CONSUME_FEATURE',feature:'planning'});
    assert.equal(result.ok,true,mode);
    assert.deepEqual(worker.requests,[{action:'consume_feature',feature:'planning'}]);
  }
});

test('sessão gratuita por e-mail consome Conteúdo e Frequência conforme o servidor', async () => {
  for (const feature of ['content','attendance']) {
    const license={active:true,mode:'external',status:'free',freeUses:{[feature]:1}};
    const worker=workerFor({ok:true,license,usage:{allowed:true,unlimited:false,remaining:1}});
    const result=await worker.send({type:'ASSISTENTE_SIAP_CONSUME_FEATURE',feature});
    assert.equal(result.ok,true,feature);
    assert.equal(result.usage.remaining,1);
    assert.deepEqual(worker.requests,[{action:'consume_feature',feature}]);
  }
});

test('sessão gratuita respeita o limite confirmado pelo servidor', async () => {
  const worker=workerFor({ok:false,code:'free_limit_reached',license:{active:false,mode:'external',status:'free',freeUses:{content:0}}});
  const result=await worker.send({type:'ASSISTENTE_SIAP_CONSUME_FEATURE',feature:'content'});
  assert.equal(result.ok,false);
  assert.equal(result.code,'free_limit_reached');
  assert.deepEqual(worker.requests,[{action:'consume_feature',feature:'content'}]);
});
