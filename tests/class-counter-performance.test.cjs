const test=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/browser-harness.cjs');

test('contadores usam lista completa com mais de mil alunos sem consultas em cada render',async()=>{
  const h=harness('class-stat-counters.js');
  Object.assign(h.context,{students:Array.from({length:1281},(_,i)=>({id:i,classId:i<1000?'a':'b'})),
    classes:[{id:'a',shift:'Matutino'},{id:'b',shift:'Vespertino'}],selectedClassId:null,selectedShift:null});
  h.context.window.render=()=>{};await h.ready();
  assert.equal(h.get('total').textContent,1281);
  h.context.selectedClassId='b';h.context.window.render();
  assert.equal(h.get('total').textContent,281);assert.equal(h.get('classesCount').textContent,1);
  h.context.selectedClassId=null;h.context.selectedShift='Matutino';h.context.window.render();
  assert.equal(h.get('total').textContent,1000);
  h.context.selectedShift=null;for(let i=0;i<20;i++)h.context.window.render();
  assert.equal(h.get('total').textContent,1281);
  assert.equal(h.calls.filter(x=>x?.table).length,0);
  h.context.school=null;h.context.window.render();
  assert.equal(h.get('total').textContent,'0');assert.equal(h.get('classesCount').textContent,'0');
});
