const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'cepi-tutoring.js'), 'utf8');
const start = source.indexOf('  const selectedAssignmentStudentIds = new Set();');
const end = source.indexOf('  async function endAssignment(', start);
assert.ok(start >= 0 && end > start, 'Bloco de distribuição não encontrado');

test('a seleção acumula alunos entre turma, busca global e lista geral antes do envio', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '', disabled: false, scrollTop: 0,
      classList: { toggle() {}, remove() {} }
    });
    return elements.get(id);
  };
  const students = [
    { id:'a1', name:'Ana', classId:'A', className:'6A' },
    { id:'a2', name:'Alice', classId:'A', className:'6A' },
    { id:'b1', name:'Bruna', classId:'B', className:'7B' },
    { id:'c1', name:'Carlos', classId:'C', className:'8C' },
    { id:'used', name:'Aluno com tutor', classId:'A', className:'6A' },
    ...Array.from({ length:105 }, (_, index) => ({ id:`z${index}`, name:`Zed ${String(index).padStart(3, '0')}`, classId:'D', className:'9D' }))
  ];
  let insertedRows;
  let insertCount = 0;
  let closed = false;
  const context = {
    document: {
      getElementById: element,
      querySelectorAll: () => []
    },
    assignmentModal: { classList: { remove() {} } },
    students,
    assignments: [{ student_id:'used' }],
    tutors: [{ id:'tutor-1', display_name:'Tutor' }],
    escapeHtml: value => String(value),
    normalizeSearch: value => String(value || '').toLocaleLowerCase('pt-BR').trim(),
    compareStudentNames: (a, b) => a.localeCompare(b, 'pt-BR'),
    window: { getActiveSchoolId: () => 'school-1' },
    db: {
      auth: { getUser: async () => ({ data:{ user:{ id:'manager-1' } } }) },
      from: () => ({ insert: async rows => { insertCount++; insertedRows = rows; return { error:null }; } })
    },
    closeModal: () => { closed = true; },
    toast() {},
    loadTutoring: async () => {}
  };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.assignmentTest = { openAssignmentForm };', context);
  context.assignmentTest.openAssignmentForm();
  const tutor = element('cepiAssignmentTutor');
  tutor.value = 'tutor-1';
  tutor.onchange();
  const classFilter = element('cepiAssignmentClass');
  const nameFilter = element('cepiAssignmentName');
  const picker = element('cepiAssignmentStudents');
  const choose = (id, checked = true) => picker.onchange({ target:{
    value:id, checked,
    matches: () => true,
    closest: () => ({ classList:{ toggle() {} } })
  } });

  classFilter.value = 'A';
  classFilter.onchange();
  choose('a1');
  choose('a2');
  assert.equal(element('cepiSelectedCount').textContent, '2 alunos selecionados');
  choose('a2', false);
  assert.equal(element('cepiSelectedCount').textContent, '1 aluno selecionado');
  choose('a2');
  assert.doesNotMatch(picker.innerHTML, /value="used"/);

  nameFilter.value = 'Bruna';
  nameFilter.oninput();
  assert.equal(classFilter.value, '', 'a busca pelo nome deve alcançar todas as turmas');
  assert.match(picker.innerHTML, /value="b1"/);
  choose('b1');
  assert.equal(element('cepiSelectedCount').textContent, '3 alunos selecionados');

  nameFilter.value = '';
  nameFilter.oninput();
  assert.match(picker.innerHTML, /value="a1" checked/);
  assert.match(picker.innerHTML, /value="b1" checked/);
  choose('c1');
  assert.equal(element('cepiSelectedCount').textContent, '4 alunos selecionados');
  assert.match(element('cepiSelectedStudents').innerHTML, /Bruna/);
  assert.doesNotMatch(picker.innerHTML, /value="z104"/);
  element('cepiAssignmentMore').onclick();
  assert.match(picker.innerHTML, /value="z104"/);
  assert.equal(element('cepiSelectedCount').textContent, '4 alunos selecionados');
  assert.equal(element('cepiAssignmentSubmit').disabled, false);
  assert.equal(element('cepiAssignmentSubmit').textContent, 'Distribuir 4 alunos');
  assert.equal(insertedRows, undefined, 'a seleção não deve distribuir alunos antes da confirmação');

  await Promise.all([
    element('cepiAssignmentForm').onsubmit({ preventDefault() {} }),
    element('cepiAssignmentForm').onsubmit({ preventDefault() {} })
  ]);
  assert.equal(insertCount, 1, 'dois cliques rápidos devem gerar apenas um envio');
  assert.deepEqual(Array.from(insertedRows, row => row.student_id), ['a1','a2','b1','c1']);
  assert.ok(insertedRows.every(row => row.school_id === 'school-1' && row.tutor_id === 'tutor-1'));
  assert.equal(closed, true);
});
