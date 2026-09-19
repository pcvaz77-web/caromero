const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'contact-support.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(index, /contact-support\.js\?v=2/);
assert.match(source, /contato@sistemacarometro\.com\.br/);
assert.match(source, /5561998971069/);
assert.match(source, /id = 'contactNav'/);
assert.match(source, /Fale conosco/);
assert.match(source, /Enviar uma sugestão/);
assert.match(source, /Dúvida de uso/);
assert.match(source, /getActiveSchoolMembership/);
assert.match(source, /roleLabel/);
assert.match(source, /db\.auth\.getUser/);
assert.match(source, /from\('profiles'\)\.select\('full_name'\)/);
assert.match(source, /Nome: \$\{name\}/);
assert.match(source, /não envie senhas nem dados pessoais de alunos/);
assert.doesNotMatch(source, /students\s*\.|student_id|photo_path/);

console.log('contact-support: contatos, contexto seguro e privacidade validados');
