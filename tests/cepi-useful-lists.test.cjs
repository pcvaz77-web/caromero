const test = require('node:test');
const assert = require('node:assert/strict');
const {prepare, table, printHtml} = require('../cepi-useful-lists.js');

const schoolId='school-1', otherSchool='school-2', classId='class-6b';
const input={
  schoolId,classId,year:2026,semester:2,
  students:[
    {id:'pedro',school_id:schoolId,class_id:classId,full_name:'2. Pedro',enrollment_status:'active'},
    {id:'joao',school_id:schoolId,class_id:classId,full_name:'1. João',enrollment_status:'active'},
    {id:'inactive',school_id:schoolId,class_id:classId,full_name:'Ana',enrollment_status:'archived'},
    {id:'other',school_id:otherSchool,class_id:classId,full_name:'Outro',enrollment_status:'active'}
  ],
  groups:[
    {id:'elective',school_id:schoolId,kind:'eletiva',title:'Descobertas do saber',academic_year:2026,semester:2,active:true,responsible_user_id:'teacher-1'},
    {id:'club',school_id:schoolId,kind:'clube',title:'Criando jogos',academic_year:2026,semester:null,active:true,responsible_user_id:'teacher-2'},
    {id:'old',school_id:schoolId,kind:'eletiva',title:'Eletiva anterior',academic_year:2025,semester:2,active:true},
    {id:'ended',school_id:schoolId,kind:'clube',title:'Clube encerrado',academic_year:2026,semester:2,active:false},
    {id:'foreign',school_id:otherSchool,kind:'eletiva',title:'Outra escola',academic_year:2026,semester:2,active:true}
  ],
  groupStudents:[
    {school_id:schoolId,group_id:'elective',student_id:'joao',ended_at:null},
    {school_id:schoolId,group_id:'club',student_id:'joao',ended_at:null},
    {school_id:schoolId,group_id:'old',student_id:'joao',ended_at:null},
    {school_id:schoolId,group_id:'ended',student_id:'joao',ended_at:null},
    {school_id:otherSchool,group_id:'foreign',student_id:'joao',ended_at:null},
    {school_id:schoolId,group_id:'club',student_id:'pedro',ended_at:'2026-08-01'}
  ],
  groupTeachers:[{user_id:'teacher-1',full_name:'Professora Ana'},{user_id:'teacher-2',full_name:'Professor Beto'}],
  tutors:[{id:'tutor',school_id:schoolId,display_name:'Professor Cícero'}],
  tutorAssignments:[{school_id:schoolId,student_id:'joao',tutor_id:'tutor',active:true}]
};

test('monta somente os vínculos atuais da turma e escola escolhidas', () => {
  const rows=prepare(input);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.name),['1. João','2. Pedro']);
  assert.deepEqual(rows[0].electives,[{title:'Descobertas do saber',teacher:'Professora Ana'}]);
  assert.deepEqual(rows[0].clubs,[{title:'Criando jogos',teacher:'Professor Beto'}]);
  assert.equal(rows[0].tutor,'Professor Cícero');
  assert.equal(rows[1].electives.length,0);
  assert.equal(rows[1].clubs.length,0);
  assert.equal(rows[1].tutor,'Tutor não definido');
});

test('distingue o semestre e escapa dados na prévia e impressão', () => {
  const rows=prepare({...input,semester:1});
  assert.equal(rows[0].electives.length,0);
  assert.equal(rows[0].clubs.length,1);
  const markup=table([{...rows[0],name:'João <script>alert(1)</script>'}]);
  assert.match(markup,/João &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<script>alert\(1\)<\/script>/);
  const printed=printHtml({rows,schoolName:'CEPI Escola',className:'6B',year:2026,semester:1});
  assert.match(printed,/Alocações da turma 6B/);
  assert.match(printed,/Professor responsável: Professor Beto/);
  assert.doesNotMatch(printed,/2\. Pedro · 6B/);
});
