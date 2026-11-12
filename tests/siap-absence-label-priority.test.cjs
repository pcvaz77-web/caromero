const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','school-daily-attendance.js'),'utf8');
const start=source.indexOf('  async function loadEffectiveBadges()');
const end=source.indexOf('  window.getSchoolDailyAttendanceStatus',start);
assert.ok(start>=0&&end>start);

async function calculate(oldRow,notesRows){
  const effectiveBadges=new Map();
  const sandbox={
    effectiveBadges,
    STATUS:{frequent:{},absent:{},active_search:{}},
    classify:p=>p>=75?'frequent':p>=60?'absent':'active_search',
    loadThresholds:async()=>{},teacherStatus:()=>null,students:[],
    window:{getActiveSchoolId:()=> 'school',render:()=>{}},
    document:{dispatchEvent:()=>{}},CustomEvent:class{},console,
    db:{
      rpc:async()=>({data:oldRow?[oldRow]:[],error:null}),
      from:()=>({select:()=>({eq:()=>({range:async()=>({data:notesRows,error:null})})})})
    }
  };
  vm.runInNewContext(`${source.slice(start,end)}\nglobalThis.load=loadEffectiveBadges;`,sandbox);
  await sandbox.load();
  return effectiveBadges.get('student');
}

const notes=(absences,percentage)=>({student_id:'student',academic_year:2026,bimester:4,
  subject:'55 - EDUCAÇÃO FÍSICA',absences,taught_hours:8,percentage,imported_at:'2026-11-12T12:00:00Z'});
const calls=(percentage,status)=>({student_id:'student',academic_year:2026,term:'4º Bimestre',
  source_key:'teacher',percentage,status,updated_at:'2026-11-11T12:00:00Z'});

test('faltas 3 de 8 geram 63% e etiqueta Faltoso quando chamada era frequente',async()=>{
  const result=await calculate(calls(85,'frequent'),[notes(3,63)]);
  assert.equal(result.source_key,'teacher_notes');
  assert.equal(result.status,'absent');
  assert.equal(result.percentage,63);
});

test('captura por datas mais grave continua visível no mesmo bimestre',async()=>{
  const result=await calculate(calls(50,'active_search'),[notes(1,88)]);
  assert.equal(result.source_key,'teacher');
  assert.equal(result.status,'active_search');
});

test('Notas de bimestre mais recente substituem etiqueta antiga',async()=>{
  const old={...calls(50,'active_search'),term:'3º Bimestre'};
  const result=await calculate(old,[notes(1,88)]);
  assert.equal(result.source_key,'teacher_notes');
  assert.equal(result.status,'frequent');
});
