const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const details = fs.readFileSync(path.join(root, 'permissions-and-details.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(details, /#studentDetails\s*\{[^}]*max-height:calc\(100dvh - 188px\)[^}]*overflow-y:auto/);
assert.match(details, /#studentDetails \.student-detail-close\s*\{[^}]*position:sticky[^}]*top:0/);
assert.match(index, /permissions-and-details\.js\?v=65/);

console.log('O perfil do aluno permanece dentro da tela e permite consultar todas as observações.');
