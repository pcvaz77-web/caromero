const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'occurrence-management.js'), 'utf8');
const start = source.indexOf('  async function saveCollective(');
const end = source.indexOf('  async function save()', start);
assert.ok(start >= 0 && end > start);

function setup(attachment = null) {
  const writes = [], uploads = [], messages = [], opened = [];
  let serial = 0;
  const button = { disabled:false, textContent:'' };
  const context = {
    crypto:{randomUUID:() => `uuid-${++serial}`},
    get:() => button,
    sameOccurrenceScope:() => true,
    OCCURRENCE_ATTACHMENT_BUCKET:'occurrence-attachments',
    db:{
      from:table => ({
        insert(rows) {
          assert.equal(table,'student_occurrences');
          writes.push(rows);
          return {select:async() => ({data:rows.map(row => ({id:row.id,student_id:row.student_id})),error:null})};
        }
      }),
      storage:{from:() => ({upload:async(filePath) => {uploads.push(filePath);return {error:null};},remove:async() => ({error:null})})}
    },
    savingOccurrence:false,
    occurrenceStudentIds:new Set(),occurrenceCounts:new Map(),
    paintStudentCards(){},publishOccurrenceLabelState(){},resetOccurrenceScreen(){},
    toast:message => messages.push(message),
    openOccurrenceGroup:args => {opened.push(args);},
    renderCollectiveCount(){},syncSaveAction(){}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const save = () => context.saveCollective({
    scope:{schoolId:'school-a',userId:'teacher-a'},
    classItem:{id:'class-a',name:'6º A'},
    text:'Descrição comum',occurrenceDate:'2026-11-12',attachment,
    studentIds:['student-a','student-b','student-c']
  });
  return {context,writes,uploads,messages,opened,save};
}

test('grava uma ocorrência individual por aluno em uma única inserção',async() => {
  const run = setup();
  await run.save();
  assert.equal(run.writes.length,1);
  const rows = run.writes[0];
  assert.deepEqual(rows.map(row => row.student_id),['student-a','student-b','student-c']);
  assert.equal(new Set(rows.map(row => row.id)).size,3);
  assert.equal(new Set(rows.map(row => row.collective_batch_id)).size,1);
  assert.ok(rows.every(row => row.school_id === 'school-a' && row.class_id === 'class-a' && row.occurrence_text === 'Descrição comum'));
  assert.deepEqual([...run.context.occurrenceCounts.values()],[1,1,1]);
  assert.equal(run.opened.length,1);
  assert.equal(run.opened[0].batchId,rows[0].collective_batch_id);
});

test('anexo coletivo recebe um caminho privado distinto para cada aluno',async() => {
  const run = setup({name:'ata.pdf',type:'application/pdf',size:100});
  await run.save();
  assert.equal(run.uploads.length,3);
  assert.equal(new Set(run.uploads).size,3);
  assert.deepEqual(run.writes[0].map(row => row.attachment_path),run.uploads);
  assert.ok(run.uploads.every(filePath => filePath.startsWith('school-a/teacher-a/')));
});

test('abrir o grupo mostra a descrição e todos os alunos no painel',async() => {
  const from = source.indexOf('  async function refreshHistory()');
  const to = source.indexOf('  async function open()',from);
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',innerHTML:''});
    return nodes.get(id);
  };
  const filters = [];
  const query = {select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;}};
  const records = [
    {id:'one',class_name:'6º A',occurred_on:'2026-11-12',occurrence_text:'Descrição comum',students:{full_name:'Ana'}},
    {id:'two',class_name:'6º A',occurred_on:'2026-11-12',occurrence_text:'Descrição comum',students:{full_name:'Beto'}}
  ];
  const context = {
    historyRequest:0,historyRecords:new Map(),focusedHistoryBatchId:'batch-a',focusedHistoryStudentId:null,
    occurrenceMembership:{school_id:'school-a'},occurrenceScope:() => ({}),sameOccurrenceScope:() => true,canViewOccurrences:() => true,
    selectedClass:() => 'class-a',selectedStudent:() => '',get,
    db:{from:() => query},readOccurrencePages:async() => ({data:records,error:null}),
    renderOccurrenceItem:item => `<article>${item.students.full_name}</article>`,
    escape:value => value,formatDate:value => value
  };
  vm.createContext(context);
  vm.runInContext(source.slice(from,to),context);
  await context.refreshHistory();
  assert.ok(filters.some(([key,value]) => key === 'collective_batch_id' && value === 'batch-a'));
  assert.match(get('occurrenceHistoryList').innerHTML,/Ocorrência coletiva · 6º A/);
  assert.match(get('occurrenceHistoryList').innerHTML,/Descrição comum/);
  assert.match(get('occurrenceHistoryList').innerHTML,/Alunos envolvidos \(2\)/);
  assert.match(get('occurrenceHistoryList').innerHTML,/<li>Ana<\/li><li>Beto<\/li>/);
});
