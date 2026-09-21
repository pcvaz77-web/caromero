import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
async function setup(error){
 const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'https://correcao.sistemacarometro.com.br/#session=11111111-1111-4111-8111-111111111111&token='+ 'a'.repeat(64),runScripts:'outside-only'});
 const w=dom.window,timers=[];let plays=0,stops=0;
 w.setTimeout=fn=>{timers.push(fn);return timers.length;};
 const remote={active:true,key:false,context:'Turma fictícia',items:[]}; const uploads=[];
 w.fetch=async(url,opts)=>{if(url.endsWith('/upload'))uploads.push(JSON.parse(opts.body));return {ok:true,json:async()=>url.endsWith('/status') ? remote : {ok:true}};};
 Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{if(error && error!=='hang-play')throw Object.assign(new Error(),{name:error});return {getTracks:()=>[{stop:()=>stops++}]};}}});
 w.HTMLMediaElement.prototype.play=()=>{plays++;return error==='hang-play' ? new Promise(()=>{}) : Promise.resolve();};
 Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{get:()=>100,configurable:true});
 w.eval(readFileSync(new URL('../public/exam-core.js',import.meta.url),'utf8'));
 w.eval(readFileSync(new URL('../public/capture.js',import.meta.url),'utf8'));await settle();
 return {w,dom,timers,remote,uploads,plays:()=>plays,stops:()=>stops};
}
test('câmera inicia reprodução explícita e libera captura',async()=>{
 const a=await setup();try{
 a.w.document.getElementById('camera').click();await settle();
 assert.equal(a.plays(),1);assert.equal(a.w.document.getElementById('video').hidden,false);
 assert.equal(a.w.document.getElementById('snap').hidden,false);
 a.w.document.getElementById('stop').click();assert.equal(a.stops(),1);
 }finally{a.dom.window.close();}
});
test('erro da câmera permanece visível após consulta de conexão e oferece câmera nativa',async()=>{
 const a=await setup('NotReadableError');try{
 a.w.document.getElementById('camera').click();await settle();
 const message=a.w.document.getElementById('notice').textContent;
 assert.match(message,/câmera está ocupada/);
 await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();
 assert.equal(a.w.document.getElementById('notice').textContent,message);
 assert.equal(a.w.document.getElementById('native-file').getAttribute('capture'),'environment');
 assert.equal(a.w.document.getElementById('file').hasAttribute('capture'),false);
 assert.equal(a.w.document.getElementById('camera').disabled,false);
 }finally{a.dom.window.close();}
});


test('pausa permite fotografar e guardar sem enviar; confirmação libera etapa de alunos',async()=>{
 const a=await setup();try{
 a.remote.active=false;a.remote.pauseReason='context';a.remote.key=true;
 await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();
 assert.equal(a.w.document.getElementById('camera').disabled,false);
 assert.equal(a.w.document.getElementById('students').disabled,false);
 assert.match(a.w.document.getElementById('connection').textContent,/Envio pausado/);
 a.w.document.getElementById('students').click();await settle();
 assert.equal(a.w.document.getElementById('kind').value,'student');
 assert.match(a.w.document.getElementById('snap').textContent,/primeira prova/);
 const video=a.w.document.getElementById('video');
 Object.defineProperty(video,'videoWidth',{value:100});Object.defineProperty(video,'videoHeight',{value:100});
 a.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 a.w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AAAA';
 a.w.document.getElementById('snap').click();a.w.document.getElementById('send').click();await settle();
 assert.equal(a.uploads.length,0);assert.match(a.w.document.getElementById('notice').textContent,/Foto guardada/);
 a.remote.active=true;await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();
 assert.equal(a.uploads.length,1);assert.equal(a.uploads[0].kind,'student');
 assert.equal(a.w.document.getElementById('native-file').hidden,true);
 assert.equal(a.w.document.getElementById('file').hidden,true);
 }finally{a.dom.window.close();}
});



test('uma entrada de câmera abre área ampliada; travamento libera alternativa e fecha quadro',async()=>{
 const a=await setup('hang-play');try{
 assert.equal(a.w.document.getElementById('native-camera').hidden,true);
 a.w.document.getElementById('camera').click();await settle();
 assert.equal(a.w.document.getElementById('camera-view').hidden,false);
 assert.equal(a.w.document.body.classList.contains('camera-open'),true);
 a.timers.filter(fn=>fn.name==='cameraDeadline').at(-1)();await settle();
 assert.equal(a.w.document.getElementById('camera-view').hidden,true);
 assert.equal(a.w.document.getElementById('native-camera').hidden,false);
 assert.equal(a.w.document.getElementById('camera').disabled,false);
 assert.match(a.w.document.getElementById('notice').textContent,/não apresentou imagem/);
 assert.equal(a.stops(),1);
 }finally{a.dom.window.close();}
});

test('após primeira confirmação, próxima prova é enviada com um toque',async()=>{
 const a=await setup();try{
 a.remote.key=true;await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();
 const video=a.w.document.getElementById('video');Object.defineProperty(video,'videoHeight',{value:100});
 a.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 a.w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AAAA';
 a.w.document.getElementById('camera').click();await settle();
 a.w.document.getElementById('snap').click();await settle();assert.equal(a.uploads.length,0);
 a.w.document.getElementById('send').click();await settle();assert.equal(a.uploads.length,1);
 a.w.document.getElementById('snap').click();await settle();assert.equal(a.uploads.length,2);
 assert.equal(a.w.document.getElementById('confirm').hidden,true);
 assert.equal(a.w.document.getElementById('camera-view').hidden,false);
 }finally{a.dom.window.close();}
});


test('fluxo do celular: gabarito, aluno antes da foto, resultado e confirmação',async()=>{
 const a=await setup();try{
 const key={alphabet:'ABCD',answers:['A','B'],ranges:[{subject:'Ciências',from:1,to:2}]};
 a.remote.mobileWorkflow=true;a.remote.roster=[{id:'aluno1',name:'ALUNO FICTÍCIO'}];
 a.remote.items=[{id:'oficial',kind:'official',status:'ready',result:{...key,name:'',warning:''}}];
 const poll=async()=>{await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();};
 await poll();assert.equal(a.w.document.getElementById('key-review').hidden,false);
 a.w.document.getElementById('key-confirm').click();await settle();
 a.remote.key=key;await poll();
 assert.equal(a.w.document.getElementById('kind').value,'student');
 assert.equal(a.w.document.getElementById('camera').disabled,true);assert.equal(a.w.document.getElementById('gallery').disabled,true);
 a.w.document.getElementById('camera').click();await settle();assert.equal(a.plays(),0);
 a.w.document.getElementById('student-select').value='aluno1';a.w.document.getElementById('student-select').dispatchEvent(new a.w.Event('change'));await settle();
 Object.defineProperty(a.w.document.getElementById('video'),'videoHeight',{value:100});
 a.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 a.w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AAAA';
 a.w.document.getElementById('camera').click();await settle();a.w.document.getElementById('snap').click();await settle();
 assert.equal(a.uploads.length,1);assert.equal(a.uploads[0].studentId,'aluno1');
 a.remote.items.push({id:a.uploads[0].id,kind:'student',status:'ready',selectedStudentId:'aluno1',result:{...key,answers:['A','C'],name:'',warning:''}});
 await poll();
 assert.equal(a.w.document.body.classList.contains('camera-complete'),true);
 assert.equal(a.w.document.getElementById('camera-result').hidden,false);
 assert.match(a.w.document.getElementById('camera-summary').textContent,/ALUNO FICTÍCIO.*1\/2 acertos/);
 assert.equal(a.w.document.getElementById('camera-result').textContent,'Enviar resultado e próximo aluno');
 a.w.document.getElementById('camera-result').click();await settle();
 assert.equal(a.w.document.getElementById('camera-view').hidden,true);
 assert.equal(a.w.document.getElementById('camera').disabled,true);
 }finally{a.dom.window.close();}
});


test('detecção estável dispara uma única foto automaticamente e encerra ao fechar',async()=>{
 const a=await setup();try{
 const key={alphabet:'ABCD',answers:['A','B'],ranges:[{subject:'Teste',from:1,to:2}]};a.remote.mobileWorkflow=true;a.remote.key=key;a.remote.roster=[{id:'1',name:'ALUNO TESTE'}];
 await a.timers.splice(a.timers.findIndex(fn=>fn.name==='poll'),1)[0]();await settle();
 let worker; a.w.Worker=class {constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}};
 const video=a.w.document.getElementById('video');Object.defineProperty(video,'videoHeight',{value:100});
 a.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray(40000)};}});a.w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AAAA';
 const select=a.w.document.getElementById('student-select');select.value='1';select.dispatchEvent(new a.w.Event('change'));await settle();
 worker.onmessage({data:{capture:true,reason:'Estável'}});await settle();assert.equal(a.uploads.length,1);worker.onmessage({data:{capture:true,reason:'Estável'}});await settle();assert.equal(a.uploads.length,1);
 a.w.document.getElementById('stop').click();assert.equal(worker.terminated,true);
 }finally{a.dom.window.close();}
});
