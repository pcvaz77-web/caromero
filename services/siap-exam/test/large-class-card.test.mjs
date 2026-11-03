import {test} from 'node:test';
import assert from 'node:assert/strict';
import Core from '../exam-core.cjs';
import {recognize} from '../worker.mjs';

test('cartão de prova da turma aceita 120 questões sem deslocar respostas',()=>{
  const key=Core.validateKey({firstQuestion:1,alphabet:'ABCDE',answers:Array(120).fill('A'),ranges:[{subject:'Matemática',from:1,to:120}]});
  const answers=Array(120).fill('A');answers[119]='B';
  assert.equal(Core.score(key,answers)[0].correct,119);
  assert.throws(()=>Core.validateKey({...key,answers:Array(201).fill('A'),ranges:[{subject:'Matemática',from:1,to:201}]}),/até 200/);
});

test('leitura de 120 questões usa esquema compacto e valida a numeração da IA',async()=>{
  const original=globalThis.fetch;
  const key=Core.validateKey({firstQuestion:1,alphabet:'ABCDE',answers:Array(120).fill('A'),ranges:[{subject:'Matemática',from:1,to:120}]});
  let seenSchema;
  globalThis.fetch=async (_url,options)=>{
    seenSchema=JSON.parse(options.body).text.format.schema;
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({warning:'',marks:Array.from({length:120},(_,i)=>({number:i+1,mark:'A'}))})}]}]})};
  };
  try{
    const result=await recognize('data:image/jpeg;base64,AA==',{OPENAI_API_KEY:'test'},key);
    assert.equal(result.answers.length,120);
    assert.equal(seenSchema.properties.marks.type,'array');
    assert.equal(Object.keys(seenSchema.properties).length,2);
  }finally{globalThis.fetch=original;}
});
