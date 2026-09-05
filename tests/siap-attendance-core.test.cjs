const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../siap-attendance-core.js');

test('exige consulta e escolha do componente antes da frequência', () => {
  const source = fs.readFileSync(path.join(__dirname, '../siap-integration.js'), 'utf8');
  assert.match(source, /SIAP_COMPONENTS_REQUEST/);
  assert.match(source, /siapAttendanceComponent/);
  assert.match(source, /if \(!componentId\)/);
});

test('normaliza diferenças comuns sem depender da ordem da lista', () => {
  assert.equal(core.normalizeName(' João  Pedro da Silva '), 'JOAO PEDRO DA SILVA');
  assert.equal(core.normalizeName('12. João Pedro da Silva'), 'JOAO PEDRO DA SILVA');
  const result = core.matchStudents(
    [{ id:'1', name:'7. Maria Eduarda Souza' }, { id:'2', name:'12. João Pedro da Silva' }],
    [{ name:'JOAO PEDRO DA SILVA', present:8, total:10 }, { name:'Maria Eduarda Souza', present:10, total:10 }]
  );
  assert.deepEqual(result.matches.map(item => item.student.id), ['2', '1']);
  assert.equal(result.conflicts.length, 0);
});

test('não decide automaticamente nomes ambíguos', () => {
  const result = core.matchStudents(
    [{ id:'1', name:'João Silva Santos' }, { id:'2', name:'João Silva Souza' }],
    [{ name:'João Silva', present:8, total:10 }]
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.conflicts.length, 1);
});

test('classifica o percentual de presença combinado', () => {
  assert.deepEqual(core.classifyAttendance({ present:8, total:10 }), { key:'frequent', label:'Frequente', percentage:80 });
  assert.deepEqual(core.classifyAttendance({ present:6, total:10 }), { key:'attention', label:'Costuma faltar', percentage:60 });
  assert.deepEqual(core.classifyAttendance({ present:4, total:10 }), { key:'critical', label:'Falta muito', percentage:40 });
  assert.deepEqual(core.classifyAttendance({ transferred:true, present:10, total:10 }), { key:'transferred', label:'Transferido', percentage:null });
});

test('respeita exatamente os limites de 75% e 50%', () => {
  assert.deepEqual(core.classifyAttendance({ present:3, total:4 }), { key:'frequent', label:'Frequente', percentage:75 });
  assert.deepEqual(core.classifyAttendance({ present:1, total:2 }), { key:'attention', label:'Costuma faltar', percentage:50 });
  assert.deepEqual(core.classifyAttendance({ present:49, total:100 }), { key:'critical', label:'Falta muito', percentage:49 });
  assert.deepEqual(core.classifyAttendance({ present:0, total:0 }), { key:'unknown', label:'Sem dados', percentage:null });
});
