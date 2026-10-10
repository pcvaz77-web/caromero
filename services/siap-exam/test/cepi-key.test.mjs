import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ExamSession } from '../worker.mjs';

const require=createRequire(import.meta.url);
const CepiCorrection=require('../../../cepi-correction.js');

class Storage {
  map=new Map();
  async get(key){return structuredClone(this.map.get(key));}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async deleteAll(){this.map.clear();}
  async setAlarm(){}
  async deleteAlarm(){}
}

test('QR do CEPI disponibiliza gabarito salvo e turma ao celular sem foto oficial',async()=>{
  const storage=new Storage();
  const session=new ExamSession({storage,blockConcurrencyWhile:task=>task()},{});
  const call=async(action,body={},token='')=>{
    const response=await session.fetch(new Request('https://internal/'+action,{method:'POST',headers:{'X-Exam-Token':token},body:JSON.stringify(body)}));
    return {status:response.status,...await response.json()};
  };
  const created=await call('init',{context:'Bloco 4 · 1A',sessionId:crypto.randomUUID(),mobileWorkflow:true});
  const answers=Array.from({length:30},(_,index)=>'ABCDE'[index%5]);
  const key=CepiCorrection.key({test:{answer_format:'ABCDE'},answers});
  assert.equal((await call('key',{key},created.desktop)).status,200);
  assert.equal((await call('roster',{binding:'escola:bloco:turma',roster:[{id:'aluno-1',name:'Aluno Exemplo'}]},created.desktop)).status,200);
  const mobile=await call('status',{},created.mobile);
  assert.deepEqual(mobile.key,key);
  assert.deepEqual(mobile.roster,[{id:'aluno-1',name:'Aluno Exemplo'}]);
  assert.equal(mobile.mobileWorkflow,true);
  assert.equal(mobile.items.length,0);
});
