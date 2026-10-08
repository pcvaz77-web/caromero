const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','cepi-blocks.js'),'utf8'),context);
const {plan,title,summarize,ranking,stageForClassName} = context.window.CepiBlocks;

test('turmas são identificadas pela série da etapa escolhida', () => {
  for (const name of ['6A','7º B','8º Ano C','9D']) assert.equal(stageForClassName(name),'fundamental_ii',name);
  for (const name of ['1A','2B','3ª Série C','Ensino Médio 1D']) assert.equal(stageForClassName(name),'medio',name);
  for (const name of ['1º ano fundamental A','2º Ano B','4A','5B','Sem série']) assert.equal(stageForClassName(name),null,name);
});

test('o teste recebe o nome do bloco sem campo livre', () => {
  assert.equal(title({kind:'bloco',stage:'fundamental_ii',bimester:3,blockNumber:2}),
    'BLOCO 2 - CIÊNCIAS - FUNDAMENTAL - 3º BIM');
  assert.equal(title({kind:'bloco',stage:'medio',bimester:3,blockNumber:6}),
    'BLOCO 6 - BIO SOC FIL - MÉDIO - 3º BIM');
  assert.equal(title({kind:'bloco',stage:'medio',bimester:3,blockNumber:7}),null);
});

test('os seis blocos de cada etapa têm a distribuição informada', () => {
  const expected = {
    fundamental_ii:[
      [['Língua Portuguesa',15]], [['Ciências',15]], [['Matemática',15]],
      [['Língua Inglesa',5],['Arte',5],['Educação Física',5]],
      [['História',15]], [['Geografia',15]]
    ],
    medio:[
      [['Língua Portuguesa',20]], [['Geografia',15],['História',15]],
      [['Matemática',20]], [['Língua Inglesa',10],['Arte',10],['Educação Física',10]],
      [['Física',15],['Química',15]], [['Biologia',15],['Sociologia',8],['Filosofia',7]]
    ]
  };
  for (const [stage,blocks] of Object.entries(expected)) {
    blocks.forEach((entries,index) => {
      assert.deepEqual(JSON.parse(JSON.stringify(plan(stage,index+1))),entries.map(([subject,count])=>({subject,count})));
    });
  }
  assert.equal(plan('medio',7),null);
});

test('o total é ponderado por questões e não pela média dos percentuais', () => {
  const exam={id:'e1',question_count:4};
  const questions=[
    {test_id:'e1',number:1,subject:'Arte',correct_answer:'A'},
    {test_id:'e1',number:2,subject:'Matemática',correct_answer:'B'},
    {test_id:'e1',number:3,subject:'Matemática',correct_answer:'B'},
    {test_id:'e1',number:4,subject:'Matemática',correct_answer:'B'}
  ];
  const score=summarize(exam,questions,['A','A','A','A']);
  assert.equal(score.correct,1);
  assert.equal(score.total,4);
  assert.equal(score.bySubject.Arte.correct,1);
  assert.equal(score.bySubject.Matemática.total,3);
});

test('ausência não vira zero, segunda chamada revista prevalece e transferido não entra', () => {
  const tests=[{id:'e1',kind:'bloco',status:'applied',academic_year:2026,bimester:3,stage:'fundamental_ii',block_number:1,class_ids:['c1'],subject_plan:[{subject:'Português',count:1}],question_count:1}];
  const questions=[{test_id:'e1',number:1,subject:'Português',correct_answer:'A'}];
  const students=[
    {id:'s1',full_name:'Ana',class_id:'c1',enrollment_status:'active'},
    {id:'s2',full_name:'Bruno',class_id:'c1',enrollment_status:'active'},
    {id:'s3',full_name:'Caio',class_id:'c1',enrollment_status:'transferred'}
  ];
  const results=[
    {test_id:'e1',student_id:'s1',call_number:1,answers:['A'],reviewed_at:'2026-09-01'},
    {test_id:'e1',student_id:'s1',call_number:2,answers:['B'],reviewed_at:'2026-09-08'},
    {test_id:'e1',student_id:'s3',call_number:1,answers:['A'],reviewed_at:'2026-09-01'}
  ];
  const report=ranking({tests,questions,results,students,academicYear:2026,bimester:3,stage:'fundamental_ii',classId:'c1'});
  assert.equal(report.rows.length,2);
  assert.equal(report.rows[0].student.id,'s1');
  assert.equal(report.rows[0].percent,0);
  assert.equal(report.rows[0].rank,1);
  assert.equal(report.rows[1].student.id,'s2');
  assert.equal(report.rows[1].percent,null);
  assert.equal(report.rows[1].rank,null);
});

test('provas de outra turma não aumentam a pendência do aluno', () => {
  const tests=['c1','c2'].map((classId,index)=>({id:`e${index+1}`,kind:'bloco',status:'applied',academic_year:2026,bimester:3,stage:'fundamental_ii',block_number:1,class_ids:[classId],subject_plan:[{subject:'Ciências',count:1}],question_count:1}));
  const questions=tests.map(t=>({test_id:t.id,number:1,subject:'Ciências',correct_answer:'A'}));
  const students=[{id:'s1',full_name:'Ana',class_id:'c1',enrollment_status:'active'}];
  const results=[{test_id:'e1',student_id:'s1',call_number:1,answers:['A'],reviewed_at:'2026-09-01'}];
  const report=ranking({tests,questions,results,students,academicYear:2026,bimester:3,stage:'fundamental_ii'});
  assert.equal(report.rows[0].expected,1);
  assert.equal(report.rows[0].covered,1);
  assert.equal(report.rows[0].rank,1);
});
