const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('resultado publicado da carteirinha entra no card pelo ID e preserva o SIAP', async () => {
  const callbacks = new Map();
  let school = 'escola-1';
  const result = {
    student_id:'aluno-1', entry_days:3, observed_days:4, percentage:75,
    period_start:'2026-10-01', period_end:'2026-10-26', published_at:'2026-10-26T12:00:00Z'
  };
  const window = {
    getActiveSchoolId:() => school,
    getStudentAttendanceDetails:id => id === 'aluno-1' ? [{ source:'SIAP', label:'Frequente' }] : [],
    render:() => {}
  };
  const document = { addEventListener:(name,callback) => callbacks.set(name,callback) };
  const db = {
    rpc:async (name,args) => {
      assert.equal(name,'family_entry_attendance_cards');
      assert.equal(args.p_school_id,school);
      return { data:school === 'escola-1' ? [result] : [], error:null };
    },
    auth:{ onAuthStateChange:() => {} }
  };
  const source = fs.readFileSync(path.join(__dirname,'../family-entry-attendance.js'),'utf8');
  vm.runInNewContext(source,{ window,document,db,setInterval:() => {},permission:{ role:'viewer' } });
  callbacks.get('DOMContentLoaded')();
  await new Promise(resolve => setImmediate(resolve));

  const details = window.getStudentAttendanceDetails('aluno-1');
  assert.equal(details.length,2);
  assert.equal(details[0].source,'SIAP');
  assert.equal(details[1].source,'Leitura da carteirinha');
  assert.equal(details[1].summary,'3 de 4 dias com leitura na turma');
  assert.equal(window.getStudentAttendanceDetails('aluno-2').length,0);

  school = 'escola-2';
  assert.equal(window.getStudentAttendanceDetails('aluno-1').length,1);
  callbacks.get('carometro:school-context-ready')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.getStudentAttendanceDetails('aluno-1').length,1);
});
