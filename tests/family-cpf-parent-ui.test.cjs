const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../services/siap-exam/node_modules/jsdom');

test('QR geral mostra filhos por nome e CPF e cria acesso sem pedir celular', async () => {
  const root=path.join(__dirname,'..');
  const schoolId='11111111-1111-4111-8111-111111111111';
  const html=readFileSync(path.join(root,'familia.html'),'utf8');
  const dom=new JSDOM(html,{ url:`https://carometro.example/familia.html?escola=${schoolId}`,
    runScripts:'outside-only' });
  const { window }=dom;
  const calls=[];
  let sessionCreated=false;
  window.matchMedia=()=>({ matches:false,addEventListener:()=>{} });
  window.CAROMETRO_RUNTIME_CONFIG={ backendConfigured:true,supabaseUrl:'https://example.test',supabasePublishableKey:'key' };
  window.supabase={ createClient:()=>({
    functions:{ invoke:async (name,{body})=>{
      calls.push({name,body});
      if (body.action==='preview') return {data:{students:[{name:'Ana',class_name:'1A'}]},error:null};
      return {data:{access_token:'access',refresh_token:'refresh'},error:null};
    } },
    auth:{
      getSession:async()=>({data:{session:null}}),
      getUser:async()=>({data:{user:{id:'family-user'}}}),
      setSession:async()=>{sessionCreated=true;return {error:null};},
    },
    rpc:async name=>({data:name==='family_my_students'
      ? [{link_id:'link',school_id:schoolId,school_name:'Escola',student_name:'Ana',class_name:'1A'}]
      : [],error:null}),
    channel:()=>({on:()=>({subscribe:()=>({})})}),
    removeChannel:async()=>{},
  }) };
  try {
    window.eval(readFileSync(path.join(root,'familia.js'),'utf8'));
    await new Promise(resolve=>window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    const el=id=>window.document.getElementById(id);
    assert.equal(el('familyCpfAccessForm').classList.contains('hidden'),false);
    assert.equal(html.includes('id="familyCpfPhone"'),false);
    el('familyCpfName').value='Maria da Silva';
    el('familyCpfNumber').value='529.982.247-25';
    el('familyCpfPreview').click();
    await new Promise(setImmediate);
    assert.match(el('familyCpfChildren').textContent,/Ana/);
    assert.equal(el('familyCpfFinish').classList.contains('hidden'),false);
    el('familyCpfPassword').value='abcd1234';
    el('familyCpfConfirm').checked=true;
    el('familyCpfAccessForm').querySelector('button[type=submit]').click();
    await new Promise(setImmediate);
    assert.equal(sessionCreated,true);
    assert.equal(el('portal').classList.contains('hidden'),false);
    assert.equal(calls[0].body.action,'preview');
    assert.equal(calls[1].body.action,'activate');
    assert.equal('phone' in calls[1].body,false);
  } finally { window.close(); }
});

test('QR individual novo confirma nome e CPF sem pedir celular', async () => {
  const root=path.join(__dirname,'..');
  const schoolId='11111111-1111-4111-8111-111111111111';
  const token='44444444-4444-4444-8444-444444444444';
  const dom=new JSDOM(readFileSync(path.join(root,'familia.html'),'utf8'),{
    url:`https://carometro.example/familia.html?escola=${schoolId}&token=${token}&cpf=1`,
    runScripts:'outside-only',
  });
  const { window }=dom;
  const calls=[];
  window.matchMedia=()=>({matches:false,addEventListener:()=>{}});
  window.CAROMETRO_RUNTIME_CONFIG={backendConfigured:true,supabaseUrl:'https://example.test',supabasePublishableKey:'key'};
  window.supabase={createClient:()=>({
    functions:{invoke:async (_name,{body})=>{
      calls.push(body);
      return {data:body.action==='preview'?{students:[{name:'Ana',class_name:'1A'}]}
        :{access_token:'access',refresh_token:'refresh'},error:null};
    }},
    auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:{id:'family-user'}}}),
      setSession:async()=>({error:null})},
    rpc:async name=>{
      assert.notEqual(name,'family_accept_invitation');
      return {data:name==='family_my_students'
        ?[{link_id:'link',school_id:schoolId,school_name:'Escola',student_name:'Ana',class_name:'1A'}]:[],error:null};
    },
    channel:()=>({on:()=>({subscribe:()=>({})})}),removeChannel:async()=>{},
  })};
  try {
    window.eval(readFileSync(path.join(root,'familia.js'),'utf8'));
    await new Promise(resolve=>window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    const el=id=>window.document.getElementById(id);
    assert.match(el('familyCpfAccessForm').textContent,/convite individual/i);
    assert.equal(el('firstAccessForm').classList.contains('hidden'),true);
    el('familyCpfName').value='Maria da Silva';
    el('familyCpfNumber').value='52998224725';
    el('familyCpfPreview').click();
    await new Promise(setImmediate);
    el('familyCpfPassword').value='abcd1234';
    el('familyCpfConfirm').checked=true;
    el('familyCpfAccessForm').querySelector('button[type=submit]').click();
    await new Promise(setImmediate);
    assert.equal(calls[0].token,token);
    assert.equal(calls[1].token,token);
    assert.equal(calls[1].cpf,'52998224725');
    assert.equal('phone' in calls[1],false);
    assert.equal(el('portal').classList.contains('hidden'),false);
  } finally { window.close(); }
});
