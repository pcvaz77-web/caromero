const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const firstToken = '00000000-0000-4000-8000-000000000001';
const secondToken = '00000000-0000-4000-8000-000000000002';
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

test('leitor identifica o próximo aluno após confirmar sem reabrir a câmera', async () => {
  const nodes = new Map();
  const listeners = new Map();
  const detections = [firstToken, secondToken];
  const calls = [];
  let cameraOpens = 0;
  let cameraStops = 0;
  const classes = () => {
    const values = new Set();
    return { add:value => values.add(value), remove:value => values.delete(value), contains:value => values.has(value), toggle(){} };
  };
  const node = () => ({ classList:classes(), style:{}, innerHTML:'', textContent:'', disabled:false, value:'', dataset:{},
    append(){}, scrollIntoView(){}, querySelector(){return null;}, closest(){return null;} });
  const get = id => { if (!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); };
  const video = get('familyScanVideo');
  video.readyState = 2;
  video.videoWidth = 720;
  video.videoHeight = 1280;
  video.play = async () => {};
  get('familySchoolModal').classList.remove('hidden');
  get('familyEntryView').classList.remove('hidden');
  const context = {
    document: {
      getElementById:get,
      createElement:tag => tag === 'canvas' ? { width:0,height:0,getContext:()=>({ drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(4)}) }) }
        : tag === 'span' ? { textContent:'',get innerHTML(){return this.textContent;} } : node(),
      addEventListener:(name,fn)=>listeners.set(name,fn), head:{append(){}},
    },
    window: { BarcodeDetector:class { async detect() { const token = detections.shift(); return token ? [{ rawValue:`CAROMETRO:CARD:${token}` }] : []; } } },
    navigator: { mediaDevices:{ getUserMedia:async()=>{
      cameraOpens++;
      const track = { stop:()=>cameraStops++, getCapabilities:()=>({}), getSettings:()=>({}) };
      return { getTracks:()=>[track], getVideoTracks:()=>[track] };
    } } },
    db: { rpc:async(name,args)=>{
      calls.push(name);
      if (name === 'family_recent_entries') return { data:[],error:null };
      if (name === 'family_lookup_card') return { data:[{ student_name:args.p_qr_token === firstToken ? 'Aluno 1' : 'Aluno 2', class_name:'6A', guardian_name:'Responsável' }],error:null };
      if (name === 'family_record_entry') return { data:[{ entry_id:'entry-1',arrived_at:'2026-10-09T12:00:00Z',duplicate:false }],error:null };
      throw new Error(`RPC inesperado: ${name}`);
    } },
    setTimeout:()=>1, clearTimeout(){}, console,
    Intl, Date, Uint8ClampedArray,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../family-gate.js'),'utf8'),context);
  listeners.get('DOMContentLoaded')();
  await listeners.get('carometro:family-school-opened')({ detail:{ schoolId:'school-a' } });
  await get('familyStartScan').onclick();
  await flush();
  assert.equal(calls.filter(name => name === 'family_lookup_card').length, 1);
  await get('familyConfirmEntry').onclick();
  await flush();
  assert.equal(calls.filter(name => name === 'family_lookup_card').length, 2);
  assert.equal(cameraOpens, 1);
  assert.equal(cameraStops, 0);
  assert.match(get('familyScanStudent').innerHTML, /Aluno 2/);
  listeners.get('carometro:family-entry-hidden')();
  assert.equal(cameraStops, 1);
});
