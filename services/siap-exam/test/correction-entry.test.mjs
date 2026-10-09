import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../regular-exam.js',import.meta.url),'utf8');

async function openCorrection(connectResult){
  const dom=new JSDOM('<div class="side"><div class="nav"></div></div><main id="app"></main>',{
    url:'https://sistemacarometro.com.br/',runScripts:'outside-only'
  });
  const {window}=dom;
  window.getActiveSchoolId=()=> 'school-1';
  window.CAROMETRO_RUNTIME_CONFIG={siapAssistantStoreUrl:'https://chromewebstore.google.com/detail/fgpjjlikinpcjpmmjehbgbfonnbfibnc'};
  window.connectCarometroCorrectionExtension=async()=>connectResult;
  window.eval(source);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.document.getElementById('regularExamNav').click();
  await new Promise(resolve=>setImmediate(resolve));
  return dom;
}

test('primeiro uso mostra instalação quando a extensão não responde',async()=>{
  const dom=await openCorrection(null);
  try{
    const {document}=dom.window;
    const install=document.getElementById('regularExamInstall');
    assert.equal(install.hidden,false);
    assert.match(install.href,/chromewebstore\.google\.com\/detail\/fgpjjlikinpcjpmmjehbgbfonnbfibnc/);
    assert.match(document.getElementById('regularExamStatus').textContent,/A extensão não respondeu/);
  }finally{dom.window.close();}
});

test('conta do Carômetro conecta a extensão sem pedir e-mail',async()=>{
  const dom=await openCorrection({ok:true,license:{examAccess:{active:true}}});
  try{
    const {document}=dom.window;
    assert.equal(document.getElementById('regularExamInstall').hidden,true);
    assert.match(document.getElementById('regularExamStatus').textContent,/Extensão conectada à sua conta/);
    assert.equal(document.querySelector('input[type="email"]'),null);
  }finally{dom.window.close();}
});

test('popup da correção não oferece entrada na conta do Assistente',async()=>{
  const html=readFileSync(new URL('../../../extensions/assistente-siap/popup/popup.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../../../extensions/assistente-siap/popup/popup.js',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'chrome-extension://example/popup/popup.html',runScripts:'outside-only'});
  try{
    dom.window.chrome={runtime:{sendMessage:async()=>({ok:true,supported:true,status:{page:'exam',open:false}})}};
    dom.window.eval(script);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(dom.window.document.querySelector('header h1').textContent,'Carômetro');
    assert.equal(dom.window.document.querySelector('.account-link').hidden,true);
  }finally{dom.window.close();}
});
