const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,deferred,flush}=require('./helpers/browser-harness.cjs');

async function setup(file,options={}) {
  const h=harness(file,options),intervals=new Map(),timeouts=new Map();let next=0,authCalls=0,loads=0;
  h.context.setInterval=(fn,ms)=>{const id=++next;intervals.set(id,{fn,ms});return id;};
  h.context.clearInterval=id=>intervals.delete(id);
  h.context.setTimeout=(fn,ms)=>{const id=++next;timeouts.set(id,{fn,ms});return id;};
  h.context.clearTimeout=id=>timeouts.delete(id);
  h.context.db.auth.getUser=async()=>{authCalls++;return {data:{user:h.context.user}};};
  h.context.window.load=async()=>{loads++;};
  h.context.console={info(){},warn(){},error(){}};
  await h.ready();
  if(file==='notification-center.js')await h.context.window.testCenter.startNotificationCenter();
  await flush();
  return Object.assign(h,{intervals,timeouts,authCalls:()=>authCalls,loads:()=>loads,
    tick:async()=>{for(const timer of [...intervals.values()])await timer.fn();await flush();},
    runRefresh:async()=>{for(const [id,timer]of [...timeouts])if(timer.ms===120){timeouts.delete(id);await timer.fn();}await flush();}});
}

for(const file of ['notification-center.js','realtime-sync.js']) {
  test(`${file}: consultas espacadas conectado, fallback rapido e pausa sem rede`,async()=>{
    const h=await setup(file),channel=h.channels.at(-1);
    assert.deepEqual([...h.intervals.values()].map(x=>x.ms),[2500]);
    channel.status('SUBSCRIBED');await flush();
    assert.deepEqual([...h.intervals.values()].map(x=>x.ms),[30000]);
    h.calls.length=0;const authBefore=h.authCalls();
    await h.tick();await h.tick();
    assert.equal(h.calls.filter(x=>x?.table).length,2,'duas consultas em 60 segundos conectado');
    assert.equal(h.authCalls(),authBefore,'polling nao faz chamada extra de autenticacao');
    h.context.document.hidden=true;await h.tick();
    h.context.document.hidden=false;h.context.navigator.onLine=false;await h.tick();
    assert.equal(h.calls.filter(x=>x?.table).length,2);
    h.context.navigator.onLine=true;channel.status('CHANNEL_ERROR');await flush();
    assert.deepEqual([...h.intervals.values()].map(x=>x.ms),[2500]);
    channel.status('SUBSCRIBED');await flush();
    assert.deepEqual([...h.intervals.values()].map(x=>x.ms),[30000]);
    h.context.user=null;h.get('app').classList.add('hidden');await h.emit(h.events,'auth','SIGNED_OUT');
    assert.equal(h.intervals.size,0,'logout encerra polling');
    channel.status('SUBSCRIBED');assert.equal(h.intervals.size,0,'callback antigo nao reinicia polling');
  });
}

test('sino continua recebendo avisos imediatamente e fallback descobre aviso perdido',async()=>{
  let rows=[];
  const h=await setup('notification-center.js',{query:()=>({data:rows,error:null,count:rows.length})});
  const channel=h.channels.at(-1);channel.status('SUBSCRIBED');await flush();
  const row={id:1,school_id:'school-a',recipient_id:'user-a',title:'Novo aviso',body:'Teste',created_at:new Date().toISOString()};
  rows=[row];await channel.handlers.find(x=>x.filter.event==='INSERT').fn({new:row});
  assert.equal(h.context.window.testCenter.getItems()[0].id,1);
  channel.status('CHANNEL_ERROR');rows=[{...row,id:2},row];await h.tick();
  assert.equal(h.context.window.testCenter.getItems()[0].id,2);
  const poll=h.calls.find(x=>x?.table&&x.operations.some(op=>op[0]==='select'&&op[1]==='id'));
  assert.ok(poll.operations.some(op=>op[0]==='eq'&&op[1]==='recipient_id'&&op[2]==='user-a'));
  assert.ok(poll.operations.some(op=>op[0]==='eq'&&op[1]==='school_id'&&op[2]==='school-a'));
});

test('revisoes preservam primeira mudanca e nao carregam escola inteira ao alternar aba rapidamente',async()=>{
  let rows=[];const h=await setup('realtime-sync.js',{query:()=>({data:rows,error:null})});
  h.channels.at(-1).status('SUBSCRIBED');await flush();
  await h.emit(h.events,'visibilitychange');await h.runRefresh();
  assert.equal(h.loads(),0);
  rows=[{id:1,entity_type:'students'}];await h.tick();await h.runRefresh();
  assert.equal(h.loads(),1,'primeira revisao apos escola sem eventos atualiza dados');
});

test('resposta de revisoes da escola anterior e descartada e cursor reinicia na nova escola',async()=>{
  const pending=deferred();let delay=false;
  const h=await setup('realtime-sync.js',{query:()=>delay?pending.promise:{data:[{id:10,entity_type:'students'}],error:null}});
  delay=true;const oldPoll=h.tick();await flush();
  h.context.school='school-b';pending.resolve({data:[{id:99,entity_type:'students'}],error:null});await oldPoll;await h.runRefresh();
  assert.equal(h.loads(),0);
  delay=false;h.calls.length=0;await h.tick();
  const query=h.calls.find(x=>x?.table==='school_realtime_events');
  assert.ok(query.operations.some(op=>op[0]==='eq'&&op[1]==='school_id'&&op[2]==='school-b'));
  assert.ok(!query.operations.some(op=>op[0]==='gt'),'cursor nao e herdado de outra escola');
});
