const assert = require('node:assert/strict');
const test = require('node:test');
const Dom = require('../src/exam-dom.js');

function page(otherCallPresent = false) {
  return {
    context: { total: 10 },
    roster: [{
      id: '1 - Aluno', unavailable: false,
      boxes: [
        { checked: false, disabled: false },
        { checked: false, disabled: false },
        { checked: otherCallPresent, disabled: false },
        { checked: false, disabled: false }
      ],
      row: { cells: [null, null, null, null, null, { querySelectorAll: () => [{ type: 'text', value: '7' }] }] }
    }]
  };
}

test('a reaplicação aceita o mesmo lote revisado depois que o SIAP reteve acertos', () => {
  assert.doesNotThrow(() => Dom.preflight(page(), [{ id: '1 - Aluno', present: true, correct: 7 }], 1));
});

test('a reaplicação não sobrescreve resultado já marcado na outra chamada', () => {
  assert.throws(() => Dom.preflight(page(true), [{ id: '1 - Aluno', present: true, correct: 7 }], 1), /outra chamada/);
});
