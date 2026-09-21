// Local-only UI fixture. No API key, authentication, SIAP data or production requests.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fixture, selectionFixture } from './fixture.mjs';
const extension=new URL('../../../extensions/assistente-siap/src/',import.meta.url);
const publicRoot=new URL('../public/',import.meta.url);
const scripts=['exam-config.js','vendor/qrcode.js','exam-core.js','exam-dom.js','exam-panel.js'];
const bridge=`
let stored=null;
const key={alphabet:'ABCD',answers:Array(15).fill('A'),ranges:[{subject:'Língua Portuguesa',from:1,to:15}]};
const items=[{id:'11111111-1111-4111-8111-111111111111',kind:'official',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:''}},{id:'22222222-2222-4222-8222-222222222222',kind:'student',status:'ready',result:{...key,title:'AVALIAÇÃO FICTÍCIA',warning:'',name:'JOÃO PEDRO TESTE',answers:['B',...Array(14).fill('A')]}}];
window.chrome={runtime:{sendMessage:async msg=>{
if(msg.type==='SIAP_EXAM_STATE_GET')return {ok:true,value:stored};
if(msg.type==='SIAP_EXAM_STATE_PUT'){stored=structuredClone(msg.value);return {ok:true};}
if(msg.action==='create')return {ok:true,id:'33333333-3333-4333-8333-333333333333',desktop:'a'.repeat(64),mobile:'b'.repeat(64),expires:Date.now()+7200000};
if(msg.action==='status')return {ok:true,key,items,active:true};
return {ok:true};}}};
document.querySelectorAll('#cphFuncionalidade_cphCampos_gdvLista input[type=checkbox]').forEach(box=>box.onchange=()=>{if(box.checked){const index=Number(box.id.split('_')[2]);document.getElementById(box.id.slice(0,-1)+(index%2?index-1:index+1)).checked=false;}});
window.SiapExamPanel.mount(document.querySelector('#demo-panel'));
`;
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try {
    if(path==='/camera-demo'){
      res.setHeader('Content-Type','text/html;charset=utf-8');
      res.end(readFileSync(new URL('index.html',publicRoot),'utf8').replace('<script src="capture.js">','<script src="/camera-demo.js"></script><script src="capture.js">'));return;
    }
    if(path==='/camera-demo.js'){
      res.setHeader('Content-Type','text/javascript');
      res.end(`location.hash='session=11111111-1111-4111-8111-111111111111&token='+ 'a'.repeat(64);
const sampleKey={alphabet:'ABCD',answers:Array(15).fill('A'),ranges:[{subject:'Ciências da Natureza',from:1,to:15}]};
const demoState={active:true,mobileWorkflow:true,assessment:{subject:'Ciências da Natureza',total:15},roster:[{id:'1',name:'JOÃO PEDRO — ALUNO FICTÍCIO'},{id:'2',name:'MARIA — ALUNA FICTÍCIA'}],key:null,context:'TURMA FICTÍCIA · 6º ANO',items:[]};
window.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);if(url.endsWith('/mobile-key'))demoState.key=b.key;
if(url.endsWith('/upload')){const item={id:b.id,kind:b.kind,status:'processing',selectedStudentId:b.studentId};demoState.items.push(item);setTimeout(()=>{item.status='ready';item.result={...sampleKey,name:b.kind==='student'?'JOÃO PEDRO — ALUNO FICTÍCIO':'',warning:'',answers:b.kind==='student'?['B',...Array(14).fill('A')]:sampleKey.answers};},1800);}
if(url.endsWith('/mobile-review'))demoState.items.find(i=>i.id===b.id).review={studentId:b.studentId,answers:b.answers,reviewed:true};
return {ok:true,json:async()=>url.endsWith('/status')?structuredClone(demoState):{ok:true}};};
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{
const c=document.createElement('canvas');c.width=720;c.height=960;const x=c.getContext('2d');
function frame(){x.fillStyle='#ddd';x.fillRect(0,0,720,960);x.fillStyle='white';x.fillRect(40,40,640,880);x.fillStyle='#17263d';x.font='28px sans-serif';x.fillText('FOLHA FICTÍCIA — TESTE',80,110);for(let n=0;n<15;n++){x.fillText(String(n+1),90,180+n*44);for(let j=0;j<4;j++){x.beginPath();x.arc(180+j*58,170+n*44,18,0,Math.PI*2);x.lineWidth=3;x.strokeStyle='#17263d';x.stroke();if(j===0)x.fill();}}requestAnimationFrame(frame);}frame();return c.captureStream(10);
}}});`);return;
    }
    if(['/LancamentoNotasModeloEdicao.aspx','/LancamentoNotasModeloListagem.aspx'].includes(path)){
      const html=(path.endsWith('Listagem.aspx') ? selectionFixture() : fixture()).replace('<body>',`<body><div style="background:#ffe3a8;padding:14px;font:16px system-ui">TESTE LOCAL — alunos fictícios; nenhum lançamento no SIAP.</div>`).replace('</body>',`<aside id="assistente-siap-panel" style="position:relative;max-width:410px;height:auto;margin:20px auto"><div id="demo-panel" class="cm-body"></div></aside><link rel="stylesheet" href="/src/content.css"><link rel="stylesheet" href="/src/exam.css">${scripts.map(s=>`<script src="/src/${s}"></script>`).join('')}<script src="/bridge.js"></script></body>`);
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;
    }
    if(path==='/bridge.js'){res.setHeader('Content-Type','text/javascript');res.end(bridge);return;}
    const source=path.startsWith('/src/')?new URL(path.slice(5),extension):new URL(path==='/'?'index.html':path.slice(1),publicRoot);
    if (!source.href.startsWith(extension.href) && !source.href.startsWith(publicRoot.href)) throw Error();
    res.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html;charset=utf-8');res.end(readFileSync(source));
  }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(4399,'127.0.0.1',()=>console.log('Fixture local: http://127.0.0.1:4399/LancamentoNotasModeloEdicao.aspx'));
