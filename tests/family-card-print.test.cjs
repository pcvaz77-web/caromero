const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../services/siap-exam/node_modules/jsdom');
const { render, qrValue } = require('../family-card-print.js');

const card = number => ({
  student_name: `Aluno ${number}`,
  class_name: '6A',
  guardian_name: 'Responsável',
  guardian_phone: '+5562999999999',
  registration_number: `2026-${number}`,
  qr_token: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
});

test('uma folha A4 paisagem contém cinco carteirinhas de 5,5 × 8,5 cm com verso invertido abaixo', () => {
  const html = render(Array.from({ length: 5 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`, value => `<svg data-barcode="${value}"></svg>`);
  const sheets = [...html.matchAll(/<section class="sheet">([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(sheets.length, 1);
  assert.equal((sheets[0].match(/class="card-pair"/g) || []).length, 5);
  assert.equal((sheets[0].match(/class="card-face card-front"/g) || []).length, 5);
  assert.equal((sheets[0].match(/class="card-face card-back"/g) || []).length, 5);
  const names = [...sheets[0].matchAll(/<strong class="(?:student-name|back-name)">(Aluno \d+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(names, ['Aluno 1','Aluno 1','Aluno 2','Aluno 2','Aluno 3','Aluno 3','Aluno 4','Aluno 4','Aluno 5','Aluno 5']);
  assert.match(html, /@page\{size:A4 landscape;margin:5mm\}/);
  assert.match(html, /grid-template-columns:repeat\(5,55mm\);grid-template-rows:170mm/);
  assert.match(html, /\.card-back\{transform:rotate\(180deg\)/);
  assert.match(html, /Nº responsável: \+5562999999999/);
  assert.match(html, /Matrícula: 2026-1/);
  assert.doesNotMatch(html, /Nº matrícula:/);
  assert.equal((html.match(/data-qr="CAROMETRO:CARD:/g) || []).length, 5);
  assert.equal((html.match(/data-barcode="2026-/g) || []).length, 5);
  assert.match(html, /class="card-face card-front"[\s\S]*data-barcode="2026-1"[\s\S]*class="card-face card-back"[\s\S]*data-qr="CAROMETRO:CARD:/);
  assert.match(html, /Recorte pelo tracejado externo e dobre na linha central/);
});

test('seis alunos geram duas folhas físicas, sem pares vazios', () => {
  const html = render(Array.from({ length: 6 }, (_, i) => card(i + 1)), 'Escola', value => `<svg data-qr="${value}"></svg>`, value => `<svg data-barcode="${value}"></svg>`);
  assert.equal((html.match(/<section class="sheet">/g) || []).length, 2);
  assert.equal((html.match(/class="card-pair"/g) || []).length, 6);
  assert.equal((html.match(/data-qr="CAROMETRO:CARD:/g) || []).length, 6);
  assert.equal((html.match(/data-barcode="2026-/g) || []).length, 6);
});

test('o código de barras Code 128 é gerado a partir da matrícula', () => {
  const dom = new JSDOM('<html><body></body></html>', { runScripts:'dangerously' });
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../vendor/JsBarcode.all.min.js'),'utf8'));
  const svg = dom.window.document.createElementNS('http://www.w3.org/2000/svg','svg');
  dom.window.JsBarcode(svg,card(1).registration_number,{ format:'CODE128',displayValue:false,width:2,height:40,margin:20 });
  assert.ok(svg.querySelectorAll('rect').length > 20);
  assert.match(svg.outerHTML,/viewBox="0 0 \d+ \d+"/);
});

test('nome exibido é escapado e QR aceita somente token de carteirinha', () => {
  const item = { ...card(1), student_name: '<script>alert(1)</script>' };
  const html = render([item], 'Escola & Cia', () => '<svg></svg>', () => '<svg></svg>');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Escola &amp; Cia'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.equal(qrValue(item.qr_token), `CAROMETRO:CARD:${item.qr_token}`);
  assert.throws(() => qrValue('outro-aluno'), /inválido/);
});

test('faixa azul da escola integra frente e verso mesmo sem fundos de impressão', () => {
  const html = render([card(1)], 'Escola & Cia', () => '<svg></svg>', () => '<svg></svg>');
  assert.equal((html.match(/<rect width="100" height="20" fill="#1d3b76"\/>/g) || []).length, 2);
  assert.equal((html.match(/class="school"/g) || []).length, 2);
  assert.equal((html.match(/<span>Escola &amp; Cia<\/span>/g) || []).length, 2);
  assert.match(html, /print-color-adjust:exact/);
  assert.equal((html.match(/class="watermark"/g) || []).length, 2);
  const watermarks = [...html.matchAll(/<div class="watermark"[^>]*>([\s\S]*?)<\/div>/g)].map(match => match[1]);
  assert.deepEqual(watermarks.map(mark => (mark.match(/<span style="--x:[^>]+>/g) || []).length), [14,14]);
  const positions = watermarks[0].matchAll(/style="--x:([\d.]+)%;--y:([\d.]+)%"/g);
  const points = [...positions].map(([,x,y]) => [Number(x), Number(y)]);
  assert.deepEqual(watermarks[1].match(/style="--x:([\d.]+)%;--y:([\d.]+)%"/g), watermarks[0].match(/style="--x:([\d.]+)%;--y:([\d.]+)%"/g));
  const normals = points.map(([x,y]) => x * Math.sin(24 * Math.PI / 180) + y * .7 * Math.cos(24 * Math.PI / 180)).sort((a,b) => a-b);
  assert.ok(normals.slice(1).every((value,index) => value - normals[index] >= 7.4));
  assert.match(html, /left:var\(--x\);top:var\(--y\)/);
  assert.match(html, /translate\(-50%,-50%\) rotate\(-24deg\)/);
  assert.match(html, /rgba\(29,59,118,\.055\)/);
});
