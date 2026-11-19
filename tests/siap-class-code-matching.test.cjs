const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const files = [
  'siap-grades.js',
  'siap-absences.js',
  'assisted-attendance.js',
  'extensions/carometro-frequencia-leitura/content.js',
  'extensions/carometro-frequencia-leitura/background.js'
];

for (const file of files) {
  test(`${file}: identifica série e letra com variações do nome`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('const classCodes =');
    const end = source.indexOf('};', source.indexOf('const sameClass =', start)) + 2;
    assert.ok(start >= 0 && end > start, `Comparador ausente em ${file}`);
    const sandbox = {};
    vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.matches = sameClass;`, sandbox);
    const matches = sandbox.matches;
    for (const name of ['1A', '1ºA', '1ª A', 'Turma 1°-A — Técnico em Informática', '2027 / 1º A']) {
      assert.equal(matches('1A', name), true, name);
    }
    assert.equal(matches('6B', '6º B - Matutino'), true);
    assert.equal(matches('8D', 'Turma: 8ªD'), true);
    assert.equal(matches('1A', '11A'), false);
    assert.equal(matches('1A', '1B'), false);
    assert.equal(matches('1A/2B', '1A'), false);
  });
}
