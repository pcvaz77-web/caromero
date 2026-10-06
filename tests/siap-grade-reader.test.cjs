const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const reader = fs.readFileSync(path.join(__dirname, '..', 'extensions', 'carometro-frequencia-leitura', 'content.js'), 'utf8');

function snapshot({ mismatch = false, malformed = false, classic = false, duplicateTable = false, missingFinalCell = false } = {}) {
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
  const classicRows = [
    { cells:['Alunos', 'trabalho avaliativo', 'seminário', 'Nota Extra', 'Faltas', 'Notas Finais'].map(textContent => ({ textContent })) },
    { cells:['1. ANA EXEMPLO', '10', '10', '9', '0', '8,1'].map(textContent => ({ textContent })) },
    { cells:['2. BRUNO EXEMPLO', '9', '9', '9', '0', malformed ? '0/0' : '0,0'].map(textContent => ({ textContent })) },
    { cells:['3. CARLA EXEMPLO', '', '', '', '0', '--'].map(textContent => ({ textContent })) }
  ];
  if (missingFinalCell) classicRows[2].cells.pop();
  const classicTable = { rows:classicRows };
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
    location:{ pathname:classic ? '/NotasEdicao.aspx' : '/NotasModeloEdicao.aspx' },
    document:{
      getElementById:id => fields[id] ? { value:fields[id], textContent:fields[id] } : null,
      querySelectorAll:selector => selector === 'table' ? classic ? duplicateTable ? [classicTable, classicTable] : [classicTable] : [] :
        selector.includes('listaDeAlunos') ? students : selector.includes('listaDeTotais') ? [finalList] : []
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

test('lê somente Notas Finais na tela clássica, sem confundir avaliações e faltas', () => {
  const result = snapshot({ classic:true })();
  assert.equal(result.context.className, '8E');
  assert.deepEqual(Array.from(result.entries, item => item.name), ['ANA EXEMPLO', 'BRUNO EXEMPLO', 'CARLA EXEMPLO']);
  assert.deepEqual(Array.from(result.entries, item => item.score), [8.1, 0, null]);
});

test('interrompe se a nota final clássica for desconhecida ou a tabela ambígua', () => {
  assert.throws(() => snapshot({ classic:true, malformed:true })(), /formato desconhecido/);
  assert.throws(() => snapshot({ classic:true, duplicateTable:true })(), /com segurança/);
  assert.throws(() => snapshot({ classic:true, missingFinalCell:true })(), /não contém a coluna Notas Finais/);
});
