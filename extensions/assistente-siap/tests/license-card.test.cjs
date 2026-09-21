const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
const start = source.indexOf('  function licenseCard() {');
const end = source.indexOf('  function featureHasFreeUse(', start);
assert.ok(start >= 0 && end > start);

function card(license) {
  const context = { model: { license } };
  vm.runInNewContext(`${source.slice(start, end)}; result = licenseCard();`, context);
  return context.result;
}

test('concessão temporária mostra dias e aviso próximo do fim', () => {
  const html = card({ mode:'carometro', active:true, daysRemaining:2 });
  assert.match(html, /Acesso concedido pelo Carômetro/);
  assert.match(html, /2 dia\(s\) restante\(s\)/);
  assert.match(html, /Peça a renovação/);
});

test('concessão permanente não recebe aviso de vencimento', () => {
  const html = card({ mode:'carometro', active:true, permanent:true, daysRemaining:null });
  assert.match(html, /Concessão permanente/);
  assert.doesNotMatch(html, /termina em breve/);
});

test('teste gratuito mostra dois usos de cada recurso', () => {
  const html = card({ mode:'external', status:'free', active:true, freeUses:{ planning:2, content:2, attendance:2, pei:2 } });
  assert.match(html, /Licença de teste/);
  assert.equal((html.match(/2 uso\(s\) restante\(s\)/g) || []).length, 4);
});

test('assinatura ativa mostra prazo e aviso de renovação', () => {
  const html = card({ mode:'subscription', active:true, daysRemaining:3 });
  assert.match(html, /Licença ativa/);
  assert.match(html, /3 dia\(s\) restante\(s\)/);
  assert.match(html, /Confira a renovação/);
});

test('concessão e compra vencidas mostram link para os planos', () => {
  for (const license of [
    { mode:'external', status:'grant_ended', active:false },
    { mode:'subscription', status:'expired', active:false },
  ]) {
    const html = card(license);
    assert.match(html, /Licença expirada/);
    assert.match(html, /assistente-siap\.html#planos/);
  }
});
