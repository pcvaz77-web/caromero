const test=require('node:test');
const assert=require('node:assert/strict');
const Dom=require('../extensions/assistente-siap/src/cepi-siap-dom.js');
function fixture(subject='Química', count=15){
 const values={txtSerie:'1ª Série',txtBimestre:'3º Bimestre',txtTurma:'1A',txtDisciplina:subject,txtComposicao:'Ensino Médio',avaliacao:'Ciclo1 - Bloco 5 do CEPI - '+subject,txtTotaldeQuestoes:String(count)};
 const boxes=Array.from({length:count+4},(_,i)=>({id:'box'+i,checked:false,disabled:false,click(){this.checked=!this.checked;}}));
 const dataRow={cells:[{textContent:'1 - ALUNA EXEMPLO'}],querySelectorAll(selector){return selector==='img'?[]:boxes;}};
 const header={cells:[{textContent:'Aluno'},...['Pres.','Aus.','Pres.','Aus.'].map(textContent=>({textContent})),...Array.from({length:count},(_,i)=>({textContent:String(i+1)}))]};
 const table={rows:[header,dataRow]};
 const doc={body:{textContent:'Ano base 2026/2 CEPI SANTA BARBARA Avaliação Ciclo1 - Edição'},getElementById(id){if(id==='h3TituloFuncionalidade')return {textContent:'Avaliação Ciclo1 - Edição'};if(id.endsWith('gdvLista'))return table;const name=id.replace('cphFuncionalidade_cphCampos_','');return Object.hasOwn(values,name)?{value:values[name]}:null;}};
 const meta={schoolName:'CEPI SANTA BÁRBARA',academicYear:2026,bimester:3,stage:'medio',blockNumber:5,className:'1A',subjectMap:[{subject:'Física',numbers:Array.from({length:15},(_,i)=>i+1)},{subject:'Química',numbers:Array.from({length:15},(_,i)=>i+16)}]};
 const key={alphabet:'ABCDE',answers:Array.from({length:30},(_,i)=>i<15?'A':'B')};
 const status={roster:[{id:'student-1',name:'Aluna Exemplo'}],items:[{id:'capture-1',kind:'student',status:'ready',review:{reviewed:true,studentId:'student-1',answers:Array.from({length:30},(_,i)=>i<15?'A':i%2?'B':'C')}}]};
 return {doc,meta,key,status,boxes};
}
test('SIAP usa só as questões da disciplina configurada no bloco misto',()=>{
 const f=fixture(),snapshot=Dom.snapshot(f.doc,f.meta,f.key),entries=Dom.plan(snapshot,f.status,f.key);
 assert.deepEqual(snapshot.numbers,Array.from({length:15},(_,i)=>i+16));
 assert.equal(entries.length,1);assert.equal(entries[0].marks.length,15);assert.equal(entries[0].marks.filter(Boolean).length,8);
 Dom.preflight(entries[0],1);Dom.apply(entries[0],1);
 assert.equal(f.boxes[0].checked,true);
 assert.deepEqual(f.boxes.slice(4).map(box=>box.checked),entries[0].marks);
});
test('SIAP bloqueia bloco e quantidade incompatíveis antes de qualquer clique',()=>{
 const f=fixture();f.meta.blockNumber=4;assert.throws(()=>Dom.snapshot(f.doc,f.meta,f.key),/coincide/);assert.equal(f.boxes.some(box=>box.checked),false);
 const g=fixture();g.meta.subjectMap[1].numbers.pop();assert.throws(()=>Dom.snapshot(g.doc,g.meta,g.key),/quantidade/);
});
test('SIAP bloqueia ausência, aluno indisponível e marcação ambígua',()=>{
 const f=fixture(),snap=Dom.snapshot(f.doc,f.meta,f.key),entry=Dom.plan(snap,f.status,f.key)[0];
 f.boxes[1].checked=true;assert.throws(()=>Dom.preflight(entry,1),/presença/);assert.equal(f.boxes[0].checked,false);
 f.boxes[1].checked=false;f.status.items[0].review.answers[0]='?';assert.throws(()=>Dom.plan(snap,f.status,f.key),/ambíguas/);
});
