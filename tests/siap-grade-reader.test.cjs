const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const reader = fs.readFileSync(path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'content.js'), 'utf8');

function snapshot({ mismatch = false, malformed = false } = {}) {
  const names = ['1. ANA EXEMPLO', '2. BRUNO EXEMPLO', '3. CARLA EXEMPLO'];
  const students = names.map((textContent, index) => ({
    dataset:{ matricula:String(index + 1), bloqueado:'False' }, textContent
  }));
  const scores = ['8,1', malformed ? '0/0' : '0.0', ' '];
  const cells = scores.map((textContent, index) => ({
    dataset:{ matricula:String(mismatch && index === 1 ? 9 : index + 1), bloqueado:index === 2 ? 'True' : 'False' }, textContent
  }));
  const finalList = {
    querySelector:() => ({ textContent:' Média Bimestral Final ' }),
    querySelectorAll:() => cells
  };
  const fields = {
    cphFuncionalidade_cphCampos_txtAnoLetivo:'2026',
    cphFuncionalidade_cphCampos_txtComposicao:'199 - Ensino Fundamental',
    cphFuncionalidade_cphCampos_txtSerie:'8º Ano',
    cphFuncionalidade_cphCampos_txtTurno:'Vespertino',
    cphFuncionalidade_cphCampos_txtDisciplina:'55 - EDUCAÇÃO FÍSICA',
    cphFuncionalidade_cphCampos_txtTurma:'8E',
    cphFuncionalidade_cphCampos_txtBimestre:'3º Bimestre',
    lblNomeEntidade:'Col Est Escola Exemplo'
  };
  const context = {
    performance:{ timeOrigin:1 },
    crypto:{ randomUUID:() => 'test' },
    location:{ pathname:'/NotasModeloEdicao.aspx' },
    document:{
      getElementById:id => fields[id] ? { value:fields[id], textContent:fields[id] } : null,
      querySelectorAll:selector => selector.includes('listaDeAlunos') ? students : selector.includes('listaDeTotais') ? [finalList] : []
    }
  };
  vm.runInNewContext(reader, context);
  return context.__carometroGradesSnapshot;
}

test('lê somente a média final e preserva zero separado de campo vazio', () => {
  const result = snapshot()();
  assert.equal(result.context.className, '8E');
  assert.equal(result.schoolName, 'Col Est Escola Exemplo');
  assert.equal(result.entries.length, 3);
  assert.deepEqual(Array.from(result.entries, item => item.score), [8.1, 0, null]);
  assert.equal(result.entries[2].blocked, true);
});

test('interrompe se matrícula e nota não estiverem alinhadas', () => {
  assert.throws(() => snapshot({ mismatch:true })(), /ordem das notas/);
});

test('interrompe se o formato da nota mudar', () => {
  assert.throws(() => snapshot({ malformed:true })(), /formato desconhecido/);
});
