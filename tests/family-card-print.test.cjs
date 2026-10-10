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

test('uma folha A4 contém quatro pares com frente e verso lado a lado', () => {
  const html = render(Array.from({ length: 4 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`);
  const sheets = [...html.matchAll(/<section class="sheet">([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(sheets.length, 1);
  assert.equal((sheets[0].match(/class="card-pair"/g) || []).length, 4);
  assert.equal((sheets[0].match(/class="card-face card-front"/g) || []).length, 4);
  assert.equal((sheets[0].match(/class="card-face card-back"/g) || []).length, 4);
  const names = [...sheets[0].matchAll(/<strong>(Aluno \d+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(names, ['Aluno 1','Aluno 1','Aluno 2','Aluno 2','Aluno 3','Aluno 3','Aluno 4','Aluno 4']);
  assert.match(html, /Recorte pelo tracejado externo e dobre na linha central/);
});

test('cinco alunos geram duas folhas físicas, sem pares vazios', () => {
  const html = render(Array.from({ length: 5 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`);
  assert.equal((html.match(/<section class="sheet">/g) || []).length, 2);
  assert.equal((html.match(/class="card-pair"/g) || []).length, 5);
  assert.equal((html.match(/data-qr="CAROMETRO:CARD:/g) || []).length, 5);
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
  assert.equal((html.match(/class="school"/g) || []).length, 2);
  assert.equal((html.match(/<span>Escola &amp; Cia<\/span>/g) || []).length, 14);
  assert.match(html, /print-color-adjust:exact/);
  assert.equal((html.match(/class="watermark"/g) || []).length, 2);
  assert.match(html, /rgba\(29,59,118,\.055\)/);
});
