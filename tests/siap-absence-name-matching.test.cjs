const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','siap-absences.js'),'utf8');
const helpers=source.slice(source.indexOf('  const normalize ='),source.indexOf('  const classKey ='));
const matcher=source.slice(source.indexOf('  function matchedRows()'),source.indexOf('  function renderPreview()'));
assert.ok(helpers.includes('studentKey')&&matcher.includes('function matchedRows'));

function match(entries,students){
  const sandbox={students,targetClassId:'class-a',snapshot:{entries}};
  vm.runInNewContext(`${helpers}\n${matcher}\nglobalThis.match=matchedRows;`,sandbox);
  return sandbox.match();
}

test('importa zero faltas somente para nome completo único na turma',()=>{
  const rows=match([{name:'1. ANA MARIA SILVA',absences:0}],[
    {id:'a',classId:'class-a',name:'Ana Maria Silva'},
    {id:'b',classId:'class-b',name:'Ana Maria Silva'}
  ]);
  assert.equal(rows[0].studentId,'a');
  assert.equal(rows[0].absences,0);
});

test('bloqueia vínculo ambíguo por nome duplicado no SIAP ou Carômetro',()=>{
  const local=[{id:'a',classId:'class-a',name:'Ana Maria Silva'}];
  assert.equal(match([{name:'Ana Maria Silva',absences:2},{name:'ANA MARIA SILVA',absences:3}],local)[0].studentId,null);
  assert.equal(match([{name:'Ana Maria Silva',absences:2}],[...local,{id:'b',classId:'class-a',name:'Ana Maria Silva'}])[0].studentId,null);
});
