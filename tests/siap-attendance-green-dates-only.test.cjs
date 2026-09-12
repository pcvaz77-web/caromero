const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const content = fs.readFileSync(
  path.join(__dirname, '../extensions/carometro-frequencia-leitura/content.js'),
  'utf8'
);

test('a extensao exige aula executada e frequencia lancada', () => {
  assert.match(content, /data-executado[\s\S]*=== 'true'/);
  assert.match(content, /data-lancamento-frequencia[\s\S]*=== 'true'/);
  assert.match(content, /filter\(isSavedAttendanceCell\)/);
});
