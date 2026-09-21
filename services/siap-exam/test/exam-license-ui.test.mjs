import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../../../extensions/assistente-siap/src/content.js',import.meta.url),'utf8');
const summarySource=source.slice(source.indexOf('  function accessSummary('),source.indexOf('  function licenseCard()'));
const core={accessSummary:new Function(summarySource+'; return accessSummary;')()};
const start=source.indexOf('    if (model.page === "exam") {');
const end=source.indexOf('    if (model.license && model.license.active !== true)',start);
const render=new Function('panel','model','window','document','refreshLicenseStatus',summarySource+source.slice(start,end));

test('cabeçalho mostra a conta autenticada como texto e oculta ao desconectar',()=>{
  const dom=new JSDOM('<aside><span class="cm-account-identity" hidden></span></aside>');
  const panel=dom.window.document.querySelector('aside');
  const begin=source.indexOf("    const identity = panel.querySelector('.cm-account-identity');");
  const finish=source.indexOf('    if (model.sessionRequired) {',begin);
  const show=new Function('panel','model',source.slice(begin,finish));
  try {
    show(panel,{accountEmail:'professor@example.invalid',sessionRequired:false});
    const label=panel.querySelector('span');
    assert.equal(label.hidden,false);
    assert.equal(label.textContent,'Conectado como professor@example.invalid');
    show(panel,{accountEmail:'<img src=x>@example.invalid',sessionRequired:false});
    assert.equal(label.querySelector('img'),null);
    show(panel,{accountEmail:null,sessionRequired:true});
    assert.equal(label.hidden,true);
    assert.equal(label.textContent,'');
  } finally {dom.window.close();}
});

test('concessões mostram validade real e nunca inventam prazo indeterminado',()=>{
  const now=Date.parse('2026-09-21T12:00:00Z');
  for(const days of [1,7,30]) {
    const lines=core.accessSummary({active:true,status:'granted',expiresAt:new Date(now+days*86400000).toISOString()},now);
    assert.match(lines.join(' '),new RegExp(`${days} dia\\(s\\)`));
  }
  assert.match(core.accessSummary({active:true,status:'granted',expiresAt:null}).join(' '),/tempo indeterminado/);
  assert.doesNotMatch(core.accessSummary({active:true,status:'granted'}).join(' '),/indeterminado/);
});

test('painel ativo substitui compra por licença e preserva a sessão ao redesenhar',()=>{
  const dom=new JSDOM('<aside><div class="cm-body"></div></aside>');
  const w=dom.window,panel=w.document.querySelector('aside');
  w.SiapExamCore=core;
  let host;
  w.SiapExamPanel={mount(container){if(host?.isConnected)return;host=w.document.createElement('div');host.textContent='QR Code ativo';container.replaceChildren(host);}};
  const draw=access=>render(panel,{page:'exam',license:{examAccess:access}},w,w.document,()=>{});
  try {
    draw({active:false,status:'not_granted'});
    assert.equal(panel.querySelectorAll('[data-exam-buy]').length,2);
    for(const access of [
      {active:true,status:'granted',expiresAt:null},
      {active:true,status:'subscription',expiresAt:'2027-01-01T12:00:00Z'},
      {active:true,status:'credits',credits:3,openBlocks:1}
    ]) {
      draw(access);
      assert.equal(panel.querySelectorAll('[data-exam-buy]').length,0);
      assert.equal(panel.querySelectorAll('.cm-exam-access').length,1);
      assert.ok(host.isConnected);
    }
    assert.match(panel.textContent,/3 crédito\(s\).*1 bloco\(s\)/);
    draw({active:false,status:'expired'});
    assert.equal(panel.querySelectorAll('[data-exam-access]').length,0);
    assert.equal(panel.querySelectorAll('[data-exam-buy]').length,2);
    draw({active:false,status:'unavailable'});
    assert.equal(panel.querySelectorAll('[data-exam-buy]').length,0);
  } finally {dom.window.close();}
});
