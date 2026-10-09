const test = require('node:test');
const assert = require('node:assert/strict');
const { render, qrValue } = require('../family-card-print.js');

const card = number => ({
  student_name: `Aluno ${number}`,
  class_name: '6A',
  guardian_name: 'Responsável',
  guardian_phone: '+5562999999999',
  qr_token: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
});

test('uma folha A4 contém oito frentes e oito versos na ordem de dobra correta', () => {
  const html = render(Array.from({ length: 8 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`);
  const sheets = [...html.matchAll(/<section class="sheet">([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(sheets.length, 2);
  assert.equal((sheets[0].match(/class="card-face"/g) || []).length, 8);
  assert.equal((sheets[1].match(/class="card-face card-back"/g) || []).length, 8);
  const frontNames = [...sheets[0].matchAll(/<strong>(Aluno \d+)<\/strong>/g)].map(match => match[1]);
  const backNames = [...sheets[1].matchAll(/<strong>(Aluno \d+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(frontNames, ['Aluno 1','Aluno 2','Aluno 3','Aluno 4','Aluno 5','Aluno 6','Aluno 7','Aluno 8']);
  assert.deepEqual(backNames, ['Aluno 2','Aluno 1','Aluno 4','Aluno 3','Aluno 6','Aluno 5','Aluno 8','Aluno 7']);
});

test('nove alunos geram duas folhas físicas e posição vazia no último verso', () => {
  const html = render(Array.from({ length: 9 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`);
  assert.equal((html.match(/<section class="sheet">/g) || []).length, 4);
  assert.equal((html.match(/class="card-face blank"/g) || []).length, 7);
  assert.equal((html.match(/data-qr="CAROMETRO:CARD:/g) || []).length, 9);
});

test('nome exibido é escapado e QR aceita somente token de carteirinha', () => {
  const item = { ...card(1), student_name: '<script>alert(1)</script>' };
  const html = render([item], 'Escola & Cia', () => '<svg></svg>');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Escola &amp; Cia'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.equal(qrValue(item.qr_token), `CAROMETRO:CARD:${item.qr_token}`);
  assert.throws(() => qrValue('outro-aluno'), /inválido/);
});

test('faixa azul da escola integra frente e verso mesmo sem fundos de impressão', () => {
  const html = render([card(1)], 'Escola & Cia', () => '<svg></svg>');
  assert.equal((html.match(/<rect width="100" height="20" fill="#1d3b76"\/>/g) || []).length, 2);
  assert.equal((html.match(/<span>Escola &amp; Cia<\/span>/g) || []).length, 2);
  assert.match(html, /print-color-adjust:exact/);
});
