const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','siap-absences.js'),'utf8');
const start=source.indexOf('  window.getStudentSiapAbsences = studentId =>');
const end=source.indexOf('  const criteriaHtml=',start);
assert.ok(start>=0 && end>start);

test('card mostra o 2º Bim. sem repetir o 4º Bim. já exibido na etiqueta',()=>{
  const rows=[
    {student_id:'aluno',academic_year:2026,bimester:4,subject:'241 - LÍNGUA PORTUGUESA',absences:11,imported_at:'2026-11-13T12:00:00Z'},
    {student_id:'aluno',academic_year:2026,bimester:2,subject:'241 - LÍNGUA PORTUGUESA',absences:7,imported_at:'2026-11-13T12:00:00Z'},
    {student_id:'aluno',academic_year:2026,bimester:2,subject:'55 - EDUCAÇÃO FÍSICA',absences:3,imported_at:'2026-11-13T12:00:00Z'}
  ];
  const context={rows,window:{getStudentAttendanceDetails:()=>[{source:'SIAP',academicYear:2026,bimester:4}]},
    escape:value=>String(value),updatedAt:()=> '13/11/2026',escapeAttribute:value=>String(value),capturedDate:()=> '13/11/2026'};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const html=context.window.getStudentSiapAbsenceDetails('aluno');
  assert.match(html,/2º Bim\.\/2026 · Total: 10 faltas/);
  assert.match(html,/LÍNGUA PORTUGUESA: 7 faltas/);
  assert.match(html,/EDUCAÇÃO FÍSICA: 3 faltas/);
  assert.doesNotMatch(html,/4º Bim\.\/2026/);

  context.window.getStudentAttendanceDetails=()=>[];
  assert.match(context.window.getStudentSiapAbsenceDetails('aluno'),/4º Bim\.\/2026 · Total: 11 faltas/);
});
