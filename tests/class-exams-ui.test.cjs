const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../services/siap-exam/node_modules/jsdom');

test('professor cria a prova da turma com cabeçalho e questões próprios', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {runScripts:'dangerously'});
  const {window} = dom;
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const teacherId = '22222222-2222-4222-8222-222222222222';
  const rows = [];
  const calls = [];
  const query = (operation, payload) => {
    const q = {
      eq() { return q; }, order() { return q; }, select() { return q; },
      async single() { if (operation === 'insert') rows.push({...payload,id:'exam-1'}); calls.push(operation); return {data:{id:'exam-1'},error:null}; },
      then(resolve) { resolve({data:rows,error:null}); }
    };
    return q;
  };
  window.getActiveSchoolRole = () => 'teacher';
  window.getActiveSchoolId = () => schoolId;
  window.db = { auth:{getUser:async () => ({data:{user:{id:teacherId}},error:null})}, from:table => {
    assert.equal(table,'class_exams');
    return { select:() => query('read'), insert:payload => query('insert',payload), update:payload => query('update',payload) };
  }};
  try {
    window.eval(readFileSync(path.join(__dirname,'..','cepi-blocks.js'),'utf8'));
    window.eval(readFileSync(path.join(__dirname,'..','class-exams.js'),'utf8'));
    assert.match(window.getClassExamPanelAction(),/Provas da turma/);
    window.document.body.innerHTML = window.getClassExamPanelAction();
    window.bindClassExamPanelAction({classId:'class-1',className:'1º A'});
    window.document.querySelector('#classExamAction').click();
    await new Promise(resolve => setTimeout(resolve,10));
    assert.equal(window.document.querySelectorAll('[data-type]').length,1,'ENEM aparece apenas na 3ª série');
    window.document.querySelector('[data-type="bimestral"]').click();
    window.document.querySelector('#cxeNew').click();
    const form = window.document.querySelector('#cxeForm');
    form.elements.subject.value = 'Ciências';
    form.elements.header_school_name.value = 'Escola Exemplo';
    form.elements.header_subtitle.value = 'Avaliação do 4º bimestre';
    form.elements.bimester.value = '4';
    form.querySelector('.cxeStatement').value = 'Qual é a resposta?';
    form.querySelector('[data-choice="A"]').value = 'Uma';
    form.querySelector('[data-choice="B"]').value = 'Outra';
    form.querySelector('.cxeAnswer').value = 'B';
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve => setTimeout(resolve,10));
    assert.equal(rows.length,1);
    assert.equal(rows[0].school_id,schoolId);
    assert.equal(rows[0].class_id,'class-1');
    assert.equal(rows[0].created_by,teacherId);
    assert.equal(rows[0].header_school_name,'Escola Exemplo');
    assert.equal(rows[0].exam_type,'bimestral');
    assert.equal(rows[0].questions[0].correct_answer,'B');
    assert.deepEqual(calls,['insert']);
    let printed = '';
    window.open = () => ({ document:{write:html => { printed = html; },close() {}},focus() {},print() {} });
    window.document.querySelector('[data-print="exam-1"]').click();
    assert.match(printed,/Escola Exemplo/);
    assert.match(printed,/Avaliação do 4º bimestre/);
    assert.match(printed,/1º A/);
    assert.match(printed,/Qual é a resposta/);
    assert.doesNotMatch(printed,/Gabarito/);
  } finally { dom.window.close(); }
});

test('3ª série recebe menu ENEM com modelo, cotas e disciplina da primeira questão', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {runScripts:'dangerously'});
  const {window} = dom;
  const rows = [];
  window.getActiveSchoolRole = () => 'teacher';
  window.getActiveSchoolId = () => 'school-1';
  window.db = { auth:{getUser:async () => ({data:{user:{id:'teacher-1'}},error:null})},from:() => ({
    select:() => ({eq() {return this;},order:async () => ({data:rows,error:null})}),
    insert:payload => ({select:() => ({single:async () => { rows.push({...payload,id:'exam-1'}); return {data:{id:'exam-1'},error:null}; }})})
  })};
  try {
    window.eval(readFileSync(path.join(__dirname,'..','cepi-blocks.js'),'utf8'));
    window.eval(readFileSync(path.join(__dirname,'..','class-exams.js'),'utf8'));
    window.document.body.innerHTML = window.getClassExamPanelAction();
    window.bindClassExamPanelAction({classId:'class-3',className:'3º A'});
    window.document.querySelector('#classExamAction').click();
    await new Promise(resolve => setTimeout(resolve,10));
    window.document.querySelector('[data-type="enem"]').click();
    window.document.querySelector('#cxeNew').click();
    const form = window.document.querySelector('#cxeForm');
    assert.equal(form.elements.title.value,'SIMULA - ENEM - CADERNO 1 - 4º BIM');
    assert.match(window.document.querySelector('#cxePlan').textContent,/Química: 8/);
    assert.match(form.querySelector('.cxe-question strong').textContent,/Química/);
    form.querySelector('.cxeStatement').value = 'Qual substância representa a resposta?';
    for (const choice of ['A','B','C','D','E']) form.querySelector(`[data-choice="${choice}"]`).value = `Alternativa ${choice}`;
    form.querySelector('.cxeAnswer').value = 'C';
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve => setTimeout(resolve,10));
    assert.equal(rows.length,1);
    assert.equal(rows[0].exam_type,'enem');
    assert.equal(rows[0].enem_model,'caderno_1');
    assert.equal(rows[0].questions[0].subject,'Química');
    assert.equal(rows[0].questions[0].correct_answer,'C');
    assert.equal(window.document.querySelector('[data-print="exam-1"]'),null,'simulado incompleto não é imprimível');
  } finally { dom.window.close(); }
});
