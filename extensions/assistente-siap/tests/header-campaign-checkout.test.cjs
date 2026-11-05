const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../../../services/siap-exam/node_modules/jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
const start = source.indexOf('  function renderHeaderCampaign() {');
const end = source.indexOf('  function licenseCard() {', start);
assert.ok(start >= 0 && end > start);

test('botões da campanha levam cada plano ao checkout do Assistente', () => {
  const dom = new JSDOM('<div id="assistente-siap-panel"><header class="cm-head"><div class="cm-operation-status"></div></header></div>');
  const campaign = {active:true,eyebrow:'OFERTA',headline:'BLACK FRIDAY',background_color:'#080e1b',text_color:'#fff5d4',buttons:[
    {plan_key:'quarterly',label:'TRIMESTRAL',amount:49.90,color:'#e7c46f',text_color:'#0b1930'},
    {plan_key:'semiannual',label:'SEMESTRAL',amount:99.90,color:'#e7c46f',text_color:'#0b1930'},
    {plan_key:'annual',label:'ANUAL',amount:199.90,color:'#e7c46f',text_color:'#0b1930'},
  ]};
  const context = {model:{page:'planning-lesson',headerCampaign:campaign},panel:dom.window.document.getElementById('assistente-siap-panel'),document:dom.window.document,URL};
  vm.runInNewContext(`${source.slice(start,end)}; renderHeaderCampaign();`, context);
  const links = [...dom.window.document.querySelectorAll('.cm-campaign-actions a')];
  assert.deepEqual(links.map(link => new URL(link.href).searchParams.get('plano')), ['quarterly','semiannual','annual']);
  assert.deepEqual(links.map(link => link.querySelector('strong').textContent), ['R$ 49,90','R$ 99,90','R$ 199,90']);
  context.model.headerCampaign = {active:false};
  vm.runInNewContext('renderHeaderCampaign();', context);
  assert.equal(dom.window.document.querySelector('.cm-header-campaign'), null);
});
