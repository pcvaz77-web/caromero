import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { ExamSession, limitedJson, recognize } from '../worker.mjs';
class Storage {
  map=new Map(); alarmTime=null;
  async get(k){return structuredClone(this.map.get(k));} async put(k,v){this.map.set(k,structuredClone(v));}
  async deleteAll(){this.map.clear();} async setAlarm(t){this.alarmTime=t;} async deleteAlarm(){this.alarmTime=null;}
}
function room() {
  const storage=new Storage(); const ctx={storage,blockConcurrencyWhile:fn=>fn()};
  const object=new ExamSession(ctx,{});
  const call=async(action,body={},token='')=>{const r=await object.fetch(new Request('https://internal/'+action,{method:'POST',headers:{'X-Exam-Token':token},body:JSON.stringify(body)}));return {status:r.status,...await r.json()};};
  return {storage,object,call};
}
const image='data:image/jpeg;base64,/9j/AAAA';
test('tokens diferentes: celular envia mas não lê nomes, fotos ou altera resultados',async()=>{
  const r=room(), init=await r.call('init',{context:'Turma TESTE',sessionId:crypto.randomUUID()});
  assert.equal((await r.call('status',{},'wrong')).status,401);
  assert.equal((await r.call('key',{key:{}},init.mobile)).status,403);
  assert.equal((await r.call('image',{id:'x'},init.mobile)).status,403);
  const status=await r.call('status',{},init.mobile); assert.equal(status.key,false); assert.equal(status.active,true);
  const stored=await r.storage.get('session'); assert.notEqual(stored.mobile,init.mobile);
});
test('reenvio idempotente não gera duas chamadas de IA e foto repetida é sinalizada',async()=>{
  const r=room(), init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
  const body={id:crypto.randomUUID(),kind:'official',image};
  assert.equal((await r.call('upload',body,init.mobile)).status,200);
  assert.equal((await r.call('upload',body,init.mobile)).status,200);
  assert.equal((await r.call('upload',{...body,id:crypto.randomUUID()},init.mobile)).status,409);
  assert.equal((await r.call('status',{},init.desktop)).items.length,1);
});
test('celular aguarda gabarito confirmado e pausa se computador perder conexão',async()=>{
  const r=room(), init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
  assert.equal((await r.call('upload',{id:crypto.randomUUID(),kind:'student',image},init.mobile)).status,400);
  const state=await r.storage.get('session');state.heartbeat=Date.now()-130000;await r.storage.put('session',state);
  assert.equal((await r.call('upload',{id:crypto.randomUUID(),kind:'official',image},init.mobile)).status,409);
});
test('expiração e encerramento eliminam os dados da sessão',async()=>{
  const r=room(), init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
  await r.call('upload',{id:crypto.randomUUID(),kind:'official',image},init.mobile);
  await r.call('close',{},init.desktop); assert.equal(r.storage.map.size,0);
  assert.equal((await r.call('status',{},init.mobile)).status,410);
});
test('parser limita tamanho mesmo sem Content-Length',async()=>{
  await assert.rejects(limitedJson(new Request('https://x',{method:'POST',body:'x'.repeat(100)}),20),/grande/);
});
test('API recusa origens estranhas antes de consultar sessão ou licença',async()=>{
  const result=await worker.fetch(new Request('https://example.test/api/create',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}),{EXTENSION_ORIGINS:'chrome-extension://test'});
  assert.equal(result.status,403);
});
test('IA recebe instrução de transcrever, sem gabarito, lista de alunos ou cálculo',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      const body=JSON.parse(options.body); assert.equal(body.store,false);assert.match(body.instructions,/Não leia nem transcreva o nome manuscrito/);assert.match(body.instructions,/Não corrija, não conte acertos/);
      assert.equal(body.input[0].content[0].type,'input_image');
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'ALUNO FICTÍCIO',title:'TESTE',warning:'',alphabet:'ABCD',questions:[{number:1,mark:'A'}],ranges:[{subject:'Ciências',from:1,to:1}]})}]}]});
    };
    const result=await recognize(image,{OPENAI_API_KEY:'synthetic-test-only'});assert.deepEqual(result.answers,['A']);
  } finally {globalThis.fetch=original;}
});
test('alarme expira fotos e não deixa leitura em execução ressuscitar sessão encerrada',async()=>{
  const r=room(), init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
  await r.call('upload',{id:crypto.randomUUID(),kind:'official',image},init.mobile);
  const original=globalThis.fetch;
  let started, finish;
  const began=new Promise(resolve=>started=resolve), completed=new Promise(resolve=>finish=resolve);
  r.object.env={OPENAI_API_KEY:'synthetic-test-only',EXAMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({ok:true})})}};
  try{
    globalThis.fetch=async()=>{started();await completed;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'TESTE',title:'TESTE',warning:'',alphabet:'ABCD',questions:[{number:1,mark:'A'}],ranges:[{subject:'Ciências',from:1,to:1}]})}]}]});};
    const alarm=r.object.alarm();await began;await r.call('close',{},init.desktop);finish();await alarm;
    assert.equal(r.storage.map.size,0);
  }finally{globalThis.fetch=original;}
});
test('fila cheia preserva captura até capacidade ficar disponível, sem chamar IA',async()=>{
  const r=room(), init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
  const id=crypto.randomUUID();await r.call('upload',{id,kind:'official',image},init.mobile);
  r.object.env={EXAMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({error:'busy'},{status:429})})}};
  await r.object.alarm();assert.equal((await r.storage.get('item:'+id)).status,'queued');assert.ok(r.storage.alarmTime>Date.now());
});

test('duas fotos são processadas em paralelo com capacidade limitada',async()=>{
 const r=room(),init=await r.call('init',{context:'TESTE',sessionId:crypto.randomUUID()});
 await r.call('upload',{id:crypto.randomUUID(),kind:'official',image},init.mobile);
 await r.call('upload',{id:crypto.randomUUID(),kind:'official',image:image+'BBBB'},init.mobile);
 r.object.env={OPENAI_API_KEY:'synthetic-test-only',EXAMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({ok:true})})}};
 const original=globalThis.fetch;let concurrent=0,max=0;const releases=[];
 try{
 globalThis.fetch=async()=>{concurrent++;max=Math.max(max,concurrent);await new Promise(resolve=>releases.push(resolve));concurrent--;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'TESTE',title:'TESTE',warning:'',alphabet:'ABCD',questions:[{number:1,mark:'A'}],ranges:[{subject:'Teste',from:1,to:1}]})}]}]});};
 const alarm=r.object.alarm();
 for(let i=0;i<30 && releases.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(max,2);for(const release of releases)release();await alarm;
 assert.equal((await r.call('status',{},init.desktop)).items.filter(i=>i.status==='ready').length,2);
 }finally{for(const release of releases)release();globalThis.fetch=original;}
});


test('sessão móvel autoriza conferência somente na turma vinculada e mantém segredo do computador',async()=>{
 const r=room(),init=await r.call('init',{context:'TURMA FICTÍCIA',sessionId:crypto.randomUUID(),mobileWorkflow:true});
 const key={alphabet:'ABCD',answers:['A'],ranges:[{subject:'Ciências',from:1,to:1}]};
 assert.equal((await r.call('roster',{binding:'turma1',roster:[{id:'1',name:'ALUNO FICTÍCIO'}]},init.desktop)).status,200);
 assert.equal((await r.call('roster',{binding:'turma2',roster:[]},init.desktop)).status,400);
 assert.equal((await r.call('roster',{binding:'turma1',roster:[]},init.mobile)).status,403);
 assert.equal((await r.call('mobile-key',{key},init.mobile)).status,200);
 const id=crypto.randomUUID();
 assert.equal((await r.call('upload',{id,kind:'student',image},init.mobile)).status,400);
 assert.equal((await r.call('upload',{id,kind:'student',image,studentId:'outro'},init.mobile)).status,400);
 assert.equal((await r.call('upload',{id,kind:'student',image,studentId:'1'},init.mobile)).status,200);
 const item=await r.storage.get('item:'+id);item.result={...key,name:'',warning:''};item.status='ready';await r.storage.put('item:'+id,item);
 assert.equal((await r.call('mobile-review',{id,studentId:'outro',answers:['A'],key},init.mobile)).status,400);
 assert.equal((await r.call('mobile-review',{id,studentId:'1',answers:['A'],key:{...key,answers:['B']}},init.mobile)).status,400);
 assert.equal((await r.call('mobile-review',{id,studentId:'1',answers:['A'],key},init.mobile)).status,200);
 const status=await r.call('status',{},init.mobile);assert.equal(status.items[0].review.studentId,'1');assert.equal(status.roster[0].name,'ALUNO FICTÍCIO');assert.equal(status.desktop,undefined);
 await r.call('mobile-key',{key:{...key,answers:['B']}},init.mobile);assert.equal((await r.call('status',{},init.mobile)).items[0].review,undefined);
 await r.call('pause',{paused:true},init.desktop);assert.equal((await r.call('mobile-key',{key},init.mobile)).status,409);
});


test('trecho da disciplina mantém números impressos variáveis e não envia gabarito à IA',async()=>{
 const original=globalThis.fetch;let responseStart=31,received;
 try{
 globalThis.fetch=async(url,options)=>{received=JSON.parse(options.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'',title:'',warning:'',alphabet:'ABCDE',...(received.text.format.schema.properties.marks?{marks:Object.fromEntries(Array.from({length:20},(_,i)=>[String(responseStart+i),'A']))}:{questions:Array.from({length:20},(_,i)=>(received.text.format.schema.properties.questions.items.properties.n?{n:responseStart+i,a:'A'}:{number:responseStart+i,mark:'A'}))}),ranges:[]})}]}]});};
 const assessment={subject:'Língua Portuguesa',total:20};
 const official=await recognize(image,{OPENAI_API_KEY:'synthetic'},null,assessment);
 assert.equal(official.firstQuestion,31);assert.equal(official.answers.length,20);assert.equal(official.ranges[0].subject,'Língua Portuguesa');
 const key={...official,answers:Array(20).fill('E')};
 const student=await recognize(image,{OPENAI_API_KEY:'synthetic'},key,assessment);
 assert.equal(student.firstQuestion,31);assert.match(received.instructions,/31 a 50/);assert.equal(received.text.format.schema.properties.ranges,undefined);assert.equal(JSON.stringify(received).includes(JSON.stringify(key.answers)),false);
 responseStart=1;await assert.rejects(recognize(image,{OPENAI_API_KEY:'synthetic'},key,assessment),/[Nn]umeração/);
 }finally{globalThis.fetch=original;}
});
