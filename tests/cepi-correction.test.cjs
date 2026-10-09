const {test}=require('node:test');
const assert=require('node:assert/strict');
const sheets=require('../cepi-answer-sheets.js');
const correction=require('../cepi-correction.js');

test('bloco misto conserva 30 respostas e o gabarito vem das questões',()=>{
  const exam={id:'exam',title:'BLOCO 4 - ING ART EFI - MÉDIO',question_count:30,answer_format:'ABCDE'};
  const subjects=['Língua Inglesa','Arte','Educação Física'];
  const questions=Array.from({length:30},(_,i)=>({test_id:'exam',number:i+1,subject:subjects[Math.floor(i/10)],correct_answer:'ABCDE'[i%5]}));
  const prepared=sheets.prepare(exam,questions);
  const card=sheets.studentHtml(prepared,'Escola Exemplo',4);
  const key=correction.key(prepared);
  assert.equal(key.answers.length,30);
  assert.deepEqual(key.ranges,[{subject:'Prova CEPI',from:1,to:30}]);
  assert.match(card,/Língua Inglesa: 10 · Arte: 10 · Educação Física: 10/);
  assert.equal((card.match(/class="answer-row"/g)||[]).length,120);
  assert.doesNotMatch(card,/bubble filled/);
});

test('registro recusa alunos de outra turma, duplicações e marcações incertas',()=>{
  const exam={question_count:2,answer_format:'ABCD'};
  const item=(id,studentId,answers)=>({id,kind:'student',status:'ready',review:{studentId,answers,reviewed:true}});
  assert.deepEqual(correction.reviewedItems({items:[item('foto-1','aluno-1',['A','-'])]},['aluno-1'],exam),[{capture_ref:'foto-1',student_id:'aluno-1',answers:['A','-']}]);
  assert.throws(()=>correction.reviewedItems({items:[item('foto-1','outro',['A','B'])]},['aluno-1'],exam),/outra turma/);
  assert.throws(()=>correction.reviewedItems({items:[item('foto-1','aluno-1',['A','B']),item('foto-2','aluno-1',['A','B'])]},['aluno-1'],exam),/dois cartões/);
  assert.throws(()=>correction.reviewedItems({items:[item('foto-1','aluno-1',['?','B'])]},['aluno-1'],exam),/ambígua/);
});
