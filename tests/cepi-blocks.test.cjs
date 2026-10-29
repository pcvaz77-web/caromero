const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','cepi-blocks.js'),'utf8'),context);
const {plan,enemPlan,enemModel,examPlan,subjectForNumber,subjectRange,nextSubjectNumber,subjectCapacity,title,displayTitle,instructions,summarize,ranking,stageForClassName} = context.window.CepiBlocks;

test('cada disciplina de um bloco ocupa sua faixa mesmo quando professores começam fora de ordem', () => {
  const exam={id:'bloco-6',kind:'bloco',stage:'medio',block_number:6,subject_plan:plan('medio',6),question_count:30};
  assert.deepEqual(JSON.parse(JSON.stringify(subjectRange(exam,'Biologia'))),{start:1,end:15});
  assert.deepEqual(JSON.parse(JSON.stringify(subjectRange(exam,'Sociologia'))),{start:16,end:23});
  assert.deepEqual(JSON.parse(JSON.stringify(subjectRange(exam,'Filosofia'))),{start:24,end:30});
  const rows=[{test_id:exam.id,number:24,subject:'Filosofia'},{test_id:exam.id,number:25,subject:'Filosofia'},{test_id:exam.id,number:1,subject:'Biologia'}];
  assert.equal(nextSubjectNumber(exam,rows,'Filosofia'),26);
  assert.equal(nextSubjectNumber(exam,rows,'Biologia'),2);
  assert.equal(nextSubjectNumber(exam,rows,'Sociologia'),16);
  assert.equal(subjectForNumber(exam,24),'Filosofia');
  assert.equal(subjectForNumber(exam,16),'Sociologia');
  assert.equal(subjectForNumber(exam,1),'Biologia');
  assert.equal(nextSubjectNumber(exam,[...rows,...Array.from({length:5},(_,i)=>({test_id:exam.id,number:26+i,subject:'Filosofia'}))],'Filosofia'),null);
  const fundamental={id:'bloco-4',kind:'bloco',stage:'fundamental_ii',block_number:4,subject_plan:plan('fundamental_ii',4)};
  assert.equal(subjectForNumber(fundamental,1),'Língua Inglesa');
  assert.equal(subjectForNumber(fundamental,6),'Arte');
  assert.equal(subjectForNumber(fundamental,11),'Educação Física');
});

test('modelos ENEM preservam totais, ordem e ano letivo', () => {
  assert.equal(enemPlan('caderno_1').reduce((sum,item)=>sum+item.count,0),45);
  assert.equal(enemPlan('caderno_2').reduce((sum,item)=>sum+item.count,0),45);
  assert.equal(enemPlan('simuladao').reduce((sum,item)=>sum+item.count,0),90);
  assert.equal(title({kind:'simulado',stage:'medio',bimester:4,enemModel:'simuladao',academicYear:2026}),'SIMULADÃO ENEM 2026');
  assert.equal(title({kind:'simulado',stage:'medio',bimester:4,enemModel:'caderno_1',academicYear:2026}),'SIMULADO ENEM - CADERNO 1 - 4º BIM');
  const caderno={kind:'simulado',stage:'medio',title:'SIMULA - ENEM - CADERNO 1 - 4º BIM',question_count:45};
  assert.equal(enemModel(caderno),'caderno_1');
  assert.equal(displayTitle(caderno.title),'SIMULADO ENEM - CADERNO 1 - 4º BIM');
  assert.equal(subjectForNumber(caderno,1),'Química');
  assert.equal(subjectForNumber(caderno,9),'Física');
  assert.equal(subjectForNumber(caderno,45),'Sociologia');
  assert.equal(subjectForNumber(caderno,46),null);
  assert.equal(examPlan(caderno).length,7);
  assert.match(instructions(caderno),/8 questões de Química/);
});

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

test('cada componente de cada bloco trava na própria cota e libera o seguinte', () => {
  for (const stage of ['fundamental_ii','medio']) {
    for (let block=1;block<=6;block++) {
      const subjectPlan=plan(stage,block);
      const exam={id:`${stage}-${block}`,kind:'bloco',stage,block_number:block,subject_plan:subjectPlan};
      let number=0;
      const rows=[];
      for (const entry of subjectPlan) {
        const before=subjectCapacity(exam,rows,entry.subject);
        assert.equal(before.full,false,`${stage}, bloco ${block}, ${entry.subject}`);
        for(let index=0;index<entry.count;index++)rows.push({id:`${exam.id}-${++number}`,test_id:exam.id,number,subject:entry.subject});
        const filled=subjectCapacity(exam,rows,entry.subject);
        assert.equal(filled.full,true,`${stage}, bloco ${block}, ${entry.subject}`);
        assert.equal(filled.lastNumber,number);
        assert.equal(subjectCapacity(exam,rows,entry.subject,rows.at(-1).id).full,false,'edição da própria questão continua permitida');
      }
    }
  }
  assert.equal(subjectCapacity({kind:'simulado'},[],'Arte'),null);
});

test('orientação usa a quantidade e as disciplinas do bloco e da etapa escolhidos', () => {
  const fundamental={kind:'bloco',stage:'fundamental_ii',block_number:1,question_count:15,subject_plan:plan('fundamental_ii',1)};
  const medio={kind:'bloco',stage:'medio',block_number:1,question_count:20,subject_plan:plan('medio',1)};
  const misto={kind:'bloco',stage:'medio',block_number:2,question_count:30,subject_plan:plan('medio',2)};
  assert.match(instructions(fundamental),/15 questões de Língua Portuguesa/);
  assert.match(instructions(medio),/20 questões de Língua Portuguesa/);
  assert.match(instructions(misto),/15 questões de Geografia e 15 questões de História/);
  assert.doesNotMatch(instructions(misto),/Língua Portuguesa/);
  for (const stage of ['fundamental_ii','medio']) {
    for (let block=1;block<=6;block++) {
      const entries=plan(stage,block);
      const count=entries.reduce((sum,item)=>sum+item.count,0);
      const text=instructions({kind:'bloco',stage,block_number:block,question_count:count,subject_plan:entries});
      assert.match(text,new RegExp(`${count} questões?`),`${stage}, bloco ${block}`);
      entries.forEach(item=>assert.ok(text.includes(`${item.count} questões de ${item.subject}`),`${stage}, bloco ${block}, ${item.subject}`));
    }
  }
});

test('outras provas usam as questões cadastradas e não inventam distribuição incompleta', () => {
  const prova={id:'p1',kind:'simulado',question_count:3,subjects:['Arte','Ciências']};
  const rows=[{test_id:'p1',subject:'Arte'},{test_id:'p1',subject:'Ciências'},{test_id:'p1',subject:'Ciências'}];
  assert.match(instructions(prova,rows),/1 questão de Arte e 2 questões de Ciências/);
  assert.doesNotMatch(instructions(prova,rows.slice(0,2)),/assim distribuídas/);
  assert.doesNotMatch(instructions({...prova,kind:'bloco',subject_plan:[{subject:'Arte',count:7}]},rows),/7 questões de Arte/);
});

test('somente a orientação final personalizada altera o texto padrão', () => {
  const prova={kind:'bloco',stage:'medio',block_number:2,question_count:30,subject_plan:plan('medio',2)};
  const text=instructions(prova,[],'Confira o tempo disponível. Boa prova!');
  assert.match(text,/30 questões, assim distribuídas: 15 questões de Geografia e 15 questões de História/);
  assert.match(text,/Confira o tempo disponível\. Boa prova!$/);
  assert.doesNotMatch(text,/Leia atentamente/);
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
  const tests=[{id:'e1',kind:'bloco',status:'ready',academic_year:2026,bimester:3,stage:'fundamental_ii',block_number:1,class_ids:['c1'],subject_plan:[{subject:'Português',count:1}],question_count:1}];
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
