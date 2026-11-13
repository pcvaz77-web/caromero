const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {classifyLatest,totalsForPeriod} = require('../siap-absence-calculations.js');

const row = (student,subject,absences,taught_hours,bimester=3) => ({
  student_id:student,subject,absences,taught_hours,academic_year:2026,bimester,imported_at:'2026-11-13T10:00:00Z'
});

test('inverte as faltas para presença com os mesmos limites configuráveis',() => {
  assert.equal(classifyLatest([row('a','Educação Física',0,19)],null).status,'frequent');
  assert.deepEqual([classifyLatest([row('a','Educação Física',5,19)],null).percentage,
    classifyLatest([row('a','Educação Física',5,19)],null).status],[74,'absent']);
  assert.equal(classifyLatest([row('a','Educação Física',8,19)],null).status,'active_search');
  assert.equal(classifyLatest([row('a','Educação Física',4,19)],null,{frequentMinimum:80,absentMinimum:65}).status,'absent');
});

test('carga incompatível ou período mais antigo preserva a etiqueta das chamadas',() => {
  assert.equal(classifyLatest([row('a','Matemática',16,7,4)],null),null);
  assert.equal(classifyLatest([row('a','Matemática',0,0,4)],null),null);
  assert.equal(classifyLatest([row('a','Matemática',5,19,3)],{academic_year:2026,term:'4º Bimestre'}),null);
  assert.equal(classifyLatest([row('a','Matemática',5,19,3)],{academic_year:2026,term:'3º Bimestre / 4º Bimestre'}),null);
  assert.equal(classifyLatest([row('a','Matemática',5,19,3)],{academic_year:2026,term:'2º semestre'}),null);
  assert.equal(classifyLatest([row('a','Matemática',5,19,3)],{academic_year:2026,term:'3º Bimestre'}).status,'absent');
});

test('uma disciplina inconsistente impede etiqueta parcial e as válidas usam o percentual geral',() => {
  assert.equal(classifyLatest([row('a','Educação Física',0,19),row('a','Matemática',16,7)],null),null);
  const result=classifyLatest([row('a','Educação Física',1,19),row('a','Matemática',8,19)],null);
  assert.equal(result.percentage,76);
  assert.equal(result.status,'frequent');
  assert.equal(result.total_absences,9);
  assert.equal(result.total_taught_hours,38);
  assert.deepEqual(result.subjects,['Educação Física','Matemática']);
  assert.deepEqual(result.subject_details,[
    {subject:'Educação Física',absences:1,taught_hours:19},
    {subject:'Matemática',absences:8,taught_hours:19}
  ]);
  assert.equal(result.subject_count,2);
  assert.equal(classifyLatest([row('a','Educação Física',2,19),row('a','Matemática',8,19)],null).status,'absent');
  assert.equal(classifyLatest([row('a','Educação Física',8,19),row('a','Matemática',8,19)],null).status,'active_search');
});

test('total por aluno e média da turma somam apenas disciplinas capturadas no período',() => {
  const summary=totalsForPeriod([row('a','Matemática',3,19),row('a','Educação Física',2,19),row('b','Matemática',1,19)]);
  assert.equal(summary.byStudent.get('a').total,5);
  assert.equal(summary.byStudent.get('b').total,1);
  assert.equal(summary.mean,3);
});

test('perfil separa o total destacado e a disciplina mesmo quando há só uma',() => {
  const source=fs.readFileSync(path.join(__dirname,'..','school-daily-attendance.js'),'utf8');
  const start=source.indexOf('  window.getStudentAttendanceDetails = studentId => {');
  const end=source.indexOf('  window.getSiapAttendanceStatus =',start);
  assert.ok(start>=0 && end>start);
  const item=classifyLatest([row('a','55 - EDUCAÇÃO FÍSICA',6,19)],null);
  const context={window:{},effectiveBadges:new Map([['a',item]]),STATUS:{
    frequent:{label:'Frequência adequada',className:'frequent'},
    absent:{label:'Faltoso',className:'absent'},
    active_search:{label:'Necessita de Busca Ativa',className:'active-search'}
  }};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  assert.equal(context.window.getStudentAttendanceDetails('a')[0].summary,
    'Total: 6 Faltas em 19 aulas ministradas.');
  assert.deepEqual(Array.from(context.window.getStudentAttendanceDetails('a')[0].subjectLines),[
    'Educação Física: 6 Faltas em 19 aulas ministradas.'
  ]);
  const combined=classifyLatest([row('a','55 - EDUCAÇÃO FÍSICA',1,19),row('a','MATEMÁTICA',8,19)],null);
  context.effectiveBadges.set('a',combined);
  assert.equal(context.window.getStudentAttendanceDetails('a')[0].summary,
    'Total: 9 Faltas em 38 aulas ministradas.');
  assert.deepEqual(Array.from(context.window.getStudentAttendanceDetails('a')[0].subjectLines),[
    'Educação Física: 1 Falta em 19 aulas ministradas.',
    'Matemática: 8 Faltas em 19 aulas ministradas.'
  ]);
});

test('carregamento prioriza faltas válidas e mantém a captura mais recente por datas',async() => {
  const source=fs.readFileSync(path.join(__dirname,'..','school-daily-attendance.js'),'utf8');
  const start=source.indexOf('  async function loadAbsenceLabels(');
  const end=source.indexOf('  async function loadEffectiveBadges()',start);
  assert.ok(start>=0 && end>start);
  const stored=[row('a','Matemática',4,19),row('b','Educação Física',4,19),row('c','Matemática',16,7,4)];
  const context={
    window:{SiapAbsenceCalculations:require('../siap-absence-calculations.js')},
    DEFAULT_THRESHOLDS:{frequentMinimum:75,absentMinimum:60},
    db:{from:table => {
      const query={select(){return this;},eq(){return this;},order(){return this;},range:async() => ({data:stored,error:null}),
        maybeSingle:async() => ({data:{frequent_minimum:80,absent_minimum:65},error:null})};
      assert.ok(['siap_bimester_absences','school_siap_attendance_settings'].includes(table));
      return query;
    }}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const badges=new Map([
    ['a',{student_id:'a',academic_year:2026,term:'4º Bimestre',source_key:'teacher',status:'frequent'}],
    ['b',{student_id:'b',academic_year:2026,term:'3º Bimestre',source_key:'teacher',status:'frequent'}]
  ]);
  await context.loadAbsenceLabels('school-a',badges);
  assert.equal(badges.get('a').source_key,'teacher');
  assert.equal(badges.get('b').source_key,'absence');
  assert.equal(badges.get('b').status,'absent');
  assert.equal(badges.has('c'),false);
});
