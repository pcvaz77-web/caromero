const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'occurrence-management.js'), 'utf8');
const start = source.indexOf('  function renderOccurrenceItem(item) {');
const end = source.indexOf('\n  async function refreshHistory()', start);
assert.ok(start >= 0 && end > start);

const render = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  formatDate: () => '24/09/2026',
  formatDateTime: value => value.startsWith('2026-09-24T16') ? '24/09/2026 16:06' : '24/09/2026 19:26',
  formatTime: () => '16:06',
  escape: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  canRemarkOccurrence: item => !!item.permissions.remark,
  canEditOccurrence: item => !!item.permissions.edit,
  canDeleteOccurrence: item => !!item.permissions.delete
});

const occurrence = {
  id: 'oc-1', occurred_on: '2026-09-24', created_at: '2026-09-24T16:06:00',
  created_by_name: 'Professora Ana', students: { full_name: 'Aluno Teste' },
  class_name: '7E', occurrence_text: 'Descrição da ocorrência.',
  updated_at: '2026-09-24T19:26:00', updated_by_name: 'Coordenadora Bia',
  student_occurrence_remarks: [{ created_at:'2026-09-24T19:26:00', created_by_name:'Professora Ana', body:'Texto da ressalva.' }],
  permissions: { remark:true, edit:true, delete:true }
};

test('registro, texto, ações e histórico aparecem nessa ordem', () => {
  const html = render(occurrence);
  const positions = ['Registrada em 24/09/2026 às 16:06', 'Responsável: <strong>Professora Ana</strong>',
    '<strong>Aluno Teste</strong>', 'Descrição da ocorrência.', 'Fazer Ressalva', 'Editar', 'Excluir',
    '<h4>Edição</h4>', 'Coordenadora Bia', '<h4>Ressalva</h4>', 'Texto da ressalva.']
    .map(value => html.indexOf(value));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  assert.doesNotMatch(html, /Registrada em:\s*24\/09\/2026 16:06/);
});

test('professor autor sem edição ou exclusão vê somente Fazer Ressalva', () => {
  const html = render({ ...occurrence, permissions:{ remark:true, edit:false, delete:false } });
  assert.match(html, />Fazer Ressalva<\/button>/);
  assert.doesNotMatch(html, />Editar<\/button>|>Excluir<\/button>/);
});

test('quem apenas visualiza não vê ações', () => {
  const html = render({ ...occurrence, permissions:{ remark:false, edit:false, delete:false } });
  assert.doesNotMatch(html, /class="occurrence-item-actions"/);
  assert.match(html, /class="occurrence-item-footer"/);
});
