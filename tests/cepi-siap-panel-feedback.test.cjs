const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../services/siap-exam/node_modules/jsdom');

test('erro de escola aparece somente após atualizar cartões e sucesso fica verde',async()=>{
  const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});
  const {window}=dom;
  let requests=0,invalid=true;
  window.CepiSiapDom={supports:()=>true,snapshot:()=>{
    if(invalid)throw new Error('A escola do SIAP não coincide com o cabeçalho salvo nesta leitura.');
    return {context:{subject:'Química',total:15,className:'1A'}};
  },plan:()=>({entries:[{name:'Aluna Exemplo',marks:[true],captureId:'capture-1'}],skipped:[]})};
  window.chrome={runtime:{sendMessage:async request=>{
    requests++;
    if(request.type==='SIAP_CEPI_ROOM_GET')return {room:{id:'room',desktop:'token',meta:{examType:'bloco'}}};
    return {ok:true,key:{}};
  }}};
  window.eval(fs.readFileSync(path.join(__dirname,'../extensions/assistente-siap/src/cepi-siap-panel.js'),'utf8'));
  const host=window.document.getElementById('host');
  window.CepiSiapPanel.mount(host);
  assert.equal(requests,0);
  assert.doesNotMatch(host.textContent,/não coincide/);
  host.querySelector('[data-cepi-refresh]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(host.querySelector('[data-cepi-message]').dataset.state,'error');
  assert.match(host.textContent,/não coincide/);
  invalid=false;
  host.querySelector('[data-cepi-refresh]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(host.querySelector('[data-cepi-message]').dataset.state,'success');
  assert.match(host.textContent,/gabarito\(s\) lido\(s\)/);
  window.close();
});
